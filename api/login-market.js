export default async function handler(req,res){
  let brent=null;
  try{
    const r=await fetch("https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?interval=1d&range=5d",{headers:{"User-Agent":"Mozilla/5.0"}});
    if(r.ok){
      const j=await r.json();
      brent=j?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    }
  }catch(_){}
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({
    brent,
    mgoAra:num(process.env.MGO_ARA),
    mgoSingapore:num(process.env.MGO_SINGAPORE),
    mgoUsg:num(process.env.MGO_USG),
    updatedAt:new Date().toISOString()
  });
}
