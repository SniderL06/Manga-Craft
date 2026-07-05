import dns from 'dns';

dns.resolve4('api-inference.huggingface.co', (err, addresses) => {
  if (err) {
    console.error('DNS Resolve Error:', err);
    return;
  }
  console.log('Addresses:', addresses);
});
