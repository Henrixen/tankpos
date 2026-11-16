// Deploy as api/claude.js in your Vercel project.
// ANTHROPIC_API_KEY must be configured as a server-side Vercel environment variable.
const SAFE_MODEL = 'claude-sonnet-4-6';

function permittedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  let parsed;
  try { parsed = new URL(origin); } catch { return false; }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === 'localhost')) return false;

  // Explicit production/custom domains, comma-separated in Vercel if needed.
  const configured = [
    'https://tankpos.vercel.app',
    ...(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  ];
  if (configured.includes(parsed.origin)) return true;

  // Permit requests from the same hostname that served this API (including Vercel previews).
  // Vercel sets x-forwarded-host; host is the fallback for local deployments.
  const servedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
  return !!servedHost && parsed.host.toLowerCase() === servedHost;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });
  if (!permittedOrigin(req)) return res.status(403).json({ error: { message: 'Forbidden: origin not allowed' } });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: { message: 'Anthropic API key is not configured on the server' } });

  const body = req.body || {};
  if (!Array.isArray(body.messages) || !body.messages.length) {
    return res.status(400).json({ error: { message: 'Missing messages' } });
  }
  const model = String(body.model || '');
  if (!model || /opus|fable|mythos/i.test(model)) body.model = SAFE_MODEL;
  body.max_tokens = Math.min(Math.max(Number(body.max_tokens) || 1024, 1), 4000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Claude upstream request failed:', error);
    return res.status(502).json({ error: { message: 'Unable to reach Anthropic API' } });
  }
}
