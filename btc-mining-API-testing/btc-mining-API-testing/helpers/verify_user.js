// Utility script: manually verify a user's email by email address.
// Usage: node helpers/verify_user.js <email>
// Requires MONGODB_URI in environment (.env in project root).

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const User = require('../models/User');

const verifyUserEmail = async (email) => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  if (!email) {
    console.error('Usage: node helpers/verify_user.js <email>');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log(`No user found with email: ${email}`);
      return;
    }

    if (!user.emailVerified) {
      user.emailVerified = true;
      await user.save();
      console.log(`Email verified for ${email}`);
    } else {
      console.log(`Email already verified for ${email}`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  }
};

verifyUserEmail(process.argv[2]);
