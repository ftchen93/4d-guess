'use strict';

const DISCLAIMER =
  'For entertainment only. 4D is random. No prediction guarantees any win.';

// Collect all numbers from a draw object based on prizeType
function getNumbersFromDraw(draw, prizeType) {
  const nums = [];
  if (prizeType === 'top3' || prizeType === 'all') {
    nums.push(draw.first, draw.second, draw.third);
  }
  if (prizeType === 'starters' || prizeType === 'all') {
    nums.push(...(draw.starters || []));
  }
  if (prizeType === 'consolation' || prizeType === 'all') {
    nums.push(...(draw.consolation || []));
  }
  return nums.filter(Boolean);
}

// Function 1: Digit frequency per position (pos1–pos4)
function digitFrequency(results) {
  const positions = { pos1: {}, pos2: {}, pos3: {}, pos4: {} };
  for (const key of Object.keys(positions)) {
    for (let d = 0; d <= 9; d++) positions[key][d] = 0;
  }

  for (const draw of results) {
    const allNums = getNumbersFromDraw(draw, 'all');
    for (const num of allNums) {
      if (!num || num.length !== 4) continue;
      positions.pos1[num[0]]++;
      positions.pos2[num[1]]++;
      positions.pos3[num[2]]++;
      positions.pos4[num[3]]++;
    }
  }

  return positions;
}

// Function 2: Number frequency
function numberFrequency(results, prizeType = 'all') {
  const freq = {};
  const lastSeen = {};

  for (const draw of results) {
    const nums = getNumbersFromDraw(draw, prizeType);
    for (const num of nums) {
      if (!num) continue;
      freq[num] = (freq[num] || 0) + 1;
      if (!lastSeen[num]) lastSeen[num] = draw.drawDate;
    }
  }

  return Object.entries(freq)
    .map(([number, count]) => ({ number, count, lastSeen: lastSeen[number] }))
    .sort((a, b) => b.count - a.count);
}

// Function 3: Hot & cold numbers
function hotColdNumbers(results, range = 30) {
  const recent = results.slice(0, range);
  const freq = {};

  for (const draw of recent) {
    const allNums = getNumbersFromDraw(draw, 'all');
    for (const num of allNums) {
      if (!num) continue;
      freq[num] = (freq[num] || 0) + 1;
    }
  }

  const allSeen = new Set(Object.keys(freq));

  // Cold: numbers that appeared in the full dataset but not in the recent window
  const allHistoric = new Set();
  for (const draw of results) {
    for (const num of getNumbersFromDraw(draw, 'all')) {
      if (num) allHistoric.add(num);
    }
  }

  const hot = Object.entries(freq)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([number, count]) => ({ number, count }));

  const cold = [...allHistoric]
    .filter((n) => !allSeen.has(n))
    .map((number) => ({ number }));

  return { hot, cold };
}

// Function 4: Gap analysis for a specific number
function gapAnalysis(results, number) {
  const appearances = [];

  for (let i = 0; i < results.length; i++) {
    const draw = results[i];
    const allNums = getNumbersFromDraw(draw, 'all');
    if (allNums.includes(number)) {
      appearances.push({ index: i, drawDate: draw.drawDate, drawNo: draw.drawNo });
    }
  }

  if (appearances.length === 0) {
    return {
      number,
      appearances: 0,
      avgGap: null,
      lastSeen: null,
      drawsSinceLastSeen: results.length,
      overdue: false,
    };
  }

  const gaps = [];
  for (let i = 1; i < appearances.length; i++) {
    gaps.push(appearances[i].index - appearances[i - 1].index);
  }

  const avgGap = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  const lastSeenIndex = appearances[0].index;
  const drawsSinceLastSeen = lastSeenIndex; // index 0 is newest

  return {
    number,
    appearances: appearances.length,
    avgGap: avgGap !== null ? Math.round(avgGap) : null,
    lastSeen: appearances[0].drawDate,
    drawsSinceLastSeen,
    overdue: avgGap !== null && drawsSinceLastSeen > avgGap,
  };
}

// Function 5: Digit pattern analysis
function digitPattern(results) {
  const sums = [];
  const oddEvenCounts = { odd: 0, even: 0 };

  for (const draw of results) {
    const allNums = getNumbersFromDraw(draw, 'all');
    for (const num of allNums) {
      if (!num || num.length !== 4) continue;
      const digits = num.split('').map(Number);
      const sum = digits.reduce((a, b) => a + b, 0);
      sums.push(sum);
      for (const d of digits) {
        if (d % 2 === 0) oddEvenCounts.even++;
        else oddEvenCounts.odd++;
      }
    }
  }

  if (sums.length === 0) {
    return { avgSum: 0, commonSumRange: [0, 36], oddEvenRatio: 1 };
  }

  const avgSum = sums.reduce((a, b) => a + b, 0) / sums.length;
  const sorted = [...sums].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];

  return {
    avgSum: Math.round(avgSum * 10) / 10,
    commonSumRange: [q1, q3],
    oddEvenRatio:
      oddEvenCounts.even > 0
        ? Math.round((oddEvenCounts.odd / oddEvenCounts.even) * 100) / 100
        : null,
  };
}

// Function 6: Generate suggestions
function generateSuggestions(results, count = 10) {
  const recentWindow = results.slice(0, 60);

  // a) Most frequent digit per position from recent 60 draws (weight: pick top 3 digits)
  const posFreq = digitFrequency(recentWindow);
  const topDigits = {};
  for (const [pos, counts] of Object.entries(posFreq)) {
    topDigits[pos] = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([d]) => d);
  }

  // b) Overdue numbers from gap analysis
  const allNumbers = new Set();
  for (const draw of results) {
    for (const num of getNumbersFromDraw(draw, 'all')) {
      if (num) allNumbers.add(num);
    }
  }
  const overdueNumbers = [...allNumbers]
    .map((n) => gapAnalysis(results, n))
    .filter((g) => g.overdue && g.avgGap !== null)
    .sort((a, b) => b.drawsSinceLastSeen - a.drawsSinceLastSeen)
    .slice(0, 20);

  // c) Weighted random using full digit frequency distribution
  const allFreq = digitFrequency(results);

  function weightedPickDigit(posKey) {
    const counts = allFreq[posKey];
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [digit, cnt] of Object.entries(counts)) {
      r -= cnt;
      if (r <= 0) return digit;
    }
    return '0';
  }

  function buildRandomNumber() {
    return (
      weightedPickDigit('pos1') +
      weightedPickDigit('pos2') +
      weightedPickDigit('pos3') +
      weightedPickDigit('pos4')
    );
  }

  function isHotPattern(num) {
    return (
      topDigits.pos1.includes(num[0]) &&
      topDigits.pos2.includes(num[1]) &&
      topDigits.pos3.includes(num[2]) &&
      topDigits.pos4.includes(num[3])
    );
  }

  const suggestions = [];
  const seen = new Set();

  // Fill with overdue numbers first (30% weight → up to 3 slots)
  for (const gap of overdueNumbers) {
    if (suggestions.length >= Math.ceil(count * 0.3)) break;
    const num = gap.number;
    if (seen.has(num)) continue;
    seen.add(num);
    const hot = isHotPattern(num);
    suggestions.push({
      number: num,
      reasoning: `Overdue by ${gap.drawsSinceLastSeen} draws (avg gap: ${gap.avgGap}). ${hot ? 'Matches frequent digit pattern.' : ''}`.trim(),
      confidence: hot ? 'high' : 'medium',
    });
  }

  // Fill hot-pattern numbers (40% weight → up to 4 slots)
  let attempts = 0;
  while (suggestions.filter((s) => s.confidence === 'high').length < Math.ceil(count * 0.4) && attempts < 500) {
    attempts++;
    const num =
      topDigits.pos1[Math.floor(Math.random() * topDigits.pos1.length)] +
      topDigits.pos2[Math.floor(Math.random() * topDigits.pos2.length)] +
      topDigits.pos3[Math.floor(Math.random() * topDigits.pos3.length)] +
      topDigits.pos4[Math.floor(Math.random() * topDigits.pos4.length)];
    if (seen.has(num)) continue;
    seen.add(num);
    const gap = gapAnalysis(results, num);
    suggestions.push({
      number: num,
      reasoning: `Frequent digit pattern in positions 1-4 over last 60 draws.${gap.overdue ? ` Also overdue by ${gap.drawsSinceLastSeen} draws.` : ''}`,
      confidence: gap.overdue ? 'high' : 'medium',
    });
  }

  // Fill remaining with weighted random (30%)
  attempts = 0;
  while (suggestions.length < count && attempts < 500) {
    attempts++;
    const num = buildRandomNumber();
    if (seen.has(num)) continue;
    seen.add(num);
    suggestions.push({
      number: num,
      reasoning: 'Weighted random pick based on historical digit frequency distribution.',
      confidence: 'low',
    });
  }

  return {
    suggestions: suggestions.slice(0, count),
    disclaimer: DISCLAIMER,
  };
}

// Function 7: Recent results
function recentResults(results, n = 10) {
  return results.slice(0, n);
}

module.exports = {
  digitFrequency,
  numberFrequency,
  hotColdNumbers,
  gapAnalysis,
  digitPattern,
  generateSuggestions,
  recentResults,
};
