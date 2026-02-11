'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('workflow_approvals', 'submission_id', {
        type: Sequelize.UUID,
        allowNull: true,
      });
    } catch (e) {
      console.log('submission_id already exists in workflow_approvals');
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('workflow_approvals', 'submission_id');
  }
};
