'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('template_submissions', "process_approved", {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false
      });
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('specified more than once')) {
        console.log('Column process_approved already exists, skipping...');
      } else {
        throw error;
      }
    }
  },

      async down(queryInterface, Sequelize) {
      /**
       * Add reverting commands here.
       *
       * Example:
       * await queryInterface.dropTable('users');
       */
      await queryInterface.removeColumn('template_submissions', "process_approved");
    }
};
