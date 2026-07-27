import axios from 'axios';

let cachedUsdPrice: number | null = null;
let cachedAtMs = 0;
let inFlight: Promise<number> | null = null;

async function fetchFromCoinGecko(): Promise<number> {
  const res = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
    params: { ids: 'bitcoin', vs_currencies: 'usd' },
  });
  const price = Number(res?.data?.bitcoin?.usd);
  return Number.isFinite(price) ? price : 0;
}

async function fetchFromBinance(): Promise<number> {
  // Public endpoint (no API key)
  const res = await axios.get('https://api.binance.com/api/v3/ticker/price', {
    params: { symbol: 'BTCUSDT' },
  });
  const price = Number(res?.data?.price);
  return Number.isFinite(price) ? price : 0;
}

/**
 * BTC→USD price with caching + rate-limit protection.
 *
 * - Caches for `ttlMs` (default 60s).
 * - Dedupes concurrent requests (inFlight).
 * - On 429 or network errors, falls back to Binance, then to cached value, then 0.
 *
 * IMPORTANT: This function should never throw (so screens don't crash on 429).
 */
export async function getBtcUsdPriceCached(ttlMs: number = 60_000): Promise<number> {
  const now = Date.now();
  if (cachedUsdPrice != null && now - cachedAtMs < ttlMs) return cachedUsdPrice;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const price = await fetchFromCoinGecko();
      if (price > 0) {
        cachedUsdPrice = price;
        cachedAtMs = Date.now();
        return price;
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        console.warn('[BTC Price] CoinGecko rate-limited (429).');
      } else {
        console.warn('[BTC Price] CoinGecko fetch failed:', err?.message ?? err);
      }
    }

    // Fallback
    try {
      const price = await fetchFromBinance();
      if (price > 0) {
        cachedUsdPrice = price;
        cachedAtMs = Date.now();
        return price;
      }
    } catch (err: any) {
      console.warn('[BTC Price] Binance fetch failed:', err?.message ?? err);
    }

    return cachedUsdPrice ?? 0;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

