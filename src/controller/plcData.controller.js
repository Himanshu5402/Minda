import { StatusCodes } from "http-status-codes";
import { AsyncHandler } from "../utils/asyncHandler.js";
import {
  createPlcDataService,
  getAllPlcDataService,
  getPlcDataByIdService,
  updatePlcDataService,
  deletePlcDataService,
  getPlcErrorDistributionService,
  getPlcDowntimeByMachineService,
  getPlcTimeDistributionService,
} from "../services/plcData.service.js";

export const createPlcData = AsyncHandler(async (req, res) => {
  const result = await createPlcDataService(req.body);
  res.status(StatusCodes.CREATED).json({
    message: "PLC Data created successfully",
    data: result,
  });
});

export const getAllPlcData = AsyncHandler(async (req, res) => {
  const { device_id, model, status, startDate, endDate, timestampStart, timestampEnd, company_name, plant_name,page,limit } = req.query;
  const filters = {};
  
  if (device_id) filters.device_id = device_id;
  if (model) filters.model = model;
  if (status) filters.status = status;
  if (company_name) filters.company_name = company_name;
  if (plant_name) filters.plant_name = plant_name;
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  if (timestampStart) filters.timestampStart = timestampStart;
  if (timestampEnd) filters.timestampEnd = timestampEnd;

  const pageNumber = Math.max(parseInt(page) || 1, 1);
  const pageSize = Math.min(parseInt(limit) || 10, 5000);
  const offset = (pageNumber - 1) * pageSize;

  const result = await getAllPlcDataService(filters,{page: pageNumber,
    limit: pageSize,
    offset,});
  res.status(StatusCodes.OK).json({
    message: "PLC Data fetched successfully",
    data: result,
  });
});


export const getPlcDataById = AsyncHandler(async (req, res) => {
  const result = await getPlcDataByIdService(req.params.id);
  res.status(StatusCodes.OK).json({
    message: "PLC Data fetched successfully",
    data: result,
  });
});

export const updatePlcData = AsyncHandler(async (req, res) => {
  const result = await updatePlcDataService(req.params.id, req.body);
  res.status(StatusCodes.OK).json({
    message: "PLC Data updated successfully",
    data: result,
  });
});

export const deletePlcData = AsyncHandler(async (req, res) => {
  await deletePlcDataService(req.params.id);
  res.status(StatusCodes.OK).json({
    message: "PLC Data deleted successfully",
  });
});

export const getPlcErrorDistribution = AsyncHandler(async (req, res) => {
  const { startDate, endDate, companyName, plantName, deviceId, model } = req.query;
  const filters = {};
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  if (companyName) filters.companyName = companyName;
  if (plantName) filters.plantName = plantName;
  if (deviceId) filters.deviceId = deviceId;
  if (model) filters.model = model;

  const result = await getPlcErrorDistributionService(filters);
  res.status(StatusCodes.OK).json({
    message: "PLC Error distribution fetched successfully",
    data: result,
  });
});

export const getPlcDowntimeByMachine = AsyncHandler(async (req, res) => {
  const { startDate, endDate, companyName, plantName, deviceId, model } = req.query;
  const filters = {};
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  if (companyName) filters.companyName = companyName;
  if (plantName) filters.plantName = plantName;
  if (deviceId) filters.deviceId = deviceId;
  if (model) filters.model = model;

  const result = await getPlcDowntimeByMachineService(filters);
  res.status(StatusCodes.OK).json({
    message: "PLC Downtime fetched successfully",
    data: result,
  });
});

export const getPlcTimeDistribution = AsyncHandler(async (req, res) => {
  const { startDate, endDate, companyName, plantName, deviceId, model, status } = req.query;
  const filters = {};
  if (startDate) filters.startDate = startDate;
  if (endDate) filters.endDate = endDate;
  if (companyName) filters.company_name = companyName;
  if (plantName) filters.plant_name = plantName;
  if (deviceId) filters.device_id = deviceId;
  if (model) filters.model = model;
  if (status) filters.status = status;

  const result = await getPlcTimeDistributionService(filters);
  res.status(StatusCodes.OK).json({
    message: "PLC Time Distribution fetched successfully",
    data: result,
  });
});
