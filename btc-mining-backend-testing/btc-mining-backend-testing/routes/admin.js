import express from 'express';
import bcrypt from 'bcryptjs';
import axios from 'axios';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import dbActions from '../helpers/db_actions.js';
import dbHelpers from '../helpers/helper_functions.js';
import WebUsers from '../models/WebUsers.js';
import DailyReward from "../models/DailyReward.js";
import Withdrawal from "../models/Withdrawal.js";
import Purchase from "../models/Purchase.js";
import Deposit from "../models/Deposit.js";
import FirebaseNotifications from "../models/FirebaseNotificationModels.js";
import DeleteRequests from '../models/DeleteRequests.js';
import Balance from '../models/Balance.js';
import ReferralRewardHistory from '../models/ReferralRewardHistory.js';
import { getBtcUsdPriceCached } from '../helpers/btcPrice.js';
import GameSession from '../models/GameSession.js';

const { users_count_comparision, transactions_count_comparision, supportTickets_count_comparision } = dbActions;
const {
    total_users,
    total_transactions,
    TotalSupportTickets
} = dbHelpers
const router = express.Router();

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.session.isLoggedIn) return next();
  res.redirect('/admin/login');
};

// Rate limiter: max 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Login page
router.get('/login', (req, res) => {
  if (req.session.isLoggedIn) {
    return res.redirect('/admin/dashboard');
  }
  res.render('login', {
    title: 'Admin Login',
    error: req.session.error || null
  });
  req.session.error = null;
});

// Handle login
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    req.session.error = 'Username and password are required';
    return res.redirect('/admin/login');
  }

  try {
    const adminUser = await WebUsers.findOne({ username }).select('+password');

    let valid = false;
    if (adminUser) {
      if (adminUser.password) {
        valid = await bcrypt.compare(password, adminUser.password);
      } else {
        // Legacy: no password stored yet — accept env-configured master password only
        const masterPw = process.env.ADMIN_MASTER_PASSWORD;
        valid = masterPw && password === masterPw;
        // Migrate to bcrypt on first successful login
        if (valid) {
          adminUser.password = await bcrypt.hash(password, 12);
          await adminUser.save();
        }
      }
    }

    if (valid) {
      req.session.isLoggedIn = true;
      req.session.adminUser = adminUser.username;
      req.session.adminUserData = { username: adminUser.username, email: adminUser.email };
      return res.redirect('/admin/dashboard');
    }

    req.session.error = 'Invalid credentials';
    return res.redirect('/admin/login');
  } catch (error) {
    console.error('Login error:', error);
    req.session.error = 'Login failed';
    return res.redirect('/admin/login');
  }
});

// Register admin route — only allowed when ALLOW_ADMIN_REGISTER=true in env
router.post('/register-admin', (req, res, next) => {
  if (process.env.ALLOW_ADMIN_REGISTER !== 'true') {
    return res.status(403).json({ success: false, message: 'Registration is disabled' });
  }
  next();
}, async (req, res) => {
  try {
    const { firstname, lastname, username, orgname, location, email, phone, password } = req.body;

    // Check if admin already exists
    const existingAdmin = await WebUsers.findOne({
      $or: [{ username }, { email }]
    });

    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Admin with this username or email already exists'
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create new admin
    const newAdmin = new WebUsers({
      firstname,
      lastname,
      username,
      orgname,
      location,
      email,
      phone,
      password: hashedPassword,
      role: 'admin'
    });

    await newAdmin.save();

    res.status(201).json({
      success: true,
      message: 'Admin registered successfully',
      admin: {
        username: newAdmin.username,
        email: newAdmin.email,
        role: newAdmin.role
      }
    });

  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register admin'
    });
  }
});

// Dashboard
router.get('/', requireAuth, async (req, res) => {
  res.redirect('/admin/dashboard');
});

router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Real revenue from purchases (subscriptions)
    const [revenueResult, lastMonthRevenue] = await Promise.all([
      Purchase.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$price_paid' } } }
      ]),
      Purchase.aggregate([
        { $match: { status: 'completed', purchase_date: { $gte: startOfLastMonth, $lt: startOfThisMonth } } },
        { $group: { _id: null, total: { $sum: '$price_paid' } } }
      ])
    ]);

    const totalRevenue = revenueResult[0]?.total || 0;
    const lastMonthRev = lastMonthRevenue[0]?.total || 0;
    const revenueChange = lastMonthRev > 0
      ? ((totalRevenue - lastMonthRev) / lastMonthRev * 100).toFixed(1)
      : null;

    // Monthly revenue for chart (last 12 months)
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(now.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);
    const monthlyRevenue = await Purchase.aggregate([
      { $match: { status: 'completed', purchase_date: { $gte: twelveMonthsAgo } } },
      { $group: {
          _id: { year: { $year: '$purchase_date' }, month: { $month: '$purchase_date' } },
          total: { $sum: '$price_paid' }
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const chartLabels = [];
    const chartData = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      chartLabels.unshift(monthNames[d.getMonth()]);
      const found = monthlyRevenue.find(m => m._id.year === d.getFullYear() && m._id.month === d.getMonth() + 1);
      chartData.unshift(found ? Math.round(found.total) : 0);
    }

    // Real recent activity: last 5 purchases + last 5 deposits
    const [recentPurchases, recentDeposits] = await Promise.all([
      Purchase.find({ status: 'completed' }).sort({ purchase_date: -1 }).limit(5).lean(),
      Deposit.find({ credited: true }).sort({ createdAt: -1 }).limit(5).lean()
    ]);
    const recentTransactions = [
      ...recentPurchases.map(p => ({
        label: 'Subscription Purchase',
        sub: p.product_identifier || 'Plan',
        amount: `+$${Number(p.price_paid).toFixed(2)}`,
        type: 'positive',
        date: p.purchase_date
      })),
      ...recentDeposits.map(d => ({
        label: `Deposit (${d.asset})`,
        sub: d.chain,
        amount: `+${parseFloat(d.amountNumeric?.toString() || '0').toFixed(6)} ${d.asset}`,
        type: 'positive',
        date: d.createdAt
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

    const [users_diff, transactions_diff, supportTicketsDiff, usersCount, TransactionsCount, supportTicketsCount] = await Promise.all([
      users_count_comparision(),
      transactions_count_comparision(),
      supportTickets_count_comparision(),
      total_users(),
      total_transactions(),
      TotalSupportTickets()
    ]);

    res.render('dashboard', {
      title: 'Dashboard',
      user: req.session.adminUser,
      data: { totalRevenue, revenueChange },
      usersCount,
      users_diff,
      TransactionsCount,
      transactions_diff,
      supportTicketsCount,
      supportTicketsDiff,
      recentTransactions,
      chartLabels: JSON.stringify(chartLabels),
      chartData: JSON.stringify(chartData)
    });
  } catch (error) {
    console.error('Dashboard error:', error.message);
    res.render('dashboard', {
      title: 'Dashboard',
      user: req.session.adminUser,
      data: { totalRevenue: 0, revenueChange: null },
      usersCount: 0,
      users_diff: '0%',
      TransactionsCount: 0,
      transactions_diff: '0%',
      supportTicketsCount: 0,
      supportTicketsDiff: '0%',
      recentTransactions: [],
      chartLabels: JSON.stringify([]),
      chartData: JSON.stringify([])
    });
  }
});

router.get('/subscriptionplans', requireAuth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const skip = (page - 1) * limit;
  const query = req.query.q?.trim() || '';

  const plansCollection = mongoose.connection.db.collection('subscriptionplans');

  const filter = query
    ? {
        name: { $regex: query, $options: 'i' },
      }
    : {};

  const plans = await plansCollection
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  const total = await plansCollection.countDocuments(filter);

  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return res.json({ plans });
  }

  res.render('subscriptionplans', {
    title: 'Subscription Plans',
    user: req.user?.name || 'Admin',
    plans,
    query,
    page,
    limit,
    total,
  });
});

router.get('/usersubscriptions', requireAuth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const skip = (page - 1) * limit;
  const query = req.query.q?.trim() || '';

  const UserSubsCollection = mongoose.connection.db.collection('userplans');

  // filter for either plan name or user email
  const matchStage = query
    ? {
        $or: [
          { plan_id: { $regex: query, $options: 'i' } },
          { 'plan.name': { $regex: query, $options: 'i' } },
          { 'user.email': { $regex: query, $options: 'i' } }
        ],
      }
    : {};

  const pipeline = [
    // join with subscriptionplans
    {
      $lookup: {
        from: 'subscriptionplans',
        localField: 'plan_id',
        foreignField: 'id',
        as: 'plan',
      },
    },
    { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },

    // join with users collection
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },

    { $match: matchStage },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        _id: 1,
        user: { _id: 1, email: 1 }, // only return id + email
        crypto: 1,
        chain: 1,
        amount: 1,
        amount_crypto: 1,
        hashrate: 1,
        paid: 1,
        plan: 1,
        createdAt: 1,
      },
    },
  ];

  const UserSubs = await UserSubsCollection.aggregate(pipeline).toArray();

  // count total
  const totalPipeline = [
    {
      $lookup: {
        from: 'subscriptionplans',
        localField: 'plan_id',
        foreignField: 'id',
        as: 'plan',
      },
    },
    { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $match: matchStage },
    { $count: 'total' },
  ];

  const totalResult = await UserSubsCollection.aggregate(totalPipeline).toArray();
  const total = totalResult[0]?.total || 0;

  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return res.json({ UserSubs, total });
  }

  res.render('usersubscriptions', {
    title: 'User Subscriptions',
    user: req.user?.name || 'Admin',
    UserSubs,
    query,
    page,
    limit,
    total,
  });
});

// Users management
router.get('/users', requireAuth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const skip = (page - 1) * limit;
  const searchQuery = req.query.q?.trim() || '';

  const usersCollection = mongoose.connection.db.collection('users');

  const filter = searchQuery
    ? {
        $or: [
          { name: { $regex: searchQuery, $options: 'i' } },
          { email: { $regex: searchQuery, $options: 'i' } }
        ]
      }
    : {};

  const [users, total] = await Promise.all([
    usersCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    usersCollection.countDocuments(filter)
  ]);

  const totalPages = Math.ceil(total / limit);

  // Enrich users with balance (total BTC, deposit BTC), referral count, and total referral rewards
  const userIds = users.map((u) => String(u._id));
  const referralCodes = [...new Set(users.map((u) => u.referralCode).filter(Boolean))];
  const referralCodesLower = referralCodes.map((c) => String(c).toLowerCase());

  const [balanceDocs, referralCounts, referralRewardDocs] = await Promise.all([
    Balance.find({ user: { $in: userIds } }).lean(),
    referralCodesLower.length > 0
      ? usersCollection
          .aggregate([
            { $addFields: { referralUsedLower: { $toLower: { $ifNull: ['$referralUsed', ''] } } } },
            { $match: { referralUsedLower: { $in: referralCodesLower } } },
            { $group: { _id: '$referralUsedLower', count: { $sum: 1 } } }
          ])
          .toArray()
      : [],
    ReferralRewardHistory.find({ parentUserId: { $in: userIds }, status: 'processed' }).lean()
  ]);

  const balanceByUser = Object.fromEntries(
    balanceDocs.map((b) => [
      b.user,
      {
        totalBtc: parseFloat(b.BTC?.toString() || '0') + parseFloat(b.BTC_DEPOSIT?.toString() || '0'),
        depositBtc: parseFloat(b.BTC_DEPOSIT?.toString() || '0')
      }
    ])
  );
  const referralByCode = Object.fromEntries(
    referralCounts.map((r) => [r._id, r.count])
  );
  const totalReferralRewardsByUser = referralRewardDocs.reduce((acc, r) => {
    const pid = r.parentUserId;
    const amount = parseFloat(r.rewardAmount?.toString() || '0');
    acc[pid] = (acc[pid] || 0) + amount;
    return acc;
  }, {});

  const usersEnriched = users.map((u) => {
    const uid = String(u._id);
    const balance = balanceByUser[uid] || { totalBtc: 0, depositBtc: 0 };
    const referralCount = u.referralCode ? (referralByCode[String(u.referralCode).toLowerCase()] || 0) : 0;
    const totalReferralRewards = totalReferralRewardsByUser[uid] ?? 0;
    return {
      ...u,
      totalBtc: balance.totalBtc,
      depositBtc: balance.depositBtc,
      referralCount,
      totalReferralRewards
    };
  });

  // If AJAX request, return JSON
  if (req.xhr) {
    return res.json({ users: usersEnriched, page, totalPages });
  }

  // Full page render
  res.render('users', {
    title: 'Users',
    user: req.user?.name || 'Admin',
    users: usersEnriched,
    page,
    limit,
    totalPages,
    searchQuery
  });
});

// Help route
router.get('/help', requireAuth, async (req, res) => {
  try {
    const query = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const ticketsCollection = mongoose.connection.db.collection('supporttickets');

    const filter = query
      ? {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } },
            { message: { $regex: query, $options: 'i' } },
          ],
        }
      : {};

    const tickets = await ticketsCollection
      .find(filter)
      .sort({ _id: -1 }) // latest first
      .skip(skip)
      .limit(limit)
      .toArray();

    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.json({ tickets });
    }

    // Initial full page render
    res.render('help', {
      title: 'Support Tickets',
      user: req.user?.name || 'Admin',
      tickets,
      searchQuery: query,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error loading help tickets:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Deposit route
router.get('/deposit', requireAuth, (req, res) => {
  res.render('deposit', {
    title: 'Deposit Transactions',
    user: req.session.adminUser
  });
});

// Withdraw route
router.get('/withdraw', requireAuth, (req, res) => {
  res.render('withdraw', {
    title: 'Withdrawal Transactions',
    user: req.session.adminUser
  });
});

// Wallet route
router.get('/wallet', requireAuth, (req, res) => {
  res.render('wallet', {
    title: 'Wallet',
    user: req.session.adminUser
  });
});

// Profile route

router.get('/profile', requireAuth, async (req, res) => {
  try {
    const adminEmail = req.session.adminUser.email;

    let webUser = await WebUsers.findOne({ username: req.session.adminUser })
      || await WebUsers.findOne({ username: 'admin' });

    if (!webUser) {
      webUser = new WebUsers({
        username: req.session.adminUser || 'admin',
        firstname: 'Admin',
        lastname: 'User',
        orgname: 'Bitplaypro',
        location: '-',
        email: 'admin@bitplaypro.com',
        phone: '-'
      });
      await webUser.save();
    }

    // Get messages and clear them immediately
    const successMessage = req.session.successMessage || null;
    const errorMessage = req.session.errorMessage || null;
    req.session.successMessage = null;
    req.session.errorMessage = null;

    res.render('profile', {
      title: 'Profile',
      user: req.session.adminUser,
      webUser: webUser,
      successMessage: successMessage,
      errorMessage: errorMessage
    });
  } catch (err) {
    console.error('Error fetching WebUser:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Settings route
router.get('/settings', requireAuth, (req, res) => {
  res.render('settings', {
    title: 'Settings',
    user: req.session.adminUser
  });
});

// Transactions
router.get('/transactions', requireAuth, async (req, res) => {
  try {
    const response = await axios.get(`${process.env.BACKEND_API_URL}/admin/transactions`);
    const transactions = response.data.data;

    res.render('transactions', {
      title: 'Transactions',
      user: req.session.adminUser,
      transactions: transactions
    });
  } catch (error) {
    console.error('Transactions fetch error:', error.message);
    res.render('transactions', {
      title: 'Transactions',
      user: req.session.adminUser,
      transactions: [],
      error: 'Failed to fetch transactions'
    });
  }
});

// Support tickets
router.get('/support', requireAuth, async (req, res) => {
  try {
    const response = await axios.get(`${process.env.BACKEND_API_URL}/admin/support`);
    const tickets = response.data.data;
    
    res.render('support', {
      title: 'Support Tickets',
      user: req.session.adminUser,
      tickets: tickets
    });
  } catch (error) {
    console.error('Support fetch error:', error.message);
    res.render('support', {
      title: 'Support Tickets',
      user: req.session.adminUser,
      tickets: [],
      error: 'Failed to fetch support tickets'
    });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/admin/login');
  });
});

//FAQs
router.get('/faqs', requireAuth, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const query = req.query.q || '';
  const skip = (page - 1) * limit;

  const faqsCollection = mongoose.connection.db.collection('faqs');

  const filter = query ? { name: { $regex: query, $options: 'i' } } : {};
  const faqs = await faqsCollection.find(filter).sort({ date_created: -1 }).skip(skip).limit(limit).toArray();

  if (req.xhr) {
    return res.json({ faqs });
  }

  res.render('Faqs', { title: 'FAQs', faqs, searchQuery: query, page, limit, user: req.session.adminUser });
});

router.get("/daily-rewards", requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const rewards = await DailyReward.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCount = await DailyReward.countDocuments();

    res.render("dailyRewards", {
      title: "Daily Rewards",
      user: req.session.adminUser,
      rewards,
      page,
      limit,
      totalCount,
    });
  } catch (err) {
    console.error("Error fetching rewards:", err);
    res.status(500).send("Server error");
  }
});

router.get("/withdrawals", requireAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const searchTrim = typeof search === "string" ? search.trim() : "";
    const usersCollection = mongoose.connection.db.collection("users");

    const query = {};
    if (searchTrim) {
      const orConditions = [
        { userId: { $regex: searchTrim, $options: "i" } },
        { status: { $regex: searchTrim, $options: "i" } },
        { txHash: { $regex: searchTrim, $options: "i" } }
      ];
      // Also search by user name or email
      const matchingUsers = await usersCollection
        .find({
          $or: [
            { name: { $regex: searchTrim, $options: "i" } },
            { email: { $regex: searchTrim, $options: "i" } }
          ]
        })
        .project({ _id: 1 })
        .toArray();
      const matchingUserIds = matchingUsers.map((u) => String(u._id));
      if (matchingUserIds.length > 0) {
        orConditions.push({ userId: { $in: matchingUserIds } });
      }
      query.$or = orConditions;
    }

    const withdrawals = await Withdrawal.find(query)
      .sort({ created_at: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    const total = await Withdrawal.countDocuments(query);

    // Enrich with user name and email
    const userIds = [...new Set(withdrawals.map((w) => w.userId).filter(Boolean))];
    const userIdsForQuery = userIds.map((id) => {
      try {
        return mongoose.Types.ObjectId.isValid(id) && String(id).length === 24
          ? new mongoose.Types.ObjectId(id)
          : id;
      } catch (_) {
        return id;
      }
    });
    const userDocs = await usersCollection
      .find({ _id: { $in: userIdsForQuery } })
      .project({ _id: 1, name: 1, email: 1 })
      .toArray();
    const userMap = {};
    userDocs.forEach((u) => {
      const key = u._id instanceof mongoose.Types.ObjectId ? u._id.toString() : String(u._id);
      userMap[key] = { name: u.name || "-", email: u.email || "-" };
    });
    // Normalize Decimal128/BSON amounts to display strings (works with .lean())
    const toDecimalStr = (val) => {
      if (val == null || val === undefined) return null;
      if (typeof val === "string") return val;
      if (typeof val === "number" && !Number.isNaN(val)) return String(val);
      if (typeof val === "object" && val.$numberDecimal) return val.$numberDecimal;
      if (typeof val === "object" && typeof val.toString === "function") return val.toString();
      return null;
    };
    const formatBtc = (val) => {
      const s = toDecimalStr(val);
      if (s == null) return null;
      const n = parseFloat(s);
      if (Number.isNaN(n)) return null;
      return n.toFixed(16);
    };

    // Fetch BTC/USD price once for USDT→BTC conversion when defaultAmountNumeric is missing
    let btcUsdPrice = 0;
    try {
      btcUsdPrice = await getBtcUsdPriceCached(60_000);
    } catch (e) {
      console.warn("[Admin withdrawals] BTC price fetch failed:", e?.message ?? e);
    }

    const withdrawalsEnriched = withdrawals.map((w) => {
      const rawAmount = toDecimalStr(w.amountNumeric) ?? "0";
      const usdLike = ["USDT", "USDC", "USD"].includes(String(w.asset || "").toUpperCase());
      const amountStr = usdLike
        ? (parseFloat(rawAmount) || 0).toFixed(3)
        : rawAmount;

      let btcStr = formatBtc(w.defaultAmountNumeric);
      if (btcStr == null && btcUsdPrice > 0) {
        if (usdLike) {
          const usdAmount = parseFloat(rawAmount);
          if (Number.isFinite(usdAmount) && usdAmount >= 0) {
            btcStr = (usdAmount / btcUsdPrice).toFixed(16);
          }
        }
      }
      return {
        ...w,
        userName: userMap[w.userId]?.name ?? "-",
        userEmail: userMap[w.userId]?.email ?? "-",
        displayAmount: amountStr,
        displayBtc: btcStr
      };
    });

    res.render("withdraw", {
      title: "Withdrawals",
      user: req.session.adminUser,
      withdrawals: withdrawalsEnriched,
      page: Number(page),
      limit: Number(limit),
      total,
      search: searchTrim
    });
  } catch (err) {
    console.error("Error fetching withdrawals:", err);
    res.status(500).send("Server error");
  }
});

router.get('/fcm', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const searchQuery = req.query.q ? req.query.q.trim() : "";

    const query = {};
    if (searchQuery) {
      query.$or = [
        { token: { $regex: searchQuery, $options: 'i' } },
        { user_id: { $regex: searchQuery, $options: 'i' } }
      ];
    }

    const tokens = await FirebaseNotifications.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    if (req.xhr) {
      // AJAX request -> return JSON
      return res.json({ tokens, page, limit });
    }

    // Normal request -> render EJS
    res.render('fcm_tokens', {
      title: 'Firebase Notifications',
      user: req.session.adminUser,
      tokens,
      page,
      limit,
      searchQuery
    });
  } catch (err) {
    console.error('Error fetching FirebaseNotifications:', err);
    res.status(500).send('Server Error');
  }
});

router.get('/delete_requests', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const query = req.query.q ? req.query.q.trim() : '';

    // Match stage for email search
    const matchStage = query
      ? { 'user.email': { $regex: query, $options: 'i' } }
      : {};

    // Aggregation pipeline
    const pipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          user: { _id: 1, email: 1 },
          reason: 1,
          createdAt: 1,
        },
      },
    ];

    // Run query on DeleteRequests model
    const deleteRequests = await DeleteRequests.aggregate(pipeline);

    // Total count
    const totalPipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      { $match: matchStage },
      { $count: 'total' },
    ];

    const totalResult = await DeleteRequests.aggregate(totalPipeline);
    const total = totalResult[0]?.total || 0;

    // Handle AJAX requests
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
      return res.json({ deleteRequests, total });
    }

    // Render EJS page
    res.render('deleterequests', {
      title: 'Delete Requests',
      user: req.session.adminUser,
      deleteRequests,
      query,
      page,
      limit,
      total,
    });
  } catch (err) {
    console.error('Error fetching delete requests:', err);
    res.status(500).send('Internal Server Error');
  }
});

// GET /admin/games-history — paginated game sessions
router.get('/games-history', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const skip = (page - 1) * limit;
    const selectedGame = req.query.gameName || '';
    const selectedResult = req.query.result || '';
    const selectedUser = req.query.userId || '';

    const filter = {};
    if (selectedGame) filter.gameName = selectedGame;
    if (selectedResult) filter.result = selectedResult;
    if (selectedUser) filter.userId = { $regex: selectedUser, $options: 'i' };

    const [sessions, totalSessions, uniqueGames, todayCount, uniquePlayerCount, topGame] = await Promise.all([
      GameSession.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      GameSession.countDocuments(filter),
      GameSession.distinct('gameName'),
      GameSession.countDocuments({
        ...filter,
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      GameSession.distinct('userId').then(ids => ids.length),
      GameSession.aggregate([
        { $group: { _id: '$gameName', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ]).then(r => r[0]?._id || 'N/A'),
    ]);

    const totalPages = Math.ceil(totalSessions / limit);

    res.render('games-history', {
      title: 'Games History',
      sessions,
      games: uniqueGames.sort(),
      totalSessions,
      uniquePlayers: uniquePlayerCount,
      todaySessions: todayCount,
      mostPlayedGame: topGame,
      selectedGame,
      selectedResult,
      selectedUser,
      page,
      totalPages,
      limit,
    });
  } catch (err) {
    console.error('games-history error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// GET /admin/games-history/export — CSV export
router.get('/games-history/export', requireAuth, async (req, res) => {
  try {
    const sessions = await GameSession.find({}).sort({ createdAt: -1 }).limit(10000).lean();
    const header = 'Session ID,User ID,Game,Score,Result,Duration (s),Round,Date\n';
    const rows = sessions.map(s =>
      `${s._id},${s.userId},"${s.gameName}",${s.score},${s.result},${s.durationSeconds},${s.roundNumber},"${new Date(s.createdAt).toISOString()}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="games-history-${Date.now()}.csv"`);
    res.send(header + rows);
  } catch (err) {
    console.error('games-history export error:', err);
    res.status(500).send('Export failed');
  }
});

export default router;
