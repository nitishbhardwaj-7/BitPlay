const cron = require('node-cron');
const axios = require('axios');

/**
 * Daily Compliance Check Job
 * Runs every day at midnight (00:00)
 * Checks if users with active subscriptions met their daily video requirement
 * Applies 13% penalty to hashpower if requirement not met
 */

const COMPLIANCE_CHECK_URL = process.env.API_BASE_URL
  ? `${process.env.API_BASE_URL}/api/user_mining/check-compliance`
  : 'http://localhost:5000/api/user_mining/check-compliance';

/**
 * Execute daily compliance check
 */
async function executeDailyComplianceCheck() {
  try {
    console.log('========================================');
    console.log('Starting daily compliance check...');
    console.log('Timestamp:', new Date().toISOString());
    console.log('========================================');

    const response = await axios.post(COMPLIANCE_CHECK_URL);

    if (response.data.success) {
      const { results } = response.data;

      console.log('✅ Daily compliance check completed successfully!');
      console.log('📊 Results:');
      console.log(`   - Total users checked: ${results.totalChecked}`);
      console.log(`   - Penalties applied: ${results.penaltiesApplied}`);
      console.log(`   - Compliant users: ${results.compliantUsers}`);

      if (results.penaltiesApplied > 0) {
        console.log('⚠️  Penalties applied to users:');
        results.details
          .filter(d => d.penaltyApplied)
          .forEach(detail => {
            console.log(`   - User ${detail.userId}:`);
            console.log(`     Videos watched: ${detail.videosWatched}/10`);
            console.log(`     Hashpower: ${detail.hashpowerBefore.toFixed(2)} → ${detail.hashpowerAfter.toFixed(2)} Gh/s`);
            console.log(`     Loss: ${detail.hashpowerLost.toFixed(2)} Gh/s (${detail.penaltyPercentage}%)`);
          });
      }
    } else {
      console.error('❌ Daily compliance check failed:', response.data.message);
    }

    console.log('========================================\n');
  } catch (error) {
    console.error('❌ Error executing daily compliance check:', error.message);

    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }

    console.log('========================================\n');
  }
}

/**
 * Schedule daily compliance check
 * Cron expression: '0 0 * * *' means every day at 00:00 (midnight)
 */
function scheduleDailyComplianceCheck() {
  // Run at midnight every day (00:00)
  const job = cron.schedule('0 0 * * *', async () => {
    await executeDailyComplianceCheck();
  }, {
    scheduled: true,
    timezone: "UTC" // Use UTC timezone for consistency
  });

  console.log('✅ Daily compliance check job scheduled');
  console.log('⏰ Will run every day at 00:00 UTC (midnight)');
  console.log('');

  return job;
}

/**
 * Test function - Run compliance check immediately
 */
async function testComplianceCheck() {
  console.log('🧪 Running test compliance check (manual trigger)...\n');
  await executeDailyComplianceCheck();
}

module.exports = {
  scheduleDailyComplianceCheck,
  executeDailyComplianceCheck,
  testComplianceCheck
};
