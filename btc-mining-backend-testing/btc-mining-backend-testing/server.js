import express from 'express';
import path from 'path';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import morgan from 'morgan';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { fileURLToPath } from 'url';
import adminRoutes from './routes/admin.js';
import apiRoutes from './routes/api.js';
import mobileApiProxy from './routes/mobile-api-proxy.js';
import revenueCatWebhook from './webhooks/revenuecat.js';
import tables_check from './helpers/create_tables.js';
import connectAlchemyWS from './webhooks/alchemyWatcher.js';
import { connectBTCWatcher } from "./webhooks/btcWatcher.js";
import "./cronJobs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '.env') });
// dotenv.config({ path: "/home/pi/bitcoin_mining_backend/.env" });

const app = express();

await connectDB();

try { await connectAlchemyWS(); } catch (e) { console.warn('[WARN] Alchemy WS failed to connect:', e.message); }

await tables_check();

if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET env var is required');
const sessionSecret = process.env.SESSION_SECRET;

// Request logger
app.use(morgan('combined'));

// Security middleware
app.use(helmet());

// Compress all JSON/text responses — reduces payload size by 60-80%
app.use(compression());

// CORS — allow all origins if ALLOWED_ORIGINS not set (open for dev/unset environments)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : true;
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Session middleware — persisted in MongoDB (survives restarts + deploys)
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60,
    autoRemove: 'native',
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Root route - redirect to admin login
app.get('/', (req, res) => {
  res.redirect('/admin/login');
});

// Routes
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);
app.use('/mobile_api', mobileApiProxy);
app.use('/webhooks/revenuecat', revenueCatWebhook);

// Handle 404
app.use('*', (req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// Global error handler — catches unhandled errors, prevents process crash
app.use((err, req, res, _next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

const PORT = process.env.PORT || process.env.ADMIN_PORT || 3001;

app.listen(PORT, () => {
  console.log(`Admin Panel running on port ${PORT}`);
  connectBTCWatcher().catch(err => console.error("BTC watcher fail:", err));
});

export default app;
