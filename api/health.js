// api/health.js — Vercel Health Check Endpoint
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ status: 'ok', message: 'MangaCraft on Vercel ✅' });
}
