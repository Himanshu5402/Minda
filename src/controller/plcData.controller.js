import { StatusCodes } from 'http-status-codes'
import { AsyncHandler } from '../utils/asyncHandler.js'
import PDFDocument from 'pdfkit-table'
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
} from '../services/plcData.service.js'

export const createPlcData = AsyncHandler(async (req, res) => {
  const result = await createPlcDataService(req.body)
  res.status(StatusCodes.CREATED).json({
    message: 'PLC Data created successfully',
    data: result,
  })
})

import path from 'path'

export const downloadMachineStoppagePdf = AsyncHandler(async (req, res) => {
  try {
    const { machine_name, from_date, to_date } = req.query

    const filters = {}
    if (machine_name) filters.machine_name = machine_name
    if (from_date) filters.from_date = from_date
    if (to_date) filters.to_date = to_date

    // Headers
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="machine-stoppage-summary.pdf"')

    const doc = new PDFDocument({
      margin: 30,
      size: 'A4',
      autoFirstPage: false,
    })

    doc.pipe(res)

    const logoPath = path.join(process.cwd(), 'assets/logo.png')

    // ✅ FIRST PAGE
    doc.addPage()

    // ✅ HEADER + FOOTER
    const drawPageLayout = () => {
      try {
        // LOGO
        doc.image(logoPath, 30, 20, { width: 80 })
      } catch (err) {
        console.log('Logo error:', err.message)
      }

      // TITLE
      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor('#2e4c99')
        .text(' JPMG Machine Stoppage Summary', 0, 30, {
          align: 'center',
        })

     
    }

    drawPageLayout()
    doc.on('pageAdded', drawPageLayout)

    // ✅ IMPORTANT: FIX POSITION (NO moveDown)
    doc.y = 100

    let page = 1
    const limit = 1000
    let hasMore = true

    while (hasMore) {
      const result = await getMachineStoppageService(filters, { page, limit })

      const chunk = result.data.map((item) => ({
        machine_name: item.device_id || 'N/A',
        device_id: item.device_id || 'N/A',
        start_time: item.Start_time ? new Date(item.Start_time).toLocaleString() : 'N/A',
        stop_time: item.Stop_time ? new Date(item.Stop_time).toLocaleString() : 'N/A',
        stopped_duration: item.stopped_duration || 0,
        status: item.Status || 'N/A',
      }))

      if (chunk.length === 0) break

      await doc.table(
        {
          headers: [
            { label: 'Machine Name', property: 'machine_name', width: 100 },
            { label: 'Machine ID', property: 'device_id', width: 80 },
            { label: 'Start Time', property: 'start_time', width: 110 },
            { label: 'Stop Time', property: 'stop_time', width: 110 },
            { label: 'Duration (Min)', property: 'stopped_duration', width: 70 },
            { label: 'Status', property: 'status', width: 65 },
          ],
          datas: chunk,
        },
        {
          prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10).fillColor('black'),
          prepareRow: () => doc.font('Helvetica').fontSize(9).fillColor('black'),

          // ✅ MAIN FIX (table same page pe start hoga)
          startY: doc.y,
        },
      )

      if (chunk.length < limit) {
        hasMore = false
      } else {
        page++
      }
    }

    doc.end()
  } catch (error) {
    console.error(error)

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'PDF generation failed',
      })
    }
  }
})
export const getMachineStoppage = AsyncHandler(async (req, res) => {
  const { machine_name, from_date, to_date, page, limit } = req.query

  const filters = {}
  if (machine_name) filters.machine_name = machine_name
  if (from_date) filters.from_date = from_date
  if (to_date) filters.to_date = to_date

  const pagination = {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 10,
  }

  const result = await getMachineStoppageService(filters, pagination)

  res.status(StatusCodes.OK).json({
    message: 'Machine stoppage data fetched successfully',
    ...result,
  })
})

export const getAllPlcData = AsyncHandler(async (req, res) => {
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
  } = req.query
  const filters = {}

  if (device_id) filters.device_id = device_id
  if (model) filters.model = model
  if (status) filters.status = status
  if (company_name) filters.company_name = company_name
  if (plant_name) filters.plant_name = plant_name
  if (startDate) filters.startDate = startDate
  if (endDate) filters.endDate = endDate
  if (timestampStart) filters.timestampStart = timestampStart
  if (timestampEnd) filters.timestampEnd = timestampEnd

  // const pageNumber = Math.max(parseInt(page) || 1, 1);
  // const pageSize = Math.min(parseInt(limit) || 10, 5000);
  // const offset = (pageNumber - 1) * pageSize;

  const result = await getAllPlcDataService(filters)
  res.status(StatusCodes.OK).json({
    message: 'PLC Data fetched successfully',
    data: result,
  });
});

// PLC Report API for report module table
export const getPlcReport = AsyncHandler(async (req, res) => {
  const {
    device_id,
    model,        // ← ab yahi model filter hai
    status,
    company_name,
    plant_name,
    page  = 1,
    limit = 10,
    duration,
    startDate,
    endDate,
    startTime,
    endTime,
    timestampStart,
    timestampEnd,
  } = req.query;

  const filters = {};

  if (device_id)    filters.device_id    = device_id;
  if (company_name) filters.company_name = company_name;
  if (plant_name)   filters.plant_name   = plant_name;
  if (model)        filters.model        = model;        // ← seedha model
  if (status && status !== "all") filters.status = status;
  if (timestampStart) filters.timestampStart = timestampStart;
  if (timestampEnd)   filters.timestampEnd   = timestampEnd;

  if (duration && duration !== "all") {
    filters.duration  = duration;
    filters.startDate = startDate;
    filters.endDate   = endDate;
    filters.startTime = startTime;
    filters.endTime   = endTime;
  }

  const result = await getAllPlcReport(filters, { page, limit });

  res.status(StatusCodes.OK).json({
    message: "PLC Report fetched successfully",
    data: {
      rows:             result.data,
      total:            result.total,
      page:             result.page,
      limit:            result.limit,
      totalPages:       result.totalPages,
      summary:          result.summary,
      productSummaries: result.productSummaries,
    },
  });
});

export const getPlcDataById = AsyncHandler(async (req, res) => {
  const result = await getPlcDataByIdService(req.params.id)
  res.status(StatusCodes.OK).json({
    message: 'PLC Data fetched successfully',
    data: result,
  })
})

export const updatePlcData = AsyncHandler(async (req, res) => {
  const result = await updatePlcDataService(req.params.id, req.body)
  res.status(StatusCodes.OK).json({
    message: 'PLC Data updated successfully',
    data: result,
  })
})

export const deletePlcData = AsyncHandler(async (req, res) => {
  await deletePlcDataService(req.params.id)
  res.status(StatusCodes.OK).json({
    message: 'PLC Data deleted successfully',
  })
})

export const getPlcErrorDistribution = AsyncHandler(async (req, res) => {
  const { startDate, endDate, companyName, plantName, deviceId, model } = req.query
  const filters = {}
  if (startDate) filters.startDate = startDate
  if (endDate) filters.endDate = endDate
  if (companyName) filters.companyName = companyName
  if (plantName) filters.plantName = plantName
  if (deviceId) filters.deviceId = deviceId
  if (model) filters.model = model

  const result = await getPlcErrorDistributionService(filters)
  res.status(StatusCodes.OK).json({
    message: 'PLC Error distribution fetched successfully',
    data: result,
  })
})

export const getPlcDowntimeByMachine = AsyncHandler(async (req, res) => {
  const { startDate, endDate, companyName, plantName, deviceId, model } = req.query
  const filters = {}
  if (startDate) filters.startDate = startDate
  if (endDate) filters.endDate = endDate
  if (companyName) filters.companyName = companyName
  if (plantName) filters.plantName = plantName
  if (deviceId) filters.deviceId = deviceId
  if (model) filters.model = model

  const result = await getPlcDowntimeByMachineService(filters)
  res.status(StatusCodes.OK).json({
    message: 'PLC Downtime fetched successfully',
    data: result,
  })
})

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

  const result = await getPlcTimeDistributionService(filters)
  res.status(StatusCodes.OK).json({
    message: 'PLC Time Distribution fetched successfully',
    data: result,
  })
})
