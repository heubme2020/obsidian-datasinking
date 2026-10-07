# Release Notes

## 0.1.1 (2026-10-07) — Fix review + report picker

- **Fix**: add `versions.json` (required by the community directory review — this is why 0.1.0 was rejected).
- **Pick any report** — the fetch command now takes an index: `-1` = latest, `-2` = 2nd latest, `-3` = 3rd latest (blank = latest).
- **Website links** — added "Visit datasink.ing" links in the modals and settings.

## 0.1.0 (2026-10-07) — Initial release

**DataSinking for Obsidian** — pull full-text financial reports into your vault as clean Markdown notes.

Features:

- **Fetch latest report by symbol** — type an FMP-style ticker (`600519.SS`, `7203.T`, `005930.KS`, `2330.TW`), get the latest full-text report as a note.
- **Batch download** — paste a comma-separated list of symbols, download each latest report.
- **No key needed to start** — uses the public quota (31 documents / 7 days / IP).
- **Bring your own key** — paste a free API key (8,191 documents / 7 days) in Settings to unlock more; yearly key for 524,287 / 7 days.

Coverage: US (SEC EDGAR), UK, China (A-shares), Japan, Korea, Taiwan.
