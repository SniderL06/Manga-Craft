// MangaCraft — Proxy Express (CommonJS)
// Estrategia de generación:
//   1️⃣  AI Horde   — gratuito, sin límites, modelos anime especializados
//   2️⃣  HF Router  — router.huggingface.co (fallback)
//   3️⃣  HF Classic — api-inference.huggingface.co (fallback final)
// Si el proxy falla por completo, el cliente cae a Pollinations.ai
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3001;

// ── AI Horde — generador gratuito y comunitario ────────────────────────────────
// Key anónima '0000000000' funciona sin registro (menor prioridad en cola).
// Configura AI_HORDE_KEY en .env para mayor prioridad (cuenta gratis en aihorde.net).
const AI_HORDE_KEY = process.env.AI_HORDE_KEY || '0000000000';
const AI_HORDE_CLIENT = 'MangaCraft:1.0:anonymous';

// Modelos disponibles en AI Horde especializados en anime/manga.
// Lista completa: https://aihorde.net/api/v2/status/models
const AI_HORDE_MODELS = [
  'Animagine XL 3.1',   // SDXL especializado en anime — mejor calidad
  'Anything V5',        // SD1.5 anime clásico — muy rápido
];

// ── Tokens HuggingFace (fallback) ─────────────────────────────────────────────
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

// ── Modelos HuggingFace (fallback) ────────────────────────────────────────────
const MANGA_MODELS = [
  { id: 'black-forest-labs/FLUX.1-schnell', label: 'FLUX.1 Schnell (Rápido)' },
  { id: 'black-forest-labs/FLUX.1-dev',    label: 'FLUX.1 Dev (Alta calidad)' },
  { id: 'cagliostrolab/animagine-xl-3.1',  label: 'Animagine XL 3.1 (Anime)' },
  { id: 'stabilityai/stable-diffusion-xl-base-1.0', label: 'SDXL Base' },
];

let tokenIndex = 0;
function nextToken() {
  const t = HF_TOKENS[tokenIndex % HF_TOKENS.length];
  tokenIndex++;
  return t;
}

// ── AI Horde: generación asíncrona con polling ────────────────────────────────
// Flujo: POST /generate/async → polling /generate/check/{id} → GET /generate/status/{id}
// Documentación: https://aihorde.net/api#tag--v2
async function tryAIHorde(prompt, negativePrompt, width, height, contentRating) {
  const isNSFW = contentRating === 'adult';

  // AI Horde exige dimensiones múltiplos de 64
  const w = Math.min(Math.round(width / 64) * 64, 1024);
  const h = Math.min(Math.round(height / 64) * 64, 1024);

  // El prompt negativo va dentro del mismo campo separado por ###
  const fullPrompt = negativePrompt
    ? `${prompt} ### ${negativePrompt}`
    : prompt;

  console.log(`[AI Horde] Enviando trabajo — ${w}×${h} | nsfw=${isNSFW}`);

  const submitRes = await fetch('https://aihorde.net/api/v2/generate/async', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': AI_HORDE_KEY,
      'Client-Agent': AI_HORDE_CLIENT,
    },
    body: JSON.stringify({
      prompt: fullPrompt,
      params: {
        width: w,
        height: h,
        steps: 20,
        sampler_name: 'k_euler_a',
        cfg_scale: 7.0,
        n: 1,
        hires_fix: false,
        clip_skip: 2,
      },
      models: AI_HORDE_MODELS,
      nsfw: isNSFW,
      r2: false,     // r2=false → responde con base64 directamente (sin CDN externo)
      shared: false,
    }),
    timeout: 15000,
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    throw new Error(`AI Horde submit HTTP ${submitRes.status}: ${errText.slice(0, 120)}`);
  }

  const submitData = await submitRes.json();
  const jobId = submitData.id;
  if (!jobId) throw new Error('AI Horde no devolvió job ID');
  console.log(`[AI Horde] Trabajo aceptado — ID: ${jobId}`);

  // Polling: comprobamos cada 5 s durante un máximo de 2 minutos
  const MAX_WAIT_MS = 120000;
  const POLL_MS     = 5000;
  const deadline    = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, POLL_MS));

    let checkData;
    try {
      const checkRes = await fetch(`https://aihorde.net/api/v2/generate/check/${jobId}`, {
        headers: { 'apikey': AI_HORDE_KEY, 'Client-Agent': AI_HORDE_CLIENT },
        timeout: 10000,
      });
      if (!checkRes.ok) continue;
      checkData = await checkRes.json();
    } catch {
      continue; // error de red puntual, reintentamos
    }

    const pos  = checkData.queue_position ?? '?';
    const wait = checkData.wait_time      ?? '?';
    console.log(`[AI Horde] Cola: pos=${pos} | espera≈${wait}s | done=${checkData.done}`);

    if (checkData.faulted) {
      throw new Error('AI Horde: el trabajo falló en el worker (faulted)');
    }
    if (checkData.is_possible === false) {
      throw new Error('AI Horde: ningún worker disponible para los modelos solicitados');
    }

    if (checkData.done) {
      // Trabajo listo — obtenemos la imagen
      const statusRes = await fetch(`https://aihorde.net/api/v2/generate/status/${jobId}`, {
        headers: { 'apikey': AI_HORDE_KEY, 'Client-Agent': AI_HORDE_CLIENT },
        timeout: 15000,
      });
      if (!statusRes.ok) {
        throw new Error(`AI Horde status HTTP ${statusRes.status}`);
      }

      const status = await statusRes.json();
      const gen    = status.generations?.[0];
      if (!gen?.img) throw new Error('AI Horde: respuesta de status sin imagen');

      console.log(`[AI Horde] ✅ Imagen lista — modelo: ${gen.model}`);
      // Con r2=false, gen.img ya es base64 puro (sin prefijo data:)
      const imgData = gen.img.startsWith('data:')
        ? gen.img
        : `data:image/webp;base64,${gen.img}`;

      return { image: imgData, model: `AI Horde / ${gen.model}`, strategy: 'ai-horde' };
    }
  }

  throw new Error('AI Horde: timeout (>2 min) — sin respuesta del worker');
}

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'MangaCraft HF Proxy on port 3001' });
});

// ── Endpoint principal de generación ─────────────────────────────────────────
app.post('/generate', async (req, res) => {
  const { prompt, negativePrompt, steps = 4, width = 768, height = 1024, contentRating = 'general', seed = null } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt requerido' });

  // ── Estrategia A: router.huggingface.co/hf-inference/models/<id> (GRATUITO) ──
  // Igual al endpoint que usa Alicia — funciona con token READ.
  // Payload: { inputs: "<prompt>", parameters: { ... } }
  async function tryRouterNative(token, model) {
    const isSchnell = model.id.includes('schnell');
    const effectiveSteps = isSchnell ? Math.min(steps, 4) : steps;
    const payload = JSON.stringify({
      inputs: prompt,
      parameters: {
        negative_prompt: negativePrompt || '',
        width,
        height,
        num_inference_steps: effectiveSteps,
        guidance_scale: isSchnell ? 0 : 7.0,
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

  // ── Estrategia 1: AI Horde (primaria) ────────────────────────────────────
  try {
    const result = await tryAIHorde(prompt, negativePrompt, width, height, contentRating);
    if (result) return res.json(result);
  } catch (e) {
    lastError = e.message;
    console.warn(`[AI Horde] Falló, pasando a HuggingFace: ${e.message.slice(0, 100)}`);
  }

  // ── Estrategia 2: HF router.huggingface.co (fallback) ────────────────────
  for (const model of MANGA_MODELS) {
    for (let i = 0; i < 3; i++) {
      const token = nextToken();
      if (authFailed.has(token)) continue;
      try {
        const result = await tryRouterNative(token, model);
        if (result === 'AUTH_FAIL') { authFailed.add(token); continue; }
        if (result) return res.json({ image: result, model: model.label, strategy: 'hf-router' });
      } catch (e) {
        lastError = e.message;
        console.warn(`[HF Router] Error: ${e.message.slice(0, 80)}`);
      }
    }
  }

  // ── Estrategia 3: HF api-inference clásico (último recurso) ──────────────
  for (const model of MANGA_MODELS.slice(0, 2)) {
    for (let i = 0; i < 2; i++) {
      const token = nextToken();
      if (authFailed.has(token)) continue;
      try {
        const result = await tryServerless(token, model);
        if (result) return res.json({ image: result, model: model.label, strategy: 'hf-serverless' });
      } catch (e) {
        lastError = e.message;
      }
    }
  }

  res.status(500).json({ error: `Todos los generadores fallaron. Último error: ${lastError}` });
});

app.listen(PORT, () => {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  🎌 MangaCraft — Proxy de Generación de Imágenes     ║');
  console.log(`║  ✅ Servidor corriendo en http://localhost:${PORT}      ║`);
  console.log('║  1️⃣  AI Horde       — gratuito, modelos anime         ║');
  console.log('║  2️⃣  HF Router      — fallback HuggingFace            ║');
  console.log('║  3️⃣  HF Serverless  — fallback clásico HF             ║');
  console.log('║  4️⃣  Pollinations   — fallback cliente (sin proxy)    ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');
});

