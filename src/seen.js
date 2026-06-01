import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEEN_PATH = join(__dirname, '../data/seen.json');
const PRUNE_MS = 7 * 24 * 60 * 60 * 1000;

async function load() {
  try {
    return JSON.parse(await readFile(SEEN_PATH, 'utf8'));
  } catch {
    return {};
  }
}

// Filters out already-seen deals by URL, marks new ones as seen, persists to disk.
export async function filterAndMark(dealGroups) {
  const seen = await load();
  const now = Date.now();

  for (const url of Object.keys(seen)) {
    if (seen[url] < now - PRUNE_MS) delete seen[url];
  }

  const newGroups = [];

  for (const group of dealGroups) {
    const newDeals = group.deals.filter((d) => !d.url || !seen[d.url]);
    if (newDeals.length > 0) {
      newGroups.push({ ...group, deals: newDeals });
      for (const d of newDeals) {
        if (d.url) seen[d.url] = now;
      }
    }
  }

  await writeFile(SEEN_PATH, JSON.stringify(seen, null, 2));
  return newGroups;
}
