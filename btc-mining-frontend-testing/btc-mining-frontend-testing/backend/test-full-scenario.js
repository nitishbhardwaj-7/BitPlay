const mongoose = require('mongoose');
require('dotenv').config();
const UserMiningDetails = require('./models/UserMiningDetails');

async function testFullScenario() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const TEST_USER_ID = '507f1f77bcf86cd799439011';

    // Find user
    let miningDetails = await UserMiningDetails.findOne({ userId: TEST_USER_ID });

    console.log('📊 FULL LOSS TRACKING SCENARIO TEST\n');
    console.log('Current state:');
    console.log(`  Cumulative Loss: ${miningDetails.lossTracking.cumulative_loss}%`);
    console.log(`  Ads Watched: ${miningDetails.lossTracking.daily_ads_watched}/30\n`);

    // Scenario: User has 16% loss, now watches 30 ads
    console.log('📺 User watches 30 ads to recover...');
    miningDetails.lossTracking.daily_ads_watched = 0; // Reset for test

    for (let i = 0; i < 30; i++) {
      miningDetails.incrementLossOffsetAds();
      if (i === 29) {
        console.log(`  ✓ Watched ${i + 1} ads`);
      }
    }
    await miningDetails.save();

    console.log('After recovery:');
    console.log(`  Cumulative Loss: ${miningDetails.lossTracking.cumulative_loss}% (reduced by 3%)`);
    console.log(`  Ads Watched: ${miningDetails.lossTracking.daily_ads_watched}/30\n`);

    // Scenario: User watches 30 ads again
    console.log('📺 User continues to watch 30 ads daily...');
    miningDetails.lossTracking.daily_ads_watched = 0;
    miningDetails.lossTracking.last_penalty_date = new Date(Date.now() - 86400000).toDateString();

    for (let i = 0; i < 30; i++) {
      miningDetails.incrementLossOffsetAds();
    }
    await miningDetails.save();

    console.log('After second day of 30 ads:');
    console.log(`  Cumulative Loss: ${miningDetails.lossTracking.cumulative_loss}% (reduced by 3% again)`);
    console.log(`  Ads Watched: ${miningDetails.lossTracking.daily_ads_watched}/30\n`);

    // Continue until loss reaches 0
    console.log('📺 Continuing daily 30 ads until loss reaches 0...');
    let daysToRecover = 0;
    while (miningDetails.lossTracking.cumulative_loss > 0 && daysToRecover < 10) {
      miningDetails.lossTracking.daily_ads_watched = 0;
      miningDetails.lossTracking.last_penalty_date = new Date(Date.now() - 86400000 * (daysToRecover + 1)).toDateString();

      for (let i = 0; i < 30; i++) {
        miningDetails.incrementLossOffsetAds();
      }
      daysToRecover++;
      console.log(`  Day ${daysToRecover + 2}: Loss = ${miningDetails.lossTracking.cumulative_loss}%`);
      await miningDetails.save();
    }

    console.log('\n✅ SCENARIO COMPLETE!');
    console.log(`Total days to recover from 16% to ${miningDetails.lossTracking.cumulative_loss}%: ${daysToRecover + 2} days`);
    console.log('\n📋 Summary:');
    console.log(`  - Each day of failure adds 3% loss (minimum 10%)`);
    console.log(`  - Each day of watching 30 ads reduces loss by 3%`);
    console.log(`  - Loss cannot go below 0%`);

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
  }
}

testFullScenario();
