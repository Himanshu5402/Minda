import { PlcDashboardModel } from "../models/plcDashboard.model.js";
import { Op, Sequelize } from "sequelize";

/**
 * Service to fetch the latest state of machines from the dashboard table.
 * @param {Object} filters - device_id, status, company_name, plant_name
 */
export const getAllPlcDashboardService = async (filters = {}) => {
  const where = {};
  
  if (filters.device_id)    where.device_id    = filters.device_id;
  if (filters.company_name) where.company_name = filters.company_name;
  if (filters.plant_name)   where.plant_name   = filters.plant_name;
  if (filters.status && filters.status !== 'All') {
    where.status = filters.status.toLowerCase();
  }

  const rows = await PlcDashboardModel.findAll({
    where,
    order: [["timestamp", "DESC"]],
  });

  return rows;
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
