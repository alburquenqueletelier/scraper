import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const ERRORS_FILE = join(DATA_DIR, 'errors.json');
const ONE_HOUR_MS = 60 * 60 * 1000;

async function readErrors() {
  try {
    return JSON.parse(await readFile(ERRORS_FILE, 'utf-8'));
  } catch {
    return { errors: [] };
  }
}

async function writeErrors(data) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(ERRORS_FILE, JSON.stringify(data, null, 2));
}

export async function logError({ store, product, error }) {
  const data = await readErrors();
  data.errors.push({
    timestamp: new Date().toISOString(),
    store,
    product,
    error: String(error),
  });
  await writeErrors(data);
}

export async function pruneOldErrors() {
  const data = await readErrors();
  const cutoff = Date.now() - ONE_HOUR_MS;
  data.errors = data.errors.filter(e => new Date(e.timestamp).getTime() > cutoff);
  await writeErrors(data);
}
