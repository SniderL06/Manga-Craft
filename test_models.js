// Test script to run through the models and tokens and output exact statuses.
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
  'black-forest-labs/FLUX.1-schnell',
  'Lykon/dreamshaper-8',
  'stabilityai/stable-diffusion-xl-base-1.0'
];

async function testAll() {
  console.log("Starting diagnostic test on Hugging Face API...");
  
  // Test first token across all models
  const token = HF_TOKENS[0];
  
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: 'girl reading a book, manga style' })
      });
      
      console.log(`Model: ${model}`);
      console.log(`  - Status: ${res.status} (${res.statusText})`);
      const text = await res.text();
      console.log(`  - Body snippet: ${text.substring(0, 150)}`);
    } catch (err) {
      console.error(`  - Fetch failed for ${model}:`, err.message);
    }
  }
}

testAll();
