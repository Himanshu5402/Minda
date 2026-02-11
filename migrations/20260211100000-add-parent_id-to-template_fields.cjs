'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('template_fields', "parent_id", {
        type: Sequelize.UUID,
        allowNull: true,
      });
    } catch (e) { console.log('parent_id already exists'); }

    try {
      await queryInterface.addColumn('template_fields', "group_id", {
        type: Sequelize.UUID,
        allowNull: true,
      });
    } catch (e) { console.log('group_id already exists'); }

    try {
      await queryInterface.addColumn('template_fields', "type", {
        type: Sequelize.ENUM("HOD", "User", "Approval"),
        allowNull: true,
        defaultValue: "User",
      });
    } catch (e) { console.log('type already exists'); }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('template_fields', "parent_id");
    await queryInterface.removeColumn('template_fields', "group_id");
    await queryInterface.removeColumn('template_fields', "type");
  }
};
