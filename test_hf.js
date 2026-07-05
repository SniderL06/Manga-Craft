// Node test script using native fetch
async function test() {
  const token = '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';
  const model = 'Lykon/dreamshaper-8';
  
  try {
    const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: 'manga style girl running' })
    });
    
    console.log('Status:', res.status);
    console.log('Status Text:', res.statusText);
    
    const text = await res.text();
    console.log('Body:', text.substring(0, 500));
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
