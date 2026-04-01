import { MachineHistoryModel } from "../models/machineHistory.model.js";
import { Op, Sequelize } from "sequelize";

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
export const getMachineSummaryService = async (device_id) => {
  // Calculate total downtime by summing duration for all "stopped" records
  const total_downtime_seconds = await MachineHistoryModel.sum('duration_seconds', {
    where: {
      device_id,
      status: 'stopped'
    }
  });

  // Calculate total unique products by counting distinct part_no
  const total_products = await MachineHistoryModel.count({
    where: { device_id },
    distinct: true,
    col: 'part_no'
  });

  // For total production, we want the LATEST production count from the history
  const latestRecord = await MachineHistoryModel.findOne({
    where: { device_id },
    order: [["timestamp", "DESC"]],
    attributes: ["production_count"],
  });

  return {
    total_products: total_products || 0,
    total_production: latestRecord ? latestRecord.production_count : 0,
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
