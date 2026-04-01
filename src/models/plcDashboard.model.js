import { Sequelize, DataTypes } from "sequelize";
import { sequelize } from "../sequelize.js";

export const PlcDashboardModel = sequelize.define(
  "PlcDashboard",
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: Sequelize.literal("NEWID()"),
      primaryKey: true,
    },
    device_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    company_name: { type: DataTypes.STRING(255), allowNull: true },
    plant_name: { type: DataTypes.STRING(255), allowNull: true },
    line_number: { type: DataTypes.STRING(50), allowNull: true },
    timestamp: { type: DataTypes.DATE, allowNull: true },
    start_time: { type: DataTypes.DATE, allowNull: true },
    stop_time: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING(255), allowNull: true },
    latch_force: { type: DataTypes.INTEGER, allowNull: true },
    claw_force: { type: DataTypes.INTEGER, allowNull: true },
    safety_lever: { type: DataTypes.INTEGER, allowNull: true },
    claw_lever: { type: DataTypes.INTEGER, allowNull: true },
    stroke: { type: DataTypes.INTEGER, allowNull: true },
    production_count: { type: DataTypes.INTEGER, allowNull: true },
    model: { type: DataTypes.STRING(255), allowNull: true },
    alarm: { type: DataTypes.STRING(255), allowNull: true },
    extra_data: { type: DataTypes.JSON, allowNull: true },
    plc_data_id: { type: DataTypes.UUID, allowNull: false },
    last_updated: { type: DataTypes.DATE, defaultValue: Sequelize.literal("GETDATE()") },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    tableName: "plc_dashboard",
    indexes: [
      { unique: true, fields: ["device_id"] },
      { fields: ["timestamp"] },
      { fields: ["status"] },
    ],
  }
);

const PARAMS_MAP = {
  latch_force: "LATCH_FORCE",
  claw_force: "CLAW_FORCE",
  safety_lever: "SAFETY_LEVER",
  claw_lever: "CLAW_LEVER",
  stroke: "STROKE",
  alarm: "ALARM",
};

PlcDashboardModel.prototype.toJSON = function () {
  const values = { ...this.get() };
  let extra = values.extra_data || {};
  if (typeof extra === "string") {
    try {
      extra = JSON.parse(extra);
    } catch (_) {
      extra = {};
    }
  }

  const parameters = {};
  
  // Only include primitive values from extra_data (exclude nested objects)
  for (const [key, value] of Object.entries(extra)) {
    // Skip nested objects and arrays
    if (key === "product" || key === "PRODUCTION_COUNT" || key === "Barcode_details") {
      continue; // Skip these - they're handled separately
    }
    // Only include primitive values (string, number, boolean, null)
    if (value !== null && typeof value !== "object") {
      parameters[key] = value;
    }
  }
  
  // Add mapped parameters from DB columns
  for (const [dbCol, paramKey] of Object.entries(PARAMS_MAP)) {
    if (values[dbCol] !== undefined && values[dbCol] !== null) {
      parameters[paramKey] = values[dbCol];
    }
  }

  const product = extra.product ?? null;
  const Barcode_details = extra.Barcode_details ?? null;

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
    product,
    production_count: values.production_count ?? extra.PRODUCTION_COUNT ?? null,
    machine: values.model ? { model: values.model } : {},
    parameters,
    Barcode_details,
    last_updated: values.last_updated,
    created_at: values.created_at,
    updated_at: values.updated_at,
  };
};
