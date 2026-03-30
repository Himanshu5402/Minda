import { StatusCodes } from "http-status-codes";
import { AsyncHandler } from "../utils/asyncHandler.js";
import PDFDocument from "pdfkit-table";
import {
  createPlcDataService,
  getAllPlcDataService,
  getPlcDataByIdService,
  updatePlcDataService,
  deletePlcDataService,
  getPlcErrorDistributionService,
  getPlcDowntimeByMachineService,
  getPlcTimeDistributionService,
  getMachineStoppageService,
} from "../services/plcData.service.js";

export const createPlcData = AsyncHandler(async (req, res) => {
  const result = await createPlcDataService(req.body);
  res.status(StatusCodes.CREATED).json({
    message: "PLC Data created successfully",
    data: result,
  });
});

export const downloadMachineStoppagePdf = AsyncHandler(async (req, res) => {
  const { machine_name, from_date, to_date } = req.query;

  const filters = {};
  if (machine_name) filters.machine_name = machine_name;
  if (from_date) filters.from_date = from_date;
  if (to_date) filters.to_date = to_date;

  // Set response headers for PDF download
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="machine-stoppage-summary.pdf"'
  );

  const doc = new PDFDocument({ margin: 30, size: "A4" });
  doc.pipe(res);

  // Helper to draw header and footer on every page
  const drawPageLayout = () => {
    const oldFontSize = doc._fontSize;
    const oldFillColor = doc._fillColor;

    // Header Logo (Top Left)
    // doc.fontSize(20).fillColor("black").font("Helvetica-Bold").text("JPMG", 30, 20);

    // Footer (Bottom Center)
    doc.fontSize(30).fillColor("grey").font("Helvetica").text(
      "JPMG Machine Stoppage Summary",
      0,
      doc.page.height - 30,
      { align: "center", width: doc.page.width }
    );

    // Restore state
    doc.fontSize(oldFontSize || 10).fillColor(oldFillColor || "black");
  };

  // Draw for the first page
  drawPageLayout();

  // Draw for subsequent pages
  doc.on("pageAdded", () => {
    drawPageLayout();
  });

  // Table Configuration
  const table = {
    title: { label: "Machine Stoppage Summary", fontSize: 18, font: "Helvetica-Bold" },
    subtitle: { label: `Generated on: ${new Date().toLocaleString()}`, fontSize: 10, font: "Helvetica" },
    headers: [
      { label: "Machine Name", property: "machine_name", width: 100 },
      { label: "Machine ID", property: "device_id", width: 80 },
      { label: "Start Time", property: "start_time", width: 110 },
      { label: "Stop Time", property: "stop_time", width: 110 },
      { label: "Duration (Min)", property: "stopped_duration", width: 70 },
      { label: "Status", property: "status", width: 65 },
    ],
    datas: [],
  };

  let page = 1;
  const limit = 1000;
  let hasMore = true;

  // Move down to avoid overlapping with header logo
  doc.moveDown(4);

  while (hasMore) {
    const result = await getMachineStoppageService(filters, { page, limit });
    const chunk = result.data.map((item) => {
      // Handle product which could be a string or object
      let machineName = item.product;
      if (machineName && typeof machineName === "object") {
        machineName = machineName.material_description || machineName.material_code || machineName.part_no || machineName.model;
      }

      return {
        machine_name: machineName || item.device_id || "N/A",
        device_id: item.device_id || "N/A",
        start_time: item.Start_time ? new Date(item.Start_time).toLocaleString() : "N/A",
        stop_time: item.Stop_time ? new Date(item.Stop_time).toLocaleString() : "N/A",
        stopped_duration: item.stopped_duration || 0,
        status: item.Status || "N/A",
      };
    });

    if (chunk.length === 0) {
      hasMore = false;
      break;
    }

    // Use pdfkit-table's table method
    // Note: We only show title/subtitle on the first page
    await doc.table({
      ...table,
      title: page === 1 ? table.title : null,
      subtitle: page === 1 ? table.subtitle : null,
      datas: chunk,
    }, {
      prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10).fillColor("black"),
      prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
        doc.font("Helvetica").fontSize(9).fillColor("black");
      },
    });

    if (chunk.length < limit) {
      hasMore = false;
    } else {
      page++;
    }
  }

  doc.end();
});

export const getMachineStoppage = AsyncHandler(async (req, res) => {
  const { machine_name, from_date, to_date, page, limit } = req.query;

  const filters = {};
  if (machine_name) filters.machine_name = machine_name;
  if (from_date) filters.from_date = from_date;
  if (to_date) filters.to_date = to_date;

  const pagination = {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 10,
  };

  const result = await getMachineStoppageService(filters, pagination);

  res.status(StatusCodes.OK).json({
    message: "Machine stoppage data fetched successfully",
    ...result,
  });
});

export const getAllPlcData = AsyncHandler(async (req, res) => {
  const { device_id, model, status, startDate, endDate, timestampStart, timestampEnd, company_name, plant_name } = req.query;
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

  // const pageNumber = Math.max(parseInt(page) || 1, 1);
  // const pageSize = Math.min(parseInt(limit) || 10, 5000);
  // const offset = (pageNumber - 1) * pageSize;

  const result = await getAllPlcDataService(filters);
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

  const list = await getAllPlcDataService(filters);

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
      Shift: flatParams.SHIFT || flatParams.Shift || flatParams.shift || null,
      Operator: flatParams.Operatorname || flatParams.OPERATORNAME || flatParams.OPERATOR || flatParams.operator || null,
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
