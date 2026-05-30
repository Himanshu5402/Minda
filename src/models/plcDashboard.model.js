// import { Sequelize, DataTypes } from "sequelize";
// import { sequelize } from "../sequelize.js";

// export const PlcDashboardModel = sequelize.define(
//   "PlcDashboard",
//   {
//     _id: {
//       type: DataTypes.UUID,
//       defaultValue: Sequelize.literal("NEWID()"),
//       primaryKey: true,
//     },
//     device_id: {
//       type: DataTypes.STRING(255),
//       allowNull: false,
//       unique: true,
//     },
//     company_name: { type: DataTypes.STRING(255), allowNull: true },
//     plant_name: { type: DataTypes.STRING(255), allowNull: true },
//     line_number: { type: DataTypes.STRING(50), allowNull: true },
//     timestamp: { type: DataTypes.DATE, allowNull: true },
//     start_time: { type: DataTypes.DATE, allowNull: true },
//     stop_time: { type: DataTypes.DATE, allowNull: true },
//     status: { type: DataTypes.STRING(255), allowNull: true },
//     latch_force: { type: DataTypes.INTEGER, allowNull: true },
//     claw_force: { type: DataTypes.INTEGER, allowNull: true },
//     safety_lever: { type: DataTypes.INTEGER, allowNull: true },
//     claw_lever: { type: DataTypes.INTEGER, allowNull: true },
//     stroke: { type: DataTypes.INTEGER, allowNull: true },
//     production_count: { type: DataTypes.INTEGER, allowNull: true },
//     model: { type: DataTypes.STRING(255), allowNull: true },
//     alarm: { type: DataTypes.STRING(255), allowNull: true },
//     extra_data: { type: DataTypes.JSON, allowNull: true },
//     plc_data_id: { type: DataTypes.UUID, allowNull: false },
//     last_updated: { type: DataTypes.DATE, defaultValue: Sequelize.literal("GETDATE()") },
//   },
//   {
//     timestamps: true,
//     createdAt: "created_at",
//     updatedAt: "updated_at",
//     tableName: "plc_dashboard",
//     indexes: [
//       { unique: true, fields: ["device_id"] },
//       { fields: ["timestamp"] },
//       { fields: ["status"] },
//     ],
//   }
// );

// const PARAMS_MAP = {
//   latch_force: "LATCH_FORCE",
//   claw_force: "CLAW_FORCE",
//   safety_lever: "SAFETY_LEVER",
//   claw_lever: "CLAW_LEVER",
//   stroke: "STROKE",
//   alarm: "ALARM",
// };

// PlcDashboardModel.prototype.toJSON = function () {
//   const values = { ...this.get() };
//   let extra = values.extra_data || {};
//   if (typeof extra === "string") {
//     try {
//       extra = JSON.parse(extra);
//     } catch (_) {
//       extra = {};
//     }
//   }

//   const parameters = {};

//   // Only include primitive values from extra_data (exclude nested objects)
//   for (const [key, value] of Object.entries(extra)) {
//     // Skip nested objects and arrays
//     if (key === "product" || key === "PRODUCTION_COUNT" || key === "Barcode_details") {
//       continue; // Skip these - they're handled separately
//     }
//     // Only include primitive values (string, number, boolean, null)
//     if (value !== null && typeof value !== "object") {
//       parameters[key] = value;
//     }
//   }

//   // Add mapped parameters from DB columns
//   for (const [dbCol, paramKey] of Object.entries(PARAMS_MAP)) {
//     if (values[dbCol] !== undefined && values[dbCol] !== null) {
//       parameters[paramKey] = values[dbCol];
//     }
//   }

//   const product = extra.product ?? null;
//   const Barcode_details = extra.Barcode_details ?? null;

//   return {
//     _id: values._id,
//     companyname: values.company_name,
//     plantname: values.plant_name,
//     linenumber: values.line_number,
//     device_id: values.device_id,
//     timestamp: values.timestamp,
//     Start_time: values.start_time,
//     Stop_time: values.stop_time,
//     Status: values.status,
//     product,
//     production_count: values.production_count ?? extra.PRODUCTION_COUNT ?? null,
//     machine: values.model ? { model: values.model } : {},
//     parameters,
//     Barcode_details,
//     last_updated: values.last_updated,
//     created_at: values.created_at,
//     updated_at: values.updated_at,
//   };
// };

import { Sequelize, DataTypes } from 'sequelize'
import { sequelize } from '../sequelize.js'

/**
 * Parameter mapping
 */
const PARAMS_MAP = {
  latch_force: 'LATCH_FORCE',
  claw_force: 'CLAW_FORCE',
  safety_lever: 'SAFETY_LEVER',
  claw_lever: 'CLAW_LEVER',
  stroke: 'STROKE',
  alarm: 'ALARM',
}

/**
 * PLC Dashboard Model
 */
export const PlcDashboardModel = sequelize.define(
  'PlcDashboard',
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: Sequelize.literal('NEWID()'),
      primaryKey: true,
    },

    device_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },

    company_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    plant_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    line_number: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    timestamp: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    start_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    stop_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    status: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    latch_force: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    claw_force: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    safety_lever: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    claw_lever: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    stroke: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    production_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    model: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    alarm: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    /**
     * JSON data from PLC
     */
    extra_data: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    plc_data_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    /**
     * Latest update time
     */
    last_updated: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal('GETDATE()'),
    },
  },

  {
    tableName: 'plc_dashboard',

    timestamps: true,

    createdAt: 'created_at',
    updatedAt: 'updated_at',

    /**
     * Performance Indexes
     */
    indexes: [
      /**
       * Unique device index
       */
      {
        name: 'idx_device_id_unique',
        unique: true,
        fields: ['device_id'],
      },

      /**
       * Timestamp sorting/filtering
       */
      {
        name: 'idx_timestamp',
        fields: ['timestamp'],
      },

      /**
       * Device + timestamp
       * Most important for dashboard APIs
       */
      {
        name: 'idx_device_timestamp',
        fields: ['device_id', 'timestamp'],
      },

      /**
       * Status based filtering
       */
      {
        name: 'idx_status',
        fields: ['status'],
      },

      /**
       * Status + timestamp
       */
      {
        name: 'idx_status_timestamp',
        fields: ['status', 'timestamp'],
      },

      /**
       * Company + plant + line filtering
       */
      {
        name: 'idx_company_plant_line',
        fields: ['company_name', 'plant_name', 'line_number'],
      },

      /**
       * Fast model filtering
       */
      {
        name: 'idx_model',
        fields: ['model'],
      },

      /**
       * Production analytics
       */
      {
        name: 'idx_production_count',
        fields: ['production_count'],
      },

      /**
       * Last updated sorting
       */
      {
        name: 'idx_last_updated',
        fields: ['last_updated'],
      },

      /**
       * Foreign relation
       */
      {
        name: 'idx_plc_data_id',
        fields: ['plc_data_id'],
      },

      /**
       * Dashboard latest queries
       */
      {
        name: 'idx_dashboard_lookup',
        fields: ['company_name', 'plant_name', 'line_number', 'status', 'timestamp'],
      },
    ],

    /**
     * Default query optimization
     */
    defaultScope: {
      attributes: {
        exclude: ['extra_data'],
      },
    },

    /**
     * Include JSON only when needed
     */
    scopes: {
      withExtraData: {
        attributes: {
          include: ['extra_data'],
        },
      },
    },
  },
)

/**
 * Optimized JSON serializer
 */
PlcDashboardModel.prototype.toJSON = function () {
  const values = { ...this.get() }

  let extra = values.extra_data || {}

  /**
   * Avoid repeated parsing
   */
  if (typeof extra === 'string') {
    try {
      extra = JSON.parse(extra)
    } catch (err) {
      extra = {}
    }
  }

  const parameters = {}

  /**
   * Only primitive values
   */
  for (const [key, value] of Object.entries(extra)) {
    if (key === 'product' || key === 'PRODUCTION_COUNT' || key === 'Barcode_details') {
      continue
    }

    /**
     * Skip arrays/objects
     */
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      parameters[key] = value
    }
  }

  /**
   * Add DB mapped params
   */
  for (const [dbCol, paramKey] of Object.entries(PARAMS_MAP)) {
    if (values[dbCol] !== undefined && values[dbCol] !== null) {
      parameters[paramKey] = values[dbCol]
    }
  }

  return {
    _id: values._id,

    companyname: values.company_name,

    plantname: values.plant_name,

    linenumber: values.line_number,

    device_id: values.device_id,

    timestamp: values.timestamp,

    Start_time: values.start_time,

    Stop_time: values.stop_time,

    Status: values.status,

    product: extra.product ?? null,

    production_count: values.production_count ?? extra.PRODUCTION_COUNT ?? null,

    machine: values.model
      ? {
          model: values.model,
        }
      : {},

    parameters,

    Barcode_details: extra.Barcode_details ?? null,

    last_updated: values.last_updated,

    created_at: values.created_at,

    updated_at: values.updated_at,
  }
}

/**
 * Sync indexes manually
 * Use only once during deployment
 */
export const syncPlcDashboardIndexes = async () => {
  try {
    await PlcDashboardModel.sync({
      alter: false,
    })

    console.log('✅ PlcDashboard indexes synchronized')
  } catch (error) {
    console.error('❌ Error syncing indexes:', error)
  }
}

/**
 * Recommended optimized query examples
 */

/**
 * Fetch latest dashboard data
 */
export const getLatestDashboardData = async (limit = 100) => {
  return PlcDashboardModel.findAll({
    attributes: [
      '_id',
      'device_id',
      'company_name',
      'plant_name',
      'line_number',
      'status',
      'timestamp',
      'production_count',
      'model',
      'last_updated',
    ],

    order: [['timestamp', 'DESC']],

    limit,

    raw: true,
  })
}

/**
 * Fetch by device id
 */
export const getDashboardByDevice = async (deviceId) => {
  return PlcDashboardModel.findOne({
    where: {
      device_id: deviceId,
    },

    raw: true,
  })
}

/**
 * Fetch running machines only
 */
export const getRunningMachines = async () => {
  return PlcDashboardModel.findAll({
    where: {
      status: 'RUNNING',
    },

    attributes: ['device_id', 'status', 'timestamp', 'production_count'],

    order: [['timestamp', 'DESC']],

    raw: true,
  })
}

/**
 * Heavy JSON fetch only when needed
 */
export const getDashboardWithExtraData = async (deviceId) => {
  return PlcDashboardModel.scope('withExtraData').findOne({
    where: {
      device_id: deviceId,
    },
  })
}
