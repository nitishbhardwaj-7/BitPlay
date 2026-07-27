import express from 'express';
import GameSession from '../../models/GameSession.js';
import { requireMobileClient, writeLimiter } from '../../middleware/mobileAuth.js';

const router = express.Router();

// POST /api/game-sessions — log a completed game session from mobile app
router.post('/', requireMobileClient, writeLimiter, async (req, res) => {
  try {
    const { userId, gameName, score, result, durationSeconds, roundNumber, metadata } = req.body;

    if (!userId || !gameName) {
      return res.status(400).json({ success: false, message: 'userId and gameName are required' });
    }

    const session = await GameSession.create({
      userId,
      gameName,
      score: score ?? 0,
      result: result ?? 'complete',
      durationSeconds: durationSeconds ?? 0,
      roundNumber: roundNumber ?? 1,
      metadata: metadata ?? {},
    });

    res.json({ success: true, sessionId: session._id });
  } catch (err) {
    console.error('game-sessions POST error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/game-sessions/popular?limit=3 — most-played games ranked by sessions + unique players
router.get('/popular', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 3, 30);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days

    const results = await GameSession.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$gameName',
          totalSessions: { $sum: 1 },
          uniquePlayers: { $addToSet: '$userId' },
          avgScore: { $avg: '$score' },
        },
      },
      {
        $project: {
          gameName: '$_id',
          totalSessions: 1,
          uniquePlayers: { $size: '$uniquePlayers' },
          avgScore: { $round: ['$avgScore', 1] },
          popularityScore: {
            $add: ['$totalSessions', { $multiply: [{ $size: '$uniquePlayers' }, 2] }],
          },
        },
      },
      { $sort: { popularityScore: -1 } },
      { $limit: limit },
    ]);

    res.json({ success: true, popular: results });
  } catch (err) {
    console.error('game-sessions popular error:', err.message);
    res.status(500).json({ success: false, popular: [] });
  }
});

// GET /api/game-sessions/leaderboard/:gameName — top 10 scores for a game
router.get('/leaderboard/:gameName', async (req, res) => {
  try {
    const { gameName } = req.params;
    const top = await GameSession.find({ gameName, result: { $in: ['win', 'complete'] } })
      .sort({ score: -1 })
      .limit(10)
      .select('userId score durationSeconds createdAt');

    res.json({ success: true, leaderboard: top });
  } catch (err) {
    console.error('leaderboard error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
