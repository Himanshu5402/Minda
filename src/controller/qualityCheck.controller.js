import { StatusCodes } from "http-status-codes";
import { AsyncHandler } from "../utils/asyncHandler.js";
import {
  createQualityCheckService,
  getAllQualityChecksService,
  getQualityCheckByIdService,
  updateQualityCheckService,
  deleteQualityCheckService,
} from "../services/qualityCheck.service.js";

export const createQualityCheck = AsyncHandler(async (req, res) => {
  const result = await createQualityCheckService(req.body);
  res.status(StatusCodes.CREATED).json({
    message: "Quality Check created successfully",
    data: result,
  });
});

export const getAllQualityChecks = AsyncHandler(async (req, res) => {
  const { machine_name, product_name, status, company_name, plant_name, search, page, limit } = req.query;
  const filters = {};
  if (machine_name) filters.machine_name = machine_name;
  if (product_name) filters.product_name = product_name;
  if (status) filters.status = status;
  if (company_name) filters.company_name = company_name;
  if (plant_name) filters.plant_name = plant_name;
  if (search) filters.search = search;
  if (page) filters.page = page;
  if (limit) filters.limit = limit;

  const result = await getAllQualityChecksService(filters);
  res.status(StatusCodes.OK).json({
    message: "Quality Checks fetched successfully",
    data: result.data,
    total: result.total,
    page: result.page,
    limit: result.limit,
  });
});

export const getQualityCheckById = AsyncHandler(async (req, res) => {
  const result = await getQualityCheckByIdService(req.params.id);
  res.status(StatusCodes.OK).json({
    message: "Quality Check fetched successfully",
    data: result,
  });
});

export const updateQualityCheck = AsyncHandler(async (req, res) => {
  const result = await updateQualityCheckService(req.params.id, req.body);
  res.status(StatusCodes.OK).json({
    message: "Quality Check updated successfully",
    data: result,
  });
});

export const deleteQualityCheck = AsyncHandler(async (req, res) => {
  await deleteQualityCheckService(req.params.id);
  res.status(StatusCodes.OK).json({
    message: "Quality Check deleted successfully",
  });
});
