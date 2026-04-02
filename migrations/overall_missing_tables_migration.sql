-- Overall Migration: Create missing tables for Workers and Dashboards
-- Date: 2026-04-01

-- 1. Create worker_configs table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'worker_configs' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.worker_configs (
        _id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        worker_name NVARCHAR(255) NOT NULL UNIQUE,
        last_processed_timestamp DATETIME2 NULL,
        last_processed_id NVARCHAR(255) NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END

-- 2. Create plc_dashboard table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'plc_dashboard' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.plc_dashboard (
        _id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        device_id NVARCHAR(255) NOT NULL UNIQUE,
        company_name NVARCHAR(255) NULL,
        plant_name NVARCHAR(255) NULL,
        line_number NVARCHAR(50) NULL,
        timestamp DATETIME2 NULL,
        start_time DATETIME2 NULL,
        stop_time DATETIME2 NULL,
        status NVARCHAR(255) NULL,
        latch_force INT NULL,
        claw_force INT NULL,
        safety_lever INT NULL,
        claw_lever INT NULL,
        stroke INT NULL,
        production_count INT NULL,
        model NVARCHAR(255) NULL,
        alarm NVARCHAR(255) NULL,
        extra_data NVARCHAR(MAX) NULL, -- JSON stored as NVARCHAR(MAX)
        plc_data_id UNIQUEIDENTIFIER NOT NULL,
        last_updated DATETIME2 DEFAULT GETDATE(),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );

    CREATE INDEX IX_plc_dashboard_device_id ON dbo.plc_dashboard(device_id);
    CREATE INDEX IX_plc_dashboard_timestamp ON dbo.plc_dashboard(timestamp);
    CREATE INDEX IX_plc_dashboard_status ON dbo.plc_dashboard(status);
END

-- 3. Create machine_history table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'machine_history' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.machine_history (
        _id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        device_id NVARCHAR(255) NOT NULL,
        status NVARCHAR(50) NOT NULL,
        production_count INT DEFAULT 0,
        product_name NVARCHAR(255) NULL,
        part_no NVARCHAR(255) NULL,
        model NVARCHAR(255) NULL,
        start_time DATETIME2 NULL,
        stop_time DATETIME2 NULL,
        duration_seconds INT DEFAULT 0,
        timestamp DATETIME2 DEFAULT GETDATE(),
        plc_data_id UNIQUEIDENTIFIER NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );

    CREATE INDEX IX_machine_history_device_id ON dbo.machine_history(device_id);
    CREATE INDEX IX_machine_history_timestamp ON dbo.machine_history(timestamp);
    CREATE INDEX IX_machine_history_status ON dbo.machine_history(status);
    CREATE INDEX IX_machine_history_device_timestamp ON dbo.machine_history(device_id, timestamp);
END
