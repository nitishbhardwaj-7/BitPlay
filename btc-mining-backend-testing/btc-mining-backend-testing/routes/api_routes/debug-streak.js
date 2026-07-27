import express from 'express';
import UserMiningDetail from '../../models/UserMiningDetails.js';
import DailyFreeMiner from '../../models/DailyMiner.js';

const router = express.Router();

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatLocalTime(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hh = String(hours).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy}, ${hh}:${min}:${ss} ${ampm}`;
}

// GET /api/debug-streak/:userId — current streak info
router.get('/:userId', async (req, res) => {
  try {
    const detail = await UserMiningDetail.findOne({ user: req.params.userId });
    if (!detail) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({
      success: true,
      streakDays: detail.streakDays,
      streakLastDate: detail.streakLastDate,
      streakBonusGh: detail.getStreakBonusGh(),
      effectiveHashpower: detail.getEffectiveHashpower(),
      baseHashpower: detail.hashpower,
      tiers: UserMiningDetail.getStreakTiers(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/debug-streak/set — set streak to exact values
// Body: { userId, streakDays, streakLastDate? }
router.post('/set', async (req, res) => {
  try {
    const { userId, streakDays } = req.body;
    if (!userId || streakDays == null) {
      return res.status(400).json({ success: false, message: 'userId and streakDays required' });
    }

    const detail = await UserMiningDetail.findOne({ user: userId });
    if (!detail) return res.status(404).json({ success: false, message: 'User not found' });

    detail.streakDays = streakDays;
    detail.streakLastDate = req.body.streakLastDate || dateStr(new Date());
    await detail.save();

    res.json({
      success: true,
      message: `Streak set to ${streakDays} days`,
      streakDays: detail.streakDays,
      streakLastDate: detail.streakLastDate,
      streakBonusGh: detail.getStreakBonusGh(),
      effectiveHashpower: detail.getEffectiveHashpower(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/debug-streak/simulate — simulate N consecutive daily claims
// Body: { userId, days }
router.post('/simulate', async (req, res) => {
  try {
    const { userId, days } = req.body;
    if (!userId || !days || days < 1) {
      return res.status(400).json({ success: false, message: 'userId and days (>= 1) required' });
    }

    const detail = await UserMiningDetail.findOne({ user: userId });
    if (!detail) return res.status(404).json({ success: false, message: 'User not found' });

    const log = [];

    for (let i = days - 1; i >= 0; i--) {
      const claimDate = new Date();
      claimDate.setDate(claimDate.getDate() - i);
      const todayS = dateStr(claimDate);

      const prevDate = new Date(claimDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const yesterdayS = dateStr(prevDate);

      const last = detail.streakLastDate || '';

      if (last === todayS) {
        log.push({ day: todayS, action: 'skip (already counted)' });
      } else if (last === yesterdayS) {
        detail.streakDays += 1;
        detail.streakLastDate = todayS;
        log.push({ day: todayS, action: 'increment', streak: detail.streakDays });
      } else {
        detail.streakDays = 1;
        detail.streakLastDate = todayS;
        log.push({ day: todayS, action: 'reset to 1', streak: 1 });
      }
    }

    await detail.save();

    res.json({
      success: true,
      message: `Simulated ${days} consecutive days`,
      streakDays: detail.streakDays,
      streakLastDate: detail.streakLastDate,
      streakBonusGh: detail.getStreakBonusGh(),
      effectiveHashpower: detail.getEffectiveHashpower(),
      simulationLog: log,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/debug-streak/claim-day — simulate a single daily claim on a specific date
// Body: { userId, date? } — date is YYYY-MM-DD, defaults to today
router.post('/claim-day', async (req, res) => {
  try {
    const { userId, date } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

    const detail = await UserMiningDetail.findOne({ user: userId });
    if (!detail) return res.status(404).json({ success: false, message: 'User not found' });

    const claimDate = date ? new Date(date + 'T12:00:00') : new Date();
    const todayS = dateStr(claimDate);
    const prevDate = new Date(claimDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const yesterdayS = dateStr(prevDate);

    const last = detail.streakLastDate || '';
    let action = '';

    if (last === todayS) {
      action = 'skip — already counted today';
    } else if (last === yesterdayS) {
      detail.streakDays = (detail.streakDays || 0) + 1;
      detail.streakLastDate = todayS;
      action = `increment — streak now ${detail.streakDays}`;
    } else {
      detail.streakDays = 1;
      detail.streakLastDate = todayS;
      action = `reset to 1 — last was "${last}", expected "${yesterdayS}"`;
    }

    await detail.save();

    res.json({
      success: true,
      claimDate: todayS,
      previousLastDate: last,
      expectedYesterday: yesterdayS,
      action,
      streakDays: detail.streakDays,
      streakLastDate: detail.streakLastDate,
      streakBonusGh: detail.getStreakBonusGh(),
      effectiveHashpower: detail.getEffectiveHashpower(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/debug-streak/test-multi-day — run a full multi-day test with gap detection
// Body: { userId, days: ["2026-02-18", "2026-02-19", "2026-02-21"] }
// Simulates claiming on each listed date in order, showing streak changes
router.post('/test-multi-day', async (req, res) => {
  try {
    const { userId, days } = req.body;
    if (!userId || !Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ success: false, message: 'userId and days[] required' });
    }

    const detail = await UserMiningDetail.findOne({ user: userId });
    if (!detail) return res.status(404).json({ success: false, message: 'User not found' });

    // Reset streak first for clean test
    detail.streakDays = 0;
    detail.streakLastDate = null;

    const log = [];

    for (const dayStr of days) {
      const claimDate = new Date(dayStr + 'T12:00:00');
      const todayS = dateStr(claimDate);
      const prevDate = new Date(claimDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const yesterdayS = dateStr(prevDate);

      const last = detail.streakLastDate || '';

      if (last === todayS) {
        log.push({ date: todayS, action: 'skip (same day)', streak: detail.streakDays });
      } else if (last === yesterdayS) {
        detail.streakDays += 1;
        detail.streakLastDate = todayS;
        log.push({ date: todayS, action: 'increment (consecutive)', streak: detail.streakDays });
      } else {
        detail.streakDays = 1;
        detail.streakLastDate = todayS;
        log.push({ date: todayS, action: `reset (gap: last="${last}")`, streak: 1 });
      }
    }

    await detail.save();

    res.json({
      success: true,
      streakDays: detail.streakDays,
      streakLastDate: detail.streakLastDate,
      streakBonusGh: detail.getStreakBonusGh(),
      effectiveHashpower: detail.getEffectiveHashpower(),
      log,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/debug-streak/test-start-mining — test the REAL start-mining flow
// This does exactly what the app does: activate mining → claim daily reward → check streak
// Body: { userId, date? }  date is YYYY-MM-DD, defaults to today
router.post('/test-start-mining', async (req, res) => {
  try {
    const { userId, date } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

    const detail = await UserMiningDetail.findOne({ user: userId });
    if (!detail) return res.status(404).json({ success: false, message: 'User not found' });

    const claimDate = date ? new Date(date + 'T12:00:00') : new Date();
    const localTimeStr = formatLocalTime(claimDate);
    const steps = [];

    // --- Step 1: Activate mining (same as syncUserData in frontend) ---
    const prevMiningActive = detail.mining_isactive;
    detail.mining_isactive = true;
    if (!detail.hashpower) detail.hashpower = 0;
    detail.local_start_time = localTimeStr;
    await detail.save();
    steps.push({
      step: 1,
      action: 'activate_mining',
      mining_isactive: true,
      prevMiningActive,
      local_start_time: localTimeStr,
    });

    // --- Step 2: Check if daily reward already claimed ---
    const existingClaim = await DailyFreeMiner.findOne({ userId });
    if (existingClaim) {
      steps.push({
        step: 2,
        action: 'daily_reward_already_claimed',
        claimedAt: existingClaim.claimedAt,
        message: 'Reward already claimed — streak was NOT updated again',
      });

      return res.json({
        success: true,
        message: 'Mining activated but daily reward already claimed today',
        streakDays: detail.streakDays,
        streakLastDate: detail.streakLastDate,
      streakBonusGh: detail.getStreakBonusGh(),
      effectiveHashpower: detail.getEffectiveHashpower(),
        steps,
      });
    }

    // --- Step 3: Claim daily reward (creates DailyFreeMiner record) ---
    const claim = new DailyFreeMiner({ userId, claimedAt: claimDate });
    await claim.save();
    steps.push({ step: 3, action: 'daily_reward_claimed', claimedAt: claimDate });

    // --- Step 4: Update streak (same logic as daily-miner-handles.js POST /) ---
    const yyyy = claimDate.getFullYear();
    const mm = String(claimDate.getMonth() + 1).padStart(2, '0');
    const dd = String(claimDate.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    const yesterday = new Date(claimDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    const prevStreak = detail.streakDays;
    const prevLastDate = detail.streakLastDate || '';

    if (prevLastDate === todayStr) {
      steps.push({ step: 4, action: 'streak_skip', reason: 'already counted today', streak: detail.streakDays });
    } else if (prevLastDate === yesterdayStr) {
      detail.streakDays = (detail.streakDays || 0) + 1;
      detail.streakLastDate = todayStr;
      await detail.save();
      steps.push({ step: 4, action: 'streak_increment', from: prevStreak, to: detail.streakDays, todayStr, yesterdayStr, prevLastDate });
    } else {
      detail.streakDays = 1;
      detail.streakLastDate = todayStr;
      await detail.save();
      steps.push({ step: 4, action: 'streak_reset', reason: `gap: last="${prevLastDate}", expected="${yesterdayStr}"`, streak: 1 });
    }

    return res.json({
      success: true,
      message: `Mining started & daily reward claimed. Streak: ${detail.streakDays}`,
      streakDays: detail.streakDays,
      streakLastDate: detail.streakLastDate,
      streakBonusGh: detail.getStreakBonusGh(),
      effectiveHashpower: detail.getEffectiveHashpower(),
      steps,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/debug-streak/test-start-mining-multi — test start mining over multiple days
// Simulates the real flow: for each date, clears daily claim, activates mining, claims reward, updates streak
// Body: { userId, days: ["2026-02-18", "2026-02-19", ...] }
router.post('/test-start-mining-multi', async (req, res) => {
  try {
    const { userId, days } = req.body;
    if (!userId || !Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ success: false, message: 'userId and days[] required' });
    }

    const detail = await UserMiningDetail.findOne({ user: userId });
    if (!detail) return res.status(404).json({ success: false, message: 'User not found' });

    // Reset for clean test
    detail.streakDays = 0;
    detail.streakLastDate = null;
    detail.mining_isactive = false;
    await detail.save();
    await DailyFreeMiner.deleteMany({ userId });

    const log = [];

    for (const dayStr of days) {
      const claimDate = new Date(dayStr + 'T12:00:00');
      const localTimeStr = formatLocalTime(claimDate);

      // Step A: Activate mining
      detail.mining_isactive = true;
      detail.local_start_time = localTimeStr;

      // Step B: Clear previous daily claim (simulating day rollover at midnight)
      await DailyFreeMiner.deleteMany({ userId });

      // Step C: Claim daily reward
      const claim = new DailyFreeMiner({ userId, claimedAt: claimDate });
      await claim.save();

      // Step D: Streak update (same as daily-miner-handles.js)
      const yyyy = claimDate.getFullYear();
      const mm = String(claimDate.getMonth() + 1).padStart(2, '0');
      const dd = String(claimDate.getDate()).padStart(2, '0');
      const todayS = `${yyyy}-${mm}-${dd}`;
      const yesterday = new Date(claimDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayS = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

      const last = detail.streakLastDate || '';

      if (last === todayS) {
        log.push({ date: todayS, action: 'skip (same day)', streak: detail.streakDays });
      } else if (last === yesterdayS) {
        detail.streakDays = (detail.streakDays || 0) + 1;
        detail.streakLastDate = todayS;
        log.push({ date: todayS, action: 'increment', streak: detail.streakDays, prevLast: last });
      } else {
        detail.streakDays = 1;
        detail.streakLastDate = todayS;
        log.push({ date: todayS, action: `reset (gap: last="${last}")`, streak: 1 });
      }
    }

    detail.mining_isactive = false;
    await detail.save();

    return res.json({
      success: true,
      message: `Simulated start-mining on ${days.length} days`,
      streakDays: detail.streakDays,
      streakLastDate: detail.streakLastDate,
      streakBonusGh: detail.getStreakBonusGh(),
      effectiveHashpower: detail.getEffectiveHashpower(),
      log,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/debug-streak/reset — reset streak to 0
// Body: { userId }
router.post('/reset', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

    const detail = await UserMiningDetail.findOne({ user: userId });
    if (!detail) return res.status(404).json({ success: false, message: 'User not found' });

    detail.streakDays = 0;
    detail.streakLastDate = null;
    detail.streakClaimedMilestones = [];
    await detail.save();

    res.json({
      success: true,
      message: 'Streak fully reset (days, lastDate, claimed milestones)',
      streakDays: 0,
      streakLastDate: null,
      streakBonusGh: 0,
      claimedMilestones: [],
      effectiveHashpower: detail.getEffectiveHashpower(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
