'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn("template_submissions","submission_id",{
        type:Sequelize.STRING(100),
        allowNull:true,
      });
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('specified more than once')) {
        console.log('Column submission_id already exists in template_submissions, skipping...');
      } else {
        throw error;
      }
    }
  },

  async down (queryInterface) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn("template_submissions","submission_id")
  }
};
