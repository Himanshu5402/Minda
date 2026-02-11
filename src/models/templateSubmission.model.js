import { Sequelize, DataTypes } from "sequelize";
import { sequelize } from "../sequelize.js";

export const TemplateSubmissionModel = sequelize.define(
  "TemplateSubmission",
  {
    _id: {
      type: DataTypes.UUID,
      defaultValue: Sequelize.literal("NEWID()"),
      primaryKey: true,
    },
    template_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "template_masters",
        key: "_id",
      },
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "_id",
      },
    },
    form_data: {
      type: DataTypes.TEXT,
      allowNull: false,
      get() {
        const value = this.getDataValue("form_data");
        try {
          return value ? JSON.parse(value) : {};
        } catch {
          return {};
        }
      },
      set(value) {
        this.setDataValue("form_data", JSON.stringify(value));
      },
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "DRAFT", // DRAFT, SUBMITTED
    },
    edit_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    plant_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    process_approved: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    submission_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    }
  },
  {
    timestamps: true,
    tableName: "template_submissions",
    indexes: [
      { fields: ["template_id"] },
      { fields: ["user_id"] },
      { fields: ["status"] },
      { fields: ["template_id", "user_id"] },
    ],
    hooks: {
      beforeCreate: async (submission) => {
        // Get last submission ordered by submission_id descending
        const lastSubmission = await TemplateSubmissionModel.findOne({
          where:{
            template_id: submission.template_id,
          },
          order: [['submission_id', 'DESC']],
          attributes: ['submission_id']
        });

        let nextNumber = 1; 

        if (lastSubmission && lastSubmission.submission_id) {
          const lastNumber = parseInt(lastSubmission.submission_id, 10);
          nextNumber = lastNumber + 1;
        }

        // Pad with zeros to create format like "0001", "0002", etc.
        submission.submission_id = String(nextNumber).padStart(4, '0');
      }
    }
  }
);
