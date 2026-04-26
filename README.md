# SG 4D Analysis

A Singapore 4D lottery statistics and analysis website. Node.js + Express backend, vanilla HTML/CSS/JS frontend.

## Quick Start

```bash
npm install
node server.js
```

Then open http://localhost:3000

## Features

- **Latest Results** — View the most recent 4D draws with 1st/2nd/3rd prizes, starters, and consolation numbers
- **Frequency Analysis** — Digit frequency heatmaps per position + most drawn numbers table, filterable by prize type and date range
- **Hot & Cold Numbers** — See which numbers have appeared frequently (hot) or gone cold over a chosen draw window
- **Suggested Numbers** — Statistically derived picks with confidence levels *(entertainment only)*
- **Number Lookup** — Full draw history and gap analysis for any 4-digit number

## Data Source

Historical draw data is fetched from **4dyes.com**, a free unofficial REST API used by open-source 4D projects. This site is **not affiliated with or endorsed by Singapore Pools**.

Data is cached locally to `cache/results-cache.json` and refreshed automatically every 24 hours (daily at 06:00 server time via node-cron). Approximately 6 months of draw history is fetched on startup.

## Force Refresh

To manually trigger a cache refresh, visit:

```
http://localhost:3000/api/refresh
```

Or via curl:

```bash
curl http://localhost:3000/api/refresh
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | HTTP port   |

## Important Disclaimer

> **The "Suggested Numbers" feature is for entertainment purposes only.**
> 4D draws are random events. Statistical patterns from past draws have no predictive power over future draws. Nothing on this site constitutes gambling advice. Please gamble responsibly.
