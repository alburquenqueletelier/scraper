import paris from './paris.js';
import ripley from './ripley.js';
import falabella from './falabella.js';
import entel from './entel.js';
import claro from './claro.js';
import lider from './lider.js';

const adapters = { paris, ripley, falabella, entel, claro, lider };

export function getStoreAdapter(key) {
  return adapters[key] ?? null;
}

export function getStoreByUrl(url) {
  if (url.includes('paris.cl'))      return { key: 'paris',     adapter: paris };
  if (url.includes('ripley.cl'))     return { key: 'ripley',    adapter: ripley };
  if (url.includes('falabella.com')) return { key: 'falabella', adapter: falabella };
  if (url.includes('entel.cl'))      return { key: 'entel',     adapter: entel };
  if (url.includes('clarochile.cl')) return { key: 'claro',     adapter: claro };
  if (url.includes('lider.cl'))      return { key: 'lider',     adapter: lider };
  return null;
}
