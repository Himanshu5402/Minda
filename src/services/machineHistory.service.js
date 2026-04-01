import { MachineHistoryModel } from "../models/machineHistory.model.js";
import { Op, Sequelize } from "sequelize";
import { sequelize } from "../sequelize.js";

/**
 * Fetch machine history with pagination and filters
 */
export const getMachineHistoryService = async (filters = {}, pagination = {}) => {
  const { device_id, status, part_no, duration } = filters;
  const { page = 1, limit = 10 } = pagination;
  const offset = (page - 1) * limit;

  const where = { device_id };
  if (status) where.status = status.toLowerCase();
  if (part_no) where.part_no = { [Op.like]: `%${part_no}%` };

  // Duration filter logic
  if (duration === "today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    where.timestamp = { [Op.gte]: today };
  } else if (duration === "custom" && filters.startDate && filters.endDate) {
    where.timestamp = { [Op.between]: [new Date(filters.startDate), new Date(filters.endDate)] };
  }

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
  const { device_id, status, part_no, duration, startDate, endDate } = filters;
  
  const where = { device_id };
  if (status) where.status = status.toLowerCase();
  if (part_no) where.part_no = { [Op.like]: `%${part_no}%` };

  // Duration filter logic
  if (duration === "today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    where.timestamp = { [Op.gte]: today };
  } else if (duration === "custom" && startDate && endDate) {
    where.timestamp = { [Op.between]: [new Date(startDate), new Date(endDate)] };
  }

  // Calculate total downtime using gap-based logic from machine_history table
  const downtimeQuery = `
    WITH UniqueSessions AS (
      SELECT device_id, part_no, start_time, stop_time,
             ROW_NUMBER() OVER (
               PARTITION BY device_id, start_time, stop_time
               ORDER BY start_time ASC
             ) AS rn
      FROM machine_history
      WHERE device_id = :device_id
      ${part_no ? "AND part_no LIKE :part_no" : ""}
      ${status ? "AND status = :status" : ""}
      ${duration === "today" ? "AND timestamp >= :today" : ""}
      ${duration === "custom" && startDate && endDate ? "AND timestamp BETWEEN :startDate AND :endDate" : ""}
    ),
    FilteredData AS (
      SELECT *
      FROM UniqueSessions
      WHERE rn = 1
    ),
    GapCalculated AS (
      SELECT *,
             LAG(stop_time) OVER (
               PARTITION BY device_id
               ORDER BY start_time
             ) AS prev_stop_time
      FROM FilteredData
    ),
    FinalData AS (
      SELECT *,
             CASE 
               WHEN prev_stop_time IS NOT NULL AND DATEDIFF(SECOND, prev_stop_time, start_time) > 0 
               THEN DATEDIFF(SECOND, prev_stop_time, start_time) 
               ELSE 0 
             END AS stopped_duration
      FROM GapCalculated
    )
    SELECT SUM(stopped_duration) as totalDowntime
    FROM FinalData
    WHERE prev_stop_time IS NOT NULL;
  `;

  const replacements = { device_id };
  if (part_no) replacements.part_no = `%${part_no}%`;
  if (status) replacements.status = status.toLowerCase();
  if (duration === "today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    replacements.today = today;
  }
  if (duration === "custom" && startDate && endDate) {
    replacements.startDate = new Date(startDate);
    replacements.endDate = new Date(endDate);
  }

  const [downtimeResult] = await sequelize.query(downtimeQuery, {
    replacements,
    type: Sequelize.QueryTypes.SELECT,
  });

  const total_downtime_seconds = downtimeResult?.totalDowntime || 0;

  // Calculate total unique products by counting distinct part_no with filters
  const total_products = await MachineHistoryModel.count({
    where,
    distinct: true,
    col: 'part_no'
  });

  // For total production, we want the sum of MAX(production_count) for each (part_no, start_time) pair
  // Apply same filters to production results
  const productionResults = await MachineHistoryModel.findAll({
    where,
    attributes: [
      [Sequelize.fn('MAX', Sequelize.col('production_count')), 'max_prod']
    ],
    group: ['part_no', 'start_time'],
    raw: true
  });

  const total_production = productionResults.reduce((sum, r) => sum + (Number(r.max_prod) || 0), 0);

  return {
    total_products: total_products || 0,
    total_production: total_production,
    total_downtime_seconds: total_downtime_seconds || 0,
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
    current_status: latest.status,
    start_time: latest.start_time,
    stop_time: latest.stop_time,
    production_count: latest.production_count,
    part_no: latest.part_no,
    model: latest.model,
  };
};
