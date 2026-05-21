/**
 * Child process: spawned per (store, product) pair.
 * Launches Puppeteer, scrapes, outputs JSON to stdout, exits.
 * All logs go to stderr so stdout stays clean for JSON parsing.
 */
import puppeteer from 'puppeteer';
import { getStoreAdapter } from './stores/index.js';

const log = (...args) => console.error('[scraper]', ...args);
const out = (data) => console.log(JSON.stringify(data));

function parseArgs(argv) {
  const args = argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  return { storeKey: get('--store'), product: get('--product') };
}

async function extractProducts(page) {
  await new Promise((r) => setTimeout(r, 500));

  return page.evaluate(() => {
    const cardSelectors = [
      '[data-testid*="product"]',
      '[class*="product-item"]',
      '[class*="ProductItem"]',
      '[class*="product-card"]',
      '[class*="ProductCard"]',
      '[class*="catalog-item"]',
      '[class*="pod-item"]',
      '[class*="pod "]',
      '.pod',
      '[class*="shelf-item"]',
      '[class*="item-card"]',
      '[class*="equipo"]',
      '[class*="smartphone"]',
    ];

    let cards = [];
    for (const sel of cardSelectors) {
      try {
        const found = Array.from(document.querySelectorAll(sel));
        if (found.length >= 2) {
          cards = found;
          break;
        }
      } catch {
        // bad selector, skip
      }
    }

    if (cards.length === 0) {
      // fallback: visible text of page, trimmed to avoid huge payloads
      return { type: 'text', content: document.body.innerText.slice(0, 6000) };
    }

    const products = cards.slice(0, 25).map((card) => {
      const nameEl = card.querySelector(
        'h1,h2,h3,h4,[class*="title"],[class*="Title"],[class*="name"],[class*="Name"],[class*="descripcion"]'
      );
      const priceEls = card.querySelectorAll(
        '[class*="price"],[class*="Price"],[class*="monto"],[class*="valor"],[class*="Precio"],[class*="precio"]'
      );
      const linkEl = card.querySelector('a[href]');
      const badgeEl = card.querySelector(
        '[class*="discount"],[class*="Discount"],[class*="offer"],[class*="badge"],[class*="promo"],[class*="rebaja"],[class*="Rebaja"],[class*="ahorro"]'
      );

      const prices = Array.from(priceEls)
        .map((el) => el.textContent?.trim())
        .filter(Boolean)
        .slice(0, 3);

      let url = null;
      const href = linkEl?.getAttribute('href');
      if (href) {
        try {
          url = new URL(href, window.location.origin).href;
        } catch {
          url = href;
        }
      }

      return {
        name: nameEl?.textContent?.trim()?.slice(0, 200) ?? null,
        prices,
        url,
        badge: badgeEl?.textContent?.trim()?.slice(0, 100) ?? null,
      };
    }).filter((p) => p.name || p.prices.length > 0);

    return { type: 'products', products };
  });
}

async function main() {
  const { storeKey, product } = parseArgs(process.argv);

  if (!storeKey || !product) {
    out({ error: 'Missing --store or --product' });
    process.exit(1);
  }

  const adapter = getStoreAdapter(storeKey);
  if (!adapter) {
    out({ error: `Unknown store key: ${storeKey}` });
    process.exit(1);
  }

  const searchUrl = adapter.buildSearchUrl(product);
  log(`${adapter.name} | "${product}" → ${searchUrl}`);

  const timeout = parseInt(process.env.PUPPETEER_TIMEOUT || '30000');
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1280,800',
      ],
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8' });

    // Disable webdriver flag (basic bot-detection evasion)
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Block images, fonts and media — keep scripts and stylesheets for SPAs
    await page.setRequestInterception(true);
    const blockedTypes = new Set(['image', 'font', 'media']);
    page.on('request', (req) => {
      if (blockedTypes.has(req.resourceType())) req.abort();
      else req.continue();
    });

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout });

    // Wait for store-specific selector
    if (adapter.waitSelector) {
      await page
        .waitForSelector(adapter.waitSelector, { timeout: 12000 })
        .catch(() => log(`Wait selector not found: ${adapter.waitSelector}`));
    }

    // Extra JS-render wait
    await new Promise((r) => setTimeout(r, adapter.pageWaitMs ?? 2000));

    const extracted = await extractProducts(page);

    const productCount =
      extracted.type === 'products' ? extracted.products?.length ?? 0 : 'text-fallback';
    log(`${adapter.name} | "${product}" → extracted ${productCount} items`);

    out({
      storeName: adapter.name,
      storeKey,
      product,
      searchUrl,
      ...extracted,
    });
  } catch (err) {
    log(`Error: ${err.message}`);
    out({
      error: err.message,
      storeName: adapter?.name ?? storeKey,
      storeKey,
      product,
      searchUrl: adapter?.buildSearchUrl(product) ?? null,
    });
  } finally {
    if (browser) {
      await browser.close();
      log(`Browser closed for ${adapter?.name} | "${product}"`);
    }
  }
}

main();
