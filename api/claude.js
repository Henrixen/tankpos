// /api/claude.js
// Server-side middleman: the browser talks to this, this talks to Claude.
// The key lives only in Vercel (ANTHROPIC_API_KEY) and never reaches the browser.

const ALLOWED_ORIGINS = ['https://tankpos.vercel.app']; // add your custom domain here if you have one
const SAFE_MODEL = 'claude-sonnet-4-6';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  // Only accept requests coming from your own website
  if (!ALLOWED_ORIGINS.includes(req.headers.origin)) {
    return res.status(403).json({ error: { message: 'Forbidden' } });
  }

  const body = req.body || {};
  if (!body.messages) return res.status(400).json({ error: { message: 'Missing messages' } });

  // Block expensive models: swap them for Sonnet
  const model = String(body.model || '');
  if (!model || /opus|fable|mythos/i.test(model)) body.model = SAFE_MODEL;

  // Cap answer length so one request can't cost much
  body.max_tokens = Math.min(Number(body.max_tokens) || 1024, 4000);

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return res.status(r.status).json(await r.json());
}
