import { StatusCodes } from "http-status-codes";
import { AsyncHandler } from "../utils/asyncHandler.js";
import PDFDocument from "pdfkit-table";
import { PlcDataModel } from "../models/plcData.model.js";
import {
  createPlcDataService,
  getAllPlcDataService,
  getPlcDataByIdService,
  getAllPlcReport,
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

export const getPlcReportOptions = AsyncHandler(async (req, res) => {
  const [companies, plants] = await Promise.all([
    PlcDataModel.findAll({
      attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("company_name")), "company_name"]],
      where: { company_name: { [Op.ne]: null } },
      raw: true,
    }),
    PlcDataModel.findAll({
      attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("plant_name")), "plant_name"]],
      where: { plant_name: { [Op.ne]: null } },
      raw: true,
    }),
  ]);

  // Products are inside JSON blob so fetch all product column values
  const allRows = await PlcDataModel.findAll({
    attributes: ["product"],
    where: { product: { [Op.ne]: null } },
    raw: true,
  });

  const productSet = new Set();
  for (const row of allRows) {
    let p = row.product;
    if (typeof p === "string") { try { p = JSON.parse(p); } catch (_) {} }
    const val =
      (p && typeof p === "object" && (p.material_code || p.part_no || p.model)) ||
      (typeof p === "string" ? p : null);
    if (val) productSet.add(val);
  }

  res.status(200).json({
    companies: companies.map((r) => r.company_name).filter(Boolean),
    plants:    plants.map((r) => r.plant_name).filter(Boolean),
    products:  Array.from(productSet),
  });
});

// PLC Report API for report module table
export const getPlcReport = AsyncHandler(async (req, res) => {
  const {
    // DB-level filters
    device_id,
    model,
    company_name,
    plant_name,
    // In-memory filters (values are inside JSON blobs)
    product,
    status,           // "ok" | "error" | "all"
    // Duration / date range
    duration,         // "today" | "week" | "month" | "custom" | "all"
    startDate,
    endDate,
    startTime,
    endTime,
    // Legacy direct timestamp range (kept for backward compat)
    timestampStart,
    timestampEnd,
    // Pagination
    page  = 1,
    limit = 10,
  } = req.query;

  const filters = {};

  if (device_id)    filters.device_id    = device_id;
  if (model)        filters.model        = model;
  if (company_name) filters.company_name = company_name;
  if (plant_name)   filters.plant_name   = plant_name;
  if (product && product !== "all") filters.product = product;
  if (status  && status  !== "all") filters.status  = status;

  if (duration && duration !== "all") {
    filters.duration  = duration;
    filters.startDate = startDate;
    filters.endDate   = endDate;
    filters.startTime = startTime;
    filters.endTime   = endTime;
  }

  if (timestampStart) filters.timestampStart = timestampStart;
  if (timestampEnd)   filters.timestampEnd   = timestampEnd;

  const result = await getAllPlcReport(
    filters,
    { page, limit }  // pass your imports here
  );

  // plcData.controller.js - getPlcReport

res.status(StatusCodes.OK).json({
  message: "PLC Report fetched successfully",
  data: {                                    // ← hook will extract THIS object
    rows:            result.data,            // the paginated rows
    total:           result.total,
    page:            result.page,
    limit:           result.limit,
    totalPages:      result.totalPages,
    summary:         result.summary,
    productSummaries: result.productSummaries,
  },
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
