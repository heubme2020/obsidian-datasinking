# DataSinking for Obsidian

Pull **full-text financial reports** (annual, semi-annual, quarterly, 10-K) into your vault as clean Markdown notes — headings, tables and unit notes preserved, ready for reading and linking.

Coverage: US (SEC EDGAR), UK, China (A-shares), Japan, Korea, Taiwan.

## Features

- **Smart search** — type a company name (`Toyota`, `Apple`, `Microsoft`) or a ticker (`7203.T`, `AAPL`, `600519.SS`, `005930.KS`, `2330.TW`). It finds the matching stocks, lists all their financial reports (annual, semi-annual, quarterly), and clicking any one saves it into your vault as a Markdown note.
- **Free tier** — no key needed to try it: 31 reports / 7 days / IP.
- **Your own key** — grab a free API key at [datasink.ing](https://datasink.ing) (no signup required) and paste it in Settings → DataSinking to unlock 8,191 reports / 7 days.

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

**Earn $7 every purchase per referral** — recurring, PayPal, $31 minimum withdrawal: https://datasink.ing/affiliate
