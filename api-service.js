'use strict';

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const CACHE_FILE = path.join(__dirname, 'cache', 'results-cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Singapore Pools static data files (official, no auth required)
const SP_BASE = 'https://www.singaporepools.com.sg/DataFileArchive/Lottery/Output';
const SP_TOP_DRAWS_URL = `${SP_BASE}/fourd_result_top_draws_en.html`;
const SP_DRAW_LIST_URL = `${SP_BASE}/fourd_result_draw_list_en.html`;
const SP_RESULT_URL = 'https://www.singaporepools.com.sg/en/product/Pages/4d_results.aspx';

const FETCH_TIMEOUT = 12000;
const BATCH_CONCURRENCY = 5;
const MONTHS_HISTORY = 6; // approx 78 draws
const DRAWS_TO_FETCH = 80;

// Ensure cache directory exists
const cacheDir = path.join(__dirname, 'cache');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

let cachedResults = [];
let lastFetchTime = null;

// ── Parsing helpers ──────────────────────────────────────────────────────────

function parseDateStr(raw) {
  // "Sat, 25 Apr 2026" → "25 Apr 2026"
  if (!raw) return '';
  return raw.replace(/^[A-Za-z]+,\s*/, '').trim();
}

// Parse one <li> block (from top-draws file) or the full page (individual draw)
function parseDraw($, root) {
  const drawDate = parseDateStr($(root).find('th.drawDate').first().text().trim());
  const drawNoRaw = $(root).find('th.drawNumber').first().text().trim();
  const drawNo = drawNoRaw.replace(/^Draw No\.\s*/i, '').trim();

  const first = $(root).find('td.tdFirstPrize').first().text().trim();
  const second = $(root).find('td.tdSecondPrize').first().text().trim();
  const third = $(root).find('td.tdThirdPrize').first().text().trim();

  const starters = [];
  $(root).find('tbody.tbodyStarterPrizes td').each((_, td) => {
    const n = $(td).text().trim();
    if (n) starters.push(n.padStart(4, '0'));
  });

  const consolation = [];
  $(root).find('tbody.tbodyConsolationPrizes td').each((_, td) => {
    const n = $(td).text().trim();
    if (n) consolation.push(n.padStart(4, '0'));
  });

  if (!drawNo || !first) return null;

  return {
    drawDate,
    drawNo,
    first: first.padStart(4, '0'),
    second: second.padStart(4, '0'),
    third: third.padStart(4, '0'),
    starters,
    consolation,
  };
}

// ── Network helpers ──────────────────────────────────────────────────────────

async function fetchHtml(url) {
  const res = await fetch(url, {
    timeout: FETCH_TIMEOUT,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SG4DAnalysis/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Batch executor with limited concurrency
async function batchFetch(tasks, concurrency) {
  const results = [];
  let i = 0;
  while (i < tasks.length) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
    i += concurrency;
  }
  return results;
}

// ── Fetch top draws (latest ~5 from Singapore Pools) ───────────────────────

async function fetchTopDraws() {
  const html = await fetchHtml(SP_TOP_DRAWS_URL);
  const $ = cheerio.load(`<ul>${html}</ul>`);
  const draws = [];
  $('li').each((_, li) => {
    const draw = parseDraw($, li);
    if (draw) draws.push(draw);
  });
  return draws;
}

// ── Fetch draw list (all draw numbers + queryStrings) ───────────────────────

async function fetchDrawList() {
  const html = await fetchHtml(SP_DRAW_LIST_URL);
  const $ = cheerio.load(html);
  const entries = [];
  $('option').each((_, opt) => {
    const drawNo = $(opt).attr('value');
    const qs = $(opt).attr('querystring') || $(opt).attr('queryString');
    const dateText = $(opt).text().trim();
    if (drawNo && qs) {
      entries.push({ drawNo, queryString: qs, dateText });
    }
  });
  return entries; // newest first
}

// ── Fetch a single historical draw page ─────────────────────────────────────

async function fetchSingleDraw(queryString) {
  const url = `${SP_RESULT_URL}?${queryString}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  return parseDraw($, $.root());
}

// ── Main data refresh ────────────────────────────────────────────────────────

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(results) {
  fs.writeFileSync(
    CACHE_FILE,
    JSON.stringify({ fetchedAt: Date.now(), results }, null, 2),
    'utf8'
  );
}

async function refreshCache(force = false) {
  const cached = readCache();
  const age = cached ? Date.now() - cached.fetchedAt : Infinity;

  if (!force && cached && age < CACHE_TTL_MS && cached.results.length > 0) {
    cachedResults = cached.results;
    lastFetchTime = cached.fetchedAt;
    console.log(`[cache] Loaded ${cachedResults.length} draws from disk.`);
    return;
  }

  console.log('[cache] Fetching data from Singapore Pools...');

  try {
    // Step 1: Get the latest 5 draws quickly
    const topDraws = await fetchTopDraws();
    const knownDrawNos = new Set(topDraws.map((d) => d.drawNo));
    console.log(`[cache] Fetched ${topDraws.length} latest draws.`);

    // Step 2: Get draw list to fill historical data
    const drawList = await fetchDrawList();
    console.log(`[cache] Draw list has ${drawList.length} entries.`);

    // Step 3: Fetch individual draws not already in topDraws (up to DRAWS_TO_FETCH)
    const toFetch = drawList
      .filter((e) => !knownDrawNos.has(e.drawNo))
      .slice(0, DRAWS_TO_FETCH - topDraws.length);

    console.log(`[cache] Fetching ${toFetch.length} historical draws...`);

    const historical = await batchFetch(
      toFetch.map((entry) => () => fetchSingleDraw(entry.queryString)),
      BATCH_CONCURRENCY
    );

    const allDraws = [...topDraws, ...historical].filter(Boolean);

    // Sort newest first by draw number (numeric)
    allDraws.sort((a, b) => Number(b.drawNo) - Number(a.drawNo));

    if (allDraws.length > 0) {
      cachedResults = allDraws;
      lastFetchTime = Date.now();
      writeCache(allDraws);
      console.log(`[cache] Cached ${allDraws.length} draws.`);
    } else {
      throw new Error('No draws fetched from Singapore Pools');
    }
  } catch (err) {
    console.error('[cache] Fetch error:', err.message);
    if (cached && cached.results.length > 0) {
      cachedResults = cached.results;
      lastFetchTime = cached.fetchedAt;
      console.warn('[cache] Serving stale cache as fallback.');
    } else {
      console.warn('[cache] No data available.');
    }
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
      'Data sourced from Singapore Pools official website. Not affiliated with or endorsed by Singapore Pools Pte Ltd.',
  };
}

// Auto-refresh every 24 hours at 06:00
cron.schedule('0 6 * * *', () => {
  console.log('[cron] Daily refresh triggered.');
  refreshCache(true).catch(console.error);
});

module.exports = { refreshCache, getResults, getCacheInfo };
