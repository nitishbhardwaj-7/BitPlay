const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api/user_mining';
const TEST_USER_ID = '507f1f77bcf86cd799439011';

async function testLossTracking() {
  console.log('🧪 Testing Loss Tracking System\n');

  // 1. Get initial state
  console.log('1️⃣ Getting initial state...');
  let response = await axios.get(`${BASE_URL}/${TEST_USER_ID}`);
  console.log('Initial loss_tracking:', response.data.loss_tracking);
  console.log('');

  // 2. Increment ads to 30
  console.log('2️⃣ Incrementing ads to 30...');
  for (let i = response.data.loss_tracking.daily_ads_watched; i < 30; i++) {
    const result = await axios.post(`${BASE_URL}/increment-loss-ad`, { userId: TEST_USER_ID });
    if ((i + 1) % 10 === 0) {
      console.log(`  ✓ Ads watched: ${result.data.daily_ads_watched}, Cumulative loss: ${result.data.cumulative_loss}%`);
    }
  }
  console.log('');

  // 3. Get final state
  console.log('3️⃣ Getting final state after 30 ads...');
  response = await axios.get(`${BASE_URL}/${TEST_USER_ID}`);
  console.log('Final loss_tracking:', response.data.loss_tracking);
  console.log('');

  // 4. Test penalty application (simulate user with hashpower > 3)
  console.log('4️⃣ Testing penalty application...');
  console.log('This will be tested by the cron job at midnight.');
  console.log('');

  console.log('✅ All tests completed!');
}

testLossTracking().catch(console.error);
