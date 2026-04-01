import { PlcDashboardModel } from "../models/plcDashboard.model.js";
import { PlcDataModel } from "../models/plcData.model.js";
import { Op, Sequelize } from "sequelize";

/**
 * Service to fetch the latest state of machines from the dashboard table.
 * @param {Object} filters - device_id, status, company_name, plant_name
 */
export const getAllPlcDashboardService = async (filters = {}) => {
  const where = {};
  
  if (filters.device_id)    where.device_id    = filters.device_id; // Exact match for faster filtering
  if (filters.company_name) where.company_name = filters.company_name;
  if (filters.plant_name)   where.plant_name   = filters.plant_name;
  if (filters.status)       where.status       = filters.status;

  const rows = await PlcDashboardModel.findAll({
    where,
    order: [["timestamp", "DESC"]],
  });

  if (!rows.length) return rows;

  const norm = (v) => String(v ?? "unknown").trim().toLowerCase();
  const toCount = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const deviceIds = Array.from(
    new Set(rows.map((r) => (r.device_id || "").trim()).filter(Boolean))
  );
  if (!deviceIds.length) return rows;

  const plcRows = await PlcDataModel.findAll({
    where: { device_id: { [Op.in]: deviceIds } },
    attributes: ["device_id", "model", "status", "production_count", "timestamp", "created_at"],
    order: [["timestamp", "DESC"], ["created_at", "DESC"]],
    raw: true,
  });

  // Strict key: one model contributes once per device.
  const keyFor = (r) => `${norm(r.device_id)}||${norm(r.model)}`;

  // Exact requirement:
  // per (device, model) pick ONLY latest RUNNING row and use that production_count.
  const latestRunningByKey = new Map();

  for (const r of plcRows) {
    const isRunning = String(r.status || "").toLowerCase() === "running";
    if (!isRunning) continue;

    const key = keyFor(r);
    if (!latestRunningByKey.has(key)) {
      latestRunningByKey.set(key, toCount(r.production_count)); // first running is latest running
    }
  }

  // Sum exactly one count per unique model under each device.
  const deviceTotal = new Map();
  for (const [key, modelCount] of latestRunningByKey.entries()) {
    const deviceKey = key.split("||")[0];
    deviceTotal.set(deviceKey, (deviceTotal.get(deviceKey) || 0) + modelCount);
  }

  return rows.map((row) => {
    const json = row.toJSON ? row.toJSON() : row;
    return {
      ...json,
      production_count: deviceTotal.get(norm(json.device_id)) || 0,
    };
  });
};

/**
 * Get distinct options for filtering the dashboard.
 */
export const getPlcDashboardOptionsService = async () => {
  const [companies, plants, models, statuses] = await Promise.all([
    PlcDashboardModel.findAll({ attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('company_name')), 'company_name']], raw: true }),
    PlcDashboardModel.findAll({ attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('plant_name')), 'plant_name']], raw: true }),
    PlcDashboardModel.findAll({ attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('model')), 'model']], raw: true }),
    PlcDashboardModel.findAll({ attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('status')), 'status']], raw: true }),
  ]);

  return {
    companies: companies.map(c => c.company_name).filter(Boolean),
    plants: plants.map(p => p.plant_name).filter(Boolean),
    models: models.map(m => m.model).filter(Boolean),
    statuses: statuses.map(s => s.status).filter(Boolean),
  };
};
