import { MachineHistoryModel } from "../models/machineHistory.model.js";
import { PlcDataModel } from "../models/plcData.model.js";
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

  // ✅ Total production — same logic as report/listing OK count:
  // latest row per barcode, then count only "ok".
  const plcWhere = { device_id };
  if (status) plcWhere.status = status.toLowerCase();
  if (model) plcWhere.model = { [Op.like]: `%${model}%` };
  if (timestampWhere) plcWhere.timestamp = timestampWhere;

  const plcRows = await PlcDataModel.findAll({
    where: plcWhere,
    attributes: ["extra_data", "timestamp", "created_at"],
    order: [["timestamp", "DESC"], ["created_at", "DESC"]],
    raw: true,
  });

  const parseMaybeJson = (value) => {
    if (!value) return null;
    if (typeof value === "object") return value;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch (_) {
        return null;
      }
    }
    return null;
  };
  const getBarcodeId = (row) => {
    const extra = parseMaybeJson(row?.extra_data) || {};
    const barcodeDetails = parseMaybeJson(extra?.Barcode_details);
    if (!barcodeDetails || typeof barcodeDetails !== "object") return null;
    const id =
      barcodeDetails?.BarcodeID ??
      barcodeDetails?.BarcodeId ??
      barcodeDetails?.barcode_id ??
      barcodeDetails?.BarcodeTag ??
      null;
    const s = id == null ? "" : String(id).trim();
    return s || null;
  };
  const isOk = (row) => {
    const extra = parseMaybeJson(row?.extra_data) || {};
    const err = String(extra?.ERROR_STATUS ?? extra?.error_status ?? "").trim().toLowerCase();
    return err === "ok";
  };

  const latestBarcodeById = new Map();
  for (const r of plcRows) {
    const barcodeId = getBarcodeId(r);
    if (!barcodeId || latestBarcodeById.has(barcodeId)) continue;
    latestBarcodeById.set(barcodeId, r);
  }

  let total_production = 0;
  for (const latestRow of latestBarcodeById.values()) {
    if (isOk(latestRow)) total_production += 1;
  }

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

/**
 * Fetch distinct model options for a device in machine history.
 */
export const getMachineModelOptionsService = async (device_id) => {
  const rows = await MachineHistoryModel.findAll({
    where: { device_id },
    attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("model")), "model"]],
    raw: true,
  });

  return rows.map((r) => r.model).filter(Boolean);
};