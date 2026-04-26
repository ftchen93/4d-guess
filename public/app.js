'use strict';

/* ===== UTILITIES ===== */
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function skeletonCards(n) {
  return Array(n).fill('<div class="skeleton skeleton-card"></div>').join('');
}

async function apiFetch(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ===== TABS ===== */
$$('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach((b) => b.classList.remove('active'));
    $$('.tab-pane').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $(`#tab-${btn.dataset.tab}`).classList.add('active');

    // Lazy-load tab content on first visit
    if (btn.dataset.tab === 'frequency' && !btn.dataset.loaded) {
      btn.dataset.loaded = '1';
      loadFrequency();
    }
    if (btn.dataset.tab === 'hotcold' && !btn.dataset.loaded) {
      btn.dataset.loaded = '1';
      loadHotCold(20);
    }
  });
});

/* ===== TAB 1: RESULTS ===== */
let resultsOffset = 0;
const PAGE = 10;

function renderDrawCard(draw) {
  const starters = (draw.starters || []).map((n) => `<span class="minor-num">${n}</span>`).join('');
  const consolation = (draw.consolation || []).map((n) => `<span class="minor-num">${n}</span>`).join('');
  return `
    <div class="draw-card">
      <div class="draw-card-header">
        <span class="draw-date">${draw.drawDate}</span>
        <span class="draw-no">Draw #${draw.drawNo}</span>
      </div>
      <div class="prize-boxes">
        <div class="prize-box first">
          <div class="prize-label">1st Prize</div>
          <div class="prize-number">${draw.first}</div>
        </div>
        <div class="prize-box second">
          <div class="prize-label">2nd Prize</div>
          <div class="prize-number">${draw.second}</div>
        </div>
        <div class="prize-box third">
          <div class="prize-label">3rd Prize</div>
          <div class="prize-number">${draw.third}</div>
        </div>
      </div>
      <div class="minor-prizes">
        <div class="minor-label">Starters (10)</div>
        <div class="minor-numbers">${starters || '<span style="color:var(--text-dim);font-size:12px">—</span>'}</div>
        <div class="minor-label">Consolation (10)</div>
        <div class="minor-numbers">${consolation || '<span style="color:var(--text-dim);font-size:12px">—</span>'}</div>
      </div>
    </div>`;
}

async function loadResults(append = false) {
  const grid = $('#drawGrid');
  const btn = $('#loadMoreBtn');

  if (!append) {
    grid.innerHTML = skeletonCards(6);
    resultsOffset = 0;
  }

  btn.disabled = true;
  btn.textContent = 'Loading…';

  try {
    const limit = resultsOffset + PAGE;
    const data = await apiFetch(`/api/results?limit=${limit}`);

    updateCacheInfo(data.cacheInfo);

    const draws = data.draws || [];
    if (!append) {
      grid.innerHTML = '';
    } else {
      // Remove previously rendered cards and re-render all up to new limit
      grid.innerHTML = '';
    }
    draws.forEach((draw) => {
      grid.insertAdjacentHTML('beforeend', renderDrawCard(draw));
    });

    resultsOffset += PAGE;
    btn.textContent = 'Load More';
    btn.disabled = resultsOffset >= data.total;
    if (btn.disabled) btn.textContent = 'All results loaded';
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>Failed to load results. ${err.message}</p></div>`;
    btn.disabled = false;
    btn.textContent = 'Retry';
    toast('Failed to load results', 'error');
  }
}

$('#loadMoreBtn').addEventListener('click', () => loadResults(true));

/* ===== TAB 2: FREQUENCY ===== */
let freqState = { prize: 'all', range: 'all' };

function heatColor(pct) {
  if (pct > 0.14) return '#22c55e';
  if (pct > 0.10) return '#84cc16';
  if (pct > 0.07) return '#f59e0b';
  return '#4b5563';
}

function renderHeatmap(digFreq) {
  const positions = ['pos1', 'pos2', 'pos3', 'pos4'];
  const labels = ['Position 1', 'Position 2', 'Position 3', 'Position 4'];

  return positions
    .map((pos, pi) => {
      const counts = digFreq[pos];
      const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
      const maxCount = Math.max(...Object.values(counts));

      const rows = Object.entries(counts)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([digit, cnt]) => {
          const pct = cnt / total;
          const barWidth = maxCount > 0 ? Math.round((cnt / maxCount) * 100) : 0;
          const color = heatColor(pct);
          return `
            <div class="heatmap-row">
              <span class="heatmap-digit">${digit}</span>
              <div class="heatmap-bar-wrap">
                <div class="heatmap-bar" style="width:${barWidth}%;background:${color}"></div>
              </div>
              <span class="heatmap-count">${cnt}</span>
            </div>`;
        })
        .join('');

      return `<div class="heatmap-col">
        <div class="heatmap-pos-label">${labels[pi]}</div>
        ${rows}
      </div>`;
    })
    .join('');
}

function renderFreqTable(numFreq) {
  if (!numFreq || numFreq.length === 0) {
    return '<div class="empty-state"><p>No data available.</p></div>';
  }
  const maxCount = numFreq[0].count;
  const rows = numFreq
    .slice(0, 20)
    .map((item, i) => {
      const barW = Math.round((item.count / maxCount) * 80);
      return `<tr>
        <td>${i + 1}</td>
        <td class="num-cell">${item.number}</td>
        <td>${item.count}<span class="freq-bar-inline" style="width:${barW}px"></span></td>
        <td>${item.lastSeen || '—'}</td>
      </tr>`;
    })
    .join('');

  return `<table class="freq-table">
    <thead><tr><th>Rank</th><th>Number</th><th>Times Drawn</th><th>Last Seen</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function loadFrequency() {
  const heatmap = $('#heatmapGrid');
  const tableWrap = $('#freqTableWrap');
  heatmap.innerHTML = '<div class="skeleton" style="height:200px;grid-column:1/-1"></div>';
  tableWrap.innerHTML = '<div class="skeleton" style="height:300px"></div>';

  try {
    const { prize, range } = freqState;
    const data = await apiFetch(
      `/api/stats/frequency?prizeType=${prize}&range=${range}`
    );
    heatmap.innerHTML = renderHeatmap(data.digitFrequency);
    tableWrap.innerHTML = renderFreqTable(data.numberFrequency);
    updateCacheInfo(data.cacheInfo);
  } catch (err) {
    heatmap.innerHTML = `<div class="empty-state"><p>Error loading data.</p></div>`;
    toast('Failed to load frequency data', 'error');
  }
}

// Frequency filters
$$('[data-freq-prize]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('[data-freq-prize]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    freqState.prize = btn.dataset.freqPrize;
    loadFrequency();
  });
});

$$('[data-freq-range]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('[data-freq-range]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    freqState.range = btn.dataset.freqRange;
    loadFrequency();
  });
});

/* ===== TAB 3: HOT & COLD ===== */
let hcRange = 20;

function renderBadgeGrid(items, type, limit = 60) {
  if (!items || items.length === 0) {
    return '<div class="empty-state" style="padding:20px"><p>No numbers found.</p></div>';
  }
  return items
    .slice(0, limit)
    .map(
      (item) =>
        `<span class="num-badge ${type}" data-number="${item.number}" title="${
          item.count ? `Appeared ${item.count}× in range` : 'Not seen in range'
        }">${item.number}</span>`
    )
    .join('');
}

async function loadHotCold(range) {
  hcRange = range;
  const hotGrid = $('#hotGrid');
  const coldGrid = $('#coldGrid');
  hotGrid.innerHTML = '<span class="skeleton" style="height:32px;width:200px;display:inline-block"></span>';
  coldGrid.innerHTML = '<span class="skeleton" style="height:32px;width:200px;display:inline-block"></span>';

  try {
    const data = await apiFetch(`/api/stats/hotcold?range=${range}`);
    hotGrid.innerHTML = renderBadgeGrid(data.hot, 'hot');
    coldGrid.innerHTML = renderBadgeGrid(data.cold, 'cold', 100);
    updateCacheInfo(data.cacheInfo);

    // Attach click handlers
    $$('.num-badge').forEach((badge) => {
      badge.addEventListener('click', () => openGapModal(badge.dataset.number));
    });
  } catch (err) {
    hotGrid.innerHTML = '<div class="empty-state"><p>Error.</p></div>';
    toast('Failed to load hot/cold data', 'error');
  }
}

$$('[data-hc-range]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('[data-hc-range]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    loadHotCold(parseInt(btn.dataset.hcRange, 10));
  });
});

/* ===== GAP MODAL ===== */
async function openGapModal(number) {
  const modal = $('#gapModal');
  const numEl = $('#modalNumber');
  const statsEl = $('#modalStats');

  numEl.textContent = number;
  statsEl.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  modal.style.display = 'flex';

  try {
    const data = await apiFetch(`/api/lookup?number=${number}`);
    const g = data.gap;
    const overdueClass = g.overdue ? 'overdue' : 'fine';
    statsEl.innerHTML = `
      <div class="stat-row"><span class="stat-key">Total appearances</span><span class="stat-val">${g.appearances}</span></div>
      <div class="stat-row"><span class="stat-key">Avg gap between draws</span><span class="stat-val">${g.avgGap !== null ? g.avgGap + ' draws' : 'N/A'}</span></div>
      <div class="stat-row"><span class="stat-key">Last seen</span><span class="stat-val">${g.lastSeen || 'Never'}</span></div>
      <div class="stat-row"><span class="stat-key">Draws since last seen</span><span class="stat-val">${g.drawsSinceLastSeen}</span></div>
      <div class="stat-row"><span class="stat-key">Overdue?</span><span class="stat-val ${overdueClass}">${g.overdue ? '⚠️ Yes' : '✓ No'}</span></div>
    `;
  } catch {
    statsEl.innerHTML = '<p style="color:var(--text-muted)">Failed to load gap data.</p>';
  }
}

$('#modalClose').addEventListener('click', () => {
  $('#gapModal').style.display = 'none';
});
$('#gapModal').addEventListener('click', (e) => {
  if (e.target === $('#gapModal')) $('#gapModal').style.display = 'none';
});

/* ===== TAB 4: SUGGESTIONS ===== */
function renderSuggestCard(s) {
  return `
    <div class="suggest-card">
      <div class="suggest-number">${s.number}</div>
      <div class="confidence-badge ${s.confidence}">${s.confidence}</div>
      <div class="suggest-reason">${s.reasoning}</div>
    </div>`;
}

async function loadSuggestions() {
  const grid = $('#suggestGrid');
  const disc = $('#suggestDisclaimer');
  const genBtn = $('#generateBtn');
  const regenBtn = $('#regenBtn');

  grid.innerHTML = skeletonCards(10);
  genBtn.disabled = true;
  regenBtn.disabled = true;

  try {
    const data = await apiFetch('/api/suggest?count=10');
    grid.innerHTML = (data.suggestions || []).map(renderSuggestCard).join('');
    disc.textContent = data.disclaimer || '';
    genBtn.style.display = 'none';
    regenBtn.style.display = 'inline-flex';
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><p>Failed to generate suggestions. ${err.message}</p></div>`;
    toast('Suggestion error', 'error');
  } finally {
    genBtn.disabled = false;
    regenBtn.disabled = false;
  }
}

$('#generateBtn').addEventListener('click', loadSuggestions);
$('#regenBtn').addEventListener('click', loadSuggestions);

/* ===== TAB 5: LOOKUP ===== */
function renderLookupResult(data) {
  const g = data.gap;
  const history = data.history || [];

  const statsHtml = `
    <div class="card" style="margin-bottom:16px">
      <div class="section-title">Gap Analysis for ${data.number}</div>
      <div class="stat-row"><span class="stat-key">Total appearances</span><span class="stat-val">${g.appearances}</span></div>
      <div class="stat-row"><span class="stat-key">Avg gap</span><span class="stat-val">${g.avgGap !== null ? g.avgGap + ' draws' : 'N/A'}</span></div>
      <div class="stat-row"><span class="stat-key">Last seen</span><span class="stat-val">${g.lastSeen || 'Never in dataset'}</span></div>
      <div class="stat-row"><span class="stat-key">Draws since last seen</span><span class="stat-val">${g.drawsSinceLastSeen}</span></div>
      <div class="stat-row"><span class="stat-key">Overdue?</span><span class="stat-val ${g.overdue ? 'overdue' : 'fine'}">${g.overdue ? '⚠️ Yes' : '✓ No'}</span></div>
    </div>`;

  const luck =
    g.appearances === 0
      ? 'Never appeared in dataset — a true dark horse!'
      : g.appearances >= 5
      ? 'Frequently appeared — a historically lucky number!'
      : g.appearances >= 2
      ? 'Appeared a few times. Average luck.'
      : 'Only appeared once. Rare!';

  const historyHtml =
    history.length === 0
      ? `<div class="card"><div class="empty-state"><p>This number has never appeared in the dataset.</p></div></div>`
      : `<div class="card">
          <div class="section-title">Draw History (${history.length} appearances)</div>
          <p style="color:var(--accent);font-size:13px;margin-bottom:12px;font-style:italic">${luck}</p>
          ${history
            .map(
              (h) => `
            <div class="history-entry">
              <span style="color:var(--text-muted)">${h.drawDate}</span>
              <span style="color:var(--text-dim);font-size:12px">Draw #${h.drawNo}</span>
              <div>${h.prizes
                .map(
                  (p) =>
                    `<span class="prize-tag ${
                      p.includes('1st') || p.includes('2nd') || p.includes('3rd') ? 'top' : ''
                    }">${p}</span>`
                )
                .join(' ')}</div>
            </div>`
            )
            .join('')}
        </div>`;

  return statsHtml + historyHtml;
}

async function doLookup() {
  const input = $('#lookupInput');
  const result = $('#lookupResult');
  const val = input.value.trim().padStart(4, '0');

  if (!/^\d{4}$/.test(val)) {
    toast('Enter a valid 4-digit number', 'error');
    return;
  }

  result.innerHTML = '<div class="skeleton" style="height:160px;margin-bottom:16px"></div><div class="skeleton" style="height:200px"></div>';

  try {
    const data = await apiFetch(`/api/lookup?number=${val}`);
    result.innerHTML = renderLookupResult(data);
  } catch (err) {
    result.innerHTML = `<div class="empty-state"><p>Lookup failed. ${err.message}</p></div>`;
    toast('Lookup failed', 'error');
  }
}

$('#lookupBtn').addEventListener('click', doLookup);
$('#lookupInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLookup();
});
$('#lookupInput').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
});

/* ===== CACHE INFO ===== */
function updateCacheInfo(info) {
  if (!info) return;
  const el = $('#cacheInfo');
  if (info.lastFetched) {
    const d = new Date(info.lastFetched);
    el.textContent = `${info.count} draws · Updated ${d.toLocaleDateString()}`;
  } else {
    el.textContent = info.count ? `${info.count} draws` : '';
  }
}

/* ===== BOOTSTRAP ===== */
loadResults();
