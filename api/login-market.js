export default async function handler(req,res){
  let brent=null;
  let mgoAra=null;
  let mgoSingapore=null;
  let mgoUsg=null;

  const fetchWithTimeout=async(url,opts={},timeoutMs=8000)=>{
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
    try{return await fetch(url,{...opts,signal:ctrl.signal});}
    finally{clearTimeout(timer);}
  };

  // Brent front-month futures from Yahoo Finance (BZ=F).
  try{
    const r=await fetchWithTimeout(
      "https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?interval=1d&range=5d",
      {headers:{"User-Agent":"Mozilla/5.0"}}
    );
    if(r.ok){
      const j=await r.json();
      const p=Number(j?.chart?.result?.[0]?.meta?.regularMarketPrice);
      if(Number.isFinite(p))brent=p;
    }
  }catch(e){console.warn("login-market: Brent fetch failed:",e?.message||e);}

  // Ship & Bunker publishes a Top Ports table with explicit columns:
  // Port | VLSFO | +/- | MGO | +/-. We read the MGO column directly.
  try{
    const r=await fetchWithTimeout("https://shipandbunker.com/prices/us-usa",{
      headers:{
        "User-Agent":"Mozilla/5.0 (compatible; BrokerDashboard/1.0)",
        "Accept":"text/html,application/xhtml+xml"
      }
    });
    if(!r.ok)throw new Error(`Ship & Bunker HTTP ${r.status}`);

    const html=await r.text();
    const plain=html
      .replace(/<script[\s\S]*?<\/script>/gi," ")
      .replace(/<style[\s\S]*?<\/style>/gi," ")
      .replace(/&nbsp;|&#160;/gi," ")
      .replace(/&amp;/gi,"&")
      .replace(/&#8722;|&minus;/gi,"-")
      .replace(/<[^>]+>/g," ")
      .replace(/\s+/g," ")
      .trim();

    const topPortMgo=port=>{
      const esc=port.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
      const price="([0-9]{3,4}(?:\\.[0-9]{1,2})?)";
      const chg="[+\\-]?[0-9]{1,4}(?:\\.[0-9]{1,2})?";
      const re=new RegExp(`${esc}\\s+${price}\\s+${chg}\\s+${price}\\s+${chg}`,"i");
      const m=plain.match(re);
      if(!m)return null;
      const n=Number(m[2]);
      return Number.isFinite(n)&&n>=500&&n<=2500?n:null;
    };

    mgoSingapore=topPortMgo("Singapore");
    mgoAra=topPortMgo("Rotterdam");
    mgoUsg=topPortMgo("Houston");

    if([mgoSingapore,mgoAra,mgoUsg].some(v=>v==null)){
      console.warn("login-market: one or more Top Ports MGO rows were not parsed",{mgoSingapore,mgoAra,mgoUsg});
    }
  }catch(e){console.warn("login-market: Ship & Bunker fetch failed:",e?.message||e);}

  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({
    brent,
    mgoAra,
    mgoSingapore,
    mgoUsg,
    brentSource:"Yahoo Finance BZ=F",
    bunkerSource:"Ship & Bunker Top Ports / MGO column",
    bunkerSourceUrl:"https://shipandbunker.com/prices/us-usa",
    bunkerMethod:"explicit-table-column",
    updatedAt:new Date().toISOString()
  });
}
