export default async function handler(req, res) {
  try {
    const response = await fetch("https://pbt-international.com/price-quotes", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      }
    });
    const html = await response.text();

    function extract(port, grade) {
      // PBT table has port names and prices in rows
      const regex = new RegExp(port + '[\\s\\S]{0,500}?' + grade + '[\\s\\S]{0,200}?(\\d{3,4})', 'i');
      const m = html.match(regex);
      return m ? parseInt(m[1]) : null;
    }

    // Parse the date
    const dateMatch = html.match(/Last update[:\s]+(\d{4}-\d{2}-\d{2})/i);
    const date = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0,10);

    // Scrape prices using row position in table
    const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const prices = {};
    
    for (const row of rows) {
      const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
        .map(td => td.replace(/<[^>]+>/g, '').trim());
      
      if (!cells.length) continue;
      const port = cells[1]?.toLowerCase() || "";
      const hsfo = parseInt(cells[2]);
      const vlsfo = parseInt(cells[3]);
      const mgo = parseInt(cells[4]);

      if (port.includes("rotterdam") && !prices.ARA_HSFO) {
        prices.ARA_HSFO = hsfo || null;
        prices.ARA_VLSFO = vlsfo || null;
        prices.ARA_MGO = mgo || null;
      }
      if (port.includes("fujairah") && !prices.FUJ_HSFO) {
        prices.FUJ_HSFO = hsfo || null;
        prices.FUJ_VLSFO = vlsfo || null;
        prices.FUJ_MGO = mgo || null;
      }
      if (port.includes("singapore") && !prices.SIN_HSFO) {
        prices.SIN_HSFO = hsfo || null;
        prices.SIN_VLSFO = vlsfo || null;
        prices.SIN_MGO = mgo || null;
      }
    }

    // Fallback if scraping fails
    const fallback = {
      ARA_HSFO:600, ARA_VLSFO:650, ARA_MGO:1075,
      FUJ_HSFO:580, FUJ_VLSFO:620, FUJ_MGO:1050,
      SIN_HSFO:570, SIN_VLSFO:610, SIN_MGO:1040,
    };

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      date,
      ...fallback,   // fallback first
      ...Object.fromEntries(Object.entries(prices).filter(([,v])=>v&&!isNaN(v))) // override with live if valid
    });

  } catch(e) {
    res.status(200).json({
      date: new Date().toISOString().slice(0,10),
      ARA_HSFO:600, ARA_VLSFO:650, ARA_MGO:1075,
      FUJ_HSFO:580, FUJ_VLSFO:620, FUJ_MGO:1050,
      SIN_HSFO:570, SIN_VLSFO:610, SIN_MGO:1040,
      error: e.message
    });
  }
}
