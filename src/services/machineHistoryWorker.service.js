import { PlcDataModel } from "../models/plcData.model.js";
import { MachineHistoryModel } from "../models/machineHistory.model.js";
import { WorkerConfigModel } from "../models/workerConfig.model.js";
import { Op } from "sequelize";
import { logger } from "../utils/logger.js";

const BATCH_SIZE = 5000;
const POLLING_INTERVAL = 10000;
const WORKER_NAME = "machine_history_worker";

let isProcessing = false;

// ✅ UPDATED: cacheKey ab device_id + model + part_no se banega
// Kyunki har model ki apni alag production hoti hai
const lastStateCache = new Map();

/**
 * ✅ Parse extra_data JSON safely
 */
function parseExtraData(raw) {
  try {
    if (!raw) return {};
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

/**
 * ✅ Normalize any PLC data format → unified shape
 *
 * FORMAT 1 (JPM device):
 *   - product/parameters inside extra_data JSON string
 *
 * FORMAT 2 (MACHINE-02):
 *   - product, parameters, Barcode_details as top-level fields
 */
function normalizePlcData(data) {
  const extraData = parseExtraData(data.extra_data);

  // ── Product ──────────────────────────────────────────────
  let product = {};

  if (data.product && typeof data.product === "object") {
    product = data.product;
  } else if (data.product && typeof data.product === "string") {
    try { product = JSON.parse(data.product); } catch { product = {}; }
  } else if (extraData?.product) {
    product = extraData.product;
  }

  // ── Parameters ───────────────────────────────────────────
  let parameters = {};

  if (data.parameters && typeof data.parameters === "object") {
    parameters = data.parameters;
  } else if (data.parameters && typeof data.parameters === "string") {
    try { parameters = JSON.parse(data.parameters); } catch { parameters = {}; }
  } else {
    parameters = extraData || {};
  }

  // ── Barcode ──────────────────────────────────────────────
  let barcode = {};

  if (data.Barcode_details && typeof data.Barcode_details === "object") {
    barcode = data.Barcode_details;
  } else if (extraData?.Barcode_details) {
    barcode = extraData.Barcode_details;
  }

  // ── Final normalized fields ───────────────────────────────
  return {
    device_id:      (data.device_id || "unknown").trim(),

    // Product details
    part_no:        (product?.part_no        || "unknown").trim(),
    material_code:  (product?.material_code  || parameters?.material_code || null),
    model:          (product?.model          || data.model || null),

    // Parameters / extra
    operator_name:  parameters?.Operatorname || parameters?.OPERATOR || null,
    shift:          parameters?.Shift        || null,
    line_name:      parameters?.line_name    || null,
    error_status:   parameters?.ERROR_STATUS || null,

    // Barcode
    barcode_id:     barcode?.BarcodeID       || null,
    barcode_status: barcode?.BarcodeStatus   || null,

    // Status & counts
    status:         (data.status || data.Status || "stopped").toLowerCase(),
    production_count: Number(data.production_count || 0),

    // Times
    timestamp:      data.timestamp  || data.created_at,
    start_time:     data.start_time || data.Start_time || null,
    stop_time:      data.stop_time  || data.Stop_time  || null,

    // Cursor
    created_at:     data.created_at,
    _id:            data._id,
  };
}

/**
 * Start Worker
 */
export async function startMachineHistoryWorker() {
  logger.info("🚀 Machine History Worker started");
  await processMachineHistory();

  setInterval(async () => {
    if (isProcessing) return;
    await processMachineHistory();
  }, POLLING_INTERVAL);
}

/**
 * Main Worker Logic
 */
async function processMachineHistory() {
  isProcessing = true;

  try {
    let config = await WorkerConfigModel.findOne({
      where: { worker_name: WORKER_NAME },
    });

    if (!config) {
      config = await WorkerConfigModel.create({
        worker_name: WORKER_NAME,
        last_processed_timestamp: new Date(0),
        last_processed_id: "0",
      });
    }

    let lastCreatedAt = config.last_processed_timestamp;
    let lastId = config.last_processed_id;

    const records = await PlcDataModel.findAll({
      where: {
        [Op.or]: [
          { created_at: { [Op.gt]: lastCreatedAt } },
          {
            created_at: lastCreatedAt,
            _id: { [Op.gt]: lastId },
          },
        ],
      },
      order: [
        ["created_at", "ASC"],
        ["_id", "ASC"],
      ],
      limit: BATCH_SIZE,
    });

    if (!records.length) {
      isProcessing = false;
      return;
    }

    logger.info(`📦 Processing ${records.length} records`);

    for (const record of records) {
      const raw = record.get({ plain: true });

      // ✅ Normalize both formats into one shape
      const d = normalizePlcData(raw);

      // ✅ UPDATED cacheKey:
      // Pehle sirf device_id + model + part_no + count tha
      // Ab device_id + model + part_no + count + start_time hai
      //
      // Kyun?
      // Har model aur specific session (start_time) ki production alag ho sakti hai
      const cacheKey = `${d.device_id}::${d.model}::${d.part_no}::${d.production_count}`;

      // 🔹 Get last state (cache → DB fallback)
      let lastState = lastStateCache.get(cacheKey);

      if (!lastState) {
        const lastHistory = await MachineHistoryModel.findOne({
          where: {
            device_id: d.device_id,
            // ✅ UPDATED: DB lookup bhi model se filter hoga
            ...(d.model ? { model: d.model } : {}),
            part_no: d.part_no,
          },
          order: [["timestamp", "DESC"]],
        });

        lastState = lastHistory
          ? {
              status:           (lastHistory.status || "").toLowerCase(),
              production_count: Number(lastHistory.production_count || 0),
              start_time:       lastHistory.start_time,
            }
          : {
              status:           "",
              production_count: -1,
              start_time:       null,
            };

        lastStateCache.set(cacheKey, lastState);
      }

      // ─────────────────────────────────────────────────────────
      // ✅ DEDUPLICATION LOGIC
      // Frontend mein yeh tha:
      //   key = `${device_id}_${model}_${production_count}_${Status}`
      //   Same key → SKIP
      //
      // Worker mein same logic:
      //   hasCountIncreased → count badhaa hai?
      //   hasStatusChanged  → status badla hai?
      //
      // SAVE kab hoga:
      //   ✅ Count badha  (10 → 11)
      //   ✅ Status badla (running → stopped)
      //   ✅ Dono badle
      //
      // SKIP kab hoga:
      //   ❌ Count 0 hai aur status bhi same hai
      //   ❌ Kuch bhi nahi badla (count same, status same)
      //   ❌ Count ghata aur status bhi same hai
      // ─────────────────────────────────────────────────────────

      const hasCountIncreased = d.production_count > lastState.production_count;
      const hasStatusChanged  = d.status !== lastState.status;

      // ❌ SKIP: count 0 aur status bhi same
      if (d.production_count <= 0 && !hasStatusChanged) {
        lastCreatedAt = d.created_at;
        lastId = d._id;
        continue;
      }

      // ❌ SKIP: bilkul kuch nahi badla
      if (!hasCountIncreased && !hasStatusChanged) {
        lastCreatedAt = d.created_at;
        lastId = d._id;
        continue;
      }

      // ❌ SKIP: count ghata aur status bhi same (reset case, ignore karo)
      if (d.production_count < lastState.production_count && !hasStatusChanged) {
        lastCreatedAt = d.created_at;
        lastId = d._id;
        continue;
      }

      logger.info(
        `📡 [${d.device_id}] Model: ${d.model} | Part: ${d.part_no} | Status: ${lastState.status} → ${d.status} | Count: ${lastState.production_count} → ${d.production_count}`
      );

      // 🔹 Calculate start/stop/duration
      let startTime = d.start_time || lastState.start_time;
      let stopTime  = d.stop_time  || null;
      let duration  = 0;

      if (d.status === "running") {
        if (lastState.status !== "running") {
          startTime = d.start_time || d.timestamp;
        }
        stopTime = null;
      } else {
        stopTime  = d.stop_time || d.timestamp;
        startTime = startTime   || stopTime;

        if (startTime) {
          duration = Math.floor(
            (new Date(stopTime) - new Date(startTime)) / 1000
          );
          if (duration < 0) duration = 0;
        }
      }

      // 🔹 Insert record
      await MachineHistoryModel.create({
        device_id:        d.device_id,
        part_no:          d.part_no,
        material_code:    d.material_code,
        model:            d.model,
        operator_name:    d.operator_name,
        shift:            d.shift,
        line_name:        d.line_name,
        error_status:     d.error_status,
        barcode_id:       d.barcode_id,
        barcode_status:   d.barcode_status,
        status:           d.status,
        production_count: d.production_count,
        start_time:       startTime,
        stop_time:        stopTime,
        duration_seconds: duration,
        timestamp:        d.timestamp,
        plc_data_id:      d._id,
      });

      // 🔹 Update cache with new state
      lastStateCache.set(cacheKey, {
        status:           d.status,
        production_count: d.production_count,
        start_time:       startTime,
      });

      lastCreatedAt = d.created_at;
      lastId = d._id;
    }

    // ✅ Save last processed cursor
    await config.update({
      last_processed_timestamp: lastCreatedAt,
      last_processed_id: lastId,
    });

  } catch (err) {
    logger.error("❌ Worker Error:", err);
  } finally {
    isProcessing = false;
  }
}