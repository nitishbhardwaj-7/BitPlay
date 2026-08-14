// routes/withdrawals/index.js
import express from "express";
import Withdrawal from "../../models/Withdrawal.js";
import Balance from "../../models/Balance.js";
import mongoose from "mongoose";
import fetch from "node-fetch";
import Client from "lightning-client";
import axios from "axios";
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Use a single key everywhere (set in your env file)
const SPEED_API_KEY = process.env.SPEED_API_KEY;

// Per-withdrawal BTC limits. The mobile app already fetches these from
// GET /limits (below) and caps its own UI to them — but that endpoint didn't
// exist until now, so every client was silently falling back to these exact
// values anyway (see DEFAULT_MIN_BTC/DEFAULT_MAX_BTC in
// WithdrawalScreenNew.tsx). Enforcing the same numbers server-side changes
// nothing for a genuine user; it just makes sure a request built outside the
// app can't skip the cap the app itself already enforces.
const MIN_WITHDRAW_BTC = 0.0000005;
const MAX_WITHDRAW_BTC = 0.000009;

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
async function deductBTCDepositBalance(userId, baseAmount, session) {
  if (baseAmount === undefined || baseAmount === null || isNaN(baseAmount)) {
    throw new Error("baseAmount is required and must be a valid number");
  }
  const baseAmountStr = typeof baseAmount === 'string' ? baseAmount : baseAmount.toString();
  const negativeAmountStr = baseAmountStr.startsWith('-') ? baseAmountStr : '-' + baseAmountStr;
  // Atomic compare-and-swap: the $gte guard means this only matches (and only
  // decrements) if the user's real BTC_DEPOSIT actually covers baseAmount.
  // A request for more than the user has simply matches no document, and we
  // throw below — this is what actually stops a fabricated withdrawal amount
  // from ever being accepted, regardless of what the client claims.
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
      session,
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
router.get("/", async (req, res) => {
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
router.get("/user/:userId", async (req, res) => {
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
 * GET withdrawal limits (mobile app)
 * WithdrawalScreenNew.tsx already calls this to cap its own UI; it 404'd
 * previously so every client silently fell back to its own hardcoded
 * defaults, which happen to equal MIN_WITHDRAW_BTC/MAX_WITHDRAW_BTC above.
 */
router.get("/limits", (req, res) => {
  res.json({ minBtc: MIN_WITHDRAW_BTC, maxBtc: MAX_WITHDRAW_BTC });
});

/**
 * POST create new withdrawal (mobile app — on-chain BTC method)
 * Status will be PENDING by default.
 *
 * amountBtc is validated against the user's real BTC_DEPOSIT balance and
 * atomically reserved (deducted) here, in the same transaction as the
 * withdrawal record itself, so a request can never be created for more than
 * the user actually has. Reserved funds are given back via
 * restoreBTCDepositBalance if the withdrawal is later rejected.
 */
router.post("/", async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let { userId, asset, chain, toAddress, amountNumeric, amountBtc } = req.body;

    if (!userId || !chain || !toAddress || !amountNumeric || !amountBtc) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const btcAmountNum = Number(amountBtc);
    if (!Number.isFinite(btcAmountNum) || btcAmountNum <= 0) {
      return res.status(400).json({ error: "Invalid BTC amount" });
    }
    if (btcAmountNum < MIN_WITHDRAW_BTC || btcAmountNum > MAX_WITHDRAW_BTC) {
      return res.status(400).json({
        error: `Amount must be between ${MIN_WITHDRAW_BTC} and ${MAX_WITHDRAW_BTC} BTC`,
      });
    }

    // Force asset to USDT for all withdrawals
    asset = "USDT";
    chain = "USDT";

    let updatedBalance, withdrawal;
    await session.startTransaction();
    try {
      updatedBalance = await deductBTCDepositBalance(userId, btcAmountNum, session);

      const created = await Withdrawal.create(
        [{
          userId,
          asset,
          chain,
          toAddress,
          amountNumeric,
          defaultAmountNumeric: btcAmountNum,
        }],
        { session }
      );
      withdrawal = created[0];

      await session.commitTransaction();
    } catch (innerErr) {
      await session.abortTransaction();
      if (innerErr.message?.includes("Insufficient BTC_DEPOSIT balance")) {
        return res.status(400).json({ error: "Insufficient BTC deposit balance" });
      }
      throw innerErr;
    }

    res.status(201).json({
      message: "Withdrawal request created successfully",
      remaining_btc_deposit: updatedBalance.BTC_DEPOSIT,
      withdrawal,
    });
  } catch (err) {
    console.error("Error creating withdrawal:", err);
    res
      .status(400)
      .json({ error: err.message || "Failed to create withdrawal" });
  } finally {
    await session.endSession();
  }
});

/**
 * PATCH approve withdrawal (admin)
 * Calls Speed /send afterwards to handle sending
 */
router.patch("/:id/approve", async (req, res) => {
  try {
    // 1. Load the withdrawal by ID
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    // Check if already processed
    if (withdrawal.status !== "PENDING") {
      return res.status(400).json({
        error: `Cannot approve withdrawal with status: ${withdrawal.status}`,
      });
    }

    // Use dynamic values for Speed API payload
    const amount =
      typeof withdrawal.amountNumeric === "object" &&
      withdrawal.amountNumeric !== null &&
      withdrawal.amountNumeric.toString
        ? Number(withdrawal.amountNumeric.toString())
        : Number(withdrawal.amountNumeric);

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Invalid withdrawal amount",
      });
    }

    const dataspeed = JSON.stringify({
      amount,
      currency: withdrawal.asset,
      target_currency: withdrawal.asset,
      withdraw_method: "lightning",
      withdraw_request: withdrawal.toAddress,
      note: "Withdrawal approved from backend"
    });

    console.log("Speed API payload (approve):", dataspeed);

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

    // 3. Call Speed API with proper error handling
    let responsespeed;
    try {
      responsespeed = await axios.request(config);
    } catch (apiError) {
      console.error("Speed API error details (approve):", {
        status: apiError.response?.status,
        statusText: apiError.response?.statusText,
        data: apiError.response?.data,
        message: apiError.message,
        payload: config.data,
        headers: config.headers,
        url: config.url,
      });
      if (apiError.response?.data) {
        console.error(
          "Full Speed API error response (approve):",
          JSON.stringify(apiError.response.data, null, 2)
        );
      }
      return res.status(500).json({
        error: "Failed to send withdrawal via Speed API",
        details:
          apiError.response?.data?.errors?.[0]?.message ||
          apiError.response?.data?.error ||
          apiError.message,
        fullError: apiError.response?.data || null,
      });
    }

    // Validate API response
    if (!responsespeed.data?.id) {
      console.error("Invalid Speed API response:", responsespeed.data);
      return res.status(500).json({
        error: "Speed API returned invalid response format",
        details: responsespeed.data,
      });
    }

    // 4. Update withdrawal record after successful payment.
    // Balance was already verified and atomically reserved (deducted) when
    // this withdrawal was created — see deductBTCDepositBalance in the POST
    // handlers above — so there is nothing left to check or deduct here.
    // (Previously this deducted a second time *after* the Speed API call,
    // meaning money could already be sent before an insufficient-balance
    // error was found, and that error was then silently reported as
    // success. Removed.)
    withdrawal.status = "SENT";
    withdrawal.txHash = responsespeed.data.id; // Speed instant_send id
    withdrawal.approvedBy = req.user?.id || "system";
    withdrawal.approvedAt = new Date();
    withdrawal.action = responsespeed.data;
    await withdrawal.save();
    // 5. Respond
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
router.patch("/:id/reject", async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    // Only PENDING withdrawals can be rejected — critically, this stops an
    // already-SENT withdrawal from being "rejected" and incorrectly
    // re-crediting a balance for funds that were already paid out.
    if (withdrawal.status !== "PENDING") {
      return res.status(400).json({
        error: `Cannot reject withdrawal with status: ${withdrawal.status}`,
      });
    }

    // Give back the balance that was reserved when this withdrawal was
    // created, since the user won't be paid. Guard against legacy/malformed
    // records (created before balance reservation was restored) that never
    // had a valid reserved amount — there's nothing to give back for those.
    const reservedRaw = withdrawal.defaultAmountNumeric;
    const reserved = reservedRaw != null
      ? Number(reservedRaw.toString?.() ?? reservedRaw)
      : 0;
    if (Number.isFinite(reserved) && reserved > 0) {
      try {
        await restoreBTCDepositBalance(withdrawal.userId, reserved);
      } catch (restoreErr) {
        console.error("Failed to restore balance on reject:", restoreErr);
        return res.status(500).json({
          error: "Failed to restore user balance — withdrawal was not rejected",
          details: restoreErr.message,
        });
      }
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
router.patch("/:id/sent", async (req, res) => {
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
router.patch("/:id/confirm", async (req, res) => {
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
router.post("/create-speed-payment", async (req, res) => {
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
    } = req.body;

    client
      .getinfo()
      .then((info) => {
        console.log("Connected to CLN:", info.id);
      })
      .catch((err) => {
        console.error("Lightning client connection error:", err);
      });

    if (!amount) {
      return res.status(400).json({ error: "Amount is required" });
    }

    if (!baseAmount || baseAmount <= 0) {
      return res
        .status(400)
        .json({ error: "Base amount is required and must be positive" });
    }

    if (Number(baseAmount) < MIN_WITHDRAW_BTC || Number(baseAmount) > MAX_WITHDRAW_BTC) {
      return res.status(400).json({
        error: `Amount must be between ${MIN_WITHDRAW_BTC} and ${MAX_WITHDRAW_BTC} BTC`,
      });
    }

    if (!metadata?.user_id) {
      return res.status(400).json({ error: "User ID is required in metadata" });
    }

    if (!speed_wallet_address || !isValidSpeedLN(speed_wallet_address)) {
      return res.status(400).json({ error: "Invalid Speed wallet address" });
    }

    // Start transaction
    await session.startTransaction();
    let updatedBalance, createdWithdrawal;
    try {
      // 1. Check and deduct balance first — atomically reserves baseAmount
      // against the user's real BTC_DEPOSIT. This was previously commented
      // out, which let a request for any amount (regardless of the user's
      // actual balance) go straight through to a PENDING withdrawal.
      updatedBalance = await deductBTCDepositBalance(
        metadata.user_id,
        baseAmount,
        session
      );
      console.log(
        `Balance deducted for user ${metadata.user_id}: ${baseAmount} from BTC_DEPOSIT`
      );
      // 2. Create withdrawal record
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