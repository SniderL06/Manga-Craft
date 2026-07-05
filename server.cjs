// MangaCraft — Proxy Express para Hugging Face (CommonJS)
// Estrategia idéntica a Alicia: usa router.huggingface.co/hf-inference/models/<id>
// que es el endpoint gratuito activo en 2025 (no el antiguo api-inference).
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3001;

// ── Tokens HuggingFace ────────────────────────────────────────────────────────
const HF_TOKENS = [
  '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',
  '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',
  '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',
  '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',
  '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',
  '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',
  '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',
  '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',
  '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',
  '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'
];

// ── Modelos especializados en manga/anime modernos ────────────────────────────
// Ordenados por calidad manga. El endpoint es router.huggingface.co/hf-inference/models/<id>
// que es el endpoint GRATUITO activo (Alicia lo confirma que funciona).
const MANGA_MODELS = [
  // FLUX — mejor calidad general, entiende prompts complejos de manga
  { id: 'black-forest-labs/FLUX.1-schnell', label: 'FLUX.1 Schnell (Rápido)' },
  { id: 'black-forest-labs/FLUX.1-dev',    label: 'FLUX.1 Dev (Alta calidad)' },
  // Animagine XL — especializado 100% en anime/manga
  { id: 'cagliostrolab/animagine-xl-3.1',  label: 'Animagine XL 3.1 (Anime)' },
  // SDXL base como último recurso
  { id: 'stabilityai/stable-diffusion-xl-base-1.0', label: 'SDXL Base' },
];

let tokenIndex = 0;
function nextToken() {
  const t = HF_TOKENS[tokenIndex % HF_TOKENS.length];
  tokenIndex++;
  return t;
}

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'MangaCraft HF Proxy on port 3001' });
});

// ── Endpoint principal de generación ─────────────────────────────────────────
app.post('/generate', async (req, res) => {
  const { prompt, negativePrompt, steps = 4, width = 768, height = 1024 } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt requerido' });

  // ── Estrategia A: router.huggingface.co/hf-inference/models/<id> (GRATUITO) ──
  // Igual al endpoint que usa Alicia — funciona con token READ.
  // Payload: { inputs: "<prompt>", parameters: { ... } }
  async function tryRouterNative(token, model) {
    const payload = JSON.stringify({
      inputs: prompt,
      parameters: {
        negative_prompt: negativePrompt || '',
        width,
        height,
        num_inference_steps: steps,
        guidance_scale: 7.0,
      }
    });

    const url = `https://router.huggingface.co/hf-inference/models/${model.id}`;
    console.log(`[Router Native] ${model.label} | token ...${token.slice(-4)}`);

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-wait-for-model': 'true',
      },
      body: payload,
      timeout: 120000
    });

    if (r.status === 503) {
      console.warn(`[Router Native] 503 model loading — ${model.label}`);
      return null;
    }
    if (r.status === 401 || r.status === 403) {
      console.warn(`[Router Native] Auth fail ${r.status}`);
      return 'AUTH_FAIL';
    }
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.warn(`[Router Native] HTTP ${r.status}: ${t.slice(0, 100)}`);
      return null;
    }

    const ct = r.headers.get('content-type') || '';
    if (ct.startsWith('image/')) {
      const buf = await r.buffer();
      if (buf.length > 5000) {
        console.log(`[Router Native] ✅ ${model.label}`);
        return `data:${ct};base64,${buf.toString('base64')}`;
      }
    }

    // Algunos modelos responden con JSON+base64
    const body = await r.text();
    try {
      const json = JSON.parse(body);
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        const b64 = item.image || item.data || item.generated_image || '';
        if (b64 && b64.length > 100) {
          console.log(`[Router Native JSON] ✅ ${model.label}`);
          return `data:image/png;base64,${b64}`;
        }
      }
    } catch {}

    return null;
  }

  // ── Estrategia B: api-inference.huggingface.co (endpoint clásico fallback) ──
  async function tryServerless(token, model) {
    const isFlux = model.id.includes('FLUX') || model.id.includes('flux');
    const payload = JSON.stringify({
      inputs: prompt,
      parameters: isFlux ? { width, height, num_inference_steps: steps } : {
        negative_prompt: negativePrompt || '',
        width, height,
        num_inference_steps: Math.max(steps, 20),
        guidance_scale: 7.5,
      }
    });

    const url = `https://api-inference.huggingface.co/models/${model.id}`;
    console.log(`[Serverless] ${model.label} | token ...${token.slice(-4)}`);

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-wait-for-model': 'true',
      },
      body: payload,
      timeout: 120000
    });

    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const buf = await r.buffer();
    if (buf.length > 5000) {
      console.log(`[Serverless] ✅ ${model.label}`);
      return `data:${ct};base64,${buf.toString('base64')}`;
    }
    return null;
  }

  // ── Ejecutar cascada ──────────────────────────────────────────────────────
  let lastError = '';
  const authFailed = new Set();

  // Estrategia A primero — igual a Alicia
  for (const model of MANGA_MODELS) {
    for (let i = 0; i < 3; i++) {
      const token = nextToken();
      if (authFailed.has(token)) continue;
      try {
        const result = await tryRouterNative(token, model);
        if (result === 'AUTH_FAIL') { authFailed.add(token); continue; }
        if (result) return res.json({ image: result, model: model.label, strategy: 'router-native' });
      } catch (e) {
        lastError = e.message;
        console.warn(`[Router Native] Error: ${e.message.slice(0, 80)}`);
      }
    }
  }

  // Estrategia B — endpoint clásico
  for (const model of MANGA_MODELS.slice(0, 2)) {
    for (let i = 0; i < 2; i++) {
      const token = nextToken();
      if (authFailed.has(token)) continue;
      try {
        const result = await tryServerless(token, model);
        if (result) return res.json({ image: result, model: model.label, strategy: 'serverless' });
      } catch (e) {
        lastError = e.message;
      }
    }
  }

  res.status(500).json({ error: `Todos los modelos HF fallaron. Último error: ${lastError}` });
});

app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  🎌 MangaCraft — Proxy Hugging Face              ║');
  console.log(`║  ✅ Servidor corriendo en http://localhost:${PORT}  ║`);
  console.log('║  📡 Usando router.huggingface.co (endpoint 2025) ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
});
