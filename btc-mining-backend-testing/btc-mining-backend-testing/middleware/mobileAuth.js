import rateLimit from 'express-rate-limit';

/**
 * Verify requests come from the official Bitplaypro mobile app.
 * The app sends x-mobile-client + x-app-id on all /api and /mobile_api requests.
 */
export const requireMobileClient = (req, res, next) => {
  const isMobile = req.headers['x-mobile-client'] === 'true';
  const appId = req.headers['x-app-id'];

  if (!isMobile || appId !== 'bitplay-mobile') {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
};

/** 10 requests per minute per IP — for write endpoints (withdrawal, purchase, 2FA). */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

/** 60 requests per minute per IP — for read endpoints. */
export const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
