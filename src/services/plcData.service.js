import { PlcDataModel } from '../models/plcData.model.js'
import { PlcProductModel } from '../models/plcProduct.model.js'
import { MachineHistoryModel } from '../models/machineHistory.model.js'
import { NotFoundError } from '../utils/errorHandler.js'
import { Op, Sequelize } from 'sequelize'
import { sequelize } from '../sequelize.js'

/** Attach product name (from plc_products) to plc data by device_id = machine_name */
async function attachProductToPlcData(plcDataOrList) {
  const list = Array.isArray(plcDataOrList) ? plcDataOrList : [plcDataOrList]
  if (list.length === 0) return plcDataOrList

  const machineNames = [
    ...new Set(
      list
        .map((item) => item.device_id?.trim()?.toLowerCase())
        .filter(Boolean),
    ),
  ]

  if (machineNames.length === 0) return plcDataOrList

  const products = await PlcProductModel.findAll({
    where: Sequelize.where(
      Sequelize.fn('LOWER', Sequelize.col('machine_name')),
      { [Op.in]: machineNames },
    ),
    raw: true,
  })

  const productNameByMachine = {}
  products.forEach((p) => {
    const mName = p.machine_name?.trim()?.toLowerCase()
    if (mName) {
      const name =
        p.product_name ||
        p.material_description ||
        p.part_no ||
        p.model_code ||
        p.material_code ||
        p.machine_name
      productNameByMachine[mName] = name
    }
  })

  list.forEach((item) => {
    const dId = item.device_id?.trim()?.toLowerCase()
    const product = dId ? productNameByMachine[dId] || null : null

    if (product) {
      if (typeof item.setDataValue === 'function') {
        item.setDataValue('product', product)
      } else {
        item.product = product
      }
    }
  })

  return plcDataOrList
}

// Known fields: incoming key -> DB column (for backward compatibility & filtering)
const KNOWN_MAP = {
  companyname: 'company_name',
  company_name: 'company_name',
  plantname: 'plant_name',
  plant_name: 'plant_name',
  linenumber: 'line_number',
  line_number: 'line_number',
  device_id: 'device_id',
  timestamp: 'timestamp',
  Start_time: 'start_time',
  start_time: 'start_time',
  Stop_time: 'stop_time',
  stop_time: 'stop_time',
  Status: 'status',
  status: 'status',
  model: 'model',
  MODEL: 'model',
  LATCH_FORCE: 'latch_force',
  latch_force: 'latch_force',
  CLAW_FORCE: 'claw_force',
  claw_force: 'claw_force',
  SAFETY_LEVER: 'safety_lever',
  safety_lever: 'safety_lever',
  CLAW_LEVER: 'claw_lever',
  claw_lever: 'claw_lever',
  STROKE: 'stroke',
  stroke: 'stroke',
  PRODUCTION_COUNT: 'production_count',
  'PRODUCTION-COUNT': 'production_count',
  production_count: 'production_count',
  ALARM: 'alarm',
  alarm: 'alarm',
}

const DATE_FIELDS = ['timestamp', 'start_time', 'stop_time']

const RAW_DATA_ATTRIBUTES = [
  '_id',
  'company_name',
  'plant_name',
  'line_number',
  'device_id',
  'timestamp',
  'start_time',
  'stop_time',
  'status',
  'latch_force',
  'claw_force',
  'safety_lever',
  'claw_lever',
  'stroke',
  'production_count',
  'model',
  'alarm',
  'extra_data',
  'created_at',
  'updated_at',
]

/** Flatten nested payload (parameters, machine) into single object */
function flattenPayload(data) {
  if (!data || typeof data !== 'object') return {}
  const flat = { ...data }
  if (data.machine && typeof data.machine === 'object') {
    Object.assign(flat, data.machine)
  }
  if (data.parameters && typeof data.parameters === 'object') {
    Object.assign(flat, data.parameters)
  }
  return flat
}

/** Extract known columns + extra_data (dynamic fields) from flattened payload */
function extractKnownAndExtra(flat) {
  const known = {}
  const extra = {}
  for (const [key, value] of Object.entries(flat)) {
    if (key === 'machine' || key === 'parameters') continue
    const dbCol = KNOWN_MAP[key]
    if (dbCol) {
      let val = value
      if (DATE_FIELDS.includes(dbCol) && val) val = new Date(val)
      known[dbCol] = val ?? null
    } else {
      // Normalization for Error key (case-insensitive)
      if (key.toLowerCase() === 'error') {
        extra['Error'] = value
        continue
      }

      // Normalization for ERROR_STATUS key (case-insensitive)
      if (key.toLowerCase() === 'error_status') {
        extra['ERROR_STATUS'] = value
        continue
      }

      // Dynamic field - jo bhi aaya, store
      let val = value
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        try {
          val = new Date(value)
        } catch (_) {}
      }
      extra[key] = val
    }
  }
  return { known, extra }
}
export const createPlcDataService = async (data) => {
  const flat = flattenPayload(data)
  const { known, extra } = extractKnownAndExtra(flat)

  const { stop_time, device_id, production_count: payloadProd } = known

  // STOP logic
  if (stop_time && device_id && (payloadProd == null || payloadProd === '')) {
    const lastRunning = await PlcDataModel.findOne({
      where: { device_id, stop_time: null },
      order: [['start_time', 'DESC']],
      attributes: ['production_count'],
      raw: true,
    })

    if (lastRunning?.production_count != null) {
      known.production_count = lastRunning.production_count
    }
  }

  // Last record
  const lastRecord = await PlcDataModel.findOne({
    where: { device_id },
    order: [['created_at', 'DESC']],
  })

  // Build current record
  const currentRecord = PlcDataModel.build({
    ...known,
    extra_data: Object.keys(extra).length ? extra : {},
  }).toJSON()

  // Function to remove ignored fields
  const clean = (obj) => {
    const { _id, timestamp, created_at, updated_at, ...rest } = obj
    return rest
  }

  // Sort object keys for JSON.stringify
  const stringifySorted = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj
    if (Array.isArray(obj)) return `[${obj.map(stringifySorted).join(',')}]`
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `"${k}":${stringifySorted(obj[k])}`)
      .join(',')}}`
  }

  const cleanCurrent = clean(currentRecord)
  const cleanLast = lastRecord ? clean(lastRecord.toJSON()) : null

  console.log('=== KNOWN ===', JSON.stringify(known, null, 2))
  console.log('=== EXTRA ===', JSON.stringify(extra, null, 2))
  console.log('=== LAST RECORD ===', JSON.stringify(cleanLast, null, 2))

  // Compare using JSON.stringify
  if (lastRecord && stringifySorted(cleanCurrent) === stringifySorted(cleanLast)) {
    console.log('⚠️ No change detected → skipping insert')
    return {
      data: lastRecord.toJSON(),
      isNewRecord: false,
    }
  }

  // Insert new row
  const plcData = await PlcDataModel.create({
    ...known,
    extra_data: Object.keys(extra).length ? extra : {},
  })

  if (typeof attachProductToPlcData === 'function') {
    await attachProductToPlcData(plcData)
  }

  return {
    data: plcData.toJSON ? plcData.toJSON() : plcData.get({ plain: true }),
    isNewRecord: true,
  }
}
// export const createPlcDataService = async (data) => {
//   const flat = flattenPayload(data);
//   const { known, extra } = extractKnownAndExtra(flat);

//   const { stop_time, device_id, production_count: payloadProd } = known;

//   if (stop_time && device_id && (payloadProd == null || payloadProd === "")) {
//     const lastRunning = await PlcDataModel.findOne({
//       where: { device_id, stop_time: null },
//       order: [["start_time", "DESC"]],
//       attributes: ["production_count"],
//     });
//     if (lastRunning?.production_count != null) {
//       known.production_count = lastRunning.production_count;
//     }
//   }

//   const lastRecord = await PlcDataModel.findOne({
//     where: { device_id },
//     order: [["created_at", "DESC"]],
//     raw: true,
//   });

//   // ⬇️ SIRF YE LINES ADD KARO AUR OUTPUT DIKHAO MUJHE
//   console.log("=== KNOWN ===", JSON.stringify(known, null, 2));
//   console.log("=== EXTRA ===", JSON.stringify(extra, null, 2));
//   console.log("=== LAST RECORD ===", JSON.stringify(lastRecord, null, 2));

//   const plcData = await PlcDataModel.create({
//     ...known,
//     extra_data: Object.keys(extra).length ? extra : null,
//   });

//   await attachProductToPlcData(plcData);
//   return plcData.toJSON ? plcData.toJSON() : plcData.get({ plain: true });
// };
// export const createPlcDataService = async (data) => {
//   const flat = flattenPayload(data)
//   const { known, extra } = extractKnownAndExtra(flat)

//   // Jab stop_time aaye: next row (stopped row) mein production_count pata hona chahiye – last running se le aao agar payload mein nahi hai
//   const { stop_time, device_id, production_count: payloadProd } = known;
//   if (stop_time && device_id && (payloadProd == null || payloadProd === "")) {
//     const lastRunning = await PlcDataModel.findOne({
//       where: { device_id, stop_time: null },
//       order: [["start_time", "DESC"]],
//       attributes: ["production_count"],
//     });
//     if (lastRunning && lastRunning.production_count != null) {
//       known.production_count = lastRunning.production_count;
//     }
//   }

//   // Har payload (running ya stopped) – sirf nayi row create karo, kisi purani row ko update mat karo
//   const plcData = await PlcDataModel.create({
//     ...known,
//     extra_data: Object.keys(extra).length ? extra : null,
//   })

//   await attachProductToPlcData(plcData);
//   return plcData.toJSON ? plcData.toJSON() : plcData.get({ plain: true });
// };

export const getAllPlcDataService = async (filters = {}, pagination = {}) => {
  const where = {}

  if (filters.device_id) {
    where.device_id = { [Op.like]: `%${filters.device_id}%` }
  }

  if (filters.model) {
    where.model = { [Op.like]: `%${filters.model}%` }
  }

  if (filters.status) {
    where.status = { [Op.like]: `%${filters.status}%` }
  }

  if (filters.company_name) {
    where.company_name = { [Op.like]: `%${filters.company_name}%` }
  }

  if (filters.plant_name) {
    where.plant_name = { [Op.like]: `%${filters.plant_name}%` }
  }

  if (filters.startDate && filters.endDate) {
    where.created_at = {
      [Op.between]: [filters.startDate, filters.endDate],
    }
  }

  if (filters.timestampStart && filters.timestampEnd) {
    where.timestamp = {
      [Op.between]: [filters.timestampStart, filters.timestampEnd],
    }
  }

  const query = {
    where,
    order: [['created_at', 'DESC']],
    raw: true,
  }

  if (pagination.page || pagination.limit) {
    const page = Math.max(Number(pagination.page) || 1, 1)
    const limit = Math.min(Number(pagination.limit) || 5000, 5000)
    query.limit = limit
    query.offset = (page - 1) * limit
  }

  const plcDataList = await PlcDataModel.findAll(query)
  await attachProductToPlcData(plcDataList)
  return plcDataList
}

export const streamAllPlcDataService = async (filters = {}, options = {}, onBatch) => {
  const batchSize = Math.min(Math.max(Number(options.batchSize) || 5000, 1000), 10000)
  const where = buildDbWhere(filters, Op)

  if (filters.status) {
    where.status = { [Op.like]: `%${filters.status}%` }
  }

  const order = [['created_at', 'DESC'], ['_id', 'DESC']]
  let lastKey = null
  let totalRows = 0

  while (true) {
    const batchWhere = lastKey
      ? {
          [Op.and]: [
            where,
            {
              [Op.or]: [
                { created_at: { [Op.lt]: lastKey.created_at } },
                {
                  created_at: lastKey.created_at,
                  _id: { [Op.lt]: lastKey._id },
                },
              ],
            },
          ],
        }
      : where

    const rows = await PlcDataModel.findAll({
      where: batchWhere,
      attributes: RAW_DATA_ATTRIBUTES,
      order,
      limit: batchSize,
      raw: true,
    })

    if (!rows || rows.length === 0) break

    if (options.attachProduct !== false) {
      await attachProductToPlcData(rows)
    }

    await onBatch(rows)
    totalRows += rows.length

    if (rows.length < batchSize) break

    const lastRow = rows[rows.length - 1]
    lastKey = {
      created_at: lastRow.created_at,
      _id: lastRow._id,
    }
  }

  return totalRows
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Map raw DB row + extra_data → what toJSON() would return
// ─────────────────────────────────────────────────────────────────────────────
function mapRawToPlain(row) {
  let extra = row.extra_data || {}
  if (typeof extra === 'string') {
    try {
      extra = JSON.parse(extra)
    } catch (_) {
      extra = {}
    }
  }

  const parameters = {}
  for (const [key, value] of Object.entries(extra)) {
    if (key === 'product' || key === 'PRODUCTION_COUNT' || key === 'Barcode_details') continue
    if (value !== null && typeof value !== 'object') {
      parameters[key] = value
    }
  }

  const PARAMS_MAP = {
    latch_force: 'LATCH_FORCE',
    claw_force: 'CLAW_FORCE',
    safety_lever: 'SAFETY_LEVER',
    claw_lever: 'CLAW_LEVER',
    stroke: 'STROKE',
    alarm: 'ALARM',
  }
  for (const [dbCol, paramKey] of Object.entries(PARAMS_MAP)) {
    if (row[dbCol] !== undefined && row[dbCol] !== null) {
      parameters[paramKey] = row[dbCol]
    }
  }

  const product = row.product ?? extra.product ?? null
  const Barcode_details = extra.Barcode_details ?? null

  return {
    _id: row._id,
    companyname: row.company_name,
    plantname: row.plant_name,
    linenumber: row.line_number,
    device_id: row.device_id,
    timestamp: row.timestamp,
    Start_time: row.start_time,
    Stop_time: row.stop_time,
    Status: row.status,
    product,
    production_count: row.production_count ?? extra.PRODUCTION_COUNT ?? null,
    machine: row.model ? { model: row.model } : {},
    parameters,
    Barcode_details,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: map a raw DB row → clean report object
// (same field extraction that was previously in the controller)
// ─────────────────────────────────────────────────────────────────────────────
function mapRowToReport(json) {
  // ── parameters ──
  let params = json.parameters || {}
  if (typeof params === 'string') {
    try {
      params = JSON.parse(params)
    } catch (_) {
      params = {}
    }
  }
  const flatParams = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && typeof v !== 'object') flatParams[k] = v
  }

  // ── barcode ──
  let barcode = json.Barcode_details || null
  if (typeof barcode === 'string') {
    try {
      barcode = JSON.parse(barcode)
    } catch (_) {
      barcode = null
    }
  }
  if (!barcode || typeof barcode !== 'object') barcode = {}

  // ── product ──
  let product = json.product
  if (typeof product === 'string' && (product.startsWith('{') || product.startsWith('['))) {
    try {
      const parsed = JSON.parse(product)
      if (parsed && typeof parsed === 'object') product = parsed
    } catch (_) {
      // Keep as string if parsing fails
    }
  }

  const finalProduct =
    (product &&
      typeof product === 'object' &&
      (product.material_code || product.part_no || product.model || product.product_name)) ||
    (typeof product === 'string' ? product : null) ||
    null

  return {
    Company: json.companyname ?? null,
    Plant: json.plantname ?? null,
    Product: finalProduct,
    ProductionCount: json.production_count ?? json.PRODUCTION_COUNT ?? null,
    Model:
      (product && typeof product === 'object' && product.model) ||
      (json.machine && json.machine.model) ||
      json.model ||
      null,
    Shift: json.parameters?.SHIFT || json.parameters?.Shift || json.parameters?.shift || null,
    Operator:
      json.parameters?.Operatorname ||
      json.parameters?.OPERATORNAME ||
      json.parameters?.OPERATOR ||
      json.parameters?.operator ||
      null,
    Date: json.timestamp || null,
    LineNumber: json.linenumber ?? null,
    LineName: json.parameters?.linename || json.parameters?.line_name || null,
    BarcodeTag:
      (json.Barcode_details &&
        (json.Barcode_details.BarcodeID || json.Barcode_details.BarcodeTag)) ||
      null,
    BarcodeStatus: json.Barcode_details?.BarcodeStatus || null,
    BarcodeDateTime: json.Barcode_details?.BarcodeDateTime || null,
    Rod: json.parameters?.ROD || json.parameters?.rod || null,
    Striker: json.parameters?.STRIKER || json.parameters?.striker || null,
    Error:
      json.parameters?.ERROR_STATUS ||
      json.parameters?.ERROR_CODE ||
      json.parameters?.error_status ||
      json.parameters?.error_code ||
      null,
    // CalculatedProduction is derived here so the frontend never has to
    CalculatedProduction:
      String(json.parameters?.ERROR_STATUS || json.parameters?.error_status || '')
        .trim()
        .toLowerCase() === 'ok'
        ? 1
        : 0,
    parameters: json.parameters || {},
    timestamp: json.timestamp || null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the Sequelize `where` clause for fields that live in the DB columns
// (company, plant, date range).  Product / status filtering happens in-memory
// after deduplication because those values are inside JSON blobs.
// ─────────────────────────────────────────────────────────────────────────────
function buildDbWhere(filters, Op) {
  const where = {}

  if (filters.device_id) where.device_id = { [Op.like]: `%${filters.device_id}%` }
  if (filters.company_name) where.company_name = filters.company_name // ← exact match
  if (filters.plant_name) where.plant_name = filters.plant_name // ← exact match
  if (filters.model) where.model = filters.model

  // duration/date filters
  const { duration, startDate, endDate, startTime, endTime, timestampStart, timestampEnd } = filters

  if (duration === 'today') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    where.timestamp = { [Op.gte]: start }
  } else if (duration === 'week') {
    const start = new Date()
    start.setDate(start.getDate() - start.getDay())
    start.setHours(0, 0, 0, 0)
    where.timestamp = { [Op.gte]: start }
  } else if (duration === 'month') {
    const now = new Date()
    where.timestamp = { [Op.gte]: new Date(now.getFullYear(), now.getMonth(), 1) }
  } else if (duration === 'custom' || (startDate && endDate)) {
    // Handle both preset "custom" and direct ISO strings from frontend
    const start = startDate
      ? new Date(
          String(startDate).includes('T') ? startDate : `${startDate}T${startTime || '00:00'}:00`,
        )
      : null
    const end = endDate
      ? new Date(String(endDate).includes('T') ? endDate : `${endDate}T${endTime || '23:59'}:59`)
      : null

    if (start && end) where.timestamp = { [Op.between]: [start, end] }
    else if (start) where.timestamp = { [Op.gte]: start }
    else if (end) where.timestamp = { [Op.lte]: end }
  } else if (timestampStart && timestampEnd) {
    where.timestamp = { [Op.between]: [timestampStart, timestampEnd] }
  } else if (startDate) {
    where.timestamp = { [Op.gte]: new Date(startDate) }
  } else if (endDate) {
    where.timestamp = { [Op.lte]: new Date(endDate) }
  }

  return where
}
// ─────────────────────────────────────────────────────────────────────────────
// Main service
// ─────────────────────────────────────────────────────────────────────────────
export const getAllPlcReport = async (filters = {}, pagination = {}) => {
  const page = Math.max(Number(pagination.page) || 1, 1)
  const limit = Math.min(Number(pagination.limit) || 10, 500)
  const offset = (page - 1) * limit

  const where = buildDbWhere(filters, Op)
  if (filters.model) where.model = filters.model

  const whereQuery = sequelize.getQueryInterface().queryGenerator.whereQuery(where)
  const whereSql = whereQuery ? whereQuery.replace(/^WHERE\s+/i, '') : '1=1'
  const statusFilter = filters.status ? String(filters.status).trim().toLowerCase() : null
  const statusCondition = statusFilter === 'ok' || statusFilter === 'error'
    ? 'AND barcode_status = :statusFilter'
    : ''

  const allRowsQuery = `
    WITH Filtered AS (
      SELECT
        _id,
        company_name,
        plant_name,
        line_number,
        device_id,
        timestamp,
        start_time,
        stop_time,
        status,
        model,
        production_count,
        extra_data,
        COALESCE(
          JSON_VALUE(extra_data, '$.Barcode_details.BarcodeID'),
          JSON_VALUE(extra_data, '$.Barcode_details.BarcodeId'),
          JSON_VALUE(extra_data, '$.Barcode_details.barcode_id'),
          JSON_VALUE(extra_data, '$.Barcode_details.BarcodeTag')
        ) AS barcode_tag,
        LOWER(COALESCE(
          NULLIF(JSON_VALUE(extra_data, '$.ERROR_STATUS'), ''),
          NULLIF(JSON_VALUE(extra_data, '$.error_status'), ''),
          NULLIF(JSON_VALUE(extra_data, '$.parameters.ERROR_STATUS'), ''),
          NULLIF(JSON_VALUE(extra_data, '$.parameters.error_status'), ''),
          'ok'
        )) AS barcode_status
      FROM plc_data
      WHERE ${whereSql}
    ),
    Ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY barcode_tag ORDER BY timestamp ASC) AS rn
      FROM Filtered
      WHERE barcode_tag IS NOT NULL
      ${statusCondition}
    ),
    Final AS (
      SELECT *
      FROM Ranked
      WHERE rn = 1
    )
    SELECT *
    FROM Final
    ORDER BY timestamp DESC;
  `

  const rawRows = await sequelize.query(allRowsQuery, {
    replacements: { statusFilter },
    type: Sequelize.QueryTypes.SELECT,
  })

  const deduped = rawRows.map((row) => mapRawToPlain(row))

  await attachProductToPlcData(deduped)

  const mapped = deduped.map((r) => mapRowToReport(r))
  mapped.sort((a, b) => new Date(b.Date || b.timestamp) - new Date(a.Date || a.timestamp))

  const total = mapped.length
  const uniqueProducts = new Set()
  let barcodeOkCount = 0
  const plantModelMax = new Map()
  const productSummaryMap = new Map()

  for (const row of mapped) {
    if (row.Product) uniqueProducts.add(row.Product)

    const isOk = String(row.Error ?? '').trim().toLowerCase() === 'ok'
    if (isOk) barcodeOkCount++

    const pmKey = `${row.Plant}__${row.Model}`
    const existingPM = plantModelMax.get(pmKey)
    if (!existingPM || (row.ProductionCount ?? 0) > existingPM.ProductionCount) {
      plantModelMax.set(pmKey, row)
    }

    const product = row.Product
    if (product) {
      const rowTime = new Date(row.timestamp || row.Date)
      let s = productSummaryMap.get(product)
      if (!s) {
        s = { latestRow: row, latestTime: rowTime, barcodeOk: 0, barcodeNg: 0 }
        productSummaryMap.set(product, s)
      } else if (rowTime > s.latestTime) {
        s.latestRow = row
        s.latestTime = rowTime
      }
      if (isOk) s.barcodeOk++
      else s.barcodeNg++
    }
  }

  const barcodeNgCount = total - barcodeOkCount
  let totalProduction = 0
  plantModelMax.forEach((r) => (totalProduction += r.ProductionCount || 0))

  const productSummaries = Array.from(productSummaryMap.entries()).map(([product, s]) => ({
    product,
    totalProduction: s.latestRow?.ProductionCount || 0,
    barcodeOk: s.barcodeOk,
    barcodeNg: s.barcodeNg,
    company: s.latestRow?.Company || '-',
    plant: s.latestRow?.Plant || '-',
    model: s.latestRow?.Model || '-',
  }))

  const pageData = mapped.slice(offset, offset + limit)

  return {
    data: pageData,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    summary: {
      uniqueProducts: uniqueProducts.size,
      barcodeOkCount,
      barcodeNgCount,
      totalProduction,
    },
    productSummaries,
  }
}

export const streamPlcReportService = async (filters = {}, options = {}, onBatch) => {
  const batchSize = Math.min(Math.max(Number(options.batchSize) || 1000, 500), 10000)
  const where = buildDbWhere(filters, Op)
  if (filters.model) where.model = filters.model

  const whereQuery = sequelize.getQueryInterface().queryGenerator.whereQuery(where)
  const whereSql = whereQuery ? whereQuery.replace(/^WHERE\s+/i, '') : '1=1'
  const statusFilter = filters.status ? String(filters.status).trim().toLowerCase() : null
  const statusCondition = statusFilter === 'ok' || statusFilter === 'error'
    ? 'AND barcode_status = :statusFilter'
    : ''

  let lastTimestamp = null
  let lastId = null
  let totalRows = 0

  while (true) {
    const query = `
      WITH Filtered AS (
        SELECT
          _id,
          company_name,
          plant_name,
          line_number,
          device_id,
          timestamp,
          start_time,
          stop_time,
          status,
          model,
          production_count,
          extra_data,
          COALESCE(
            JSON_VALUE(extra_data, '$.Barcode_details.BarcodeID'),
            JSON_VALUE(extra_data, '$.Barcode_details.BarcodeId'),
            JSON_VALUE(extra_data, '$.Barcode_details.barcode_id'),
            JSON_VALUE(extra_data, '$.Barcode_details.BarcodeTag')
          ) AS barcode_tag,
          LOWER(COALESCE(
            NULLIF(JSON_VALUE(extra_data, '$.ERROR_STATUS'), ''),
            NULLIF(JSON_VALUE(extra_data, '$.error_status'), ''),
            NULLIF(JSON_VALUE(extra_data, '$.parameters.ERROR_STATUS'), ''),
            NULLIF(JSON_VALUE(extra_data, '$.parameters.error_status'), ''),
            'ok'
          )) AS barcode_status
        FROM plc_data
        WHERE ${whereSql}
      ),
      Ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY barcode_tag ORDER BY timestamp ASC) AS rn
        FROM Filtered
        WHERE barcode_tag IS NOT NULL
        ${statusCondition}
      ),
      Final AS (
        SELECT *
        FROM Ranked
        WHERE rn = 1
      )
      SELECT *
      FROM Final
      WHERE 1=1
      ${lastTimestamp ? 'AND (timestamp < :lastTimestamp OR (timestamp = :lastTimestamp AND _id < :lastId))' : ''}
      ORDER BY timestamp DESC, _id DESC
      OFFSET 0 ROWS FETCH NEXT :batchSize ROWS ONLY;
    `

    const replacements = { statusFilter, batchSize }
    if (lastTimestamp && lastId) {
      replacements.lastTimestamp = lastTimestamp
      replacements.lastId = lastId
    }

    const rows = await sequelize.query(query, {
      replacements,
      type: Sequelize.QueryTypes.SELECT,
    })

    if (!rows || rows.length === 0) break

    const batch = rows.map((row) => mapRawToPlain(row))
    await attachProductToPlcData(batch)
    const mappedBatch = batch.map((r) => mapRowToReport(r))

    await onBatch(mappedBatch)
    totalRows += mappedBatch.length

    if (rows.length < batchSize) break

    const lastRow = rows[rows.length - 1]
    lastTimestamp = lastRow.timestamp
    lastId = lastRow._id
  }

  return totalRows
}

export const getPlcReportOptionsService = async () => {
  const [companies, plants, models, part_nos] = await Promise.all([
    PlcDataModel.findAll({
      attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('company_name')), 'company_name']],
      raw: true,
    }),
    PlcDataModel.findAll({
      attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('plant_name')), 'plant_name']],
      raw: true,
    }),
    PlcDataModel.findAll({
      attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('model')), 'model']],
      raw: true,
    }),
    MachineHistoryModel.findAll({
      attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('part_no')), 'part_no']],
      raw: true,
    }),
  ])

  return {
    companies: companies.map((c) => c.company_name).filter(Boolean),
    plants: plants.map((p) => p.plant_name).filter(Boolean),
    models: models.map((m) => m.model).filter(Boolean),
    part_nos: part_nos.map((p) => p.part_no).filter(Boolean),
  }
}

export const getPlcListingService = async (filters = {}) => {
  const where = buildDbWhere(filters, Op)

  // Helper to parse JSON safely
  const parseMaybeJson = (value) => {
    if (!value) return null
    if (typeof value === 'object') return value
    if (typeof value === 'string') {
      try {
        return JSON.parse(value)
      } catch (_) {
        return null
      }
    }
    return null
  }

  const asObject = (value) => {
    if (!value) return null
    if (typeof value === 'object') return value
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === 'object' ? parsed : null
      } catch (_) {
        return null
      }
    }
    return null
  }

  const getModel = (row) => {
    const machine = asObject(row?.machine)
    const product = asObject(row?.product)
    return row?.model ?? machine?.model ?? product?.model ?? 'Unknown'
  }

  const getErrorStatus = (plainRow) => {
    const raw =
      plainRow?.parameters?.ERROR_STATUS ??
      plainRow?.parameters?.error_status ??
      plainRow?.ERROR_STATUS ??
      plainRow?.error_status
    return String(raw ?? '')
      .trim()
      .toLowerCase()
  }

  const getBarcodeId = (plainRow) => {
    const rawBarcodeDetails = plainRow?.Barcode_details
    const barcodeDetails = parseMaybeJson(rawBarcodeDetails)
    if (!barcodeDetails || typeof barcodeDetails !== 'object') return null

    const id =
      barcodeDetails?.BarcodeID ??
      barcodeDetails?.BarcodeId ??
      barcodeDetails?.barcode_id ??
      barcodeDetails?.BarcodeTag ??
      null

    const s = id == null ? '' : String(id).trim()
    return s ? s : null
  }

  const norm = (value) =>
    String(value ?? 'Unknown')
      .trim()
      .toLowerCase()

  const modelSel =
    filters.model != null && String(filters.model).trim() !== ''
      ? String(filters.model).trim().toLowerCase()
      : null

  /**
   * OPTIMIZATION:
   * Instead of fetching ALL records and processing in JS, we use two targeted fetches.
   * 1. Latest record per device (using a subquery/window function if possible, or targeted findAll)
   * 2. Aggregated barcode stats
   */

  // 1. Fetch only the latest record for each device matching the filters
  // We use a subquery with ROW_NUMBER() for maximum performance in MSSQL
  const whereQuery = sequelize.getQueryInterface().queryGenerator.whereQuery(where)
  const whereSql = whereQuery ? whereQuery.replace(/^WHERE\s+/i, '') : '1=1'

  const latestRows = await PlcDataModel.findAll({
    where: {
      ...where,
      _id: {
        [Op.in]: Sequelize.literal(`(
            SELECT _id FROM (
              SELECT _id, ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY timestamp DESC) as rn
              FROM plc_data
              WHERE ${whereSql}
            ) t WHERE rn = 1
          )`),
      },
    },
    raw: true,
  })

  await attachProductToPlcData(latestRows)
  const latestRowByDeviceList = latestRows.map((r) => mapRawToPlain(r))

  // 2. Fetch barcode data for production count and summary
  // To keep logic consistent with "first-seen in ASC order", we need all relevant barcode records.
  // But we only need a few columns, which is much faster than fetching everything.
  const barcodeData = await PlcDataModel.findAll({
    where,
    attributes: ['device_id', 'timestamp', 'extra_data', 'model', 'production_count'],
    order: [['timestamp', 'ASC']],
    raw: true,
  })

  const latestBarcodeById = new Map()
  for (const plainRow of barcodeData) {
    // In the DB, extra_data is JSON, but Sequelize might return it as object or string
    let extra = plainRow.extra_data
    if (typeof extra === 'string') {
      try {
        extra = JSON.parse(extra)
      } catch (_) {
        extra = {}
      }
    }

    const barcodeDetails = parseMaybeJson(extra?.Barcode_details)
    const barcodeId =
      barcodeDetails?.BarcodeID ??
      barcodeDetails?.BarcodeId ??
      barcodeDetails?.barcode_id ??
      barcodeDetails?.BarcodeTag ??
      null

    if (!barcodeId) continue

    // Model filtering logic (must match getModel logic)
    const rowModel = plainRow.model ?? extra?.machine?.model ?? extra?.product?.model ?? 'Unknown'
    if (modelSel && String(rowModel).trim().toLowerCase() !== modelSel) {
      continue
    }

    const bId = String(barcodeId).trim()
    if (!bId) continue

    if (!latestBarcodeById.has(bId)) {
      // Reconstruct what getErrorStatus expects
      const errorStatus =
        extra?.ERROR_STATUS ?? extra?.error_status ?? extra?.parameters?.ERROR_STATUS ?? null

      latestBarcodeById.set(bId, {
        device_id: plainRow.device_id,
        errorStatus: String(errorStatus ?? '')
          .trim()
          .toLowerCase(),
      })
    }
  }

  // Per-device production count
  const barcodeOkSetByDevice = new Map()
  let totalProductionBarcodes = 0
  let totalErrorBarcodes = 0

  for (const [barcodeId, data] of latestBarcodeById.entries()) {
    const isOk = data.errorStatus === 'ok'
    if (isOk) {
      totalProductionBarcodes += 1
      const dId = norm(data.device_id)
      if (!barcodeOkSetByDevice.has(dId)) {
        barcodeOkSetByDevice.set(dId, new Set())
      }
      barcodeOkSetByDevice.get(dId).add(barcodeId)
    } else {
      totalErrorBarcodes += 1
    }
  }

  let result = latestRowByDeviceList.map((row) => ({
    ...row,
    production_count: barcodeOkSetByDevice.get(norm(row.device_id))?.size || 0,
  }))

  // Apply final filters
  if (filters.status) {
    const sel = String(filters.status).toLowerCase()
    result = result.filter((r) => String(r?.Status ?? r?.status ?? '').toLowerCase() === sel)
  }

  if (modelSel) {
    result = result.filter((r) => String(getModel(r)).trim().toLowerCase() === modelSel)
  }

  return {
    rows: result,
    summary: {
      total_production_barcodes: totalProductionBarcodes,
      total_error_barcodes: totalErrorBarcodes,
    },
  }
}
export const getMachineStoppageService = async (filters = {}, pagination = {}) => {
  const page = Math.max(pagination.page || 1, 1)
  const limit = Math.min(pagination.limit || 10, 100)
  const offset = (page - 1) * limit

  let whereClause = 'WHERE stop_time IS NOT NULL'
  const replacements = { offset, limit }

  if (filters.machine_name) {
    whereClause += ' AND (device_id LIKE :machine_name OR model LIKE :machine_name)'
    replacements.machine_name = `%${filters.machine_name}%`
  }

  if (filters.from_date && filters.to_date) {
    whereClause += ' AND start_time BETWEEN :from_date AND :to_date'
    replacements.from_date = filters.from_date
    replacements.to_date = filters.to_date
  }

  let summaryWhereClause = 'WHERE 1=1'
  if (filters.machine_name) {
    summaryWhereClause += ' AND (device_id LIKE :machine_name OR model LIKE :machine_name)'
  }
  if (filters.from_date && filters.to_date) {
    summaryWhereClause += ' AND start_time BETWEEN :from_date AND :to_date'
  }

  const baseCte = `
    WITH UniqueData AS (
      SELECT *,
             ROW_NUMBER() OVER (
               PARTITION BY device_id, start_time, stop_time
               ORDER BY start_time DESC
             ) AS rn
      FROM plc_data
      ${whereClause}
    ),
    FilteredData AS (
      SELECT *
      FROM UniqueData
      WHERE rn = 1
    ),
    GapCalculated AS (
      SELECT *,
             LAG(stop_time) OVER (
               PARTITION BY device_id
               ORDER BY start_time
             ) AS prev_stop_time
      FROM FilteredData
    ),
    FinalData AS (
      SELECT *,
             CASE 
               WHEN prev_stop_time IS NOT NULL AND DATEDIFF(SECOND, prev_stop_time, start_time) > 0 
               THEN DATEDIFF(MINUTE, prev_stop_time, start_time) 
               ELSE 0 
             END AS stopped_duration
      FROM GapCalculated
    )
  `

  const dataQuery = `
    ${baseCte}
    SELECT *
    FROM FinalData
    WHERE prev_stop_time IS NOT NULL
    ORDER BY start_time DESC
    OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY;
  `

  const summaryQuery = `
    ${baseCte}
    SELECT COUNT(*) AS total, SUM(stopped_duration) AS totalDowntime
    FROM FinalData
    WHERE prev_stop_time IS NOT NULL;
  `

  const [
    data,
    [summaryResult],
    [totalMachinesResult],
    [totalStoppedMachinesResult],
    allDevicesResult,
  ] = await Promise.all([
    sequelize.query(dataQuery, {
      replacements,
      type: Sequelize.QueryTypes.SELECT,
    }),
    sequelize.query(summaryQuery, {
      replacements,
      type: Sequelize.QueryTypes.SELECT,
    }),
    sequelize.query(
      `SELECT COUNT(DISTINCT device_id) as count FROM plc_data ${summaryWhereClause}`,
      {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      },
    ),
    sequelize.query(
      `WITH LatestStatus AS (
         SELECT device_id, status,
                ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY timestamp DESC, created_at DESC) as rn
         FROM plc_data
         ${summaryWhereClause}
       )
       SELECT COUNT(*) as count
       FROM LatestStatus
       WHERE rn = 1 AND LOWER(LTRIM(RTRIM(COALESCE(status, '')))) = 'stopped';`,
      {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      },
    ),
    sequelize.query(
      `SELECT DISTINCT device_id FROM plc_data ${summaryWhereClause} AND device_id IS NOT NULL`,
      {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      },
    ),
  ])

  const total = summaryResult?.total || 0
  const totalDowntime = summaryResult?.totalDowntime || 0
  const totalMachines = totalMachinesResult?.count || 0
  const totalStoppedMachines = totalStoppedMachinesResult?.count || 0
  const allDevices = allDevicesResult?.map((d) => d.device_id) || []

  await attachProductToPlcData(data)

  return {
    data: data.map((item) => (item.toJSON ? item.toJSON() : item)),
    totalMachines,
    totalStoppedMachines,
    totalDowntime,
    allDevices,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  }
}

export const getPlcDataByIdService = async (id) => {
  const plcData = await PlcDataModel.findByPk(id)
  if (!plcData) {
    throw new NotFoundError('PLC Data not found', 'getPlcDataByIdService()')
  }
  await attachProductToPlcData(plcData)
  return plcData
}

export const updatePlcDataService = async (id, data) => {
  const plcData = await PlcDataModel.findByPk(id)
  if (!plcData) {
    throw new NotFoundError('PLC Data not found', 'updatePlcDataService()')
  }

  const flat = flattenPayload(data)
  const { known, extra } = extractKnownAndExtra(flat)

  const updateData = { ...known }
  if (Object.keys(extra).length) {
    updateData.extra_data = { ...(plcData.extra_data || {}), ...extra }
  }

  plcData.set(updateData)
  const changedFields = plcData.changed()
  if (!changedFields || changedFields.length === 0) {
    await attachProductToPlcData(plcData)
    return {
      data: plcData,
      isUpdated: false,
    }
  }

  await plcData.save()
  await attachProductToPlcData(plcData)

  return {
    data: plcData,
    isUpdated: true,
  }
}

export const deletePlcDataService = async (id) => {
  const plcData = await PlcDataModel.findByPk(id)
  if (!plcData) {
    throw new NotFoundError('PLC Data not found', 'deletePlcDataService()')
  }

  await plcData.destroy()
  return true
}

export const getPlcErrorDistributionService = async (filters = {}) => {
  const where = {}

  if (filters.startDate && filters.endDate) {
    where.created_at = {
      [Op.between]: [filters.startDate, filters.endDate],
    }
  }

  if (filters.companyName) {
    where.company_name = {
      [Op.like]: `%${filters.companyName}%`,
    }
  }

  if (filters.plantName) {
    where.plant_name = {
      [Op.like]: `%${filters.plantName}%`,
    }
  }

  if (filters.deviceId) {
    where.device_id = {
      [Op.like]: `%${filters.deviceId}%`,
    }
  }

  if (filters.model) {
    where.model = {
      [Op.like]: `%${filters.model}%`,
    }
  }

  const results = await PlcDataModel.findAll({
    attributes: [
      [Sequelize.literal("JSON_VALUE(extra_data, '$.ERROR_CODE')"), 'name'],
      [Sequelize.fn('COUNT', Sequelize.col('_id')), 'value'],
    ],
    where: {
      ...where,
    },
    group: [Sequelize.literal("JSON_VALUE(extra_data, '$.ERROR_CODE')")],
    raw: true,
  })

  return results.filter((item) => item.name)
}

export const getPlcDowntimeByMachineService = async (filters = {}) => {
  const where = {}

  // If status is 'Stopped' or 'Stop', then stop_time - start_time is downtime.
  // We need to filter by status or just check where stop_time is not null?
  // User said "stoppage jo meri stopped time aa rha h".
  // Let's assume records with non-null stop_time contribute to downtime,
  // or specifically status='Stopped'.
  // However, often stop_time - start_time IS the duration of the state.
  // If status is 'Running', it's runtime. If 'Stopped', it's downtime.

  // Let's try to filter for status NOT 'Running' (case insensitive)
  where.status = {
    [Op.notLike]: 'Running',
  }
  // Or maybe better: where status LIKE 'Stop%' or similar.
  // Let's assume anything NOT Running is downtime for now, or check for non-null Stop_time.
  // But wait, if Stop_time is present, it means the cycle finished.
  // If Status was 'Running' during that cycle, then Stop - Start is Run Time.
  // If Status was 'Stopped', then Stop - Start is Stop Time.
  // So we must filter by Status = 'Stopped' or similar.

  // Refined Logic:
  // 1. Filter by date range
  if (filters.startDate && filters.endDate) {
    where.created_at = {
      [Op.between]: [filters.startDate, filters.endDate],
    }
  }

  if (filters.companyName) where.company_name = { [Op.like]: `%${filters.companyName}%` }
  if (filters.plantName) where.plant_name = { [Op.like]: `%${filters.plantName}%` }
  if (filters.deviceId) where.device_id = { [Op.like]: `%${filters.deviceId}%` }
  if (filters.model) where.model = { [Op.like]: `%${filters.model}%` }

  // 2. Filter for Stopped status
  // We'll search for status containing 'Stop' or 'Error' or 'Alarm'?
  // User specifically said "stopped time aa rha h".
  // Let's assume status='Stopped'.
  // But to be safe, let's include anything that is not 'Running'.
  // Actually, let's stick to what the user implies: downtime.
  const downtimeQuery = `
    WITH UniqueData AS (
      SELECT *,
             ROW_NUMBER() OVER (
               PARTITION BY device_id, start_time, stop_time
               ORDER BY start_time DESC
             ) AS rn
      FROM plc_data
      WHERE stop_time IS NOT NULL
        ${filters.startDate && filters.endDate ? `AND start_time BETWEEN '${filters.startDate}' AND '${filters.endDate}'` : ''}
        ${filters.deviceId ? `AND device_id LIKE '%${filters.deviceId}%'` : ''}
        ${filters.model ? `AND model LIKE '%${filters.model}%'` : ''}
        ${filters.companyName ? `AND company_name LIKE '%${filters.companyName}%'` : ''}
        ${filters.plantName ? `AND plant_name LIKE '%${filters.plantName}%'` : ''}
    ),
    FilteredData AS (
      SELECT *
      FROM UniqueData
      WHERE rn = 1
    ),
    GapCalculated AS (
      SELECT *,
             LAG(stop_time) OVER (
               PARTITION BY device_id
               ORDER BY start_time
             ) AS prev_stop_time
      FROM FilteredData
    ),
    FinalData AS (
      SELECT *,
             CASE 
               WHEN prev_stop_time IS NOT NULL AND DATEDIFF(SECOND, prev_stop_time, start_time) > 0 
               THEN DATEDIFF(MINUTE, prev_stop_time, start_time) 
               ELSE 0 
             END AS stopped_duration_minutes
      FROM GapCalculated
    )
    SELECT 
      device_id AS name,
      SUM(stopped_duration_minutes) AS value
    FROM FinalData
    WHERE prev_stop_time IS NOT NULL
    GROUP BY device_id
    ORDER BY value DESC;
  `

  const results = await sequelize.query(downtimeQuery, {
    type: Sequelize.QueryTypes.SELECT,
    raw: true,
  })

  return results.map((r) => ({
    name: r.name,
    value: r.value,
  }))
}

export const getPlcTimeDistributionService = async (filters = {}) => {
  const where = {}

  if (filters.device_id) where.device_id = { [Op.like]: `%${filters.device_id}%` }
  if (filters.model) where.model = { [Op.like]: `%${filters.model}%` }
  if (filters.status) where.status = { [Op.like]: `%${filters.status}%` }
  if (filters.company_name) where.company_name = { [Op.like]: `%${filters.company_name}%` }
  if (filters.plant_name) where.plant_name = { [Op.like]: `%${filters.plant_name}%` }

  if (filters.startDate && filters.endDate) {
    where.created_at = { [Op.between]: [filters.startDate, filters.endDate] }
  }
  if (filters.timestampStart && filters.timestampEnd) {
    where.timestamp = { [Op.between]: [filters.timestampStart, filters.timestampEnd] }
  }

  // Same data scope as PlcStoppage: order created_at DESC, limit 1000 when no date filter
  const queryOpts = {
    attributes: [
      '_id',
      'device_id',
      'start_time',
      'stop_time',
      'timestamp',
      'production_count',
      'status',
      'created_at',
    ],
    where,
    order: [['created_at', 'DESC']],
    raw: true,
  }
  if (!filters.startDate || !filters.endDate) {
    queryOpts.limit = 1000
  }
  const records = await PlcDataModel.findAll(queryOpts)

  // Normalize like PlcStoppage: _ts = timestamp || created_at || start_time
  const allRecords = records.map((r) => {
    const ts = r.timestamp || r.created_at || r.start_time
    return {
      ...r,
      _ts: ts ? new Date(ts).getTime() : 0,
      _start: r.start_time ? new Date(r.start_time).getTime() : null,
      _stop: r.stop_time ? new Date(r.stop_time).getTime() : null,
    }
  })

  let totalRunMins = 0
  let totalStopMins = 0
  let totalIdleMins = 0

  const grouped = {}
  allRecords.forEach((r) => {
    const dId = r.device_id || 'unknown'
    if (!grouped[dId]) grouped[dId] = []
    grouped[dId].push(r)
  })

  Object.keys(grouped).forEach((deviceId) => {
    const group = grouped[deviceId].sort((a, b) => a._ts - b._ts)

    // A) Sessions - same as PlcStoppage (Run/Stop from session status, gaps -> Stop)
    const sessions = group.filter((r) => r.start_time || r.stop_time)

    sessions.forEach((row, index) => {
      const start = row.start_time
        ? new Date(row.start_time).getTime()
        : row.timestamp
          ? new Date(row.timestamp).getTime()
          : 0
      const stop = row.stop_time ? new Date(row.stop_time).getTime() : null
      const statusLower = (row.status || '').toLowerCase()
      const durationMins = start && stop && stop > start ? (stop - start) / 60000 : 0

      if (durationMins > 0) {
        if (statusLower.includes('stop')) {
          totalRunMins += durationMins
        } else {
          totalStopMins += durationMins
        }
      }

      if (index > 0) {
        const prev = sessions[index - 1]
        if (prev._stop && row._start && row._start > prev._stop) {
          totalStopMins += (row._start - prev._stop) / 60000
        }
      }
    })

    // B) Idle - production_count same for 30+ sec (same as PlcStoppage)
    let lastProdCount = -1
    let lastProdChangeTime = 0
    let isIdling = false
    let idleStartTs = 0

    group.forEach((r) => {
      const currentTs = r._ts
      const currentProd = r.production_count
      if (!currentTs) return
      const currProd = currentProd != null ? currentProd : lastProdCount

      if (lastProdCount === -1) {
        lastProdCount = currProd
        lastProdChangeTime = currentTs
        return
      }

      if (currProd !== lastProdCount) {
        if (isIdling) {
          const durationMins = (currentTs - idleStartTs) / 60000
          if (durationMins > 0) totalIdleMins += durationMins
          isIdling = false
        }
        lastProdCount = currProd
        lastProdChangeTime = currentTs
      } else {
        const diffMs = currentTs - lastProdChangeTime
        if (!isIdling && diffMs > 30000) {
          isIdling = true
          idleStartTs = lastProdChangeTime + 30000
        }
      }
    })

    if (isIdling && group.length > 0) {
      const lastRecord = group[group.length - 1]
      const endTs = lastRecord._ts
      if (endTs > idleStartTs) {
        totalIdleMins += (endTs - idleStartTs) / 60000
      }
    }
  })

  return {
    runTime: Math.round(totalRunMins),
    stopTime: Math.round(totalStopMins),
    idleTime: Math.round(totalIdleMins),
  }
}

export const getMachinePerformanceService = async (filters = {}) => {
  const { startDate, endDate, companyName, plantName, deviceId, model } = filters

  // We use the SQL logic provided by the user, adapted for our schema and including filters.
  // The logic identifies Best/Worst machines based on Running Time (Running -> Stopped transitions)
  // and Production Count.

  const performanceQuery = `
    WITH StatusData AS ( 
      SELECT device_id, model, status, timestamp, production_count,
             LAG(status) OVER (PARTITION BY device_id ORDER BY timestamp) AS prev_status, 
             LAG(timestamp) OVER (PARTITION BY device_id ORDER BY timestamp) AS prev_time 
      FROM plc_data 
      WHERE 1=1
      ${startDate && endDate ? `AND timestamp BETWEEN :startDate AND :endDate` : ''}
      ${companyName ? `AND company_name = :companyName` : ''}
      ${plantName ? `AND plant_name = :plantName` : ''}
      ${deviceId ? `AND device_id = :deviceId` : ''}
      ${model ? `AND model = :model` : ''}
    ), 
    
    RunningTimeCalc AS ( 
      SELECT 
        device_id, 
        model as machine_name, 
        DATEDIFF(MINUTE, prev_time, timestamp) AS running_minutes, 
        production_count 
      FROM StatusData 
      WHERE prev_status = 'Running' AND status = 'Stopped' 
    ), 
    
    Aggregated AS ( 
      SELECT 
        device_id, 
        machine_name, 
        SUM(ISNULL(running_minutes, 0)) AS total_running_time, 
        SUM(ISNULL(production_count, 0)) AS total_production 
      FROM RunningTimeCalc 
      GROUP BY device_id, machine_name 
    ) 
    SELECT * FROM Aggregated;
  `

  const replacements = {}
  if (startDate) replacements.startDate = startDate
  if (endDate) replacements.endDate = endDate
  if (companyName) replacements.companyName = companyName
  if (plantName) replacements.plantName = plantName
  if (deviceId) replacements.deviceId = deviceId
  if (model) replacements.model = model

  const results = await sequelize.query(performanceQuery, {
    replacements,
    type: Sequelize.QueryTypes.SELECT,
    raw: true,
  })

  if (!results || results.length === 0) {
    return {
      best_machine: null,
      worst_machine: null,
    }
  }

  // Find Best Machine: MAX(total_running_time) then MAX(total_production)
  const bestMachine = [...results].sort((a, b) => {
    if (b.total_running_time !== a.total_running_time) {
      return b.total_running_time - a.total_running_time
    }
    return b.total_production - a.total_production
  })[0]

  // Find Worst Machine: MIN(total_running_time) then MIN(total_production)
  const worstMachine = [...results].sort((a, b) => {
    if (a.total_running_time !== b.total_running_time) {
      return a.total_running_time - b.total_running_time
    }
    return a.total_production - b.total_production
  })[0]

  return {
    best_machine: {
      machine_name: bestMachine.machine_name,
      total_running_time: bestMachine.total_running_time,
      total_production: bestMachine.total_production,
    },
    worst_machine: {
      machine_name: worstMachine.machine_name,
      total_running_time: worstMachine.total_running_time,
      total_production: worstMachine.total_production,
    },
  }
}

export const getPlcDowntimeByErrorService = async (filters = {}) => {
  const { startDate, endDate, companyName, plantName, deviceId, model } = filters

  let whereClause =
    "WHERE status = 'Stopped' AND stop_time IS NOT NULL AND JSON_VALUE(extra_data, '$.Error') IS NOT NULL AND JSON_VALUE(extra_data, '$.Error') <> ''"
  const replacements = {}

  if (startDate && endDate) {
    whereClause += ' AND start_time BETWEEN :startDate AND :endDate'
    replacements.startDate = startDate
    replacements.endDate = endDate
  }

  if (companyName) {
    whereClause += ' AND company_name LIKE :companyName'
    replacements.companyName = `%${companyName}%`
  }

  if (plantName) {
    whereClause += ' AND plant_name LIKE :plantName'
    replacements.plantName = `%${plantName}%`
  }

  if (deviceId) {
    whereClause += ' AND device_id LIKE :deviceId'
    replacements.deviceId = `%${deviceId}%`
  }

  if (model) {
    whereClause += ' AND model LIKE :model'
    replacements.model = `%${model}%`
  }

  const query = `
    SELECT 
      UPPER(LTRIM(RTRIM(JSON_VALUE(extra_data, '$.Error')))) AS error_name, 
      SUM(DATEDIFF(MINUTE, start_time, stop_time)) AS total_downtime 
    FROM plc_data 
    ${whereClause}
    GROUP BY UPPER(LTRIM(RTRIM(JSON_VALUE(extra_data, '$.Error')))) 
    ORDER BY total_downtime DESC;
  `

  const results = await sequelize.query(query, {
    replacements,
    type: Sequelize.QueryTypes.SELECT,
    raw: true,
  })

  return results.map((r) => ({
    error_name: r.error_name,
    total_downtime: r.total_downtime,
  }))
}

export const getPlcDowntimeByErrorStatusService = async (filters = {}) => {
  // This card should show "how many errors" per ERROR_STATUS (NOT downtime minutes),
  // and it must align with the same error-count logic used in the dashboard summary.
  const { startDate, endDate, companyName, plantName, deviceId, model } = filters

  const where = {}
  if (startDate && endDate) {
    // UI date range is treated as "created_at" range across PLC dashboards.
    where.created_at = { [Op.between]: [startDate, endDate] }
  } else if (startDate) {
    where.created_at = { [Op.gte]: startDate }
  } else if (endDate) {
    where.created_at = { [Op.lte]: endDate }
  }

  if (companyName) where.company_name = { [Op.like]: `%${companyName}%` }
  if (plantName) where.plant_name = { [Op.like]: `%${plantName}%` }
  if (deviceId) where.device_id = { [Op.like]: `%${deviceId}%` }
  if (model) where.model = { [Op.like]: `%${model}%` }

  const toPlain = (row) => (row?.toJSON ? row.toJSON() : row)

  const parseMaybeJson = (value) => {
    if (!value) return null
    if (typeof value === 'object') return value
    if (typeof value === 'string') {
      try {
        return JSON.parse(value)
      } catch (_) {
        return null
      }
    }
    return null
  }

  const getModel = (row) => {
    const machine = row?.machine
    const product = row?.product
    return row?.model ?? machine?.model ?? product?.model ?? 'Unknown'
  }

  const getErrorStatus = (plainRow) => {
    const raw =
      plainRow?.parameters?.ERROR_STATUS ??
      plainRow?.parameters?.error_status ??
      plainRow?.ERROR_STATUS ??
      plainRow?.error_status
    return String(raw ?? '')
      .trim()
      .toLowerCase()
  }

  const getBarcodeId = (plainRow) => {
    const rawBarcodeDetails = plainRow?.Barcode_details
    const barcodeDetails = parseMaybeJson(rawBarcodeDetails)
    if (!barcodeDetails || typeof barcodeDetails !== 'object') return null

    const id =
      barcodeDetails?.BarcodeID ??
      barcodeDetails?.BarcodeId ??
      barcodeDetails?.barcode_id ??
      barcodeDetails?.BarcodeTag ??
      null

    const s = id == null ? '' : String(id).trim()
    return s ? s : null
  }

  const modelSel =
    model != null && String(model).trim() !== '' ? String(model).trim().toLowerCase() : null

  // Fetch ordered like `getPlcListingService` so our "latest barcode per id"
  // matches the dashboard summary's logic.
  const rows = await PlcDataModel.findAll({
    where,
    order: [['timestamp', 'ASC']],
  })

  await attachProductToPlcData(rows)

  const latestBarcodeById = new Map()
  for (const row of rows) {
    const plainRow = toPlain(row)
    const barcodeId = getBarcodeId(plainRow)
    if (!barcodeId) continue

    if (modelSel) {
      const m = String(getModel(plainRow)).trim().toLowerCase()
      if (m !== modelSel) continue
    }

    if (!latestBarcodeById.has(barcodeId)) {
      latestBarcodeById.set(barcodeId, plainRow)
    }
  }

  const countsByStatus = new Map() // ERROR_STATUS -> count
  const modelsByStatus = new Map() // ERROR_STATUS -> Map(model -> count)

  for (const latestRow of latestBarcodeById.values()) {
    const status = getErrorStatus(latestRow)
    if (!status || status === 'ok') continue

    const error_status = status.toUpperCase()
    countsByStatus.set(error_status, (countsByStatus.get(error_status) || 0) + 1)

    const modelVal = String(getModel(latestRow) ?? 'Unknown').trim() || 'Unknown'
    if (!modelsByStatus.has(error_status)) modelsByStatus.set(error_status, new Map())
    const mm = modelsByStatus.get(error_status)
    mm.set(modelVal, (mm.get(modelVal) || 0) + 1)
  }

  const results = Array.from(countsByStatus.entries()).map(([error_status, total_errors]) => {
    const modelsMap = modelsByStatus.get(error_status) || new Map()
    const top_models = Array.from(modelsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([m, c]) => ({ model: m, count: c }))

    return { error_status, total_errors, top_models }
  })

  results.sort((a, b) => b.total_errors - a.total_errors)
  return results
}
