const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const CACHE_FILE = path.join(__dirname, 'cache', 'results-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const API_BASE = 'https://www.4dyes.com/api';

// Ensure cache directory exists
const cacheDir = path.join(__dirname, 'cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

let cachedResults = [];
let lastFetchTime = null;

function pad4(n) {
  return String(n).padStart(4, '0');
}

function parseDraws(rawData) {
  if (!Array.isArray(rawData)) return [];
  return rawData
    .map((draw) => {
      try {
        // 4dyes API shape: { date, drawno, 1st, 2nd, 3rd, starter: [...], consolation: [...] }
        const starters = (draw.starter || draw.starters || [])
          .slice(0, 10)
          .map(pad4);
        const consolation = (draw.consolation || [])
          .slice(0, 10)
          .map(pad4);
        return {
          drawDate: draw.date || draw.drawDate || '',
          drawNo: String(draw.drawno || draw.drawNo || ''),
          first: pad4(draw['1st'] || draw.first || '0000'),
          second: pad4(draw['2nd'] || draw.second || '0000'),
          third: pad4(draw['3rd'] || draw.third || '0000'),
          starters,
          consolation,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(data) {
  const payload = { fetchedAt: Date.now(), results: data };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

async function fetchFromAPI() {
  // Attempt to fetch last ~6 months of results (≈78 draws, 3 draws/week)
  // 4dyes API: GET /api?company=STC&year=YYYY&month=MM
  const results = [];
  const now = new Date();

  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const url = `${API_BASE}?company=STC&year=${year}&month=${month}`;

    try {
      const res = await fetch(url, { timeout: 10000 });
      if (!res.ok) continue;
      const json = await res.json();
      const draws = parseDraws(Array.isArray(json) ? json : json.data || json.results || []);
      results.push(...draws);
    } catch {
      // silently continue — will serve from cache if all months fail
    }
  }

  return results;
}

async function refreshCache(force = false) {
  const cached = readCache();
  const age = cached ? Date.now() - cached.fetchedAt : Infinity;

  if (!force && cached && age < CACHE_TTL_MS && cached.results.length > 0) {
    cachedResults = cached.results;
    lastFetchTime = cached.fetchedAt;
    console.log(`[cache] Loaded ${cachedResults.length} draws from disk cache.`);
    return;
  }

  console.log('[cache] Fetching fresh data from 4dyes API...');
  const fresh = await fetchFromAPI();

  if (fresh.length > 0) {
    // Sort newest first
    fresh.sort((a, b) => (b.drawDate > a.drawDate ? 1 : -1));
    cachedResults = fresh;
    lastFetchTime = Date.now();
    writeCache(fresh);
    console.log(`[cache] Cached ${fresh.length} draws.`);
  } else if (cached && cached.results.length > 0) {
    cachedResults = cached.results;
    lastFetchTime = cached.fetchedAt;
    console.warn('[cache] API unreachable — serving stale cache.');
  } else {
    console.warn('[cache] No data available from API or disk.');
  }
}

function getResults() {
  return cachedResults;
}

function getCacheInfo() {
  return {
    count: cachedResults.length,
    lastFetched: lastFetchTime ? new Date(lastFetchTime).toISOString() : null,
    disclaimer:
      'Data sourced from an unofficial third-party API (4dyes.com). Not affiliated with or endorsed by Singapore Pools.',
  };
}

// Auto-refresh every 24 hours
cron.schedule('0 6 * * *', () => {
  console.log('[cron] Daily cache refresh triggered.');
  refreshCache(true).catch(console.error);
});

module.exports = { refreshCache, getResults, getCacheInfo };
