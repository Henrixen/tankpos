const ITEMS=[
  {id:"brent",label:"Brent",slug:"brent-crude-oil",unit:"USD/bbl"},
  {id:"crude",label:"WTI",slug:"crude-oil",unit:"USD/bbl"},
  {id:"eu-gas",label:"EU Gas",slug:"eu-natural-gas",unit:"EUR/MWh"},
  {id:"natgas",label:"Natural Gas",slug:"natural-gas",unit:"USD/MMBtu"},
  {id:"gasoline",label:"Gasoline",slug:"gasoline",unit:"USD/gal"},
  {id:"heating-oil",label:"Heating Oil",slug:"heating-oil",unit:"USD/gal"},
  {id:"ethanol",label:"Ethanol",slug:"ethanol",unit:"USD/gal"},
  {id:"naphtha",label:"Naphtha",slug:"naphtha",unit:"USD/t"},
  {id:"methanol",label:"Methanol",slug:"methanol",unit:"CNY/t"},
  {id:"urea",label:"Urea",slug:"urea",unit:"USD/t"},
  {id:"eu-carbon",label:"EU Carbon",slug:"carbon",unit:"EUR/t"}
];

const YAHOO={brent:"BZ=F",crude:"CL=F",natgas:"NG=F",gasoline:"RB=F","heating-oil":"HO=F"};
function strip(s=""){return String(s).replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();}
async function fetchOne(item){
  const url=`https://tradingeconomics.com/commodity/${item.slug}`;
  const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0 (compatible; SignalTankerDashboard/1.0)","accept":"text/html,*/*"}});
  if(!r.ok)throw new Error(item.id+" "+r.status);
  const txt=strip(await r.text()),actual=txt.match(/\bActual\s+([\d,.]+)/i),daily=txt.match(/\bDaily Change\s+([+-]?[\d,.]+)%/i);
  const price=actual?Number(actual[1].replace(/,/g,"")):null,changePct=daily?Number(daily[1].replace(/,/g,"")):null;
  return {...item,price:Number.isFinite(price)&&price>0?price:null,changePct:Number.isFinite(changePct)?changePct:null,url};
}
async function fetchHistory(id,symbol){
  const now=Math.floor(Date.now()/1000),from=now-740*86400;
  const path=`/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${from}&period2=${now}&interval=1d&events=history`;
  let lastErr=null;
  for(const host of ["https://query1.finance.yahoo.com","https://query2.finance.yahoo.com"]){
    try{
      const r=await fetch(host+path,{headers:{"user-agent":"Mozilla/5.0","accept":"application/json"}});
      if(!r.ok){lastErr=new Error(`${id} history ${r.status}`);continue;}
      const j=await r.json(),x=j?.chart?.result?.[0],ts=x?.timestamp||[],close=x?.indicators?.quote?.[0]?.close||[];
      const rows=ts.map((t,i)=>({date:new Date(t*1000).toISOString().slice(0,10),price:Number(close[i])})).filter(x=>Number.isFinite(x.price)&&x.price>0);
      if(rows.length)return rows;
    }catch(e){lastErr=e;}
  }
  throw lastErr||new Error(`${id} history unavailable`);
}
export default async function handler(req,res){
  const [prices,histories]=await Promise.all([
    Promise.allSettled(ITEMS.map(fetchOne)),
    Promise.allSettled(Object.entries(YAHOO).map(async([id,symbol])=>[id,await fetchHistory(id,symbol)]))
  ]);
  const items=prices.map((r,i)=>r.status==="fulfilled"?r.value:{...ITEMS[i],price:null,changePct:null});
  const history={}; for(const r of histories)if(r.status==="fulfilled")history[r.value[0]]=r.value[1];
  res.setHeader("Cache-Control","s-maxage=900, stale-while-revalidate=3600");
  res.status(200).json({items,history,updatedAt:new Date().toISOString(),source:"Trading Economics",historySource:"Yahoo Finance · daily futures history"});
}
