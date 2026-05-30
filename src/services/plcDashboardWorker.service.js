import { PlcDataModel } from '../models/plcData.model.js'
import { PlcDashboardModel } from '../models/plcDashboard.model.js'
import { WorkerConfigModel } from '../models/workerConfig.model.js'
import { Op } from 'sequelize'
import { logger } from '../utils/logger.js'

const BATCH_SIZE = 10000
const POLLING_INTERVAL = 5000
const WORKER_NAME = 'plc_dashboard_worker'

let isProcessing = false

function toUtcDate(val) {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

function toJsonObject(val, fieldName = 'field', deviceId = 'unknown') {
  if (val === null || val === undefined) return null
  if (typeof val === 'object') return val
  if (typeof val === 'string') {
    try {
      return JSON.parse(val)
    } catch {
      logger.warn(`⚠️ ${fieldName} for device=${deviceId} is not valid JSON — storing null`)
      return null
    }
  }
  return null
}

function extractErrorMessage(err) {
  if (!err) return '(no error)'
  const candidates = [err.message, err.parent?.message, err.original?.message]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c
  }
  for (const key of Object.getOwnPropertyNames(err)) {
    if (key === 'stack') continue
    const val = err[key]
    if (typeof val === 'string' && val.trim().length > 0) return `[${key}] ${val}`
  }
  return '(no message)'
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
export async function startPlcDashboardWorker() {
  logger.info('🚀 PLC Dashboard Worker started')
  await processPlcDataForDashboard() // ✅ await added
  setInterval(async () => {
    if (isProcessing) return
    await processPlcDataForDashboard()
  }, POLLING_INTERVAL)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main processing loop
// ─────────────────────────────────────────────────────────────────────────────
async function processPlcDataForDashboard() {
  isProcessing = true

  try {
    // ── Step 1: Cursor management ───────────────────────────────────────────
    let config = await WorkerConfigModel.findOne({
      where: { worker_name: WORKER_NAME },
    })

    if (!config) {
      config = await WorkerConfigModel.create({
        worker_name: WORKER_NAME,
        last_processed_timestamp: new Date(0),
        last_processed_id: '00000000-0000-0000-0000-000000000000',
      })
    }

    const lastCreatedAt = config.last_processed_timestamp || new Date(0)
    const lastId = config.last_processed_id || '00000000-0000-0000-0000-000000000000'

    // ── Step 2: Fetch new records ───────────────────────────────────────────
    let newRecords
    try {
      newRecords = await PlcDataModel.findAll({
        where: {
          [Op.or]: [
            { created_at: { [Op.gt]: lastCreatedAt } },
            {
              [Op.and]: [{ created_at: lastCreatedAt }, { _id: { [Op.gt]: lastId } }],
            },
          ],
        },
        order: [
          ['created_at', 'ASC'],
          ['_id', 'ASC'],
        ],
        limit: BATCH_SIZE,
      })
    } catch (err) {
      // ✅ FIX: no return here — falls through to finally so isProcessing resets
      logger.error(`❌ [Step 2] PlcDataModel.findAll failed: ${extractErrorMessage(err)}`)
      logger.error(err.stack)
      return // outer try → outer finally → isProcessing = false ✅
    }

    if (newRecords.length === 0) return // outer finally handles isProcessing ✅

    logger.info(`📊 Dashboard Worker: Processing batch of ${newRecords.length} records...`)

    // ── Step 3: Keep only the latest record per device in this batch ────────
    const latestPerDevice = new Map()
    let latestCreatedAt = lastCreatedAt
    let latestId = lastId

    for (const record of newRecords) {
      const { device_id, created_at, _id, timestamp } = record

      if (
        created_at > latestCreatedAt ||
        (created_at.getTime?.() === latestCreatedAt.getTime?.() && _id > latestId)
      ) {
        latestCreatedAt = created_at
        latestId = _id
      }

      const cleanDeviceId = device_id?.trim()
      if (!cleanDeviceId) continue

      const incomingTime = toUtcDate(timestamp || created_at)?.getTime() || 0
      const existingInMap = latestPerDevice.get(cleanDeviceId)
      const existingInMapTime = existingInMap
        ? toUtcDate(existingInMap.timestamp || existingInMap.created_at)?.getTime() || 0
        : -1

      if (incomingTime > existingInMapTime) {
        latestPerDevice.set(cleanDeviceId, record)
      }
    }

    // ── Step 4: Build upsert payload ────────────────────────────────────────
    const upsertData = Array.from(latestPerDevice.values()).map((record) => {
      const data = record.get({ plain: true })
      const extraData = toJsonObject(data.extra_data, 'extra_data', data.device_id)

      return {
        device_id: (data.device_id || '').trim(),
        company_name: data.company_name || null,
        plant_name: data.plant_name || null,
        line_number: data.line_number || null,
        timestamp: toUtcDate(data.timestamp || data.created_at) || new Date(),
        start_time: toUtcDate(data.start_time) || null,
        stop_time: toUtcDate(data.stop_time) || null,
        status: data.status || null,
        latch_force: data.latch_force ?? 0,
        claw_force: data.claw_force ?? 0,
        safety_lever: data.safety_lever ?? 0,
        claw_lever: data.claw_lever ?? 0,
        stroke: data.stroke ?? 0,
        production_count: data.production_count ?? 0,
        model: data.model || null,
        alarm: data.alarm || null,
        extra_data: extraData,
        plc_data_id: data._id || null,
        last_updated: new Date(),
      }
    })

    // ── Step 5: Upsert with staleness check ─────────────────────────────────
    let successCount = 0
    let failCount = 0
    let skippedCount = 0

    for (const row of upsertData) {
      try {
        // ✅ Check 1 — invalid device_id
        if (!row.device_id) {
          logger.warn(`⚠️ Skipping record — empty device_id`)
          continue
        }

        // ✅ Check 2 — invalid timestamp
        if (!row.timestamp || isNaN(new Date(row.timestamp).getTime())) {
          logger.warn(`⚠️ Skipping device=${row.device_id} — invalid timestamp`)
          continue
        }

        // ✅ Check 3 — fetch existing dashboard row
        const existing = await PlcDashboardModel.findOne({
          where: { device_id: row.device_id },
        })

        if (existing) {
          const existingTime = new Date(existing.timestamp).getTime()
          const incomingTime = new Date(row.timestamp).getTime()

          // ✅ Check 4 — STALENESS CHECK: purana data newer ko overwrite na kare
          if (incomingTime <= existingTime) {
            skippedCount++
            logger.info(
              `⏩ Skipped device=${row.device_id} | stored=${existing.timestamp} | incoming=${row.timestamp} (older or equal)`,
            )
            continue
          }

          // ✅ newer data — update karo
          await existing.update(row)
          logger.info(
            `🔄 Updated device=${row.device_id} | ${existing.timestamp} → ${row.timestamp}`,
          )
        } else {
          // ✅ device pehli baar aa raha hai — create karo
          await PlcDashboardModel.create(row)
          logger.info(`➕ Created device=${row.device_id} | timestamp=${row.timestamp}`)
        }

        successCount++
      } catch (err) {
        failCount++
        logger.error(
          `❌ Upsert failed | device=${row.device_id} | reason: ${extractErrorMessage(err)}`,
        )
        if (err.sql) logger.error(`   SQL: ${err.sql}`)
        logger.error(err.stack)
      }
    }

    logger.info(
      `✅ Dashboard upsert complete | success=${successCount} | skipped=${skippedCount} | failed=${failCount}`,
    )

    // ── Step 6: Advance cursor ──────────────────────────────────────────────
    try {
      await config.update({
        last_processed_timestamp: latestCreatedAt,
        last_processed_id: latestId,
      })
    } catch (err) {
      logger.error(`❌ [Step 6] Cursor update failed: ${extractErrorMessage(err)}`)
      logger.error(err.stack)
    }
  } catch (err) {
    logger.error(`❌ PLC Dashboard Worker unexpected error: ${extractErrorMessage(err)}`)
    logger.error('❌ FULL ERROR:', err)
    console.log(err.parent)
    console.log(err.original)
    console.log(err.sql)
    logger.error(err.stack);
  } finally {
    // ✅ isProcessing ALWAYS resets — no matter what path was taken above
    isProcessing = false
  }
}
