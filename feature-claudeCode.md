# Feature: `claudecode` LLM provider

Usa `claude -p` (CLI local) como provider LLM en vez de API externa.
Activado con `LLM_PROVIDER=claudecode` en `.env`. No rompe providers existentes.

---

## Flags CLI relevantes descubiertos

| Flag | Uso |
|------|-----|
| `--model <alias\|id>` | Alias: `haiku`, `sonnet`, `opus`. Full ID: `claude-haiku-4-5-20251001` |
| `--output-format json` | Devuelve JSON con campo `result` en vez de texto plano |
| `--json-schema <schema>` | Fuerza estructura de salida — ideal para nuestro JSON de deals |
| `--print` / `-p` | Modo no-interactivo (requerido) |
| `--max-budget-usd` | Límite en dólares — NO es max_tokens |

**Limitación:** No existe flag `--max-tokens`. No hay control directo de tokens de output.
Workaround: `--max-budget-usd` como proxy muy aproximado, o truncar el prompt (ver pendientes).

---

## Variables `.env` nuevas

```env
LLM_PROVIDER=claudecode          # activa este provider
CLAUDECODE_MODEL=haiku           # alias o model ID completo (default: haiku)
CLAUDECODE_MAX_TOKENS=3000       # NO implementable vía flag CLI — ver pendientes
```

---

## Implementación en `src/llm.js`

### 1. Nueva función `askClaudeCode(prompt, model)`

```js
import { spawnSync } from 'child_process';

function askClaudeCode(prompt, model = 'haiku') {
  const schema = JSON.stringify({
    type: 'object',
    properties: {
      hasGoodDeals: { type: 'boolean' },
      deals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            price: { type: 'string' },
            url: { type: ['string', 'null'] },
            reason: { type: 'string' },
          },
        },
      },
      summary: { type: 'string' },
    },
    required: ['hasGoodDeals', 'deals'],
  });

  const result = spawnSync(
    'claude',
    ['-p', prompt, '--model', model, '--output-format', 'json', '--json-schema', schema],
    { encoding: 'utf8', timeout: 60000 }
  );

  if (result.error) throw new Error(`claude spawn error: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`claude exit ${result.status}: ${result.stderr?.slice(0, 300)}`);

  const parsed = JSON.parse(result.stdout.trim());
  // --output-format json envuelve la respuesta — estructura exacta a verificar
  // Candidatos: parsed.result | parsed | parsed.content
  return typeof parsed.result === 'object' ? parsed.result : parsed;
}
```

### 2. Integración en `askLLM()`

```js
export async function askLLM(scraperResult, product) {
  const providerName = (process.env.LLM_PROVIDER || 'openrouter').toLowerCase();

  if (providerName === 'claudecode') {
    const model = process.env.CLAUDECODE_MODEL || 'haiku';
    const prompt = buildPrompt(scraperResult, product); // mismo buildPrompt existente
    return askClaudeCode(prompt, model);
    // rateLimit() no aplica — claude -p ya tiene su propio throttle
  }

  // ... resto del flujo actual sin cambios
  await rateLimit();
  // ...
}
```

---

## Estructura de salida `--output-format json`

**PENDIENTE VERIFICAR** — ejecutar:
```bash
echo "responde solo: {\"ok\":true}" | claude -p --output-format json "di ok"
```
y ver el shape exacto del JSON devuelto. Puede ser:
- `{ "result": "...", "type": "result" }` → extraer `.result` y parsear como string
- `{ "result": {...} }` → ya objeto si usamos `--json-schema`
- Otro shape

---

## Pendientes / Dudas

1. **`--output-format json` con `--json-schema`:** ¿Devuelve el objeto directamente en `.result`
   o sigue siendo string JSON embebido? Verificar antes de implementar el parser.

2. **Max tokens:** No existe flag. Opciones:
   - a) Truncar `formatProducts()` a N productos máximo antes de construir el prompt
   - b) Documentar como limitación conocida y aceptar que `claude` decide el corte
   - c) `--max-budget-usd 0.01` como proxy muy impreciso (no recomendado)
   
   **Pregunta al usuario:** ¿Preferís truncar productos o dejarlo sin límite?

3. **`spawnSync` vs `spawn` async:** `spawnSync` bloquea el event loop mientras corre `claude`.
   Como las llamadas LLM ya son secuenciales (`for await`), no es problema práctico.
   Pero si se paraleliza LLM en el futuro, hay que migrar a `spawn` + Promise.

4. **Auth:** `claude -p` usa la sesión OAuth del usuario logueado en la máquina.
   Si corre en servidor/CI sin sesión activa, falla. ¿Se usará solo local?

5. **`--bare` flag:** Reduce overhead (skip hooks, LSP, CLAUDE.md). ¿Agregar para velocidad?

---

## Archivos a modificar

- `src/llm.js` — agregar `askClaudeCode()` + branching en `askLLM()`
- `.env.example` — documentar `CLAUDECODE_MODEL`, `LLM_PROVIDER=claudecode`
- `CLAUDE.md` — actualizar tabla de arquitectura

## Archivos NO modificar

- `src/main.js` — sin cambios
- `src/stores/*.js` — sin cambios
- `src/telegram.js` — sin cambios
