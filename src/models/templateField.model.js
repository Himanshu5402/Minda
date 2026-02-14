import { Sequelize, DataTypes } from "sequelize";
import { sequelize } from "../sequelize.js";

export const TemplateFieldModel = sequelize.define(
  "TemplateField",
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: Sequelize.literal("NEWID()"),
      primaryKey: true,
    },
    template_id: { type: DataTypes.UUID, allowNull: false },
    field_name: { type: DataTypes.STRING, allowNull: false }, 
    field_type: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [
          [
            "TEXT",
            "NUMBER",
            "CHECKBOX",
            "DROPDOWN",
            "RADIO",
            "DATE",
            "TEXTAREA",
            "IMAGE",
          ],
        ],
      },
    },
    is_mandatory: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    dropdown_options: {
      // stored as JSON string: ["opt1","opt2"]
      type: DataTypes.TEXT,
      allowNull: true,
    },
    type: { type: DataTypes.ENUM("HOD",'User','Approval'), allowNull: true,defaultValue:'User' },
    group_id: { type: DataTypes.UUID, allowNull: true },
    parent_id: { type: DataTypes.UUID, allowNull: true },
    is_submission_only: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    timestamps: true,
    tableName: "template_fields",
    indexes: [{ fields: ["template_id"] }],
  }
);

