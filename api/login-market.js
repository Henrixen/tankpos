export default async function handler(req,res){
  let brent=null;
  let mgoAra=null;
  let mgoSingapore=null;
  let mgoUsg=null;

  const fetchWithTimeout=async(url,opts={},timeoutMs=7000)=>{
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
    try{
      return await fetch(url,{...opts,signal:ctrl.signal});
    }finally{
      clearTimeout(timer);
    }
  };

  // Brent front-month futures from Yahoo Finance (BZ=F).
  try{
    const r=await fetchWithTimeout(
      "https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?interval=1d&range=5d",
      {headers:{"User-Agent":"Mozilla/5.0"}}
    );
    if(r.ok){
      const j=await r.json();
      const p=j?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if(Number.isFinite(Number(p)))brent=Number(p);
    }
  }catch(e){
    console.warn("login-market: Brent fetch failed:",e?.message||e);
  }

  // Ship & Bunker: try to extract an explicitly MGO-labelled price close to
  // each port. If their markup changes and no labelled value is found, use
  // the old port-level highest-price heuristic as a fallback (MGO is normally
  // the highest conventional bunker grade), but report that fallback in the
  // response so it is visible during troubleshooting.
  let bunkerMethod="mgo-labelled";
  try{
    const r=await fetchWithTimeout("https://shipandbunker.com/prices",{
      headers:{
        "User-Agent":"Mozilla/5.0 (compatible; BrokerDashboard/1.0)",
        "Accept":"text/html,application/xhtml+xml"
      }
    });

    if(r.ok){
      const raw=await r.text();

      const plain=raw
        .replace(/<script[\s\S]*?<\/script>/gi," ")
        .replace(/<style[\s\S]*?<\/style>/gi," ")
        .replace(/&nbsp;|&#160;/gi," ")
        .replace(/&amp;/gi,"&")
        .replace(/<[^>]+>/g," ")
        .replace(/\s+/g," ");

      const validPrice=v=>{
        const n=Number(String(v).replace(/,/g,""));
        return Number.isFinite(n)&&n>=250&&n<=2500?n:null;
      };

      const labelledMgoForPort=name=>{
        const hay=plain;
        const lower=hay.toLowerCase();
        const needle=name.toLowerCase();
        let pos=0;
        const candidates=[];

        while((pos=lower.indexOf(needle,pos))!==-1){
          const a=Math.max(0,pos-700);
          const b=Math.min(hay.length,pos+1400);
          const snippet=hay.slice(a,b);

          // Match MGO / MGO LS / DMA followed reasonably closely by a price.
          const after=[
            /\bMGO(?:\s*LS)?\b[^0-9]{0,90}([0-9]{3,4}(?:\.[0-9]{1,2})?)/ig,
            /\bDMA\b[^0-9]{0,90}([0-9]{3,4}(?:\.[0-9]{1,2})?)/ig
          ];
          for(const re of after){
            let m;
            while((m=re.exec(snippet))){
              const n=validPrice(m[1]);
              if(n!=null)candidates.push({n,d:Math.abs((a+m.index)-pos)});
            }
          }

          // Also handle markup/text where the price appears immediately before MGO.
          const before=/([0-9]{3,4}(?:\.[0-9]{1,2})?)[^A-Za-z0-9]{0,90}\b(?:MGO(?:\s*LS)?|DMA)\b/ig;
          let bm;
          while((bm=before.exec(snippet))){
            const n=validPrice(bm[1]);
            if(n!=null)candidates.push({n,d:Math.abs((a+bm.index)-pos)});
          }
          pos+=needle.length;
        }

        if(!candidates.length)return null;
        candidates.sort((a,b)=>a.d-b.d);
        return candidates[0].n;
      };

      const highestForPort=name=>{
        const vals=[];
        const re=new RegExp(name+"\\s+([0-9]{3,4}(?:\\.[0-9]{1,2})?)","gi");
        let m;
        while((m=re.exec(plain))){
          const n=validPrice(m[1]);
          if(n!=null)vals.push(n);
        }
        return vals.length?Math.max(...new Set(vals)):null;
      };

      const getPortMgo=name=>{
        const labelled=labelledMgoForPort(name);
        if(labelled!=null)return labelled;
        bunkerMethod="port-highest-fallback";
        return highestForPort(name);
      };

      mgoSingapore=getPortMgo("Singapore");
      mgoAra=getPortMgo("Rotterdam");
      mgoUsg=getPortMgo("Houston");
    }
  }catch(e){
    console.warn("login-market: Ship & Bunker fetch failed:",e?.message||e);
  }

  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({
    brent,
    mgoAra,
    mgoSingapore,
    mgoUsg,
    brentSource:"Yahoo Finance BZ=F",
    bunkerSource:"Ship & Bunker",
    bunkerMethod,
    updatedAt:new Date().toISOString()
  });
}
