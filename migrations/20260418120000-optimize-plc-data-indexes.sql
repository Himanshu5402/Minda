-- Migration: Add composite indexes for PLC Data performance optimization

-- Add composite index on device_id and timestamp for window functions (latest record per device)
IF NOT EXISTS (
    SELECT * FROM sys.indexes 
    WHERE name = 'IX_plc_data_device_timestamp' 
    AND object_id = OBJECT_ID(N'dbo.plc_data')
)
BEGIN
    CREATE INDEX IX_plc_data_device_timestamp ON dbo.plc_data(device_id, timestamp DESC);
END

-- Add composite index on company and plant for main filtering
IF NOT EXISTS (
    SELECT * FROM sys.indexes 
    WHERE name = 'IX_plc_data_company_plant' 
    AND object_id = OBJECT_ID(N'dbo.plc_data')
)
BEGIN
    CREATE INDEX IX_plc_data_company_plant ON dbo.plc_data(company_name, plant_name);
END

-- Add composite index on company, plant and timestamp for date range filtering
IF NOT EXISTS (
    SELECT * FROM sys.indexes 
    WHERE name = 'IX_plc_data_company_plant_timestamp' 
    AND object_id = OBJECT_ID(N'dbo.plc_data')
)
BEGIN
    CREATE INDEX IX_plc_data_company_plant_timestamp ON dbo.plc_data(company_name, plant_name, timestamp DESC);
END
