import { QualityCheckModel } from "../models/qualityCheck.model.js";
import { NotFoundError } from "../utils/errorHandler.js";
import { Op } from "sequelize";

export const createQualityCheckService = async (data) => {
  const qc = await QualityCheckModel.create({
    machine_name: data.machine_name || null,
    product_name: data.product_name || null,
    part_number: data.part_number || null,
    company_name: data.company_name || null,
    plant_name: data.plant_name || null,
    status: data.status || null,
    remarks: data.remarks || null,
    checked_by: data.checked_by || null,
    checked_at: data.checked_at ? new Date(data.checked_at) : null,
    approve_quantity: data.approve_quantity ?? 0,
    reject_quantity: data.reject_quantity ?? 0,
  });
  return qc;
};

export const getAllQualityChecksService = async (filters = {}) => {
  const where = {};

  if (filters.machine_name && filters.machine_name.trim()) {
    where.machine_name = { [Op.like]: `%${filters.machine_name.trim()}%` };
  }

  if (filters.product_name && filters.product_name.trim()) {
    where.product_name = { [Op.like]: `%${filters.product_name.trim()}%` };
  }

  if (filters.status && filters.status.trim()) {
    where.status = { [Op.like]: `%${filters.status.trim()}%` };
  }

  if (filters.company_name && filters.company_name.trim()) {
    where.company_name = { [Op.like]: `%${filters.company_name.trim()}%` };
  }

  if (filters.plant_name && filters.plant_name.trim()) {
    where.plant_name = { [Op.like]: `%${filters.plant_name.trim()}%` };
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    where[Op.or] = [
      { machine_name: { [Op.like]: term } },
      { product_name: { [Op.like]: term } },
      { part_number: { [Op.like]: term } },
      { company_name: { [Op.like]: term } },
      { plant_name: { [Op.like]: term } },
      { remarks: { [Op.like]: term } },
    ];
  }

  const page = Math.max(parseInt(filters.page) || 1, 1);
  const limit = Math.min(parseInt(filters.limit) || 10, 100);
  const offset = (page - 1) * limit;

  const { rows, count } = await QualityCheckModel.findAndCountAll({
    where,
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });
  return { data: rows, total: count, page, limit };
};

export const getQualityCheckByIdService = async (id) => {
  const qc = await QualityCheckModel.findByPk(id);
  if (!qc) {
    throw new NotFoundError("Quality Check not found", "getQualityCheckByIdService()");
  }
  return qc;
};

export const updateQualityCheckService = async (id, data) => {
  const qc = await QualityCheckModel.findByPk(id);
  if (!qc) {
    throw new NotFoundError("Quality Check not found", "updateQualityCheckService()");
  }

  const updateData = {};
  if (data.machine_name !== undefined) updateData.machine_name = data.machine_name;
  if (data.product_name !== undefined) updateData.product_name = data.product_name;
  if (data.part_number !== undefined) updateData.part_number = data.part_number;
  if (data.company_name !== undefined) updateData.company_name = data.company_name;
  if (data.plant_name !== undefined) updateData.plant_name = data.plant_name;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.remarks !== undefined) updateData.remarks = data.remarks;
  if (data.checked_by !== undefined) updateData.checked_by = data.checked_by;
  if (data.checked_at !== undefined) updateData.checked_at = data.checked_at ? new Date(data.checked_at) : null;
  if (data.approve_quantity !== undefined) updateData.approve_quantity = data.approve_quantity;
  if (data.reject_quantity !== undefined) updateData.reject_quantity = data.reject_quantity;

  await qc.update(updateData);
  return qc;
};

export const deleteQualityCheckService = async (id) => {
  const qc = await QualityCheckModel.findByPk(id);
  if (!qc) {
    throw new NotFoundError("Quality Check not found", "deleteQualityCheckService()");
  }
  await qc.destroy();
  return true;
};
