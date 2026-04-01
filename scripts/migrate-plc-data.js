import axios from 'axios'
import sql from 'mssql'
import { config } from '../src/config.js'

async function migratePlcData() {
  try {
    // 1. Connection Pool configuration using existing config
    const dbConfig = {
      user: config.DB_USER,
      password: config.DB_PASSWORD,
      server: config.DB_HOST,
      database: config.DB_NAME,
      port: parseInt(config.DB_PORT) || 1433,
      options: {
        encrypt: false, // Set to true if using Azure
        trustServerCertificate: true, // For local development
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    }

    console.log(`Connecting to database ${config.DB_NAME} on ${config.DB_HOST}...`)
    const pool = await sql.connect(dbConfig)
    console.log('Connected to MSSQL successfully.')

    // 2. Fetch data from API
    const apiUrl = 'https://digitisationapi.jpmgroup.co.in/api/v1/plc-data'
    console.log(`Fetching data from ${apiUrl}...`)
    const res = await axios.get(apiUrl)

    // Adjust based on actual API response structure
    const data = res.data.data || res.data

    if (!Array.isArray(data)) {
      console.error('API response data is not an array:', data)
      return
    }

    console.log(`Fetched ${data.length} records. Starting bulk migration...`)
    console.time('MigrationTime')

    // 3. Batch processing
    const batchSize = 1000
    let totalInserted = 0

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize)

      // Use sql.Table for bulk insert
      const table = new sql.Table('plc_data')
      table.create = false // Table already exists

      // Add columns (Ensure names match DB schema exactly)
      table.columns.add("_id", sql.UniqueIdentifier, { nullable: false, primary: true });
      table.columns.add("company_name", sql.VarChar(255), { nullable: true });
      table.columns.add("plant_name", sql.VarChar(255), { nullable: true });
      table.columns.add("line_number", sql.VarChar(50), { nullable: true });
      table.columns.add("device_id", sql.VarChar(255), { nullable: true });
      table.columns.add("timestamp", sql.DateTime, { nullable: true });
      table.columns.add("start_time", sql.DateTime, { nullable: true });
      table.columns.add("stop_time", sql.DateTime, { nullable: true });
      table.columns.add("status", sql.VarChar(255), { nullable: true });
      table.columns.add("latch_force", sql.Int, { nullable: true });
      table.columns.add("claw_force", sql.Int, { nullable: true });
      table.columns.add("safety_lever", sql.Int, { nullable: true });
      table.columns.add("claw_lever", sql.Int, { nullable: true });
      table.columns.add("stroke", sql.Int, { nullable: true });
      table.columns.add("production_count", sql.Int, { nullable: true });
      table.columns.add("model", sql.VarChar(255), { nullable: true });
      table.columns.add("alarm", sql.VarChar(255), { nullable: true });
      table.columns.add("extra_data", sql.NVarChar(sql.MAX), { nullable: true });
      table.columns.add("created_at", sql.DateTime, { nullable: false });
      table.columns.add("updated_at", sql.DateTime, { nullable: false });

      // Add rows to the table object
      batch.forEach(row => {
        const now = new Date();
        
        // Extract nested objects from the new payload structure
        const params = row.parameters || {};
        const product = row.product || {};
        const barcode = row.Barcode_details || {};
        const machine = row.machine || {};

        // Prepare extra_data object
        // We want to store the original parameters, product, and barcode info
        const extraData = {
          ...params,
          product: product,
          Barcode_details: barcode
        };

        table.rows.add(
          row._id || sql.VarChar(36).createValue(undefined), // Let DB generate UUID if missing
          row.companyname || row.company_name || null,
          row.plantname || row.plant_name || null,
          row.linenumber || row.line_number || null,
          row.device_id || null,
          row.timestamp ? new Date(row.timestamp) : null,
          row.Start_time || row.start_time ? new Date(row.Start_time || row.start_time) : null,
          row.Stop_time || row.stop_time ? new Date(row.Stop_time || row.stop_time) : null,
          row.Status || row.status || null,
          params.LATCH_FORCE || null,
          params.CLAW_FORCE || null,
          params.SAFETY_LEVER || null,
          params.CLAW_LEVER || null,
          params.STROKE || null,
          row.production_count || null,
          product.model || machine.model || row.model || null,
          params.ALARM || null,
          JSON.stringify(extraData),
          now,
          now,
        )
      })

      // Perform bulk insert
      await pool.request().bulk(table)
      totalInserted += batch.length
      console.log(
        `✅ Inserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} rows). Total: ${totalInserted}`,
      )
    }

    console.timeEnd('MigrationTime')
    console.log('🚀 All Data Imported Successfully')
    await pool.close()
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

migratePlcData();
