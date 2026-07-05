// Node test script to check general internet access
async function test() {
  try {
    const res = await fetch('https://www.google.com');
    console.log('Google Status:', res.status);
  } catch (err) {
    console.error('Google Fetch Error:', err);
  }
}
test();
