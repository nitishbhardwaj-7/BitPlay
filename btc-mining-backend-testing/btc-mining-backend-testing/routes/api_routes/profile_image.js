import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { requireMobileClient, writeLimiter } from '../../middleware/mobileAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const PROFILES_DIR = path.join(__dirname, '../../public/images/profiles');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PROFILES_DIR),
  filename: (req, file, cb) => {
    const userId = req.body.userId || req.query.userId || 'unknown';
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${userId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  },
});

// POST /api/profile-image/upload
router.post('/upload', requireMobileClient, writeLimiter, upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }

    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const imageUrl = `/images/profiles/${req.file.filename}`;

    // Persist to MongoDB users collection
    try {
      const usersCollection = mongoose.connection.db.collection('users');
      const { ObjectId } = mongoose.Types;
      await usersCollection.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { profileImage: imageUrl, updatedAt: new Date() } }
      );
    } catch (dbErr) {
      console.error('Profile image DB update error:', dbErr.message);
      // Still return success — image is saved to disk
    }

    return res.json({ success: true, profileImage: imageUrl });
  } catch (err) {
    console.error('Profile image upload error:', err.message);
    return res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// GET /api/profile-image/:userId
router.get('/:userId', requireMobileClient, async (req, res) => {
  try {
    const { userId } = req.params;
    const usersCollection = mongoose.connection.db.collection('users');
    const { ObjectId } = mongoose.Types;
    const user = await usersCollection.findOne(
      { _id: new ObjectId(userId) },
      { projection: { profileImage: 1 } }
    );
    return res.json({ success: true, profileImage: user?.profileImage || null });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to fetch profile image' });
  }
});

export default router;
