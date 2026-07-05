// api/generate.js — Vercel Serverless Function
// Equivalent to the Express server.cjs but runs as a Vercel function
// This is the HuggingFace proxy that handles CORS-blocked calls from the browser.

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

const MANGA_MODELS = [
  { id: 'black-forest-labs/FLUX.1-schnell', label: 'FLUX.1 Schnell' },
  { id: 'black-forest-labs/FLUX.1-dev',    label: 'FLUX.1 Dev' },
  { id: 'cagliostrolab/animagine-xl-3.1',  label: 'Animagine XL 3.1' },
  { id: 'stabilityai/stable-diffusion-xl-base-1.0', label: 'SDXL Base' },
];

let tokenIndex = 0;
function nextToken() {
  const t = HF_TOKENS[tokenIndex % HF_TOKENS.length];
  tokenIndex++;
  return t;
}

async function tryRouterNative(token, model, prompt, negativePrompt, width, height, steps) {
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

async function tryServerless(token, model, prompt, negativePrompt, width, height, steps) {
  const isFlux = model.id.includes('FLUX') || model.id.includes('flux');
  const payload = JSON.stringify({
    inputs: prompt,
    parameters: isFlux
      ? { width, height, num_inference_steps: steps }
      : { negative_prompt: negativePrompt || '', width, height, num_inference_steps: Math.max(steps, 20), guidance_scale: 7.5 }
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

  const { prompt, negativePrompt, steps = 4, width = 768, height = 1024 } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt requerido' });

  const authFailed = new Set();
  let lastError = '';

  // Strategy A: router.huggingface.co
  for (const model of MANGA_MODELS) {
    for (let i = 0; i < 3; i++) {
      const token = nextToken();
      if (authFailed.has(token)) continue;
      try {
        const result = await tryRouterNative(token, model, prompt, negativePrompt, width, height, steps);
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
        const result = await tryServerless(token, model, prompt, negativePrompt, width, height, steps);
        if (result) return res.status(200).json({ image: result, model: model.label, strategy: 'serverless' });
      } catch (e) {
        lastError = e.message;
      }
    }
  }

  res.status(500).json({ error: `Todos los modelos HF fallaron. Último error: ${lastError}` });
}
