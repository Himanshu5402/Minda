// import { PlcDashboardModel } from "../models/plcDashboard.model.js";
// import { Sequelize } from "sequelize";

// /**
//  * Service to fetch the latest state of machines from the dashboard table.
//  * @param {Object} filters - device_id, status, company_name, plant_name
//  */
// export const getAllPlcDashboardService = async (filters = {}) => {
//   const where = {};

//   if (filters.device_id)    where.device_id    = filters.device_id;
//   if (filters.company_name) where.company_name = filters.company_name;
//   if (filters.plant_name)   where.plant_name   = filters.plant_name;
//   if (filters.status && filters.status !== 'All') {
//     where.status = filters.status.toLowerCase();
//   }

//   const rows = await PlcDashboardModel.findAll({
//     where,
//     order: [["timestamp", "DESC"]],
//   });

//   // Live dashboard cards should show only real-time production_count
//   // from plc_dashboard table, not history/aggregated count.
//   return rows;
// };

// /**
//  * Get distinct options for filtering the dashboard.
//  */
// export const getPlcDashboardOptionsService = async () => {
//   const [companies, plants, models, statuses] = await Promise.all([
//     PlcDashboardModel.findAll({ attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('company_name')), 'company_name']], raw: true }),
//     PlcDashboardModel.findAll({ attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('plant_name')), 'plant_name']], raw: true }),
//     PlcDashboardModel.findAll({ attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('model')), 'model']], raw: true }),
//     PlcDashboardModel.findAll({ attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('status')), 'status']], raw: true }),
//   ]);

//   return {
//     companies: companies.map(c => c.company_name).filter(Boolean),
//     plants: plants.map(p => p.plant_name).filter(Boolean),
//     models: models.map(m => m.model).filter(Boolean),
//     statuses: statuses.map(s => s.status).filter(Boolean),
//   };
// };

import { Op, Sequelize } from 'sequelize'
import { PlcDashboardModel } from '../models/plcDashboard.model.js'

/**
 * Common lightweight attributes
 * Avoid fetching heavy JSON column
 */
const DASHBOARD_ATTRIBUTES = [
  '_id',
  'device_id',
  'company_name',
  'plant_name',
  'line_number',
  'timestamp',
  'start_time',
  'stop_time',
  'status',
  'production_count',
  'model',
  'last_updated',
]

/**
 * Get all PLC dashboard data
 *
 * Optimizations:
 * - pagination
 * - raw query
 * - lightweight attributes
 * - proper filtering
 * - limit protection
 * - index-friendly sorting
 */
export const getAllPlcDashboardService = async (filters = {}, options = {}) => {
  try {
    const where = {}
    const page = Math.max(Number(options.page) || 1, 1)
    const limit = Math.min(Number(options.limit) || 6, 100)
    const offset = (page - 1) * limit

    /**
     * Exact filters
     */
    if (filters.device_id) {
      where.device_id = filters.device_id
    }

    if (filters.company_name) {
      where.company_name = filters.company_name
    }

    if (filters.plant_name) {
      where.plant_name = filters.plant_name
    }

    /**
     * Status filter
     * DO NOT transform case unless DB stores lowercase
     */
    if (filters.status && filters.status !== 'All') {
      where.status = filters.status
    }

    /**
     * Main query
     */
    const [rows, totalItems] = await Promise.all([
      PlcDashboardModel.findAll({
        where,
        attributes: DASHBOARD_ATTRIBUTES,
        order: [['timestamp', 'DESC']],
        limit,
        offset,
        raw: true,
        subQuery: false,
      }),
      PlcDashboardModel.count({ where }),
    ])

    return {
      rows,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit) || 1,
      },
    }
  } catch (error) {
    console.error('Error fetching PLC dashboard:', error)

    throw new Error('Failed to fetch PLC dashboard data')
  }
}

/**
 * Get single dashboard by device id
 *
 * Optimized for unique index lookup
 */
export const getPlcDashboardByDeviceService = async (deviceId) => {
  try {
    if (!deviceId) {
      throw new Error('deviceId is required')
    }

    const row = await PlcDashboardModel.findOne({
      where: {
        device_id: deviceId,
      },

      attributes: DASHBOARD_ATTRIBUTES,

      raw: true,
    })

    return row
  } catch (error) {
    console.error('Error fetching dashboard by device:', error)

    throw new Error('Failed to fetch device dashboard')
  }
}

/**
 * Get running machines only
 *
 * Uses status index
 */
export const getRunningMachinesService = async () => {
  try {
    return PlcDashboardModel.findAll({
      where: {
        status: 'RUNNING',
      },

      attributes: ['device_id', 'status', 'timestamp', 'production_count', 'model'],

      order: [['timestamp', 'DESC']],

      limit: 500,

      raw: true,
    })
  } catch (error) {
    console.error('Error fetching running machines:', error)

    throw new Error('Failed to fetch running machines')
  }
}

/**
 * Get dashboard statistics
 *
 * Useful for cards/widgets
 */
export const getDashboardStatsService = async () => {
  try {
    const [totalMachines, runningMachines, stoppedMachines] = await Promise.all([
      PlcDashboardModel.count(),

      PlcDashboardModel.count({
        where: {
          status: 'RUNNING',
        },
      }),

      PlcDashboardModel.count({
        where: {
          status: 'STOPPED',
        },
      }),
    ])

    return {
      totalMachines,
      runningMachines,
      stoppedMachines,
    }
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)

    throw new Error('Failed to fetch dashboard statistics')
  }
}

/**
 * Get distinct filter options
 *
 * Optimized:
 * - grouped queries
 * - raw mode
 * - lightweight responses
 */
export const getPlcDashboardOptionsService = async () => {
  try {
    const [companies, plants, models, statuses] = await Promise.all([
      PlcDashboardModel.findAll({
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('company_name')), 'company_name']],

        where: {
          company_name: {
            [Op.ne]: null,
          },
        },

        raw: true,
      }),

      PlcDashboardModel.findAll({
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('plant_name')), 'plant_name']],

        where: {
          plant_name: {
            [Op.ne]: null,
          },
        },

        raw: true,
      }),

      PlcDashboardModel.findAll({
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('model')), 'model']],

        where: {
          model: {
            [Op.ne]: null,
          },
        },

        raw: true,
      }),

      PlcDashboardModel.findAll({
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('status')), 'status']],

        where: {
          status: {
            [Op.ne]: null,
          },
        },

        raw: true,
      }),
    ])

    return {
      companies: companies.map((c) => c.company_name).filter(Boolean),

      plants: plants.map((p) => p.plant_name).filter(Boolean),

      models: models.map((m) => m.model).filter(Boolean),

      statuses: statuses.map((s) => s.status).filter(Boolean),
    }
  } catch (error) {
    console.error('Error fetching dashboard options:', error)

    throw new Error('Failed to fetch dashboard options')
  }
}

/**
 * Get latest updated machines
 *
 * Useful for live dashboards
 */
export const getLatestUpdatedMachinesService = async (limit = 50) => {
  try {
    return PlcDashboardModel.findAll({
      attributes: DASHBOARD_ATTRIBUTES,

      order: [['last_updated', 'DESC']],

      limit,

      raw: true,
    })
  } catch (error) {
    console.error('Error fetching latest machines:', error)

    throw new Error('Failed to fetch latest machines')
  }
}

/**
 * Heavy query with JSON included
 * Use only when needed
 */
export const getDashboardWithExtraDataService = async (deviceId) => {
  try {
    return PlcDashboardModel.scope('withExtraData').findOne({
      where: {
        device_id: deviceId,
      },

      raw: true,
    })
  } catch (error) {
    console.error('Error fetching dashboard extra data:', error)

    throw new Error('Failed to fetch extra dashboard data')
  }
}