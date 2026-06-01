# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun start                                          # full loop
bun src/scraper.js --store paris --product laptop  # test one scrape
bun run telegram:check                             # verify bot reaches your chat_id
cat data/errors.json                               # last-hour errors
```

## Architecture

```
main.js          → loop + concurrency pool (runWithPool)
scraper.js       → child process per (store, product): puppeteer → JSON stdout → exit
stores/{key}.js  → adapter: buildSearchUrl(), waitSelector, pageWaitMs
llm.js           → provider-agnostic chat completions (openrouter/openai/cloudflare)
telegram.js      → Bot API notifications + verifyTelegram() health check
errors.js        → rolling 1h log → data/errors.json
```

`scraper.js` is always a short-lived child process (intentional — prevents Puppeteer memory leaks).

## Adding a store

1. Create `src/stores/{key}.js` with `name`, `buildSearchUrl()`, `waitSelector`, `pageWaitMs`
2. Add to `adapters` object and `getStoreByUrl()` if-chain in `src/stores/index.js`

## Fixing broken extraction

If a store returns `type:'text'` instead of structured products, CSS selectors missed. Inspect the live page → find real product card class → update `waitSelector` in the adapter and/or `cardSelectors` array at `src/scraper.js:25`.

## Store status (2026-06-01)

| Store     | Status | Notes |
|-----------|--------|-------|
| Ripley    | ✓ working | URL changed to `simple.ripley.cl/search/{query}` |
| Entel     | ✓ working | Moved to `miportal.entel.cl/personas/catalogo/celulares` — no keyword search |
| Claro     | ✓ text-fallback | `ofertaplanconequipo/` page — Tailwind classes, structured extraction not viable |
| Falabella | ✗ bot-blocked | Returns empty shell; needs anti-bot bypass |
| Lider     | ✗ bot-blocked | Cloudflare CAPTCHA |
| Paris.cl  | ✓ API (fast) | Constructor.io `key_8pjkPsSkEsJHKgxR` — no browser, 25 products/call |

## Known gaps

- Claro/Entel scrape full catalog (no keyword filtering) — LLM filters by product relevance
- No deduplication — same deal re-notifies every 15 min
- Falabella and Lider bot-blocked; need proxy/residential IP or API approach
