/**
 * Test Script for Daily Video Requirement Feature
 * Tests penalty calculation, video tracking, and daily compliance
 */

const axios = require('axios');

// Configuration
const API_BASE_URL = 'http://localhost:5000/api';
const TEST_USER_ID = '60f7b3b3b3b3b3b3b3b3b3b3'; // Replace with actual user ID for testing

console.log('========================================');
console.log('Daily Video Requirement Feature Test');
console.log('========================================\n');

/**
 * Test 1: Activate subscription for a user
 */
async function testActivateSubscription() {
  console.log('TEST 1: Activating Subscription');
  console.log('--------------------------------');

  try {
    const response = await axios.post(`${API_BASE_URL}/user_mining/activate-subscription`, {
      userId: TEST_USER_ID,
      planName: 'Premium 100 Gh/s',
      hashpowerAmount: 100
    });

    console.log('✅ Subscription activated');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    console.log('');
    return response.data.success;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    console.log('');
    return false;
  }
}

/**
 * Test 2: Get daily progress (should be 0/10)
 */
async function testGetDailyProgress() {
  console.log('TEST 2: Getting Daily Progress');
  console.log('--------------------------------');

  try {
    const response = await axios.get(`${API_BASE_URL}/user_mining/daily-progress/${TEST_USER_ID}`);

    console.log('✅ Daily progress retrieved');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    console.log('');
    return response.data.success;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    console.log('');
    return false;
  }
}

/**
 * Test 3: Simulate watching 5 videos (not meeting requirement)
 */
async function testWatchingVideos(count) {
  console.log(`TEST 3: Simulating ${count} Video Watches`);
  console.log('--------------------------------');

  try {
    for (let i = 1; i <= count; i++) {
      const response = await axios.post(`${API_BASE_URL}/user_mining/increment-video`, {
        userId: TEST_USER_ID
      });

      console.log(`Video ${i}/${count} watched`);
      console.log(`Progress: ${response.data.daily_progress.videosWatchedToday}/${response.data.daily_progress.dailyTarget}`);
    }

    console.log('✅ Video watching simulation complete');
    console.log('');
    return true;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    console.log('');
    return false;
  }
}

/**
 * Test 4: Get user mining details
 */
async function testGetUserMiningDetails() {
  console.log('TEST 4: Getting User Mining Details');
  console.log('--------------------------------');

  try {
    const response = await axios.get(`${API_BASE_URL}/user_mining/${TEST_USER_ID}`);

    console.log('✅ Mining details retrieved');
    console.log('Hashpower:', response.data.mining_details.hashpower);
    console.log('Daily Progress:', response.data.daily_progress);
    console.log('');
    return response.data.mining_details.hashpower;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    console.log('');
    return null;
  }
}

/**
 * Test 5: Trigger daily compliance check (apply penalty)
 */
async function testDailyComplianceCheck() {
  console.log('TEST 5: Running Daily Compliance Check');
  console.log('--------------------------------');
  console.log('⚠️  This will apply penalty if user did not meet requirement (watched < 10 videos)');

  try {
    const response = await axios.post(`${API_BASE_URL}/user_mining/check-compliance`);

    console.log('✅ Compliance check completed');
    console.log('Results:', JSON.stringify(response.data.results, null, 2));
    console.log('');
    return response.data.success;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    console.log('');
    return false;
  }
}

/**
 * Test 6: Verify penalty was applied
 */
async function testVerifyPenalty() {
  console.log('TEST 6: Verifying Penalty Application');
  console.log('--------------------------------');

  try {
    const response = await axios.get(`${API_BASE_URL}/user_mining/penalty-history/${TEST_USER_ID}`);

    console.log('✅ Penalty history retrieved');
    console.log('Total Penalties Applied:', response.data.totalPenaltiesApplied);
    console.log('Consecutive Failures:', response.data.consecutiveFailures);

    if (response.data.penaltyHistory.length > 0) {
      console.log('\nLatest Penalty:');
      const latest = response.data.penaltyHistory[response.data.penaltyHistory.length - 1];
      console.log(`  - Date: ${latest.date}`);
      console.log(`  - Hashpower Before: ${latest.hashpowerBefore} Gh/s`);
      console.log(`  - Hashpower After: ${latest.hashpowerAfter} Gh/s`);
      console.log(`  - Loss: ${latest.hashpowerLost} Gh/s (${latest.penaltyPercentage}%)`);
      console.log(`  - Videos Watched: ${latest.videosWatchedThatDay}/10`);
    }

    console.log('');
    return response.data.success;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    console.log('');
    return false;
  }
}

/**
 * Test Scenario: Complete Penalty Flow
 */
async function testCompletePenaltyFlow() {
  console.log('========================================');
  console.log('COMPLETE PENALTY FLOW TEST');
  console.log('========================================\n');

  console.log('Scenario: User purchases subscription with 100 Gh/s,');
  console.log('watches only 5 videos (< 10 required), penalty applied.\n');

  // Step 1: Activate subscription
  console.log('Step 1: Activating subscription (100 Gh/s)...');
  await testActivateSubscription();

  // Step 2: Check initial progress
  console.log('Step 2: Checking initial daily progress...');
  await testGetDailyProgress();

  // Step 3: Watch only 5 videos (not meeting requirement)
  console.log('Step 3: Simulating 5 video watches (NOT meeting requirement)...');
  await testWatchingVideos(5);

  // Step 4: Check hashpower before penalty
  console.log('Step 4: Checking hashpower before penalty...');
  const hashpowerBefore = await testGetUserMiningDetails();

  // Step 5: Run compliance check (apply penalty)
  console.log('Step 5: Running daily compliance check (apply penalty)...');
  await testDailyComplianceCheck();

  // Step 6: Verify penalty
  console.log('Step 6: Verifying penalty was applied...');
  await testVerifyPenalty();

  // Step 7: Check hashpower after penalty
  console.log('Step 7: Checking hashpower after penalty...');
  const hashpowerAfter = await testGetUserMiningDetails();

  // Summary
  console.log('========================================');
  console.log('TEST SUMMARY');
  console.log('========================================');
  console.log(`Hashpower Before: ${hashpowerBefore} Gh/s`);
  console.log(`Hashpower After: ${hashpowerAfter} Gh/s`);
  console.log(`Loss: ${(hashpowerBefore - hashpowerAfter).toFixed(2)} Gh/s`);
  console.log(`Penalty: ${(((hashpowerBefore - hashpowerAfter) / hashpowerBefore) * 100).toFixed(2)}%`);
  console.log('Expected Penalty: 13% (10% cumulative + 3% daily offset)');
  console.log('========================================\n');
}

/**
 * Run tests
 */
async function runTests() {
  const args = process.argv.slice(2);

  if (args.includes('--full')) {
    // Run complete flow test
    await testCompletePenaltyFlow();
  } else {
    // Run individual tests
    await testActivateSubscription();
    await testGetDailyProgress();
    await testWatchingVideos(5);
    await testGetUserMiningDetails();
    await testDailyComplianceCheck();
    await testVerifyPenalty();
  }

  console.log('All tests completed!\n');
}

// Run tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
