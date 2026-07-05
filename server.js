// Local Express proxy server for Hugging Face API
// This runs on the user's machine and has full internet access (no sandbox restrictions)
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3001;

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

const MODELS = [
  'cagliostrolab/animagine-xl-3.1',
  'Lykon/dreamshaper-8',
  'stabilityai/stable-diffusion-xl-base-1.0',
  'black-forest-labs/FLUX.1-schnell'
];

let tokenIndex = 0;
function getNextToken() {
  const t = HF_TOKENS[tokenIndex];
  tokenIndex = (tokenIndex + 1) % HF_TOKENS.length;
  return t;
}

app.use(cors({ origin: '*' }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'MangaCraft proxy server running' });
});

// Image generation endpoint
app.post('/generate', async (req, res) => {
  const { prompt, negativePrompt, steps = 25 } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  let lastError = null;

  for (const model of MODELS) {
    for (let t = 0; t < 3; t++) {
      const token = getNextToken();
      try {
        console.log(`[HF Proxy] Model: ${model} | Token: ...${token.slice(-4)}`);

        const isFlux = model.toLowerCase().includes('flux');
        const body = { inputs: prompt };
        if (!isFlux) {
          body.parameters = {
            negative_prompt: negativePrompt || '',
            guidance_scale: 7.5,
            num_inference_steps: steps
          };
        }

        const hfRes = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body),
          timeout: 120000
        });

        if (hfRes.status === 503) {
          throw new Error(`Model ${model} loading (503). Trying next...`);
        }

        if (!hfRes.ok) {
          const errText = await hfRes.text();
          throw new Error(`HF API ${hfRes.status}: ${errText.substring(0, 200)}`);
        }

        const contentType = hfRes.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
          const body = await hfRes.text();
          throw new Error(`Not an image response: ${body.substring(0, 200)}`);
        }

        const imageBuffer = await hfRes.buffer();
        const base64 = `data:${contentType};base64,${imageBuffer.toString('base64')}`;
        
        console.log(`[HF Proxy] Success with ${model}`);
        return res.json({ image: base64, model });

      } catch (err) {
        console.warn(`[HF Proxy] Failed: ${err.message}`);
        lastError = err;
      }
    }
  }

  res.status(500).json({ error: `All models failed. Last: ${lastError?.message}` });
});

app.listen(PORT, () => {
  console.log(`\n✅ MangaCraft Proxy Server running at http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Generate: POST http://localhost:${PORT}/generate\n`);
});
