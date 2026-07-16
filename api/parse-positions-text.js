// /api/parse-positions-text.js
// Vercel serverless function — proxies free-form pasted text to Anthropic API
// with server-side key, extracting vessel positions from whatever format it's in.
// Fallback for Quick Positions when the deterministic (regex-based) parsers
// in ReportsTab.jsx don't confidently match — headers, region markers,
// optional fields, arbitrary column orders, etc. are all fine here since
// this relies on semantic understanding, not fixed positional patterns.
// Set ANTHROPIC_API_KEY in Vercel dashboard → Project → Settings → Environment Variables.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Missing text in request body" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured on server" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content:
            "Extract every vessel position from the pasted text below, whatever format it's in — " +
            "it may have a header row, region/area markers (e.g. UKC, MED — carry the most recent " +
            "one forward as each vessel's region if there's a spot for it), one field per line, " +
            "space-separated single lines, dash-separated lines, or a table copied from a PDF/email. " +
            "Some fields may be optional or missing entirely for some vessels (e.g. a status like " +
            "'Subs' or 'Fixed' is often omitted) — do not let a missing optional field shift other " +
            "fields out of place; use context and field type (e.g. dates look like '18-JUL' or '18 JUL', " +
            "DWT/CBM are plain numbers, ice class looks like '1A'/'1B'/'1C' or 'N/A') to figure out what " +
            "each value actually is.\n\n" +
            "Return ONLY a valid JSON array, no markdown, no other text. Each object must have exactly " +
            "these keys: operator, vessel, port, date, direction. Use an empty string for any field " +
            "that isn't present or isn't clearly determinable — never guess a value that isn't there. " +
            "Vessel names and ports in UPPERCASE. Dates in 'D MMM' format (e.g. '18 JUL') if a month is " +
            "given; if only a day number is given with no month, use an empty string for date instead of " +
            "guessing the month. Put any status/comment/cargo-type info (e.g. 'Subs', 'NAP + JET CLN') " +
            "into the direction field if there's no better place for it.\n\n" +
            "Example: [{\"operator\":\"MAERSK TANKERS\",\"vessel\":\"ERIKA SCHULTE\",\"port\":\"GRANGEMOUTH\",\"date\":\"6 JUL\",\"direction\":\"NAP + JET CLN\"}]\n\n" +
            "Text to parse:\n" + text
        }]
      }),
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("parse-positions-text error:", err);
    return res.status(500).json({ error: err.message });
  }
}
