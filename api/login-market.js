export default async function handler(req,res){
  let brent=null;
  let mgoAra=null;
  let mgoSingapore=null;
  let mgoUsg=null;

  try{
    const r=await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?interval=1d&range=5d",
      {headers:{"User-Agent":"Mozilla/5.0"}}
    );
    if(r.ok){
      const j=await r.json();
      brent=j?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    }
  }catch(_){}

  try{
    const r=await fetch("https://shipandbunker.com/prices",{
      headers:{
        "User-Agent":"Mozilla/5.0",
        "Accept":"text/html,application/xhtml+xml"
      }
    });

    if(r.ok){
      let html=await r.text();

      html=html
        .replace(/<script[\s\S]*?<\/script>/gi," ")
        .replace(/<style[\s\S]*?<\/style>/gi," ")
        .replace(/<[^>]+>/g," ")
        .replace(/&nbsp;|&#160;/gi," ")
        .replace(/&amp;/gi,"&")
        .replace(/\s+/g," ");

      const pricesForPort=(name)=>{
        const vals=[];
        const re=new RegExp(
          name+"\\s+([0-9]{3,4}(?:\\.[0-9]{1,2})?)",
          "gi"
        );
        let m;
        while((m=re.exec(html))){
          const n=Number(m[1]);
          if(Number.isFinite(n)&&n>=250&&n<=2500)vals.push(n);
        }
        if(!vals.length)return null;
        return Math.max(...new Set(vals));
      };

      mgoSingapore=pricesForPort("Singapore");
      mgoAra=pricesForPort("Rotterdam");
      mgoUsg=pricesForPort("Houston");
    }
  }catch(_){}

  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({
    brent,
    mgoAra,
    mgoSingapore,
    mgoUsg,
    bunkerSource:"Ship & Bunker",
    updatedAt:new Date().toISOString()
  });
}
