/**
 * Add is_submission_only column to template_fields table
 * Run: node scripts/add-is-submission-only-column.js
 */
import { sequelize } from '../src/sequelize.js';

async function addColumn() {
  try {
    await sequelize.query(`
      ALTER TABLE template_fields ADD is_submission_only BIT NOT NULL DEFAULT 0;
    `);
    console.log('Column is_submission_only added successfully to template_fields.');
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('already exists') || msg.includes('specified more than once')) {
      console.log('Column is_submission_only already exists - OK.');
    } else {
      console.error('Error:', err.message);
    }
  } finally {
    await sequelize.close();
  }
}

addColumn();
