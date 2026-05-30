import { Op } from "sequelize";
import { ProductionLogsModel } from "../models/productionLogs.model.js";

export const getProductionLogsForUser = async (
  userId,
  { page = 1, limit = 20, status, search } = {}
) => {
  const where = { user_id: userId };

  if (status) {
    where.status = status;
  }

  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [
      { product_name: { [Op.like]: term } },
      { part_no: { [Op.like]: term } },
      { barcode: { [Op.like]: term } },
      { machine: { [Op.like]: term } },
      { company_name: { [Op.like]: term } },
    ];
  }

  const offset = (Math.max(1, page) - 1) * limit;

  const { count, rows } = await ProductionLogsModel.findAndCountAll({
    where,
    limit: parseInt(limit, 10),
    offset,
    order: [["date_time", "DESC"]],
  });

  return {
    data: rows.map((r) => (r.toJSON ? r.toJSON() : r)),
    total: count,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(count / limit) || 0,
  };
};

export const getProductionLogsSummary = async (userId) => {
  const { sequelize } = await import("../sequelize.js");
  const [rows] = await sequelize.query(
    `SELECT
      COUNT(*) AS total_records,
      ISNULL(SUM(qty), 0) AS total_qty,
      SUM(CASE WHEN UPPER(status) = 'PASS' THEN 1 ELSE 0 END) AS pass_count,
      SUM(CASE WHEN UPPER(status) = 'FAIL' THEN 1 ELSE 0 END) AS fail_count
    FROM production_logs
    WHERE user_id = :userId`,
    { replacements: { userId } }
  );

  const row = rows[0] || {};
  return {
    total_records: Number(row.total_records) || 0,
    total_qty: Number(row.total_qty) || 0,
    pass_count: Number(row.pass_count) || 0,
    fail_count: Number(row.fail_count) || 0,
  };
};
