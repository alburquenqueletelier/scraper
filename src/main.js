import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getStoreByUrl } from './stores/index.js';
import { askLLM } from './llm.js';
import { sendTelegram } from './telegram.js';
import { logError, pruneOldErrors } from './errors.js';
import { filterAndMark } from './seen.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRAPER_PATH = join(__dirname, 'scraper.js');

const INTERVAL_MS = parseInt(process.env.LOOP_INTERVAL_MS || '900000');
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '3');

// ─── Config parsers ────────────────────────────────────────────────────────────

function parseProducts() {
  const raw = process.env.PRODUCTS || '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      // Split on last ":" only if followed by digits (max price)
      const lastColon = s.lastIndexOf(':');
      if (lastColon > 0 && /^\d+$/.test(s.slice(lastColon + 1))) {
        return { name: s.slice(0, lastColon).trim(), maxPrice: parseInt(s.slice(lastColon + 1)) };
      }
      return { name: s.trim(), maxPrice: null };
    });
}

function parseStores() {
  return (process.env.STORE_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function validateConfig(stores, products) {
  const errors = [];
  if (!stores.length) errors.push('STORE_URLS not set');
  if (!products.length) errors.push('PRODUCTS not set');
  if (!process.env.TELEGRAM_BOT_TOKEN) errors.push('TELEGRAM_BOT_TOKEN not set');
  if (!process.env.TELEGRAM_CHAT_ID) errors.push('TELEGRAM_CHAT_ID not set');

  const provider = (process.env.LLM_PROVIDER || 'openrouter').toLowerCase();
  const keyMap = { openrouter: 'OPENROUTER_API_KEY', openai: 'OPENAI_API_KEY', cloudflare: 'CF_API_TOKEN' };
  if (!process.env[keyMap[provider]]) errors.push(`${keyMap[provider]} not set for provider "${provider}"`);

  return errors;
}

// ─── Child process runner ──────────────────────────────────────────────────────

function runScraper(storeKey, productName) {
  return new Promise((resolve) => {
    const proc = spawn('bun', [SCRAPER_PATH, '--store', storeKey, '--product', productName], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));

    proc.on('close', (code) => {
      if (stderr.trim()) {
        process.stderr.write(`  ${stderr.trim()}\n`);
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        resolve({ error: `JSON parse failed (exit ${code}): ${stdout.slice(0, 200)}` });
      }
    });

    proc.on('error', (err) => resolve({ error: err.message }));
  });
}

// ─── Concurrency pool ──────────────────────────────────────────────────────────

async function runWithPool(tasks, maxConcurrent) {
  const results = new Array(tasks.length);
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(maxConcurrent, tasks.length) }, worker)
  );

  return results;
}

// ─── Main cycle ────────────────────────────────────────────────────────────────

async function runCycle() {
  const ts = new Date().toISOString();
  console.log(`\n[${ts}] ── Iniciando ciclo de búsqueda ──`);

  const stores = parseStores();
  const products = parseProducts();

  // Build task list: one per (store, product) pair
  const tasks = [];
  for (const storeUrl of stores) {
    const storeInfo = getStoreByUrl(storeUrl);
    if (!storeInfo) {
      console.warn(`[WARN] Sin adaptador para: ${storeUrl}`);
      continue;
    }
    for (const product of products) {
      tasks.push(() =>
        runScraper(storeInfo.key, product.name).then((result) => ({
          storeUrl,
          storeInfo,
          product,
          result,
        }))
      );
    }
  }

  console.log(`[INFO] ${tasks.length} tareas (${stores.length} tiendas × ${products.length} productos)`);

  const scraperResults = await runWithPool(tasks, MAX_CONCURRENT);

  // Evaluate each result with LLM
  const goodDeals = [];

  for (const { storeUrl, storeInfo, product, result } of scraperResults) {
    const label = `${storeInfo.key}:${product.name}`;

    if (result.error) {
      console.error(`[ERROR] ${label} → ${result.error}`);
      await logError({ store: storeUrl, product: product.name, error: result.error });
      continue;
    }

    try {
      console.log(`[LLM]   ${label} → analizando...`);
      const llmResult = await askLLM(result, product);
      const dealCount = llmResult.deals?.length ?? 0;
      console.log(`[LLM]   ${label} → hasGoodDeals=${llmResult.hasGoodDeals} deals=${dealCount}`);

      if (llmResult.hasGoodDeals && dealCount > 0) {
        goodDeals.push({
          product: product.name,
          store: result.storeName,
          deals: llmResult.deals,
          summary: llmResult.summary,
        });
      }
    } catch (err) {
      console.error(`[LLM ERROR] ${label} → ${err.message}`);
      await logError({ store: storeUrl, product: product.name, error: `LLM: ${err.message}` });
    }
  }

  // Send Telegram if deals found (skip already-seen URLs)
  if (goodDeals.length > 0) {
    try {
      const newDeals = await filterAndMark(goodDeals);
      if (newDeals.length > 0) {
        await sendTelegram(newDeals);
        console.log(`[TELEGRAM] Enviado: ${newDeals.length} grupo(s) de ofertas`);
      } else {
        console.log('[RESULT] Ofertas encontradas pero ya notificadas (deduplicadas).');
      }
    } catch (err) {
      console.error(`[TELEGRAM ERROR] ${err.message}`);
    }
  } else {
    console.log('[RESULT] Sin buenas ofertas este ciclo.');
  }

  // Prune old errors (keep last hour only)
  await pruneOldErrors();

  const nextMin = Math.round(INTERVAL_MS / 60000);
  console.log(`[${new Date().toISOString()}] ── Ciclo completo. Próximo en ${nextMin} min ──`);
}

// ─── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════');
  console.log('  CyberScraper — buscador de ofertas');
  console.log('═══════════════════════════════════');

  const stores = parseStores();
  const products = parseProducts();
  const configErrors = validateConfig(stores, products);

  if (configErrors.length > 0) {
    console.error('\n[CONFIG ERROR] Faltan variables de entorno:');
    for (const e of configErrors) console.error(`  • ${e}`);
    console.error('\nCopia .env.example a .env y completa los valores.\n');
    process.exit(1);
  }

  console.log(`\nTiendas  : ${stores.length}`);
  console.log(`Productos: ${products.map((p) => `${p.name}${p.maxPrice ? ` ($${p.maxPrice.toLocaleString('es-CL')})` : ''}`).join(', ')}`);
  console.log(`Intervalo: ${INTERVAL_MS / 60000} min`);
  console.log(`LLM      : ${process.env.LLM_PROVIDER || 'openrouter'}\n`);

  while (true) {
    try {
      await runCycle();
    } catch (err) {
      console.error(`[FATAL] Error en ciclo: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main();
