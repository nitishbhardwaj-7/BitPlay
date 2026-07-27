const mongoose = require('mongoose');
const User = require('../models/User');

const generateReferralCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

async function updateReferralCode(userId, newReferralCode) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid userId");
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { referralCode: newReferralCode },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      throw new Error("User not found");
    }

    return updatedUser;
  } catch (err) {
    if (err.code === 11000) {
      throw new Error("Referral code already exists");
    }
    throw err;
  }
}

// Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  // Create token
  const token = user.getSignedJwtToken();

  const options = {
    expires: new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    ),
    httpOnly: true
  };

  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }

  var refferal_code = user.referralCode;

  console.log("User Referral Code: ", refferal_code);

  if (user.referralCode === undefined || user.referralCode === '') {
    refferal_code = generateReferralCode();
  } else {
    console.log("Referral Code Exist!! ", refferal_code);
  }

  updateReferralCode(user._id, refferal_code);

  res.status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isActive: user.isActive,
        referralCode: refferal_code,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        twofactor: user.TwoFactorAuth
      }
    });
};

module.exports = sendTokenResponse;
