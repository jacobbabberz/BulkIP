const express = require('express');
const path = require('path');
const { lookupIP } = require('./lib/lookupIP');
const { normalizeResult } = require('./lib/normalizeResult');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory cache: ip -> { result, expiry }
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached(ip) {
  const entry = cache.get(ip);
  if (!entry) return null;
  if (Date.now() > entry.expiry) { cache.delete(ip); return null; }
  return entry.result;
}

function setCached(ip, result) {
  cache.set(ip, { result, expiry: Date.now() + CACHE_TTL_MS });
}

async function processChunk(ips) {
  return Promise.all(
    ips.map(async (ip) => {
      const cached = getCached(ip);
      if (cached) return cached;
      const raw = await lookupIP(ip);
      const result = normalizeResult(ip, raw);
      setCached(ip, result);
      return result;
    })
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/lookup', async (req, res) => {
  const { ips } = req.body;

  if (!Array.isArray(ips) || ips.length === 0) {
    return res.status(400).json({ error: 'ips must be a non-empty array' });
  }

  const deduplicated = [...new Set(ips)].slice(0, 500); // hard cap
  const CHUNK_SIZE = 40;
  const CHUNK_DELAY_MS = 1500;
  const results = [];

  for (let i = 0; i < deduplicated.length; i += CHUNK_SIZE) {
    if (i > 0) await sleep(CHUNK_DELAY_MS);
    const chunk = deduplicated.slice(i, i + CHUNK_SIZE);
    const chunkResults = await processChunk(chunk);
    results.push(...chunkResults);
  }

  res.json({ results });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`BulkIP running at http://localhost:${PORT}`);
  });
}

module.exports = app;
