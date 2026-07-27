// api_routes/lightning-handle.js
import express from "express";
import fs from "fs";
import Client from "lightning-client";
import { requireMobileClient, writeLimiter } from "../../middleware/mobileAuth.js";

const router = express.Router();

const rpcPath = "/home/pi/.lightning/bitcoin";
const lightningAvailable = fs.existsSync(rpcPath);
const client = lightningAvailable ? new Client(rpcPath) : null;

// Changed from GET to POST — GET with body is non-standard and dropped by many proxies
router.post("/pay-invoice", requireMobileClient, writeLimiter, async (req, res) => {
  if (!client) return res.status(503).json({ error: "Lightning Network not available on this server" });
  try {
    const { invoice } = req.body;
    if (!invoice || typeof invoice !== "string" || invoice.trim().length === 0) {
      return res.status(400).json({ error: "Missing or invalid invoice" });
    }

    // Decode invoice
    const decoded = await client.decodepay(invoice);

    // ensure connected to peer
    if (decoded.payee) {
      try {
        await client.connect(decoded.payee);
      } catch (err) {
        // Peer already connected or unreachable — not fatal
      }
    }

    // Pay invoice
    const payment = await client.pay(invoice);

    res.json({
      status: "paid",
      preimage: payment.payment_preimage,
      hash: payment.payment_hash,
      amount_msat: payment.amount_msat,
      fees_msat: payment.fee_msat,
    });
  } catch (err) {
    console.error("Lightning payment failed:", err.message);
    res.status(500).json({ error: "Payment failed" });
  }
});

export default router;
