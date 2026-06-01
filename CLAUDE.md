# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun start                                          # full loop
bun src/scraper.js --store paris --product laptop  # test one scrape
cat data/errors.json                               # last-hour errors
```

## Architecture

```
main.js          → loop + concurrency pool (runWithPool)
scraper.js       → child process per (store, product): puppeteer → JSON stdout → exit
stores/{key}.js  → adapter: buildSearchUrl(), waitSelector, pageWaitMs
llm.js           → provider-agnostic chat completions (openrouter/openai/cloudflare)
telegram.js      → Bot API notifications
errors.js        → rolling 1h log → data/errors.json
```

`scraper.js` is always a short-lived child process (intentional — prevents Puppeteer memory leaks).

## Adding a store

1. Create `src/stores/{key}.js` with `name`, `buildSearchUrl()`, `waitSelector`, `pageWaitMs`
2. Add to `adapters` object and `getStoreByUrl()` if-chain in `src/stores/index.js`

## Fixing broken extraction

If a store returns `type:'text'` instead of structured products, CSS selectors missed. Inspect the live page → find real product card class → update `waitSelector` in the adapter and/or `cardSelectors` array at `src/scraper.js:25`.

## Known gaps

- `promoUrl` on Entel/Claro adapters declared but never used by scraper
- No deduplication — same deal re-notifies every 15 min
- No rate limiting between LLM calls
