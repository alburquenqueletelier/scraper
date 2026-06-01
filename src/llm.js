const PROVIDERS = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: () => process.env.OPENROUTER_API_KEY,
    model: () => process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
    extraHeaders: {
      'HTTP-Referer': 'https://github.com/cyber-scraper',
      'X-Title': 'CyberScraper',
    },
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: () => process.env.OPENAI_API_KEY,
    model: () => process.env.OPENAI_MODEL || 'gpt-4o-mini',
    extraHeaders: {},
  },
  cloudflare: {
    baseUrl: () =>
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/v1`,
    apiKey: () => process.env.CF_API_TOKEN,
    model: () => process.env.CF_MODEL || '@cf/meta/llama-3.1-8b-instruct',
    extraHeaders: {},
  },
};

const _rateWindow = [];

async function rateLimit() {
  const rpm = parseInt(process.env.LLM_RPM_LIMIT || '6', 10);
  const now = Date.now();
  const cutoff = now - 60_000;

  while (_rateWindow.length && _rateWindow[0] < cutoff) _rateWindow.shift();

  if (_rateWindow.length >= rpm) {
    const waitMs = 60_000 - (now - _rateWindow[0]) + 50;
    await new Promise(r => setTimeout(r, waitMs));
    return rateLimit();
  }

  _rateWindow.push(Date.now());
}

function formatProducts(scraperResult) {
  if (scraperResult.type === 'products' && scraperResult.products?.length) {
    return scraperResult.products
      .map((p, i) => {
        const parts = [`${i + 1}. ${p.name ?? 'Sin nombre'}`];
        if (p.prices?.length) parts.push(`   Precio: ${p.prices.join(' / ')}`);
        if (p.badge) parts.push(`   Oferta: ${p.badge}`);
        if (p.url) parts.push(`   URL: ${p.url}`);
        return parts.join('\n');
      })
      .join('\n\n');
  }
  if (scraperResult.type === 'text') {
    return scraperResult.content;
  }
  return 'Sin datos de productos.';
}

function buildPrompt(scraperResult, product) {
  const maxPriceText = product.maxPrice
    ? `Precio máximo aceptable: $${product.maxPrice.toLocaleString('es-CL')} CLP`
    : 'Sin precio máximo (usa tu conocimiento del mercado chileno para evaluar si es buen precio)';

  return `Eres un asistente buscador de ofertas para tiendas online chilenas.

Producto buscado: "${product.name}"
Tienda: ${scraperResult.storeName}
${maxPriceText}

Listado de productos encontrados:
---
${formatProducts(scraperResult)}
---

Instrucciones:
- Identifica productos que coincidan o sean muy similares a "${product.name}"
- Evalúa si el precio es bueno según: conocimiento del mercado chileno, descuentos visibles, y el precio máximo
- Solo marca como "buena oferta" si el precio está genuinamente bajo el valor de mercado 0 tiene descuento significativo (>25%)
- Si hay precio máximo, solo incluye ofertas en ese rango o menor
- Si no hay productos relevantes o no hay buenas ofertas, responde con hasGoodDeals: false y deals: []

Responde SOLO con JSON válido (sin markdown, sin explicación):
{
  "hasGoodDeals": boolean,
  "deals": [
    {
      "name": "nombre exacto del producto",
      "price": "precio tal como aparece",
      "url": "URL del producto o null",
      "reason": "por qué es buena oferta en una frase"
    }
  ],
  "summary": "resumen en una frase"
}`;
}

function parseJsonResponse(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`LLM no retornó JSON: ${text.slice(0, 300)}`);
  return JSON.parse(match[0]);
}

export async function askLLM(scraperResult, product) {
  await rateLimit();
  const providerName = (process.env.LLM_PROVIDER || 'openrouter').toLowerCase();
  const provider = PROVIDERS[providerName];

  if (!provider) throw new Error(`Proveedor LLM desconocido: ${providerName}`);

  const apiKey = provider.apiKey();
  if (!apiKey) throw new Error(`Falta API key para proveedor: ${providerName}`);

  const model = provider.model();
  const baseUrl = typeof provider.baseUrl === 'function' ? provider.baseUrl() : provider.baseUrl;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...provider.extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: buildPrompt(scraperResult, product) }],
      temperature: 0.1,
      max_tokens: 3000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) throw new Error('Respuesta LLM vacía');

  return parseJsonResponse(text);
}
