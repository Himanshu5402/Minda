'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. worker_configs table
    await queryInterface.createTable('worker_configs', {
      _id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('NEWID()'),
        primaryKey: true,
      },
      worker_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      last_processed_timestamp: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_processed_id: {
        type: Sequelize.STRING(255), // Can be UUID or string "0"
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()'),
      },
    });

    // 2. plc_dashboard table
    await queryInterface.createTable('plc_dashboard', {
      _id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('NEWID()'),
        primaryKey: true,
      },
      device_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      company_name: { type: Sequelize.STRING(255), allowNull: true },
      plant_name: { type: Sequelize.STRING(255), allowNull: true },
      line_number: { type: Sequelize.STRING(50), allowNull: true },
      timestamp: { type: Sequelize.DATE, allowNull: true },
      start_time: { type: Sequelize.DATE, allowNull: true },
      stop_time: { type: Sequelize.DATE, allowNull: true },
      status: { type: Sequelize.STRING(255), allowNull: true },
      latch_force: { type: Sequelize.INTEGER, allowNull: true },
      claw_force: { type: Sequelize.INTEGER, allowNull: true },
      safety_lever: { type: Sequelize.INTEGER, allowNull: true },
      claw_lever: { type: Sequelize.INTEGER, allowNull: true },
      stroke: { type: Sequelize.INTEGER, allowNull: true },
      production_count: { type: Sequelize.INTEGER, allowNull: true },
      model: { type: Sequelize.STRING(255), allowNull: true },
      alarm: { type: Sequelize.STRING(255), allowNull: true },
      extra_data: { type: Sequelize.TEXT, allowNull: true }, // Using TEXT for JSON in MSSQL (NVARCHAR(MAX))
      plc_data_id: { type: Sequelize.UUID, allowNull: false },
      last_updated: { type: Sequelize.DATE, defaultValue: Sequelize.literal('GETDATE()') },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()'),
      },
    });

    // 3. machine_history table
    await queryInterface.createTable('machine_history', {
      _id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('NEWID()'),
        primaryKey: true,
      },
      device_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      production_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      product_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      part_no: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      model: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      start_time: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      stop_time: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      duration_seconds: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      timestamp: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('GETDATE()'),
      },
      plc_data_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('GETDATE()'),
      },
    });

    // Add indexes
    await queryInterface.addIndex('plc_dashboard', ['device_id'], { unique: true });
    await queryInterface.addIndex('plc_dashboard', ['timestamp']);
    await queryInterface.addIndex('plc_dashboard', ['status']);

    await queryInterface.addIndex('machine_history', ['device_id']);
    await queryInterface.addIndex('machine_history', ['timestamp']);
    await queryInterface.addIndex('machine_history', ['status']);
    await queryInterface.addIndex('machine_history', ['device_id', 'timestamp']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('machine_history');
    await queryInterface.dropTable('plc_dashboard');
    await queryInterface.dropTable('worker_configs');
  }
};
