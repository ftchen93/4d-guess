'use strict';

const express = require('express');
const path = require('path');
const { refreshCache, getResults, getCacheInfo } = require('./api-service');
const {
  digitFrequency,
  numberFrequency,
  hotColdNumbers,
  gapAnalysis,
  digitPattern,
  generateSuggestions,
  recentResults,
} = require('./analysis-engine');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// GET /api/results?limit=20
app.get('/api/results', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 200);
  const results = getResults();
  res.json({
    draws: recentResults(results, limit),
    total: results.length,
    cacheInfo: getCacheInfo(),
  });
});

// GET /api/stats/frequency?prizeType=all&range=all
app.get('/api/stats/frequency', (req, res) => {
  const { prizeType = 'all', range } = req.query;
  let results = getResults();
  if (range && range !== 'all') {
    const n = parseInt(range, 10);
    if (!isNaN(n)) results = results.slice(0, n);
  }
  res.json({
    digitFrequency: digitFrequency(results),
    numberFrequency: numberFrequency(results, prizeType).slice(0, 100),
    cacheInfo: getCacheInfo(),
  });
});

// GET /api/stats/hotcold?range=30
app.get('/api/stats/hotcold', (req, res) => {
  const range = parseInt(req.query.range, 10) || 30;
  const results = getResults();
  res.json({
    ...hotColdNumbers(results, range),
    range,
    cacheInfo: getCacheInfo(),
  });
});

// GET /api/stats/patterns
app.get('/api/stats/patterns', (req, res) => {
  const results = getResults();
  res.json({
    ...digitPattern(results),
    cacheInfo: getCacheInfo(),
  });
});

// GET /api/suggest?count=10
app.get('/api/suggest', (req, res) => {
  const count = Math.min(parseInt(req.query.count, 10) || 10, 20);
  const results = getResults();
  if (results.length === 0) {
    return res.status(503).json({ error: 'No data available. Try again later.' });
  }
  res.json(generateSuggestions(results, count));
});

// GET /api/lookup?number=1234
app.get('/api/lookup', (req, res) => {
  const { number } = req.query;
  if (!number || !/^\d{4}$/.test(number)) {
    return res.status(400).json({ error: 'Provide a valid 4-digit number (0000–9999).' });
  }
  const results = getResults();
  const padded = number.padStart(4, '0');
  const gap = gapAnalysis(results, padded);

  // Find all appearances with prize type
  const history = [];
  for (const draw of results) {
    const prizes = [];
    if (draw.first === padded) prizes.push('1st Prize');
    if (draw.second === padded) prizes.push('2nd Prize');
    if (draw.third === padded) prizes.push('3rd Prize');
    if ((draw.starters || []).includes(padded)) prizes.push('Starter');
    if ((draw.consolation || []).includes(padded)) prizes.push('Consolation');
    if (prizes.length > 0) {
      history.push({ drawDate: draw.drawDate, drawNo: draw.drawNo, prizes });
    }
  }

  res.json({ number: padded, gap, history });
});

// GET /api/refresh — force cache refresh
app.get('/api/refresh', async (req, res) => {
  try {
    await refreshCache(true);
    res.json({ ok: true, cacheInfo: getCacheInfo() });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Serve SPA for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Boot
refreshCache()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`4D Analysis server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialise cache:', err);
    app.listen(PORT, () => {
      console.log(`4D Analysis server running (no data) at http://localhost:${PORT}`);
    });
  });
