const mongoose = require('mongoose');
require('dotenv').config();
const UserMiningDetails = require('./models/UserMiningDetails');

async function testLossRecovery() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const TEST_USER_ID = '507f1f77bcf86cd799439011';

    // Find or create user
    let miningDetails = await UserMiningDetails.findOne({ userId: TEST_USER_ID });

    if (!miningDetails) {
      miningDetails = await UserMiningDetails.create({
        userId: TEST_USER_ID,
        hashpower: 50 // Set hashpower > 3 to enable loss tracking
      });
    }

    // Test 1: Apply penalty to get cumulative_loss > 0
    console.log('1️⃣ Testing penalty application...');
    miningDetails.hashpower = 50; // Ensure hashpower > 3
    miningDetails.lossTracking.daily_ads_watched = 0; // User didn't watch ads
    miningDetails.lossTracking.cumulative_loss = 0;
    await miningDetails.save();

    console.log('Before penalty:');
    console.log(`  Hashpower: ${miningDetails.hashpower}`);
    console.log(`  Cumulative Loss: ${miningDetails.lossTracking.cumulative_loss}%`);
    console.log(`  Ads Watched: ${miningDetails.lossTracking.daily_ads_watched}/30`);

    // Apply penalty
    miningDetails.applyLossPenalty();
    await miningDetails.save();

    console.log('After penalty:');
    console.log(`  Cumulative Loss: ${miningDetails.lossTracking.cumulative_loss}%`);
    console.log(`  Ads Watched: ${miningDetails.lossTracking.daily_ads_watched}/30 (reset)\n`);

    // Test 2: Watch 30 ads to trigger recovery
    console.log('2️⃣ Testing recovery (watching 30 ads)...');
    for (let i = 0; i < 30; i++) {
      miningDetails.incrementLossOffsetAds();
      if ((i + 1) % 10 === 0) {
        console.log(`  Ads watched: ${i + 1}, Cumulative loss: ${miningDetails.lossTracking.cumulative_loss}%`);
      }
    }
    await miningDetails.save();

    console.log('After watching 30 ads:');
    console.log(`  Cumulative Loss: ${miningDetails.lossTracking.cumulative_loss}%`);
    console.log(`  Ads Watched: ${miningDetails.lossTracking.daily_ads_watched}/30\n`);

    // Test 3: Apply multiple penalties
    console.log('3️⃣ Testing multiple consecutive penalties...');
    for (let day = 1; day <= 3; day++) {
      // Reset ads watched to simulate new day with no ads watched
      miningDetails.lossTracking.daily_ads_watched = 0;

      // Change date to trigger penalty
      const testDate = new Date();
      testDate.setDate(testDate.getDate() - (3 - day)); // Different date for each iteration
      miningDetails.lossTracking.last_penalty_date = new Date(testDate.getTime() - 86400000).toDateString();

      miningDetails.applyLossPenalty();
      console.log(`  Day ${day}: Cumulative loss = ${miningDetails.lossTracking.cumulative_loss}%`);
    }
    await miningDetails.save();

    console.log('\n✅ All loss tracking tests completed successfully!');
    console.log('\nFinal state:');
    console.log(`  Hashpower: ${miningDetails.hashpower}`);
    console.log(`  Cumulative Loss: ${miningDetails.lossTracking.cumulative_loss}%`);
    console.log(`  Ads Watched Today: ${miningDetails.lossTracking.daily_ads_watched}/30`);
    console.log(`  Days Without Meeting: ${miningDetails.lossTracking.days_without_meeting}`);

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
  }
}

testLossRecovery();
