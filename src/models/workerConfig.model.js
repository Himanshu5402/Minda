import { Sequelize, DataTypes } from "sequelize";
import { sequelize } from "../sequelize.js";

export const WorkerConfigModel = sequelize.define(
  "WorkerConfig",
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: Sequelize.literal("NEWID()"),
      primaryKey: true,
    },
    worker_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    last_processed_timestamp: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_processed_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    tableName: "worker_configs",
  }
);
