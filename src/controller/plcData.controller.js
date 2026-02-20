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

// PLC Report API for report module table
export const getPlcReport = AsyncHandler(async (req, res) => {
  const {
    device_id,
    model,
    status,
    startDate,
    endDate,
    timestampStart,
    timestampEnd,
    company_name,
    plant_name,
    page,
    limit,
  } = req.query;

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
  const pageSize = Math.min(parseInt(limit) || 1000, 5000);
  const offset = (pageNumber - 1) * pageSize;

  const list = await getAllPlcDataService(filters, {
    page: pageNumber,
    limit: pageSize,
    offset,
  });

  const report = list.map((row) => {
    const json = row.toJSON();
    
    // Ensure parameters is a plain object (not nested objects)
    let params = json.parameters || {};
    if (typeof params === "string") {
      try {
        params = JSON.parse(params);
      } catch (_) {
        params = {};
      }
    }
    
    // Filter out nested objects from parameters (keep only primitive values)
    const flatParams = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && typeof value !== "object") {
        flatParams[key] = value;
      }
    }
    
    // Extract Barcode_details properly
    let barcode = json.Barcode_details || null;
    if (typeof barcode === "string") {
      try {
        barcode = JSON.parse(barcode);
      } catch (_) {
        barcode = null;
      }
    }
    if (!barcode || typeof barcode !== "object") {
      barcode = {};
    }

    // Extract product properly
    let product = json.product;
    if (typeof product === "string") {
      try {
        product = JSON.parse(product);
      } catch (_) {
        product = null;
      }
    }

    return {
      Company: json.companyname ?? null,
      Plant: json.plantname ?? null,
      Product:
        (product &&
          typeof product === "object" &&
          (product.material_code ||
            product.part_no ||
            product.model)) ||
        (typeof product === "string" ? product : null) ||
        null,
      Model:
        (product &&
          typeof product === "object" &&
          product.model) ||
        (json.machine && json.machine.model) ||
        json.model ||
        null,
      Shift: flatParams.SHIFT || flatParams.shift || null,
      Operator: flatParams.OPERATOR || flatParams.operator || null,
      Date: json.timestamp || null,
      LineNumber: json.linenumber ?? null,
      LineName: flatParams.linename || flatParams.line_name || null,
      BarcodeTag: barcode.BarcodeID || null,
      BarcodeStatus: barcode.BarcodeStatus || null,
      BarcodeDateTime: barcode.BarcodeDateTime || null,
      Rod: flatParams.ROD || flatParams.rod || null,
      Striker: flatParams.STRIKER || flatParams.striker || null,
      Error:
        flatParams.ERROR_STATUS ||
        flatParams.ERROR_CODE ||
        flatParams.error_status ||
        flatParams.error_code ||
        null,
      ProductionCount: json.production_count ?? flatParams.PRODUCTION_COUNT ?? flatParams.production_count ?? null,
      // PLC-data API se aane wale saare parameters (machine se) — Report ki Parameters column ke liye
      parameters: flatParams,
      timestamp: json.timestamp || null,
    };
  });

  res.status(StatusCodes.OK).json({
    message: "PLC Report fetched successfully",
    data: report,
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
