// Vercel Serverless Function for Registration
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Generate unique referral code
const generateReferralCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const MONGODB_URI = 'mongodb+srv://bitplaypro:owH5NTgw3PohNY3S@cluster0.gzkzosz.mongodb.net/bitplay-pro &appName=Cluster0';
const JWT_SECRET = 'your-super-secret-jwt-key-for-fake-mining-app-2024';

let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) {
    return cachedClient;
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email and password'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Connect to database
    const client = await connectToDatabase();
    const db = client.db('fakeminingapp');
    const users = db.collection('users');

    // Check if user already exists
    const existingUser = await users.findOne({ email: email.toLowerCase() });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate unique referral code
    let referralCode;
    let isUnique = false;

    while (!isUnique) {
      referralCode = generateReferralCode();
      const existingUser = await users.findOne({ referralCode });
      if (!existingUser) {
        isUnique = true;
      }
    }

    // Validate referral code if provided
    let referrerUser = null;
    const referral_code = req.body.referral_code;
    
    if (referral_code && referral_code.trim()) {
      const referralCodeUpper = referral_code.trim().toUpperCase();
      referrerUser = await users.findOne({ 
        referralCode: referralCodeUpper,
        isActive: true  // Only accept codes from active users
      });
      
      if (!referrerUser) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or inactive referral code'
        });
      }
      
      console.log('Valid referral code found:', referralCodeUpper);
    }

    // Create user
    const newUser = {
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      referralCode,
      referralUsed: referrerUser ? referral_code.trim().toUpperCase() : null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await users.insertOne(newUser);

    // Generate JWT token
    const token = jwt.sign(
      { id: result.insertedId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Log referral tracking
    if (referrerUser) {
      console.log(`New user ${newUser.email} registered with referral code: ${newUser.referralUsed}`);
      console.log(`Referrer: ${referrerUser.email} (ID: ${referrerUser._id})`);
    }

    // Return success response
    res.status(201).json({
      success: true,
      token,
      user: {
        id: result.insertedId,
        name: newUser.name,
        email: newUser.email,
        isActive: newUser.isActive,
        referralCode: newUser.referralCode,
        referralUsed: newUser.referralUsed,
        createdAt: newUser.createdAt
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}
