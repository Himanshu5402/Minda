import { MachineHistoryModel } from "../models/machineHistory.model.js";
import { Op, Sequelize } from "sequelize";
import { sequelize } from "../sequelize.js";

/**
 * ✅ Helper — duration string se timestamp WHERE condition banao
 * Frontend "Custom", "today", "week", "month" ya "all" bhejta hai
 */
function buildTimestampWhere(duration, startDate, endDate) {
  // Normalize: "Custom" → "custom", "Today" → "today", etc.
  const d = (duration || "").toLowerCase();

  if (d === "today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return { [Op.gte]: today };
  }

  if (d === "week") {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return { [Op.gte]: startOfWeek };
  }

  if (d === "month") {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    return { [Op.gte]: startOfMonth };
  }

  if (d === "custom" && startDate && endDate) {
    return { [Op.between]: [new Date(startDate), new Date(endDate)] };
  }

  // "all" ya kuch aur → no filter
  return null;
}

/**
 * ✅ Helper — SQL WHERE snippet + replacements for raw downtime query
 * duration ke hisaab se SQL condition string return karta hai
 */
function buildRawDurationCondition(duration, startDate, endDate, replacements) {
  const d = (duration || "").toLowerCase();

  if (d === "today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    replacements.today = today;
    return "AND timestamp >= :today";
  }

  if (d === "week") {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    replacements.weekStart = startOfWeek;
    return "AND timestamp >= :weekStart";
  }

  if (d === "month") {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    replacements.monthStart = startOfMonth;
    return "AND timestamp >= :monthStart";
  }

  if (d === "custom" && startDate && endDate) {
    replacements.startDate = new Date(startDate);
    replacements.endDate = new Date(endDate);
    return "AND timestamp BETWEEN :startDate AND :endDate";
  }

  return "";
}

/**
 * Fetch machine history with pagination and filters
 */
export const getMachineHistoryService = async (filters = {}, pagination = {}) => {
  const { device_id, status, model, duration, startDate, endDate } = filters;
  const { page = 1, limit = 20 } = pagination;
  const offset = (page - 1) * limit;

  const where = { device_id };

  if (status) where.status = status.toLowerCase();
  if (model) where.model = { [Op.like]: `%${model}%` };

  // ✅ Duration filter — ab week aur month bhi handle hoga
  const timestampWhere = buildTimestampWhere(duration, startDate, endDate);
  if (timestampWhere) where.timestamp = timestampWhere;

  const { count, rows } = await MachineHistoryModel.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [["timestamp", "DESC"]],
  });

  return {
    data: rows,
    total: count,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(count / limit),
  };
};

/**
 * Fetch machine summary (Total Products, Production, Downtime)
 */
export const getMachineSummaryService = async (filters = {}) => {
  const { device_id, status, model, duration, startDate, endDate } = filters;

  const where = { device_id };
  if (status) where.status = status.toLowerCase();
  if (model) where.model = { [Op.like]: `%${model}%` };

  // ✅ Duration filter — ab week aur month bhi handle hoga
  const timestampWhere = buildTimestampWhere(duration, startDate, endDate);
  if (timestampWhere) where.timestamp = timestampWhere;

  // ✅ Downtime SQL — gap-based logic
  // Stopped session ke baad Running session start hua →
  // next.start_time - current.stop_time = downtime gap
  const replacements = { device_id };
  if (model) replacements.model = `%${model}%`;
  if (status) replacements.status = status.toLowerCase();

  // ✅ Duration condition for raw SQL — week/month/today/custom sab handle
  const durationSqlCondition = buildRawDurationCondition(
    duration,
    startDate,
    endDate,
    replacements
  );

  const downtimeQuery = `
    WITH UniqueSessions AS (
      SELECT device_id, model, start_time, stop_time,
             ROW_NUMBER() OVER (
               PARTITION BY device_id, start_time, stop_time
               ORDER BY start_time ASC
             ) AS rn
      FROM machine_history
      WHERE device_id = :device_id
        AND stop_time IS NOT NULL
        ${model  ? "AND model LIKE :model"   : ""}
        ${status ? "AND status = :status"    : ""}
        ${durationSqlCondition}
    ),
    FilteredData AS (
      SELECT * FROM UniqueSessions WHERE rn = 1
    ),
    GapCalculated AS (
      SELECT *,
             LAG(stop_time) OVER (
               PARTITION BY device_id
               ORDER BY start_time ASC
             ) AS prev_stop_time
      FROM FilteredData
    ),
    FinalData AS (
      SELECT *,
             CASE
               WHEN prev_stop_time IS NOT NULL
                AND DATEDIFF(SECOND, prev_stop_time, start_time) > 0
               THEN DATEDIFF(SECOND, prev_stop_time, start_time)
               ELSE 0
             END AS stopped_duration
      FROM GapCalculated
    )
    SELECT SUM(stopped_duration) AS totalDowntime
    FROM FinalData
    WHERE prev_stop_time IS NOT NULL;
  `;

  const [downtimeResult] = await sequelize.query(downtimeQuery, {
    replacements,
    type: Sequelize.QueryTypes.SELECT,
  });

  const total_downtime_seconds = downtimeResult?.totalDowntime || 0;

  // ✅ Total unique products — distinct models
  const total_products = await MachineHistoryModel.count({
    where,
    distinct: true,
    col: "model",
  });

  // ✅ Total production — Delta-based calculation
  //
  // Problem: Machine ka counter cumulative hota hai (reset nahi hota)
  //   Session1: 1 → 2 → 4 (stopped)
  //   Session2: 5           (counter continue hua, sirf 1 naya piece bana)
  //
  // Galat logic: MAX(s1) + MAX(s2) = 4 + 5 = 9 ❌
  // Sahi logic:  delta(s1) + delta(s2) = 4 + (5-4) = 5 ✅
  //
  // Agar counter reset hua (curr < prevMax) toh curr ko directly add karo
  const productionResults = await MachineHistoryModel.findAll({
    where,
    attributes: [
      "model",
      "start_time",
      [Sequelize.fn("MAX", Sequelize.col("production_count")), "max_prod"],
    ],
    group: ["model", "start_time"],
    order: [
      ["model",      "ASC"],
      ["start_time", "ASC"],  // oldest session pehle taaki delta sahi nikle
    ],
    raw: true,
  });

  // Model-wise sessions group karo
  const sessionsByModel = {};
  productionResults.forEach((r) => {
    const key = r.model || "unknown";
    if (!sessionsByModel[key]) sessionsByModel[key] = [];
    sessionsByModel[key].push(Number(r.max_prod) || 0);
  });

  // Har model ke sessions pe delta calculate karo
  let total_production = 0;
  Object.values(sessionsByModel).forEach((sessions) => {
    let prevMax = 0;
    sessions.forEach((curr) => {
      if (curr > prevMax) {
        // Counter aage badha → sirf naya delta add karo
        total_production += curr - prevMax;
      } else {
        // Counter reset hua (naya batch) → poora count add karo
        total_production += curr;
      }
      prevMax = curr;
    });
  });

  return {
    total_products:          total_products || 0,
    total_production:        total_production,
    total_downtime_seconds:  total_downtime_seconds || 0,
  };
};

/**
 * Fetch latest machine status
 */
export const getMachineLatestStatusService = async (device_id) => {
  const latest = await MachineHistoryModel.findOne({
    where: { device_id },
    order: [["timestamp", "DESC"]],
  });

  if (!latest) return null;

  return {
    current_status:   latest.status,
    start_time:       latest.start_time,
    stop_time:        latest.stop_time,
    production_count: latest.production_count,
    part_no:          latest.part_no,
    model:            latest.model,
  };
};