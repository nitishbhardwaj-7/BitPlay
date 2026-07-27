// routes/withdrawals/index.js
import express from "express";
import Withdrawal from "../../models/Withdrawal.js";
import Balance from "../../models/Balance.js";
import mongoose from "mongoose";
import fetch from "node-fetch";
import Client from "lightning-client";
import axios from "axios";
import dotenv from 'dotenv';
import { requireMobileClient, writeLimiter, readLimiter } from "../../middleware/mobileAuth.js";

dotenv.config();

// Admin-only guard — requires active session (cookie-based, same as admin panel)
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.isLoggedIn) return next();
  return res.status(401).json({ error: "Admin authentication required" });
};

const router = express.Router();

// Use a single key everywhere (set in your env file)
const SPEED_API_KEY = process.env.SPEED_API_KEY;

// Lightning client config
const rpcPath = "/home/pi/.lightning/bitcoin";
const client = new Client(rpcPath);

function isValidSpeedLN(address) {
  const regex = /^[a-zA-Z0-9_-]+@speed\.app$/;
  return regex.test(address);
}

/**
 * Helper: build Basic auth header from Speed API key
 */
function getSpeedAuthHeader() {
  return "Basic " + Buffer.from(SPEED_API_KEY + ":").toString("base64");
}

/**
 * Helper function to safely deduct balance with transaction locks
 * @param {string} userId - User ID
 * @param {string|number} baseAmount - Amount to deduct from BTC_DEPOSIT (will be converted to string for precision)
 * @param {Object} session - MongoDB session for transaction
 * @returns {Promise<Object>} Updated balance
 */
async function deductBTCDepositBalance(userId, baseAmount) {
  if (baseAmount === undefined || baseAmount === null || isNaN(baseAmount)) {
    throw new Error("baseAmount is required and must be a valid number");
  }
  const baseAmountStr = typeof baseAmount === 'string' ? baseAmount : baseAmount.toString();
  const negativeAmountStr = baseAmountStr.startsWith('-') ? baseAmountStr : '-' + baseAmountStr;
  const balance = await Balance.findOneAndUpdate(
    {
      user: userId,
      BTC_DEPOSIT: {
        $gte: mongoose.Types.Decimal128.fromString(baseAmountStr),
      },
    },
    {
      $inc: {
        BTC_DEPOSIT: mongoose.Types.Decimal128.fromString(negativeAmountStr),
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!balance) {
    throw new Error("Insufficient BTC_DEPOSIT balance or user not found");
  }

  return balance;
}

/**
 * Helper function to restore balance in case of failed withdrawal
 * @param {string} userId - User ID
 * @param {number} baseAmount - Amount to restore to BTC_DEPOSIT
 * @param {Object} session - MongoDB session for transaction
 * @returns {Promise<Object>} Updated balance
 */
async function restoreBTCDepositBalance(userId, baseAmount, session) {
  const balance = await Balance.findOneAndUpdate(
    { user: userId },
    {
      $inc: {
        BTC_DEPOSIT: mongoose.Types.Decimal128.fromString(baseAmount.toString()),
      },
    },
    {
      new: true,
      session,
      runValidators: true,
      upsert: false,
    }
  );

  if (!balance) {
    throw new Error("User balance not found for restoration");
  }

  return balance;
}

/**
 * GET all withdrawals (admin)
 * Supports pagination & search by userId or status
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const query = {};
    if (search) {
      // Search by userId or status or txHash
      query.$or = [
        { userId: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
        { txHash: { $regex: search, $options: "i" } },
      ];
    }

    const withdrawals = await Withdrawal.find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Withdrawal.countDocuments(query);

    res.render("withdrawals/index", {
      title: "Withdrawals",
      user: req.user,
      withdrawals,
      page: Number(page),
      limit: Number(limit),
      total,
    });
  } catch (err) {
    console.error("Error fetching withdrawals:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET withdrawals by userId (for user dashboard / mobile)
 */
router.get("/user/:userId", requireMobileClient, readLimiter, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({
      userId: req.params.userId,
    }).sort({ created_at: -1 });
    res.json(withdrawals);
  } catch (err) {
    console.error("Error fetching user withdrawals:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST create new withdrawal (mobile app)
 * Status will be PENDING by default
 */
router.post("/", requireMobileClient, writeLimiter, async (req, res) => {
  try {
    let { userId, asset, chain, toAddress, amountNumeric } = req.body;

    if (!userId || !chain || !toAddress || !amountNumeric) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Force asset to USDT for all withdrawals
    asset = "USDT";
    chain = "USDT";

    // Speed API minimum for USDT is 0.5; reject at creation so withdrawal can be approved later
    const SPEED_MIN_USDT = 0.5;
    const amountNum =
      typeof amountNumeric === "object" && amountNumeric?.toString
        ? Number(amountNumeric.toString())
        : Number(amountNumeric);
    if (Number.isNaN(amountNum) || amountNum < SPEED_MIN_USDT) {
      return res.status(400).json({
        error: `Withdrawal amount must be at least ${SPEED_MIN_USDT} USDT (Speed minimum).`,
        minAmountUsdt: SPEED_MIN_USDT,
      });
    }

    // Balance check — reject overdraft withdrawals before they enter the queue
    const userBalance = await Balance.findOne({ user: userId });
    const currentDeposit = userBalance?.BTC_DEPOSIT
      ? (typeof userBalance.BTC_DEPOSIT === "object" && userBalance.BTC_DEPOSIT.toString
          ? parseFloat(userBalance.BTC_DEPOSIT.toString())
          : Number(userBalance.BTC_DEPOSIT))
      : 0;
    if (currentDeposit < amountNum) {
      return res.status(402).json({
        error: "Insufficient balance for withdrawal",
        available: currentDeposit,
        requested: amountNum,
      });
    }

    const withdrawal = await Withdrawal.create({
      userId,
      asset,
      chain,
      toAddress,
      amountNumeric,
    });

    res.status(201).json({
      message: "Withdrawal request created successfully",
      withdrawal,
    });
  } catch (err) {
    console.error("Error creating withdrawal:", err);
    res
      .status(400)
      .json({ error: err.message || "Failed to create withdrawal" });
  }
});

/**
 * PATCH approve withdrawal (admin)
 * Calls Speed /send afterwards to handle sending
 */
router.patch("/:id/approve", requireAdmin, async (req, res) => {
  try {
    // 1. Atomically claim the withdrawal — prevents double-approval race condition
    const withdrawal = await Withdrawal.findOneAndUpdate(
      { _id: req.params.id, status: "PENDING" },
      { $set: { status: "PROCESSING" } },
      { new: true }
    );

    if (!withdrawal) {
      // Either not found or already being processed / already sent
      const existing = await Withdrawal.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Withdrawal not found" });
      return res.status(409).json({
        error: `Cannot approve withdrawal with status: ${existing.status}`,
      });
    }

    // 2. Determine deduct amount — prefer defaultAmountNumeric, fall back to amountNumeric
    const rawDeduct = withdrawal.defaultAmountNumeric ?? withdrawal.amountNumeric;
    const deductAmount = rawDeduct !== null && rawDeduct !== undefined
      ? (typeof rawDeduct === "object" && rawDeduct.toString ? rawDeduct.toString() : String(rawDeduct))
      : null;

    if (!deductAmount || isNaN(Number(deductAmount)) || Number(deductAmount) <= 0) {
      // Restore to PENDING so admin can retry
      await Withdrawal.findByIdAndUpdate(req.params.id, { $set: { status: "PENDING" } });
      return res.status(400).json({
        error: "Cannot approve: withdrawal has no valid deduct amount",
        withdrawal_id: withdrawal._id,
      });
    }

    // 3. Deduct balance BEFORE sending payment — if this fails nothing is sent
    let balanceAfterDeduct;
    try {
      balanceAfterDeduct = await deductBTCDepositBalance(withdrawal.userId, deductAmount);
    } catch (balanceErr) {
      // Restore to PENDING so admin can see it and retry or reject
      await Withdrawal.findByIdAndUpdate(req.params.id, { $set: { status: "PENDING" } });
      const isInsufficient = balanceErr.message.includes("Insufficient");
      return res.status(isInsufficient ? 402 : 500).json({
        error: isInsufficient
          ? "User has insufficient BTC_DEPOSIT balance to cover this withdrawal"
          : "Balance deduction failed",
        details: balanceErr.message,
      });
    }

    // 4. Send via Speed API
    const amount =
      typeof withdrawal.amountNumeric === "object" &&
      withdrawal.amountNumeric !== null &&
      withdrawal.amountNumeric.toString
        ? Number(withdrawal.amountNumeric.toString())
        : Number(withdrawal.amountNumeric);

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      await restoreBTCDepositBalance(withdrawal.userId, deductAmount, null);
      await Withdrawal.findByIdAndUpdate(req.params.id, { $set: { status: "PENDING" } });
      return res.status(400).json({ error: "Invalid withdrawal amount" });
    }

    const SPEED_MIN_USDT = 0.5;
    if (withdrawal.asset === "USDT" && amount < SPEED_MIN_USDT) {
      await restoreBTCDepositBalance(withdrawal.userId, deductAmount, null);
      await Withdrawal.findByIdAndUpdate(req.params.id, { $set: { status: "PENDING" } });
      return res.status(400).json({
        error: `Amount below Speed minimum of ${SPEED_MIN_USDT} USDT`,
        minAmountUsdt: SPEED_MIN_USDT,
        amountUsdt: amount,
      });
    }

    const amountForSpeed = parseFloat(Number(amount).toFixed(8));
    const dataspeed = JSON.stringify({
      amount: amountForSpeed,
      currency: withdrawal.asset,
      target_currency: withdrawal.asset,
      withdraw_method: "lightning",
      withdraw_request: withdrawal.toAddress,
      note: "Withdrawal approved from backend",
    });

    const config = {
      method: "post",
      maxBodyLength: Infinity,
      url: "https://api.tryspeed.com/send",
      headers: {
        "Content-Type": "application/json",
        Authorization: getSpeedAuthHeader(),
      },
      data: dataspeed,
    };

    let responsespeed;
    try {
      responsespeed = await axios.request(config);
    } catch (apiError) {
      // Speed API failed — restore balance and reset to PENDING so admin can retry
      await restoreBTCDepositBalance(withdrawal.userId, deductAmount, null);
      await Withdrawal.findByIdAndUpdate(req.params.id, { $set: { status: "PENDING" } });

      console.error("Speed API error details (approve):", {
        status: apiError.response?.status,
        data: apiError.response?.data,
        message: apiError.message,
      });

      const speedMessage =
        apiError.response?.data?.errors?.[0]?.message ||
        apiError.response?.data?.error ||
        apiError.message;
      const isInsufficientFunds =
        typeof speedMessage === "string" &&
        speedMessage.toLowerCase().includes("insufficient funds");

      return res.status(isInsufficientFunds ? 402 : 500).json({
        error: isInsufficientFunds
          ? "Speed wallet has insufficient funds. Top up your Speed account at tryspeed.com."
          : "Failed to send withdrawal via Speed API",
        details: speedMessage,
        code: isInsufficientFunds ? "SPEED_INSUFFICIENT_FUNDS" : undefined,
        fullError: apiError.response?.data || null,
      });
    }

    if (!responsespeed.data?.id) {
      await restoreBTCDepositBalance(withdrawal.userId, deductAmount, null);
      await Withdrawal.findByIdAndUpdate(req.params.id, { $set: { status: "PENDING" } });
      console.error("Invalid Speed API response:", responsespeed.data);
      return res.status(500).json({
        error: "Speed API returned invalid response",
        details: responsespeed.data,
      });
    }

    // 5. Mark as SENT
    withdrawal.status = "SENT";
    withdrawal.txHash = responsespeed.data.id;
    withdrawal.approvedBy = req.user?.id || "system";
    withdrawal.approvedAt = new Date();
    withdrawal.action = responsespeed.data;
    await withdrawal.save();

    return res.json({
      message: "Withdrawal approved and sent",
      withdrawal,
      speed: responsespeed.data,
    });
  } catch (err) {
    console.error("Approve withdrawal error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH reject withdrawal (admin)
 */
router.patch("/:id/reject", requireAdmin, async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    withdrawal.status = "FAILED";
    withdrawal.note = "Rejected by admin"; // if model supports 'note'
    await withdrawal.save();

    // TODO: Optionally notify user

    res.json({ message: "Withdrawal rejected", withdrawal });
  } catch (err) {
    console.error("Reject withdrawal error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH mark as sent (after blockchain/bank tx is done)
 */
router.patch("/:id/sent", requireAdmin, async (req, res) => {
  try {
    const { txHash } = req.body;
    const withdrawal = await Withdrawal.findByIdAndUpdate(
      req.params.id,
      { status: "SENT", txHash },
      { new: true }
    );
    if (!withdrawal)
      return res.status(404).json({ error: "Withdrawal not found" });

    res.json({ message: "Marked as sent", withdrawal });
  } catch (err) {
    console.error("Mark sent error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH mark as confirmed (after confirmations)
 */
router.patch("/:id/confirm", requireAdmin, async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findByIdAndUpdate(
      req.params.id,
      { status: "CONFIRMED" },
      { new: true }
    );
    if (!withdrawal)
      return res.status(404).json({ error: "Withdrawal not found" });

    res.json({ message: "Marked as confirmed", withdrawal });
  } catch (err) {
    console.error("Mark confirmed error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /create-speed-payment
 * Deducts BTC_DEPOSIT, creates withdrawal, and calls Speed APIs
 */
router.post("/create-speed-payment", requireMobileClient, writeLimiter, async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const {
      amount,
      currency = "USD",
      target_currency = "USDT",
      payment_methods = ["lightning"],
      metadata,
      speed_wallet_address,
      baseAmount,
      defaultAmountNumeric,
      idempotency_key,
    } = req.body;

    if (!amount) {
      return res.status(400).json({ error: "Amount is required" });
    }

    if (!baseAmount || baseAmount <= 0) {
      return res
        .status(400)
        .json({ error: "Base amount is required and must be positive" });
    }

    if (!metadata?.user_id) {
      return res.status(400).json({ error: "User ID is required in metadata" });
    }

    if (!speed_wallet_address || !isValidSpeedLN(speed_wallet_address)) {
      return res.status(400).json({ error: "Invalid Speed wallet address" });
    }

    // Idempotency: if same key was already processed, return the existing record
    if (idempotency_key) {
      const existing = await Withdrawal.findOne({ idempotency_key });
      if (existing) {
        return res.json({
          status: existing.status,
          withdrawal_id: existing._id,
          withdrawal: existing,
          idempotent: true,
        });
      }
    }

    // Start transaction
    await session.startTransaction();
    let updatedBalance, createdWithdrawal;
    try {
      // 1. Deduct balance first — if insufficient this throws and aborts the transaction
      updatedBalance = await deductBTCDepositBalance(
        metadata.user_id,
        baseAmount
      );
      console.log(
        `Balance deducted for user ${metadata.user_id}: ${baseAmount} from BTC_DEPOSIT`
      );

      // 2. Create withdrawal record with PENDING status — admin must approve to send
      const withdrawalArr = await Withdrawal.create(
        [
          {
            userId: metadata.user_id,
            asset: target_currency,
            chain: "BTC",
            toAddress: speed_wallet_address,
            amountNumeric: amount,
            defaultAmountNumeric: Number(defaultAmountNumeric),
            status: "PENDING",
            ...(idempotency_key ? { idempotency_key } : {}),
          },
        ],
        { session }
      );
      createdWithdrawal = withdrawalArr[0];

      await session.commitTransaction();
      return res.json({
        status: "PENDING",
        withdrawal_id: createdWithdrawal._id,
        balance_deducted: baseAmount,
        remaining_btc_deposit: updatedBalance.BTC_DEPOSIT,
        withdrawal: createdWithdrawal,
      });
    } catch (paymentError) {
      await session.abortTransaction();
      console.error("Payment processing failed:", paymentError);
      if (paymentError.message.includes("Insufficient BTC_DEPOSIT balance")) {
        return res.status(400).json({
          error: "Insufficient BTC deposit balance",
          details: paymentError.message,
        });
      }
      return res.status(500).json({
        error: "Payment processing failed",
        details: paymentError.message,
      });
    }
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error("Error creating Speed payment:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  } finally {
    await session.endSession();
  }
});

export default router;