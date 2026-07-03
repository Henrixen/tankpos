// /api/parse-image.js
// Vercel serverless function — proxies image to Anthropic API with server-side key.
// Set ANTHROPIC_API_KEY in Vercel dashboard → Project → Settings → Environment Variables.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { image, mediaType } = req.body || {};
  if (!image || !mediaType) {
    return res.status(400).json({ error: "Missing image or mediaType in request body" });
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
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: image }
            },
            {
              type: "text",
              text: "Extract all vessel positions from this image. Return ONLY a valid JSON array, no markdown, no other text. Each object must have exactly these keys: operator, vessel, port, date, direction. Use empty string for missing fields. Vessel names and ports in UPPERCASE. Example: [{\"operator\":\"MAERSK TANKERS\",\"vessel\":\"ERIKA SCHULTE\",\"port\":\"GRANGEMOUTH\",\"date\":\"6 JUL\",\"direction\":\"\"}]"
            }
          ]
        }]
      }),
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("parse-image error:", err);
    return res.status(500).json({ error: err.message });
  }
}
