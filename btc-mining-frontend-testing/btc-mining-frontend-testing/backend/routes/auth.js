const express = require('express');
const {
  register,
  login,
  socialLogin,
  getMe,
  forgotPassword,
  resetPassword,
  updatePasswordDirect,
  logout,
  verifyEmail,
  verifyEmailOTP,
  resendEmailVerification,
  updateProfile
} = require('../controllers/authController');

const auth = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/social-login', socialLogin);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:resettoken', resetPassword);
router.post('/update-password-direct', updatePasswordDirect); // For testing purposes
router.get('/verify-email/:token', verifyEmail);
router.get('/verify-email-otp/:otp/:email', verifyEmailOTP);
router.post('/resend-verification', resendEmailVerification);

// Protected routes
router.get('/me', auth, getMe);
router.get('/logout', auth, logout);
router.put('/update-profile', auth, updateProfile);

module.exports = router;
