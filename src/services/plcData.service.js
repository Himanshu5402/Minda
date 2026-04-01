import { PlcDataModel } from '../models/plcData.model.js'
import { PlcProductModel } from '../models/plcProduct.model.js'
import { NotFoundError } from '../utils/errorHandler.js'
import { Op, Sequelize } from 'sequelize'
import { sequelize } from "../sequelize.js";

/** Attach product name (from plc_products) to plc data by device_id = machine_name */
async function attachProductToPlcData(plcDataOrList) {
  const list = Array.isArray(plcDataOrList) ? plcDataOrList : [plcDataOrList]
  const products = await PlcProductModel.findAll({})
  const productNameByMachine = {}
  products.forEach((p) => {
    if (p.machine_name && p.machine_name.trim()) {
      const name =
        p.material_description || p.part_no || p.model_code || p.material_code || p.machine_name
      productNameByMachine[p.machine_name.trim()] = name
    }
  })
  list.forEach((item) => {
    const product =
      item.device_id && item.device_id.trim()
        ? productNameByMachine[item.device_id.trim()] || null
        : null
    item.setDataValue('product', product)
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
    return lastRecord.toJSON()
  }

  // Insert new row
  const plcData = await PlcDataModel.create({
    ...known,
    extra_data: Object.keys(extra).length ? extra : {},
  })

  if (typeof attachProductToPlcData === 'function') {
    await attachProductToPlcData(plcData)
  }

  return plcData.toJSON ? plcData.toJSON() : plcData.get({ plain: true })
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

  // const page = Math.max(pagination.page || 1, 1)
  // const limit = Math.min(pagination.limit || 10, 5000)
  // const offset = (page - 1) * limit

  const plcDataList = await PlcDataModel.findAll({
    where,
    order: [['created_at', 'DESC']],
    // limit,
    // offset,
  })

  await attachProductToPlcData(plcDataList)
  return plcDataList
}
// ─────────────────────────────────────────────────────────────────────────────
// Helper: map a raw DB row → clean report object
// (same field extraction that was previously in the controller)
// ─────────────────────────────────────────────────────────────────────────────
function mapRowToReport(json) {
  // ── parameters ──
  let params = json.parameters || {};
  if (typeof params === "string") {
    try { params = JSON.parse(params); } catch (_) { params = {}; }
  }
  const flatParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && typeof v !== "object") flatParams[k] = v;
  }

  // ── barcode ──
  let barcode = json.Barcode_details || null;
  if (typeof barcode === "string") {
    try { barcode = JSON.parse(barcode); } catch (_) { barcode = null; }
  }
  if (!barcode || typeof barcode !== "object") barcode = {};

  // ── product ──
  let product = json.product;
  if (typeof product === "string") {
    try { product = JSON.parse(product); } catch (_) { product = null; }
  }

  return {
    Company:        json.companyname ?? null,
    Plant:          json.plantname   ?? null,
    Product:
      (product && typeof product === "object" &&
        (product.material_code || product.part_no || product.model)) ||
      (typeof product === "string" ? product : null) ||
      null,
    Model:
      (product && typeof product === "object" && product.model) ||
      (json.machine && json.machine.model) ||
      json.model ||
      null,
    Shift:     flatParams.SHIFT     || flatParams.Shift     || flatParams.shift     || null,
    Operator:  flatParams.Operatorname || flatParams.OPERATORNAME || flatParams.OPERATOR || flatParams.operator || null,
    Date:      json.timestamp || null,
    LineNumber: json.linenumber ?? null,
    LineName:  flatParams.linename  || flatParams.line_name  || null,
    BarcodeTag:      barcode.BarcodeID       || null,
    BarcodeStatus:   barcode.BarcodeStatus   || null,
    BarcodeDateTime: barcode.BarcodeDateTime || null,
    Rod:     flatParams.ROD     || flatParams.rod     || null,
    Striker: flatParams.STRIKER || flatParams.striker || null,
    Error:
      flatParams.ERROR_STATUS || flatParams.ERROR_CODE ||
      flatParams.error_status || flatParams.error_code || null,
    ProductionCount:
      json.production_count ??
      flatParams.PRODUCTION_COUNT ??
      flatParams.production_count ??
      null,
    // CalculatedProduction is derived here so the frontend never has to
    CalculatedProduction:
      String(flatParams.ERROR_STATUS || flatParams.error_status || "")
        .trim().toLowerCase() === "ok" ? 1 : 0,
    parameters: flatParams,
    timestamp:  json.timestamp || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the Sequelize `where` clause for fields that live in the DB columns
// (company, plant, date range).  Product / status filtering happens in-memory
// after deduplication because those values are inside JSON blobs.
// ─────────────────────────────────────────────────────────────────────────────
function buildDbWhere(filters, Op) {
  const where = {};

  if (filters.device_id)    where.device_id    = { [Op.like]: `%${filters.device_id}%` };
  if (filters.company_name) where.company_name = filters.company_name; // ← exact match
  if (filters.plant_name)   where.plant_name   = filters.plant_name;   // ← exact match

  // duration/date filters same as before
  const { duration, startDate, endDate, startTime, endTime } = filters;

  if (duration === "today") {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    where.timestamp = { [Op.gte]: start };
  } else if (duration === "week") {
    const start = new Date();
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    where.timestamp = { [Op.gte]: start };
  } else if (duration === "month") {
    const now = new Date();
    where.timestamp = { [Op.gte]: new Date(now.getFullYear(), now.getMonth(), 1) };
  } else if (duration === "custom") {
    const start = startDate ? new Date(`${startDate}T${startTime || "00:00"}:00`) : null;
    const end   = endDate   ? new Date(`${endDate}T${endTime || "23:59"}:59`)     : null;
    if (start && end) where.timestamp = { [Op.between]: [start, end] };
    else if (start)   where.timestamp = { [Op.gte]: start };
    else if (end)     where.timestamp = { [Op.lte]: end };
  } else if (filters.timestampStart && filters.timestampEnd) {
    where.timestamp = { [Op.between]: [filters.timestampStart, filters.timestampEnd] };
  }

  return where;
}
// ─────────────────────────────────────────────────────────────────────────────
// Main service
// ─────────────────────────────────────────────────────────────────────────────
export const getAllPlcReport = async (filters = {}, pagination = {}) => {
  // 1️⃣  Fetch from DB — oldest first so dedup keeps the first scan per barcode
  const where = buildDbWhere(filters, Op);

  const rawRows = await PlcDataModel.findAll({
    where,
    order: [["timestamp", "ASC"]],
  });

  await attachProductToPlcData(rawRows);

  // 2️⃣  Map to clean report objects
  const mapped = rawRows.map((r) => mapRowToReport(r.toJSON()));

  // 3️⃣  Deduplicate by BarcodeTag — keep FIRST (oldest) occurrence
  const barcodeMap = new Map();
  for (const row of mapped) {
    if (row.BarcodeTag && !barcodeMap.has(row.BarcodeTag)) {
      barcodeMap.set(row.BarcodeTag, row);
    }
  }
  let deduped = Array.from(barcodeMap.values());

  // 4️⃣  In-memory filters (values live inside JSON blobs, can't use SQL)
  if (filters.model) {
  deduped = deduped.filter((r) =>
    String(r.Model ?? "").trim() === String(filters.model).trim() // ← exact match
  );
}

  if (filters.status) {
  const sel = filters.status.trim().toLowerCase();
  deduped = deduped.filter((r) => {
    const err = String(r.Error ?? "").trim().toLowerCase();
    if (sel === "ok")    return err === "ok";
    if (sel === "error") return err !== "ok";
    return true;
  });
  }

  // 5️⃣  Sort DESC — latest on top (for display)
  deduped.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const total = deduped.length;

  // 6️⃣  Summary stats (computed once, on full filtered set)
  const uniqueProducts  = new Set(deduped.map((r) => r.Product).filter(Boolean)).size;
  const barcodeOkCount  = deduped.filter((r) => String(r.Error ?? "").trim().toLowerCase() === "ok").length;
  const barcodeNgCount  = total - barcodeOkCount;

  // Total production: max ProductionCount per Plant+Model combination, then sum
  const plantModelMax = new Map();
  for (const row of deduped) {
    const key = `${row.Plant}__${row.Model}`;
    const cur = plantModelMax.get(key)?.ProductionCount ?? -1;
    if ((row.ProductionCount ?? 0) > cur) plantModelMax.set(key, row);
  }
  let totalProduction = 0;
  plantModelMax.forEach((r) => { totalProduction += r.ProductionCount || 0; });

  // Per-product summary for the summary modal
  const productSummaryMap = new Map();
  for (const row of deduped) {
    const product = row.Product;
    if (!product) continue;

    const rowTime = new Date(row.timestamp);
    if (!productSummaryMap.has(product)) {
      productSummaryMap.set(product, { latestRow: row, latestTime: rowTime, barcodeOk: 0, barcodeNg: 0 });
    } else {
      const e = productSummaryMap.get(product);
      if (rowTime > e.latestTime) { e.latestRow = row; e.latestTime = rowTime; }
    }

    const err = String(row.Error ?? "").trim().toLowerCase();
    const entry = productSummaryMap.get(product);
    if (err === "ok") entry.barcodeOk += 1;
    else              entry.barcodeNg += 1;
  }

  const productSummaries = Array.from(productSummaryMap.entries()).map(([product, s]) => ({
    product,
    totalProduction: s.latestRow?.ProductionCount || 0,
    barcodeOk:       s.barcodeOk,
    barcodeNg:       s.barcodeNg,
    company:         s.latestRow?.Company || "-",
    plant:           s.latestRow?.Plant   || "-",
    model:           s.latestRow?.Model   || "-",
  }));

  // 7️⃣  Paginate
  const page   = Math.max(Number(pagination.page)  || 1,  1);
  const limit  = Math.min(Number(pagination.limit) || 10, 500);
  const offset = (page - 1) * limit;
  const pageData = deduped.slice(offset, offset + limit);

  return {
    data:       pageData,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    summary: {
      uniqueProducts,
      barcodeOkCount,
      barcodeNgCount,
      totalProduction,
    },
    productSummaries,
  };
};
export const getPlcListingService = async (filters = {}) => {
  const where = buildDbWhere(filters, Op)

  if (filters.company_name) where.company_name = filters.company_name
  if (filters.plant_name) where.plant_name = filters.plant_name
  if (filters.device_id) {
    where.device_id = { [Op.like]: `%${filters.device_id}%` }
  }

  const data = await PlcDataModel.findAll({
    where,
    order: [['created_at', 'DESC']],
  })

  await attachProductToPlcData(data)

  // 🔥 Latest per device logic (frontend se yaha shift)
  const deviceMap = new Map()

  data.forEach((item) => {
    const deviceId = item.device_id || 'Unknown'

    const existing = deviceMap.get(deviceId)

    if (!existing || new Date(item.created_at) > new Date(existing.created_at)) {
      deviceMap.set(deviceId, item)
    }
  })

  let result = Array.from(deviceMap.values())

  // 🔥 Status filter (backend me)
  if (filters.status) {
    const sel = filters.status.toLowerCase()
    result = result.filter((r) => (r.status || '').toLowerCase() === sel)
  }

  return result
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

  // Updated query to calculate gap-based stoppage duration between consecutive records
  const query = `
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
    SELECT *
    FROM FinalData
    WHERE prev_stop_time IS NOT NULL -- Follow user logic to ignore first record
    ORDER BY start_time DESC
    OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY;
  `

  const countQuery = `
    WITH UniqueData AS (
      SELECT device_id, start_time, stop_time,
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
    )
    SELECT COUNT(*) as total
    FROM GapCalculated
    WHERE prev_stop_time IS NOT NULL;
  `

  const totalDowntimeQuery = `
    WITH UniqueData AS (
      SELECT device_id, start_time, stop_time,
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
    SELECT SUM(stopped_duration) as totalDowntime
    FROM FinalData
    WHERE prev_stop_time IS NOT NULL;
  `

  const [
    data,
    [countResult],
    [totalDowntimeResult],
    [totalMachinesResult],
    [totalStoppedMachinesResult],
    allDevicesResult,
  ] = await Promise.all([
    sequelize.query(query, {
      replacements,
      type: Sequelize.QueryTypes.SELECT,
      model: PlcDataModel,
      mapToModel: true,
    }),
    sequelize.query(countQuery, {
      replacements,
      type: Sequelize.QueryTypes.SELECT,
    }),
    sequelize.query(totalDowntimeQuery, {
      replacements,
      type: Sequelize.QueryTypes.SELECT,
    }),
    sequelize.query('SELECT COUNT(DISTINCT device_id) as count FROM plc_data', {
      type: Sequelize.QueryTypes.SELECT,
    }),
    sequelize.query(
      `WITH UniqueData AS (
         SELECT device_id, start_time, stop_time,
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
         SELECT device_id,
                LAG(stop_time) OVER (
                  PARTITION BY device_id
                  ORDER BY start_time
                ) AS prev_stop_time
         FROM FilteredData
       )
       SELECT COUNT(DISTINCT device_id) as count
       FROM GapCalculated
       WHERE prev_stop_time IS NOT NULL;`,
      {
        replacements,
        type: Sequelize.QueryTypes.SELECT,
      }
    ),
    sequelize.query('SELECT DISTINCT device_id FROM plc_data WHERE device_id IS NOT NULL', {
      type: Sequelize.QueryTypes.SELECT,
    }),
  ])

  const total = countResult?.total || 0
  const totalDowntime = totalDowntimeResult?.totalDowntime || 0
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

  await plcData.update(updateData)
  await attachProductToPlcData(plcData)

  return plcData
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
  `;

  const results = await sequelize.query(downtimeQuery, {
    type: Sequelize.QueryTypes.SELECT,
    raw: true,
  });

  return results.map((r) => ({
    name: r.name,
    value: r.value,
  }));
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
  const { startDate, endDate, companyName, plantName, deviceId, model } = filters;

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
  `;

  const replacements = {};
  if (startDate) replacements.startDate = startDate;
  if (endDate) replacements.endDate = endDate;
  if (companyName) replacements.companyName = companyName;
  if (plantName) replacements.plantName = plantName;
  if (deviceId) replacements.deviceId = deviceId;
  if (model) replacements.model = model;

  const results = await sequelize.query(performanceQuery, {
    replacements,
    type: Sequelize.QueryTypes.SELECT,
    raw: true,
  });

  if (!results || results.length === 0) {
    return {
      best_machine: null,
      worst_machine: null,
    };
  }

  // Find Best Machine: MAX(total_running_time) then MAX(total_production)
  const bestMachine = [...results].sort((a, b) => {
    if (b.total_running_time !== a.total_running_time) {
      return b.total_running_time - a.total_running_time;
    }
    return b.total_production - a.total_production;
  })[0];

  // Find Worst Machine: MIN(total_running_time) then MIN(total_production)
  const worstMachine = [...results].sort((a, b) => {
    if (a.total_running_time !== b.total_running_time) {
      return a.total_running_time - b.total_running_time;
    }
    return a.total_production - b.total_production;
  })[0];

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
  };
};

export const getPlcDowntimeByErrorService = async (filters = {}) => {
  const { startDate, endDate, companyName, plantName, deviceId, model } = filters;
  
  let whereClause = "WHERE status = 'Stopped' AND stop_time IS NOT NULL AND JSON_VALUE(extra_data, '$.Error') IS NOT NULL AND JSON_VALUE(extra_data, '$.Error') <> ''";
  const replacements = {};

  if (startDate && endDate) {
    whereClause += " AND start_time BETWEEN :startDate AND :endDate";
    replacements.startDate = startDate;
    replacements.endDate = endDate;
  }

  if (companyName) {
    whereClause += " AND company_name LIKE :companyName";
    replacements.companyName = `%${companyName}%`;
  }

  if (plantName) {
    whereClause += " AND plant_name LIKE :plantName";
    replacements.plantName = `%${plantName}%`;
  }

  if (deviceId) {
    whereClause += " AND device_id LIKE :deviceId";
    replacements.deviceId = `%${deviceId}%`;
  }

  if (model) {
    whereClause += " AND model LIKE :model";
    replacements.model = `%${model}%`;
  }

  const query = `
    SELECT 
      UPPER(LTRIM(RTRIM(JSON_VALUE(extra_data, '$.Error')))) AS error_name, 
      SUM(DATEDIFF(MINUTE, start_time, stop_time)) AS total_downtime 
    FROM plc_data 
    ${whereClause}
    GROUP BY UPPER(LTRIM(RTRIM(JSON_VALUE(extra_data, '$.Error')))) 
    ORDER BY total_downtime DESC;
  `;

  const results = await sequelize.query(query, {
    replacements,
    type: Sequelize.QueryTypes.SELECT,
    raw: true,
  });

  return results.map(r => ({
    error_name: r.error_name,
    total_downtime: r.total_downtime
  }));
};

export const getPlcDowntimeByErrorStatusService = async (filters = {}) => {
  const { startDate, endDate, companyName, plantName, deviceId, model } = filters;
  
  let whereClause = `
    WHERE status = 'Stopped' 
      AND stop_time IS NOT NULL 
      AND JSON_VALUE(extra_data, '$.ERROR_STATUS') IS NOT NULL 
      AND LOWER(LTRIM(RTRIM(JSON_VALUE(extra_data, '$.ERROR_STATUS')))) <> 'ok'
  `;
  const replacements = {};

  if (startDate && endDate) {
    whereClause += " AND start_time BETWEEN :startDate AND :endDate";
    replacements.startDate = startDate;
    replacements.endDate = endDate;
  }

  if (companyName) {
    whereClause += " AND company_name LIKE :companyName";
    replacements.companyName = `%${companyName}%`;
  }

  if (plantName) {
    whereClause += " AND plant_name LIKE :plantName";
    replacements.plantName = `%${plantName}%`;
  }

  if (deviceId) {
    whereClause += " AND device_id LIKE :deviceId";
    replacements.deviceId = `%${deviceId}%`;
  }

  if (model) {
    whereClause += " AND model LIKE :model";
    replacements.model = `%${model}%`;
  }

  const query = `
    SELECT 
      UPPER(LTRIM(RTRIM(JSON_VALUE(extra_data, '$.ERROR_STATUS')))) AS error_status, 
      SUM(DATEDIFF(MINUTE, start_time, stop_time)) AS total_downtime 
    FROM plc_data 
    ${whereClause}
    GROUP BY UPPER(LTRIM(RTRIM(JSON_VALUE(extra_data, '$.ERROR_STATUS')))) 
    ORDER BY total_downtime DESC;
  `;

  const results = await sequelize.query(query, {
    replacements,
    type: Sequelize.QueryTypes.SELECT,
    raw: true,
  });

  return results.map(r => ({
    error_status: r.error_status,
    total_downtime: r.total_downtime
  }));
};
