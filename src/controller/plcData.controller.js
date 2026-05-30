import { StatusCodes } from 'http-status-codes'
import { AsyncHandler } from '../utils/asyncHandler.js'
import PDFDocument from 'pdfkit-table'
import ExcelJS from 'exceljs'

import {
  createPlcDataService,
  getAllPlcDataService,
  streamAllPlcDataService,
  getPlcDataByIdService,
  getAllPlcReport,
  updatePlcDataService,
  deletePlcDataService,
  getPlcErrorDistributionService,
  getPlcDowntimeByMachineService,
  getPlcTimeDistributionService,
  getMachineStoppageService,
  getPlcDowntimeByErrorService,
  getPlcDowntimeByErrorStatusService,
  getPlcListingService,
  getPlcReportOptionsService,
} from '../services/plcData.service.js'
import { io } from '../server.js'
import { cacheDelByPrefix, getOrSetJSON } from '../utils/redisCache.js'

const REPORT_CACHE_PREFIX = 'plc-report:'
const REPORT_OPTIONS_CACHE_KEY = 'plc-report:options'

export const createPlcData = AsyncHandler(async (req, res) => {
  const { data, isNewRecord } = await createPlcDataService(req.body)
  await cacheDelByPrefix(REPORT_CACHE_PREFIX)
  await cacheDelByPrefix(REPORT_OPTIONS_CACHE_KEY)

  if (isNewRecord && io) {
    console.log('[socket] emitting dataCreated for plcData')
    io.emit('dataCreated', {
      entity: 'plcData',
      data,
    })
  }

  res.status(StatusCodes.CREATED).json({
    message: 'PLC Data created successfully',
    data,
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
  const { machine_name, from_date, to_date, page = 1, limit = 10 } = req.query
  const filters = { machine_name, from_date, to_date }
  const pagination = { page, limit }

  const result = await getMachineStoppageService(filters, pagination)
  res.status(StatusCodes.OK).json(result)
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
  })
})

export const exportPlcData = AsyncHandler(async (req, res) => {
  const {
    device_id,
    model,
    status,
    company_name,
    plant_name,
    startDate,
    endDate,
    timestampStart,
    timestampEnd,
    stream,
    format,
    batchSize,
  } = req.query

  const filters = {}
  if (device_id) filters.device_id = device_id
  if (company_name) filters.company_name = company_name
  if (plant_name) filters.plant_name = plant_name
  if (model) filters.model = model
  if (status) filters.status = status
  if (timestampStart) filters.timestampStart = timestampStart
  if (timestampEnd) filters.timestampEnd = timestampEnd
  if (startDate && endDate) {
    filters.startDate = startDate
    filters.endDate = endDate
  }

  const exportFormat = format === 'csv' ? 'csv' : 'ndjson'
  const useStream = String(stream || '') === 'true'

  if (!useStream) {
    const result = await getAllPlcDataService(filters)
    return res.status(StatusCodes.OK).json({
      message: 'PLC Data fetched successfully',
      data: result,
    })
  }

  res.setHeader('Content-Type', exportFormat === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson')
  res.setHeader('Content-Disposition', `attachment; filename="plc-data-export.${exportFormat === 'csv' ? 'csv' : 'ndjson'}"`)
  res.flushHeaders()

  let sentHeader = false
  let firstRow = true

  const writeCsvRow = (row) => {
    if (!sentHeader) {
      const header = Object.keys(row).join(',')
      res.write(`${header}\n`)
      sentHeader = true
    }
    const line = Object.values(row)
      .map((value) => {
        if (value == null) return ''
        const str = String(value)
        const escaped = str.replace(/"/g, '""')
        return `"${escaped}"`
      })
      .join(',')
    res.write(`${line}\n`)
  }

  await streamAllPlcDataService(filters, { batchSize, attachProduct: true }, async (rows) => {
    for (const row of rows) {
      if (exportFormat === 'csv') {
        writeCsvRow(row)
      } else {
        res.write(`${JSON.stringify(row)}\n`)
      }
    }
  })

  res.end()
})

// ─────────────────────────────────────────────────────────────────────────────
// Download PLC Report as PDF
// GET /plc-data/report/download-pdf
// ─────────────────────────────────────────────────────────────────────────────
export const downloadPlcReportPdf = AsyncHandler(async (req, res) => {
  try {
    const {
      device_id,
      model,
      status,
      company_name,
      plant_name,
      duration,
      startDate,
      endDate,
      startTime,
      endTime,
      timestampStart,
      timestampEnd,
    } = req.query

    const filters = {}
    if (device_id) filters.device_id = device_id
    if (company_name) filters.company_name = company_name
    if (plant_name) filters.plant_name = plant_name
    if (model) filters.model = model
    if (status && status !== 'all') filters.status = status
    if (timestampStart) filters.timestampStart = timestampStart
    if (timestampEnd) filters.timestampEnd = timestampEnd
    if (duration && duration !== 'all') {
      filters.duration = duration
      filters.startDate = startDate
      filters.endDate = endDate
      filters.startTime = startTime
      filters.endTime = endTime
    }

    // Fetch ALL rows (no pagination limit)
    const result = await getAllPlcReport(filters, { page: 1, limit: 99999 })
    const rows = result.data || []

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="PLC-Report-${new Date().toISOString().slice(0, 10)}.pdf"`,
    )

    const doc = new PDFDocument({
      margin: 30,
      size: 'A4',
      layout: 'landscape',
      autoFirstPage: false,
    })
    doc.pipe(res)

    const logoPath = path.join(process.cwd(), 'assets/logo.png')

    const drawPageLayout = () => {
      try {
        doc.image(logoPath, 30, 15, { width: 70 })
      } catch (_) {}

      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#2e4c99')
        .text('Barcode Production Report', 0, 22, { align: 'center' })

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#555')
        .text(
          `Generated: ${new Date().toLocaleString('en-GB')}   |   Total Records: ${rows.length}   |   OK: ${result.summary.barcodeOkCount}   |   Error: ${result.summary.barcodeNgCount}`,
          0,
          42,
          { align: 'center' },
        )
    }

    // Map and sanitize all rows
    const mappedRows = rows.map((row) => ({
      company: String(row.Company ?? '—'),
      plant: String(row.Plant ?? '—'),
      product: String(row.Product ?? '—'),
      prod_count: String(row.CalculatedProduction === 0 ? '0 (Err)' : '1'),
      model: String(row.Model ?? '—'),
      shift: String(row.Shift ?? '—'),
      operator: String(row.Operator ?? '—'),
      date: row.Date ? new Date(row.Date).toLocaleString('en-GB') : '—',
      line_no: String(row.LineNumber ?? '—'),
      line_name: String(row.LineName ?? '—'),
      // Sanitize barcode tag by adding spaces around pipes to help with wrapping
      barcode_tag: String(row.BarcodeTag ?? '—').replace(/\|/g, ' | '),
      barcode_status: String(row.BarcodeStatus ?? '—'),
      barcode_dt: row.BarcodeDateTime
        ? new Date(row.BarcodeDateTime).toLocaleString('en-GB')
        : '—',
      error: String(row.Error ?? '—'),
    }))

    const headers = [
      { label: 'Company', property: 'company', width: 60 },
      { label: 'Plant', property: 'plant', width: 30 },
      { label: 'Product', property: 'product', width: 60 },
      { label: 'Prod. Count', property: 'prod_count', width: 40 },
      { label: 'Model', property: 'model', width: 80 },
      { label: 'Shift', property: 'shift', width: 25 },
      { label: 'Operator', property: 'operator', width: 40 },
      { label: 'Date', property: 'date', width: 80 },
      { label: 'Line No', property: 'line_no', width: 35 },
      { label: 'Line Name', property: 'line_name', width: 60 },
      { label: 'Barcode Tag', property: 'barcode_tag', width: 100 },
      { label: 'Barcode Status', property: 'barcode_status', width: 50 },
      { label: 'Barcode DT', property: 'barcode_dt', width: 80 },
      { label: 'Error', property: 'error', width: 30 },
    ]

    // Use manual chunking to avoid pdfkit-table's pagination issues causing blank pages
    const rowsPerPage = 15
    for (let i = 0; i < mappedRows.length; i += rowsPerPage) {
      const chunk = mappedRows.slice(i, i + rowsPerPage)
      doc.addPage()
      drawPageLayout()

      await doc.table(
        {
          headers,
          datas: chunk,
        },
        {
          prepareHeader: () => doc.font('Helvetica-Bold').fontSize(6.5).fillColor('blue'),
          prepareRow: () => doc.font('Helvetica').fontSize(6.5).fillColor('black'),
          startY: 65,
          columnSpacing: 3,
          padding: 4,
          striped: true,
          stripedColors: ['#ffffff', '#f0f4ff'],
        },
      )
    }

    if (rows.length === 0) {
      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor('#888')
        .text('No data available.', { align: 'center' })
    }

    doc.end()
  } catch (error) {
    console.error('PDF generation failed:', error)
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'PDF generation failed' })
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Download PLC Report as Excel
// GET /plc-data/report/download-excel
// ─────────────────────────────────────────────────────────────────────────────
export const downloadPlcReportExcel = AsyncHandler(async (req, res) => {
  try {
    const {
      device_id,
      model,
      status,
      company_name,
      plant_name,
      duration,
      startDate,
      endDate,
      startTime,
      endTime,
      timestampStart,
      timestampEnd,
    } = req.query

    const filters = {}
    if (device_id) filters.device_id = device_id
    if (company_name) filters.company_name = company_name
    if (plant_name) filters.plant_name = plant_name
    if (model) filters.model = model
    if (status && status !== 'all') filters.status = status
    if (timestampStart) filters.timestampStart = timestampStart
    if (timestampEnd) filters.timestampEnd = timestampEnd
    if (duration && duration !== 'all') {
      filters.duration = duration
      filters.startDate = startDate
      filters.endDate = endDate
      filters.startTime = startTime
      filters.endTime = endTime
    }

    // Fetch ALL rows
    const result = await getAllPlcReport(filters, { page: 1, limit: 99999 })
    const rows = result.data || []

    // Build workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'JPM Group'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('PLC Report', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    })

    // ── Column definitions ──
    sheet.columns = [
      { header: 'Company', key: 'Company', width: 18 },
      { header: 'Plant', key: 'Plant', width: 10 },
      { header: 'Product', key: 'Product', width: 18 },
      { header: 'Production Count', key: 'ProductionCount', width: 18 },
      { header: 'Model', key: 'Model', width: 22 },
      { header: 'Shift', key: 'Shift', width: 10 },
      { header: 'Operator', key: 'Operator', width: 16 },
      { header: 'Date', key: 'Date', width: 22 },
      { header: 'Line Number', key: 'LineNumber', width: 14 },
      { header: 'Line Name', key: 'LineName', width: 16 },
      { header: 'Barcode Tag', key: 'BarcodeTag', width: 16 },
      { header: 'Barcode Status', key: 'BarcodeStatus', width: 16 },
      { header: 'Barcode Date & Time', key: 'BarcodeDateTime', width: 24 },
      { header: 'Error', key: 'Error', width: 12 },
      { header: 'Rod', key: 'Rod', width: 10 },
      { header: 'Striker', key: 'Striker', width: 10 },
    ]

    // ── Style header row ──
    const headerRow = sheet.getRow(1)
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B4FA8' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
        bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
        left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
        right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      }
    })
    headerRow.height = 22

    // ── Add data rows ──
    rows.forEach((row, idx) => {
      const isOk =
        String(row.Error ?? '')
          .trim()
          .toLowerCase() === 'ok'
      const bgColor = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FF' // stripe

      const dataRow = sheet.addRow({
        Company: row.Company ?? '—',
        Plant: row.Plant ?? '—',
        Product: row.Product ?? '—',
        ProductionCount: row.CalculatedProduction === 0 ? '0 (Machine Error)' : '1',
        Model: row.Model ?? '—',
        Shift: row.Shift ?? '—',
        Operator: row.Operator ?? '—',
        Date: row.Date ? new Date(row.Date).toLocaleString('en-GB') : '—',
        LineNumber: row.LineNumber ?? '—',
        LineName: row.LineName ?? '—',
        BarcodeTag: row.BarcodeTag ?? '—',
        BarcodeStatus: row.BarcodeStatus ?? '—',
        BarcodeDateTime: row.BarcodeDateTime
          ? new Date(row.BarcodeDateTime).toLocaleString('en-GB')
          : '—',
        Error: row.Error ?? '—',
        Rod: row.Rod ?? '—',
        Striker: row.Striker ?? '—',
      })

      dataRow.eachCell((cell, colNumber) => {
        // Stripe background
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
        cell.font = { size: 9 }
        cell.alignment = { vertical: 'middle', wrapText: false }

        // Color Error column
        if (colNumber === 14) {
          // Error column
          cell.font = {
            size: 9,
            bold: true,
            color: { argb: isOk ? 'FF059669' : 'FFE11D48' }, // green or red
          }
        }

        // Color Barcode Status column
        if (colNumber === 12) {
          const printed =
            String(row.BarcodeStatus ?? '')
              .trim()
              .toLowerCase() === 'printed'
          cell.font = { size: 9, color: { argb: printed ? 'FF2563EB' : 'FFE11D48' } }
        }
      })
    })

    // ── Summary sheet ──
    const summarySheet = workbook.addWorksheet('Summary')
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Value', key: 'value', width: 15 },
    ]

    const summaryHeaderRow = summarySheet.getRow(1)
    summaryHeaderRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B4FA8' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
      cell.alignment = { horizontal: 'center' }
    })

    const summaryData = [
      { metric: 'Total Records', value: result.total },
      { metric: 'OK Count', value: result.summary.barcodeOkCount },
      { metric: 'Error Count', value: result.summary.barcodeNgCount },
      { metric: 'Unique Products', value: result.summary.uniqueProducts },
      { metric: 'Total Production', value: result.summary.totalProduction },
      { metric: 'Generated At', value: new Date().toLocaleString('en-GB') },
    ]
    summaryData.forEach((s) => summarySheet.addRow(s))

    // ── Send response ──
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="PLC-Report-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    )

    await workbook.xlsx.write(res)
    res.end()
  } catch (error) {
    console.error('Excel generation failed:', error)
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Excel generation failed' })
    }
  }
})
// PLC Report API for report module table
export const getPlcReport = AsyncHandler(async (req, res) => {
  const {
    device_id,
    model, // ← ab yahi model filter hai
    status,
    company_name,
    plant_name,
    page = 1,
    limit = 10,
    duration,
    startDate,
    endDate,
    startTime,
    endTime,
    timestampStart,
    timestampEnd,
  } = req.query

  const filters = {}

  if (device_id) filters.device_id = device_id
  if (company_name) filters.company_name = company_name
  if (plant_name) filters.plant_name = plant_name
  if (model) filters.model = model // ← seedha model
  if (status && status !== 'all') filters.status = status
  if (timestampStart) filters.timestampStart = timestampStart
  if (timestampEnd) filters.timestampEnd = timestampEnd

  if (duration && duration !== 'all') {
    filters.duration = duration
    filters.startDate = startDate
    filters.endDate = endDate
    filters.startTime = startTime
    filters.endTime = endTime
  }

  const cacheKey = `${REPORT_CACHE_PREFIX}${JSON.stringify({ filters, page, limit })}`

  const { data: result, fromCache } = await getOrSetJSON(cacheKey, 120, async () => {
    const report = await getAllPlcReport(filters, { page, limit })
    return {
      rows: report.data,
      total: report.total,
      page: report.page,
      limit: report.limit,
      totalPages: report.totalPages,
      summary: report.summary,
      productSummaries: report.productSummaries,
    }
  })

  res.status(StatusCodes.OK).json({
    message: 'PLC Report fetched successfully',
    fromCache,
    data: result,
  })
})

export const exportPlcReport = AsyncHandler(async (req, res) => {
  const {
    device_id,
    model,
    status,
    company_name,
    plant_name,
    page = 1,
    limit = 10,
    duration,
    startDate,
    endDate,
    startTime,
    endTime,
    timestampStart,
    timestampEnd,
    stream,
    format,
    batchSize,
  } = req.query

  const filters = {}
  if (device_id) filters.device_id = device_id
  if (company_name) filters.company_name = company_name
  if (plant_name) filters.plant_name = plant_name
  if (model) filters.model = model
  if (status && status !== 'all') filters.status = status
  if (timestampStart) filters.timestampStart = timestampStart
  if (timestampEnd) filters.timestampEnd = timestampEnd
  if (duration && duration !== 'all') {
    filters.duration = duration
    filters.startDate = startDate
    filters.endDate = endDate
    filters.startTime = startTime
    filters.endTime = endTime
  }

  const useStream = String(stream || '').toLowerCase() === 'true'
  const exportFormat = String(format || 'ndjson').toLowerCase() === 'csv' ? 'csv' : 'ndjson'

  if (!useStream) {
    const report = await getAllPlcReport(filters, { page, limit })
    return res.status(StatusCodes.OK).json({
      message: 'PLC Report fetched successfully',
      data: {
        rows: report.data,
        total: report.total,
        page: report.page,
        limit: report.limit,
        totalPages: report.totalPages,
        summary: report.summary,
        productSummaries: report.productSummaries,
      },
    })
  }

  res.setHeader('Content-Type', exportFormat === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="plc-report-export.${exportFormat === 'csv' ? 'csv' : 'ndjson'}"`,
  )
  res.flushHeaders()

  let sentHeader = false

  const writeCsvRow = (row) => {
    if (!sentHeader) {
      const header = Object.keys(row).join(',')
      res.write(`${header}\n`)
      sentHeader = true
    }

    const line = Object.values(row)
      .map((value) => {
        if (value == null) return ''
        const str = String(value)
        const escaped = str.replace(/"/g, '""')
        return `"${escaped}"`
      })
      .join(',')

    res.write(`${line}\n`)
  }

  const rowsWritten = await streamPlcReportService(
    filters,
    { batchSize },
    async (rows) => {
      for (const row of rows) {
        if (exportFormat === 'csv') {
          writeCsvRow(row)
        } else {
          res.write(`${JSON.stringify(row)}\n`)
        }
      }
    },
  )

  if (!sentHeader && exportFormat === 'csv') {
    res.write('No data available\n')
  }

  res.end()
})

export const getPlcDataById = AsyncHandler(async (req, res) => {
  const result = await getPlcDataByIdService(req.params.id)
  res.status(StatusCodes.OK).json({
    message: 'PLC Data fetched successfully',
    data: result,
  })
})

export const getPlcListing = async (req, res, next) => {
  try {
    const result = await getPlcListingService(req.query)
    res.status(200).json({
      success: true,
      data: result?.rows || [],
      summary: result?.summary || {
        total_production_barcodes: 0,
        total_error_barcodes: 0,
      },
    })
  } catch (err) {
    next(err)
  }
}
export const updatePlcData = AsyncHandler(async (req, res) => {
  await cacheDelByPrefix(REPORT_CACHE_PREFIX)
  await cacheDelByPrefix(REPORT_OPTIONS_CACHE_KEY)
  const { data, isUpdated } = await updatePlcDataService(req.params.id, req.body)

  if (isUpdated && io) {
    console.log(`[socket] emitting dataUpdated for plcData id=${req.params.id}`)
    io.emit('dataUpdated', {
      entity: 'plcData',
      id: req.params.id,
      data,
    })
  }

  res.status(StatusCodes.OK).json({
    message: 'PLC Data updated successfully',
    data,
  })
})

export const deletePlcData = AsyncHandler(async (req, res) => {
  await cacheDelByPrefix(REPORT_CACHE_PREFIX)
  await cacheDelByPrefix(REPORT_OPTIONS_CACHE_KEY)
  await deletePlcDataService(req.params.id)
  if (io) {
    console.log(`[socket] emitting dataUpdated(delete) for plcData id=${req.params.id}`)
    io.emit('dataUpdated', {
      entity: 'plcData',
      id: req.params.id,
      action: 'deleted',
    })
  }
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

export const getPlcReportOptions = AsyncHandler(async (req, res) => {
  const cacheKey = 'plc-report:options'
  const { data: result, fromCache } = await getOrSetJSON(cacheKey, 180, async () =>
    getPlcReportOptionsService(),
  )

  res.status(StatusCodes.OK).json({
    message: 'PLC Report Options fetched successfully',
    fromCache,
    data: result,
  })
})

export const getPlcTimeDistribution = AsyncHandler(async (req, res) => {
  const { startDate, endDate, companyName, plantName, deviceId, model, status } = req.query
  const filters = {}
  if (startDate) filters.startDate = startDate
  if (endDate) filters.endDate = endDate
  if (companyName) filters.company_name = companyName
  if (plantName) filters.plant_name = plantName
  if (deviceId) filters.device_id = deviceId
  if (model) filters.model = model
  if (status) filters.status = status

  const result = await getPlcTimeDistributionService(filters)
  res.status(StatusCodes.OK).json({
    message: 'PLC Time Distribution fetched successfully',
    data: result,
  })
})

export const getMachinePerformance = AsyncHandler(async (req, res) => {
  const { startDate, endDate, companyName, plantName, deviceId, model } = req.query
  const filters = {}
  if (startDate) filters.startDate = startDate
  if (endDate) filters.endDate = endDate
  if (companyName) filters.companyName = companyName
  if (plantName) filters.plantName = plantName
  if (deviceId) filters.deviceId = deviceId
  if (model) filters.model = model

  const result = await getMachinePerformanceService(filters)
  res.status(StatusCodes.OK).json({
    message: 'Machine Performance fetched successfully',
    data: result,
  })
})

export const getPlcDowntimeByError = AsyncHandler(async (req, res) => {
  const { startDate, endDate, companyName, plantName, deviceId, model } = req.query
  const filters = {}
  if (startDate) filters.startDate = startDate
  if (endDate) filters.endDate = endDate
  if (companyName) filters.companyName = companyName
  if (plantName) filters.plantName = plantName
  if (deviceId) filters.deviceId = deviceId
  if (model) filters.model = model

  const result = await getPlcDowntimeByErrorService(filters)
  res.status(StatusCodes.OK).json({
    message: 'PLC Downtime by Error fetched successfully',
    data: result,
  })
})

export const getPlcDowntimeByErrorStatus = AsyncHandler(async (req, res) => {
  const { startDate, endDate, companyName, plantName, deviceId, model } = req.query
  const filters = {}
  if (startDate) filters.startDate = startDate
  if (endDate) filters.endDate = endDate
  if (companyName) filters.companyName = companyName
  if (plantName) filters.plantName = plantName
  if (deviceId) filters.deviceId = deviceId
  if (model) filters.model = model

  const result = await getPlcDowntimeByErrorStatusService(filters)
  res.status(StatusCodes.OK).json({
    message: 'PLC Downtime by Error Status fetched successfully',
    data: result,
  })
})
