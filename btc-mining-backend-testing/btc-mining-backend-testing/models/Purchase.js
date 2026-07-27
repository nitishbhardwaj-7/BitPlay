import mongoose from 'mongoose';

const PurchaseSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true,
    index: true
  },
  plan_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: true
  },
  product_identifier: {
    type: String,
    required: true,
    index: true
  },
  revenuecat_customer_id: {
    type: String,
    required: false
  },
  price_paid: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true,
    default: 'USD'
  },
  purchase_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['completed', 'pending', 'failed', 'refunded'],
    default: 'completed'
  },
  existing_hashpower: {
    type: Number,
    required: true,
    min: 0
  },
  updated_hashpower: {
    type: Number,
    required: true,
    min: 0
  },
  mining_power_added: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

PurchaseSchema.index({ user: 1, purchase_date: -1 });
// Prevent duplicate purchase credits for the same app-store transaction
PurchaseSchema.index({ product_identifier: 1, user: 1 }, { unique: true });

export default mongoose.model('Purchase', PurchaseSchema);
