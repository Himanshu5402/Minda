  import { Sequelize, DataTypes } from "sequelize";
  import { sequelize } from "../sequelize.js";

  export const MachineHistoryModel = sequelize.define(
    "MachineHistory",
    {
      _id: {
        type: DataTypes.UUID,
        defaultValue: Sequelize.literal("NEWID()"),
        primaryKey: true,
      },
      device_id: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      production_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      product_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      part_no: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      model: {
        type: DataTypes.STRING(255),
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
      duration_seconds: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      timestamp: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.literal("GETDATE()"),
      },
      plc_data_id: {
        type: DataTypes.UUID,
        allowNull: false,
      }
    },
    {
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      tableName: "machine_history",
      indexes: [
        { fields: ["device_id"] },
        { fields: ["timestamp"] },
        { fields: ["status"] },
        { fields: ["device_id", "timestamp"] },
      ],
    }
  );

  MachineHistoryModel.prototype.toJSON = function () {
    const values = { ...this.get() };
    return values;
  };
