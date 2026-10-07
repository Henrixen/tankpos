export default async function handler(req,res){
  const noCache={
    "Cache-Control":"no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0",
    "Pragma":"no-cache",
    "Expires":"0",
    "Surrogate-Control":"no-store"
  };
  Object.entries(noCache).forEach(([k,v])=>res.setHeader(k,v));

  const fetchWithTimeout=async(url,opts={},timeoutMs=8000)=>{
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
    try{return await fetch(url,{...opts,signal:ctrl.signal,cache:"no-store"});}
    finally{clearTimeout(timer);}
  };
  const clean=s=>String(s||"")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/&nbsp;|&#160;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&#8722;|&minus;/gi,"-")
    .replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ").trim();
  const num=s=>{
    const m=String(s||"").replace(/,/g,"").match(/\d{3,4}(?:\.\d+)?/);
    const n=m?Number(m[0]):NaN;
    return Number.isFinite(n)?n:null;
  };

  // Read an HTML table by its actual MGO column, never by price order.
  const parseMgoFromTables=(html,port)=>{
    const tables=html.match(/<table\b[\s\S]*?<\/table>/gi)||[];
    for(const table of tables){
      const rows=table.match(/<tr\b[\s\S]*?<\/tr>/gi)||[];
      let mgoIndex=-1;
      for(const row of rows){
        const cells=[...row.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(m=>clean(m[1]));
        if(!cells.length)continue;
        const headerIdx=cells.findIndex(c=>/^MGO(?:\s|$|\+\/\-|\$)/i.test(c));
        if(headerIdx>=0){mgoIndex=headerIdx;continue;}
        if(mgoIndex>=0 && cells[0] && cells[0].toLowerCase().includes(port.toLowerCase())){
          const n=num(cells[mgoIndex]);
          if(n!=null && n>=500 && n<=2500)return n;
        }
      }
    }
    return null;
  };

  let brent=null,mgoHouston=null,mgoAra=null,mgoSingapore=null;

  try{
    const r=await fetchWithTimeout("https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?interval=1d&range=5d&_="+Date.now(),{headers:{"User-Agent":"Mozilla/5.0"}});
    if(r.ok){
      const j=await r.json();
      const p=Number(j?.chart?.result?.[0]?.meta?.regularMarketPrice);
      if(Number.isFinite(p))brent=p;
    }
  }catch(e){console.warn("login-market Brent:",e?.message||e);}

  try{
    const url="https://www.shipandbunker.com/prices?nocache="+Date.now();
    const r=await fetchWithTimeout(url,{headers:{
      "User-Agent":"Mozilla/5.0 (compatible; BrokerDashboard/1.0)",
      "Accept":"text/html,application/xhtml+xml",
      "Cache-Control":"no-cache",
      "Pragma":"no-cache"
    }});
    if(!r.ok)throw new Error(`Ship & Bunker HTTP ${r.status}`);
    const html=await r.text();
    mgoHouston=parseMgoFromTables(html,"Houston");
    mgoAra=parseMgoFromTables(html,"Rotterdam");
    mgoSingapore=parseMgoFromTables(html,"Singapore");

    // Deliberately NO cross-port fallback and NO VLSFO fallback.
    if([mgoHouston,mgoAra,mgoSingapore].some(v=>v==null)){
      console.warn("login-market: missing explicit MGO table value",{mgoHouston,mgoAra,mgoSingapore});
    }
  }catch(e){console.warn("login-market Ship & Bunker:",e?.message||e);}

  return res.status(200).json({
    brent,
    mgoHouston,
    mgoUsg:mgoHouston, // backward compatibility with current DesktopApp
    mgoAra,
    mgoSingapore,
    bunkerSource:"Ship & Bunker",
    bunkerGrade:"MGO",
    bunkerSourceUrl:"https://www.shipandbunker.com/prices",
    updatedAt:new Date().toISOString()
  });
}
