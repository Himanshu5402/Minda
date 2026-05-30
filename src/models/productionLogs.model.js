import { DataTypes } from "sequelize";
import { sequelize } from "../sequelize.js";

export const ProductionLogsModel = sequelize.define(
  "ProductionLog",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    company_name: { type: DataTypes.STRING(255), allowNull: true },
    code: { type: DataTypes.INTEGER, allowNull: true },
    part_no: { type: DataTypes.STRING(255), allowNull: true },
    qty: { type: DataTypes.INTEGER, allowNull: true },
    new_part_no: { type: DataTypes.STRING(255), allowNull: true },
    grade: { type: DataTypes.STRING(255), allowNull: true },
    operator_name: { type: DataTypes.STRING(255), allowNull: true },
    date_time: { type: DataTypes.DATE, allowNull: true },
    machine: { type: DataTypes.STRING(255), allowNull: true },
    product_name: { type: DataTypes.STRING(255), allowNull: true },
    barcode: { type: DataTypes.STRING(255), allowNull: true },
    status: { type: DataTypes.STRING(50), allowNull: true },
    print_time: { type: DataTypes.DATE, allowNull: true },
    result_status: { type: DataTypes.STRING(50), allowNull: true },
    user_id: { type: DataTypes.STRING(50), allowNull: true },
  },
  {
    tableName: "production_logs",
    timestamps: false,
  }
);
