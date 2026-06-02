# CyberScraper — Buscador de Ofertas

Scraper que monitorea tiendas chilenas, evalúa precios con un LLM y notifica por Telegram cuando hay buenas ofertas.

---

## Estado actual

### Lo que funciona
- Loop principal cada 15 min (configurable)
- Puppeteer corre como **proceso hijo aislado** por cada (tienda × producto) → muere al terminar, sin memory leaks
- Pool de concurrencia configurable (`MAX_CONCURRENT`)
- Extractor genérico de productos: prueba ~12 selectores CSS comunes, cae a texto plano si ninguno encaja
- LLM evalúa si hay buena oferta y retorna JSON estructurado
- Notificación Telegram en español con nombre, precio, razón y link
- Log de errores rolling de 1 hora en `data/errors.json`
- Validación de `.env` al arrancar (falla rápido si falta algo)

### Lo que está declarado pero necesita validación real
| Componente | Estado | Nota |
|---|---|---|
| Selectores CSS por tienda | **Educated guess** | Cada tienda puede tener clases distintas en producción. Ver sección de debug. |
| Entel / Claro búsqueda | **Parcial** | `promoUrl` declarado en el adaptador pero el scraper no lo usa como fallback aún |
| Bot detection | **Básico** | Se oculta `navigator.webdriver`, User-Agent real, headers `es-CL`. Sin stealth plugin. |
| LLM JSON parsing | **Robusto** | Extrae primer `{...}` del response; sobrevive si el LLM wrappea con markdown |

---

## Setup paso a paso

### 1. Prerrequisitos

```bash
# Bun instalado
curl -fsSL https://bun.sh/install | bash

# Claude Code CLI (requerido si usas LLM_PROVIDER=claudecode)
npm install -g @anthropic-ai/claude-code
# Luego autenticarse: claude login

# Dependencias del sistema para Chromium headless (Linux)
sudo apt-get install -y libatk-bridge2.0-0 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2
```

### 2. Instalar dependencias

```bash
cd cyber-scraper
bun install
# Descarga Chromium automáticamente (~170MB, solo la primera vez)
```

### 3. Configurar `.env`

```bash
cp .env.example .env
```

Editar `.env`:

```env
# Tiendas a monitorear (quitar las que no necesites)
STORE_URLS=https://www.paris.cl/,https://simple.ripley.cl/,https://www.falabella.com/falabella-cl/,https://www.lider.cl/

# Productos: Nombre:PrecioMaximoCLP
# Sin precio → el LLM juzga por conocimiento de mercado
PRODUCTS=iPhone 15:800000,Laptop Gaming:1500000,Silla Gamer:150000

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=tu_chat_id

# LLM (default: openrouter con tier gratis)
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free

# Alternativa sin API key: Claude Code CLI local
# LLM_PROVIDER=claudecode
# CLAUDECODE_MODEL=haiku   # alias: haiku | sonnet | opus
```

#### Obtener credenciales Telegram

```
1. Abrir @BotFather en Telegram → /newbot → guardar token
2. Enviar un mensaje al bot
3. Visitar: https://api.telegram.org/bot<TOKEN>/getUpdates
4. Copiar el "id" dentro de "chat" → ese es TELEGRAM_CHAT_ID
```

#### Obtener API key OpenRouter

```
1. Registrarse en https://openrouter.ai
2. Settings → Keys → Create Key
3. Modelos gratis disponibles: meta-llama/llama-3.3-70b-instruct:free
                                 google/gemma-3-27b-it:free
                                 mistralai/mistral-7b-instruct:free
```

### 4. Correr

```bash
bun start
```

Output esperado al arrancar:

```
═══════════════════════════════════
  CyberScraper — buscador de ofertas
═══════════════════════════════════

Tiendas  : 4
Productos: iPhone 15 ($800.000), Laptop Gaming ($1.500.000)
Intervalo: 15 min
LLM      : openrouter

[2026-05-20T...] ── Iniciando ciclo de búsqueda ──
[INFO] 8 tareas (4 tiendas × 2 productos)
  [scraper] Paris.cl | "iPhone 15" → https://www.paris.cl/search/?text=iPhone%2015&sortBy=price-asc
  ...
```

---

## Estructura de archivos

```
cyber-scraper/
├── .env                    ← tus secrets (no commitear)
├── .env.example            ← plantilla
├── package.json
├── data/
│   └── errors.json         ← errores última hora (auto-generado)
└── src/
    ├── main.js             ← loop orchestrador, pool de concurrencia
    ├── scraper.js          ← proceso hijo: puppeteer → JSON → exit
    ├── llm.js              ← cliente LLM agnóstico (openrouter/openai/cloudflare)
    ← telegram.js          ← envío de notificaciones (HTML mode, español)
    ├── errors.js           ← log rolling 1 hora
    └── stores/
        ├── index.js        ← registry de adaptadores
        ├── paris.js        ← Paris.cl
        ├── ripley.js       ← Ripley
        ├── falabella.js    ← Falabella Chile
        ├── lider.js        ← Lider (Walmart Chile)
        ├── entel.js        ← Entel (telco, página de equipos)
        └── claro.js        ← Claro Chile (telco, página de smartphones)
```

---

## Cómo debuggear selectores

Si una tienda siempre retorna `text-fallback` o 0 productos, los selectores CSS no están encontrando las tarjetas de producto.

**Paso 1:** Correr el scraper de una tienda puntual:

```bash
bun src/scraper.js --store paris --product "laptop"
# Output JSON en stdout, logs en stderr
```

**Paso 2:** Abrir la URL de búsqueda en Chrome, inspeccionar una tarjeta de producto → copiar la clase CSS real.

**Paso 3:** Editar el `waitSelector` en el archivo del adaptador correspondiente:

```js
// src/stores/paris.js
export default {
  waitSelector: '.tu-selector-real-aqui',  // ← actualizar esto
  ...
};
```

**Paso 4:** También actualizar el array `cardSelectors` en `src/scraper.js` línea ~25 si el selector no está en la lista genérica.

**Revisar errores de las últimas horas:**

```bash
cat data/errors.json
```

---

## Variables de entorno — referencia completa

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `STORE_URLS` | ✅ | — | Tiendas separadas por coma |
| `PRODUCTS` | ✅ | — | `Nombre:Precio` separados por coma |
| `TELEGRAM_BOT_TOKEN` | ✅ | — | Token del bot de Telegram |
| `TELEGRAM_CHAT_ID` | ✅ | — | ID del chat donde llegan las alertas |
| `LLM_PROVIDER` | ✅ | `openrouter` | `openrouter` / `openai` / `cloudflare` / `claudecode` |
| `CLAUDECODE_MODEL` | ❌ | `haiku` | Alias (`haiku`/`sonnet`/`opus`) o model ID completo. Solo si `LLM_PROVIDER=claudecode` |
| `OPENROUTER_API_KEY` | ✅* | — | *si LLM_PROVIDER=openrouter |
| `OPENROUTER_MODEL` | ❌ | `meta-llama/llama-3.3-70b-instruct:free` | Modelo de OpenRouter |
| `OPENAI_API_KEY` | ✅* | — | *si LLM_PROVIDER=openai |
| `OPENAI_MODEL` | ❌ | `gpt-4o-mini` | Modelo de OpenAI |
| `CF_ACCOUNT_ID` | ✅* | — | *si LLM_PROVIDER=cloudflare |
| `CF_API_TOKEN` | ✅* | — | *si LLM_PROVIDER=cloudflare |
| `CF_MODEL` | ❌ | `@cf/meta/llama-3.1-8b-instruct` | Modelo Cloudflare Workers AI |
| `LOOP_INTERVAL_MS` | ❌ | `900000` | 15 min en ms |
| `MAX_CONCURRENT` | ❌ | `3` | Scrapers paralelos máximos |
| `PUPPETEER_TIMEOUT` | ❌ | `30000` | Timeout navegación en ms |

---

## Insights y consideraciones

### Sobre el scraping

**Tiendas con SPA React/Vue:** Paris, Ripley y Falabella renderizan todo con JavaScript. El scraper espera `domcontentloaded` + un `pageWaitMs` adicional (3–4 segundos) para darle tiempo al JS. Si el contenido no aparece, aumentar `pageWaitMs` en el adaptador.

**Bot detection:** Las tiendas grandes (especialmente Falabella) pueden detectar Puppeteer y retornar CAPTCHA o página vacía. Los mitigantes actuales son básicos. Si ocurre frecuentemente, opciones:
- Instalar `puppeteer-extra-plugin-stealth` (ampliamente usado en la comunidad)
- Rotar User-Agents
- Agregar delays aleatorios entre requests

**Entel / Claro:** Son telcos — no tienen búsqueda de productos estándar. El scraper apunta a sus páginas de equipos/smartphones. El campo `promoUrl` en los adaptadores existe como fallback pero aún no está implementado en el scraper (próxima mejora obvia).

### Sobre el LLM

**Tokens por llamada:** ~700–1.000 tokens por llamada (prompt + respuesta). Con 6 tiendas × 4 productos = 24 llamadas por ciclo. En tier gratis de OpenRouter los límites son por minuto y por día — si hay rate limit errors aparecerán en `data/errors.json`.

**Calidad del análisis:** El LLM evalúa con conocimiento general de precios en Chile. Para productos muy específicos o nichos (ej: componentes de PC), el modelo puede no tener precios de referencia actualizados. Usar `maxPrice` en `.env` como ancla objetiva es más confiable que depender solo del criterio del LLM.

**Modelo recomendado:** `meta-llama/llama-3.3-70b-instruct:free` es bueno para seguir instrucciones JSON. Modelos más pequeños (`mistral-7b`) pueden alucinar o no respetar el formato JSON — si pasa, ver errores de parsing en los logs.

### Sobre la arquitectura

**¿Por qué procesos hijos?** Puppeteer tiene memory leaks acumulativos si el browser nunca se cierra. Al matar el proceso completo después de cada scrape, el OS libera todo. Costo: overhead de ~1s por proceso spawn.

**Escala:** Con 6 tiendas × 4 productos = 24 procesos hijos por ciclo. `MAX_CONCURRENT=3` los ejecuta de a 3. Tiempo estimado por ciclo: `(24/3) × (tiempo_scrape + tiempo_llm)` ≈ 8 × (8s + 3s) ≈ **~90 segundos** en condiciones normales. Esto cabe bien en el intervalo de 15 min.

---

## Próximas mejoras obvias

- [ ] Implementar fallback a `promoUrl` en Entel/Claro cuando el search no retorna tarjetas
- [ ] Deduplicar alertas: no re-enviar por Telegram la misma URL que ya se notificó (guardar en `data/seen.json`)
- [ ] Agregar `puppeteer-extra-plugin-stealth` si hay problemas de bot detection
- [ ] Rate limiting entre llamadas LLM para no quemar el tier gratis
- [ ] Modo test: `bun start --dry-run` que muestra resultados sin enviar Telegram
