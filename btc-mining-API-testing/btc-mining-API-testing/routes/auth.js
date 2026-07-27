const express = require('express');
const {
  register,
  login,
  socialLogin,
  getMe,
  forgotPassword,
  resetPassword,
  logout,
  verifyEmail,
  verifyEmailOTP,
  resendEmailVerification,
  updateProfile,
  updateemailotp,
  updateemail,
  TwoFactorOTP,
  VerifyTwoFaOTP
} = require('../controllers/authController');


const auth = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// Escape regex special characters to prevent ReDoS
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/referrals', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, message: 'Referral code is required' });
    }

    const safeCode = escapeRegex(code.trim());

    const count = await User.countDocuments({
      referralUsed: { $regex: `^${safeCode}$`, $options: 'i' },
      isActive: true
    });

    res.json({ success: true, referralCode: code, count });
  } catch (error) {
    console.error('Fetching error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch user referrals' });
  }
});

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/social-login', socialLogin);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:resettoken', resetPassword);
router.get('/verify-email/:token', verifyEmail);
router.get('/verify-email-otp/:otp/:email', verifyEmailOTP);
router.post('/resend-verification', resendEmailVerification);
router.post('/update-email-otp', updateemailotp);
router.post('/update-email', updateemail);
router.post('/two-factor-otp', TwoFactorOTP);
router.post('/verify-twofactorotp', VerifyTwoFaOTP);

// Protected routes
router.put('/update-profile', auth, updateProfile);
router.get('/me', auth, getMe);
router.get('/logout', auth, logout);

module.exports = router;
