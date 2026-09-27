// api/generate.js — Vercel Serverless Function
// Equivalent to the Express server.cjs but runs as a Vercel function
// This is the HuggingFace proxy that handles CORS-blocked calls from the browser.

// Los tokens viven en variables de entorno de Vercel (HF_TOKEN_1..HF_TOKEN_10),
// Si no están configuradas, usamos los tokens hardcodeados como fallback.
const FALLBACK_TOKENS = [
  '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',
  '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',
  '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',
  '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',
  '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',
  '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',
  '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',
  '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',
  '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',
  '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',
];

const ENV_TOKENS = [
  process.env.HF_TOKEN_1,  process.env.HF_TOKEN_2,
  process.env.HF_TOKEN_3,  process.env.HF_TOKEN_4,
  process.env.HF_TOKEN_5,  process.env.HF_TOKEN_6,
  process.env.HF_TOKEN_7,  process.env.HF_TOKEN_8,
  process.env.HF_TOKEN_9,  process.env.HF_TOKEN_10,
].filter(Boolean);

// Usar env vars si están configuradas, si no los tokens hardcodeados
const HF_TOKENS = ENV_TOKENS.length > 0 ? ENV_TOKENS : FALLBACK_TOKENS;

// ── AI Horde config ──────────────────────────────────────────────────────────
const AI_HORDE_KEY = process.env.AI_HORDE_KEY || '0000000000';
const AI_HORDE_CLIENT = 'MangaCraft:1.0:anonymous';
const AI_HORDE_MODELS = ['Animagine XL 3.1', 'Anything V5'];

const MANGA_MODELS = [
  { id: 'cagliostrolab/animagine-xl-3.1',           label: 'Animagine XL 3.1' },
  { id: 'stabilityai/stable-diffusion-xl-base-1.0', label: 'SDXL Base' },
  { id: 'black-forest-labs/FLUX.1-dev',             label: 'FLUX.1 Dev' },
  { id: 'black-forest-labs/FLUX.1-schnell',          label: 'FLUX.1 Schnell' },
];

let tokenIndex = 0;
function nextToken() {
  const t = HF_TOKENS[tokenIndex % HF_TOKENS.length];
  tokenIndex++;
  return t;
}

async function tryAIHorde(prompt, negativePrompt, width, height, contentRating) {
  const isNSFW = contentRating === 'adult';
  const w = Math.min(Math.round(width / 64) * 64, 1024);
  const h = Math.min(Math.round(height / 64) * 64, 1024);
  const fullPrompt = negativePrompt ? `${prompt} ### ${negativePrompt}` : prompt;

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
      r2: false,
      shared: false,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    throw new Error(`AI Horde submit HTTP ${submitRes.status}: ${errText.slice(0, 100)}`);
  }

  const submitData = await submitRes.json();
  const jobId = submitData.id;
  if (!jobId) throw new Error('AI Horde no devolvió job ID');

  const MAX_WAIT_MS = 60000;
  const POLL_MS = 4000;
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    let checkData;
    try {
      const checkRes = await fetch(`https://aihorde.net/api/v2/generate/check/${jobId}`, {
        headers: { apikey: AI_HORDE_KEY, 'Client-Agent': AI_HORDE_CLIENT },
        signal: AbortSignal.timeout(8000),
      });
      if (!checkRes.ok) continue;
      checkData = await checkRes.json();
    } catch {
      continue;
    }

    if (checkData.faulted) throw new Error('AI Horde worker faulted');
    if (checkData.is_possible === false) throw new Error('No workers available for models');

    if (checkData.done) {
      const statusRes = await fetch(`https://aihorde.net/api/v2/generate/status/${jobId}`, {
        headers: { apikey: AI_HORDE_KEY, 'Client-Agent': AI_HORDE_CLIENT },
        signal: AbortSignal.timeout(12000),
      });
      if (!statusRes.ok) throw new Error(`AI Horde status HTTP ${statusRes.status}`);

      const status = await statusRes.json();
      const gen = status.generations?.[0];
      if (!gen?.img) throw new Error('No image in status');

      const imgData = gen.img.startsWith('data:')
        ? gen.img
        : `data:image/webp;base64,${gen.img}`;

      return { image: imgData, model: `AI Horde / ${gen.model}`, strategy: 'ai-horde' };
    }
  }

  throw new Error('AI Horde: timeout');
}

async function tryRouterNative(token, model, prompt, negativePrompt, width, height, steps, seed) {
  const params = {
    negative_prompt: negativePrompt || '',
    width,
    height,
    num_inference_steps: steps,
    guidance_scale: 7.0,
  };
  if (typeof seed === 'number' && !Number.isNaN(seed)) params.seed = seed;

  const payload = JSON.stringify({
    inputs: prompt,
    parameters: params
  });

  const url = `https://router.huggingface.co/hf-inference/models/${model.id}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-wait-for-model': 'true',
    },
    body: payload,
    signal: AbortSignal.timeout(110000)
  });

  if (r.status === 503) return null;
  if (r.status === 401 || r.status === 403) return 'AUTH_FAIL';
  if (!r.ok) return null;

  const ct = r.headers.get('content-type') || '';
  if (ct.startsWith('image/')) {
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 5000) {
      const b64 = Buffer.from(buf).toString('base64');
      return `data:${ct};base64,${b64}`;
    }
  }

  const body = await r.text();
  try {
    const json = JSON.parse(body);
    const items = Array.isArray(json) ? json : [json];
    for (const item of items) {
      const b64 = item.image || item.data || item.generated_image || '';
      if (b64 && b64.length > 100) return `data:image/png;base64,${b64}`;
    }
  } catch {}

  return null;
}

async function tryServerless(token, model, prompt, negativePrompt, width, height, steps, seed) {
  const isFlux = model.id.includes('FLUX') || model.id.includes('flux');
  const hasSeed = typeof seed === 'number' && !Number.isNaN(seed);
  const params = isFlux
    ? { width, height, num_inference_steps: steps }
    : { negative_prompt: negativePrompt || '', width, height, num_inference_steps: Math.max(steps, 20), guidance_scale: 7.5 };
  if (hasSeed) params.seed = seed;

  const payload = JSON.stringify({
    inputs: prompt,
    parameters: params
  });

  const url = `https://api-inference.huggingface.co/models/${model.id}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'x-wait-for-model': 'true' },
    body: payload,
    signal: AbortSignal.timeout(110000)
  });

  if (!r.ok) return null;
  const ct = r.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) return null;
  const buf = await r.arrayBuffer();
  if (buf.byteLength > 5000) {
    return `data:${ct};base64,${Buffer.from(buf).toString('base64')}`;
  }
  return null;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'MangaCraft HF Proxy (Vercel)' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, negativePrompt, steps = 8, width = 768, height = 1024, contentRating = 'general', seed } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt requerido' });

  const authFailed = new Set();
  let lastError = '';

  // Strategy 1: AI Horde (gratis, especializada en anime)
  try {
    const hordeResult = await tryAIHorde(prompt, negativePrompt, width, height, contentRating);
    if (hordeResult) return res.status(200).json(hordeResult);
  } catch (e) {
    lastError = e.message;
  }

  // Strategy A: router.huggingface.co
  for (const model of MANGA_MODELS) {
    for (let i = 0; i < 3; i++) {
      const token = nextToken();
      if (authFailed.has(token)) continue;
      try {
        const result = await tryRouterNative(token, model, prompt, negativePrompt, width, height, steps, seed);
        if (result === 'AUTH_FAIL') { authFailed.add(token); continue; }
        if (result) return res.status(200).json({ image: result, model: model.label, strategy: 'router-native' });
      } catch (e) {
        lastError = e.message;
      }
    }
  }

  // Strategy B: api-inference.huggingface.co
  for (const model of MANGA_MODELS.slice(0, 2)) {
    for (let i = 0; i < 2; i++) {
      const token = nextToken();
      if (authFailed.has(token)) continue;
      try {
        const result = await tryServerless(token, model, prompt, negativePrompt, width, height, steps, seed);
        if (result) return res.status(200).json({ image: result, model: model.label, strategy: 'serverless' });
      } catch (e) {
        lastError = e.message;
      }
    }
  }

  res.status(500).json({ error: `Todos los modelos HF fallaron. Último error: ${lastError}` });
}
