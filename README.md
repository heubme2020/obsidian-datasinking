# DataSinking for Obsidian

Pull **full-text financial reports** (annual, semi-annual, quarterly, 10-K) into your vault as clean Markdown notes — headings, tables and unit notes preserved, ready for reading and linking.

Coverage: US (SEC EDGAR), UK, China (A-shares), Japan, Korea, Taiwan.

## Features

- **Fetch latest report by symbol** — type a FMP-style ticker (`600519.SS`, `7203.T`, `005930.KS`, `2330.TW`), get the latest full-text report as a note.
- **Batch download** — paste a comma-separated list of symbols, download each latest report.
- **Free tier** — no key needed to try it; the shared free quota is small.
- **Your own key** — grab a free API key at [datasink.ing](https://datasink.ing) (no signup required) and paste it in Settings → DataSinking to unlock 8,191 docs / 7 days.

## Install

Once listed in the Obsidian community plugins: Settings → Community plugins → browse → "DataSinking".

Manual: copy `main.js`, `manifest.json` and `styles.css` into your vault's `.obsidian/plugins/datasinking/` folder.

## Build

```bash
npm install
npm run build
```

## Pricing

- Free key: 8,191 documents / 7 days
- Yearly: 524,287 documents / 7 days (see [datasink.ing/pricing](https://datasink.ing/pricing))
