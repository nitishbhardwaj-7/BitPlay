import mongoose from 'mongoose';

const GameSessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  gameName: { type: String, required: true, index: true },
  score: { type: Number, default: 0 },
  result: { type: String, enum: ['win', 'lose', 'complete'], default: 'complete' },
  durationSeconds: { type: Number, default: 0 },
  roundNumber: { type: Number, default: 1 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
});

export default mongoose.model('GameSession', GameSessionSchema);
