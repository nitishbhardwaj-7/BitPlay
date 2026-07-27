import express from 'express';
import axios from 'axios';
import { trackReferralSignup } from '../services/apptroveService.js';

const router = express.Router();

// Mobile backend URL (bitcoin_mining/backend server)
const MOBILE_BACKEND_URL = process.env.MOBILE_BACKEND_URL || 'http://localhost:5000';

// Signup path patterns used by the mobile backend — adjust if the path changes
const SIGNUP_PATHS = ['/auth/register', '/auth/signup', '/register', '/signup', '/users/register'];

// Proxy all requests to mobile backend
router.all('/*', async (req, res) => {
  try {
    // Remove /mobile_api prefix and keep the rest of the path
    const targetPath = req.originalUrl.replace('/mobile_api', '');
    const targetUrl = `${MOBILE_BACKEND_URL}${targetPath}`;

    console.log(`Proxying request: ${req.method} ${req.originalUrl} -> ${targetUrl}`);

    // Snapshot signup body before proxying (body stream consumed once)
    const isSignupRoute = req.method === 'POST' && SIGNUP_PATHS.some(p => targetPath.startsWith(p));
    const signupBody = isSignupRoute ? { ...req.body } : null;

    // Prepare request config
    const config = {
      method: req.method,
      url: targetUrl,
      headers: {
        ...req.headers,
        host: new URL(MOBILE_BACKEND_URL).host,
      },
      data: req.body,
      params: req.query,
      validateStatus: () => true,
    };

    // Remove headers that shouldn't be forwarded
    delete config.headers['content-length'];
    delete config.headers['host'];

    // Make the proxied request
    const response = await axios(config);

    // referral_signup — fire after a successful signup that included a referral code
    if (isSignupRoute && response.status >= 200 && response.status < 300 && signupBody?.referralCode) {
      const data = response.data || {};
      const userId = data.user?._id || data.userId || data.user?.id || null;
      trackReferralSignup({
        userId,
        referralCode: signupBody.referralCode,
        referralOwnerId: null, // resolved server-side in referralRewardService
        platform: signupBody.platform || null,
        appVersion: signupBody.appVersion || null,
        country: signupBody.country || null,
      });
    }

    // Forward the response
    res.status(response.status);

    // Forward response headers (except some that shouldn't be forwarded)
    Object.keys(response.headers).forEach(key => {
      if (!['connection', 'transfer-encoding', 'content-encoding'].includes(key.toLowerCase())) {
        res.set(key, response.headers[key]);
      }
    });

    res.send(response.data);
  } catch (error) {
    console.error('Mobile API proxy error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Proxy error: Unable to reach mobile backend',
      error: error.message,
    });
  }
});

export default router;
