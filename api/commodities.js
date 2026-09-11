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
  {id:"eu-carbon",label:"EU Carbon",slug:"carbon-emissions-allowances",unit:"EUR/t"}
];
function strip(s=""){return String(s).replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();}
async function fetchOne(item){
  const url=`https://tradingeconomics.com/commodity/${item.slug}`;
  const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0 (compatible; SignalTankerDashboard/1.0)","accept":"text/html,*/*"}});
  if(!r.ok)throw new Error(item.id+" "+r.status);
  const txt=strip(await r.text());
  const actual=txt.match(/\bActual\s+([\d,.]+)/i);
  const daily=txt.match(/\bDaily Change\s+([+-]?[\d,.]+)%/i);
  const price=actual?Number(actual[1].replace(/,/g,"")):null;
  const changePct=daily?Number(daily[1].replace(/,/g,"")):null;
  return {...item,price:Number.isFinite(price)?price:null,changePct:Number.isFinite(changePct)?changePct:null,url};
}
export default async function handler(req,res){
  const settled=await Promise.allSettled(ITEMS.map(fetchOne));
  const items=settled.map((r,i)=>r.status==="fulfilled"?r.value:{...ITEMS[i],price:null,changePct:null});
  res.setHeader("Cache-Control","s-maxage=900, stale-while-revalidate=3600");
  res.status(200).json({items,updatedAt:new Date().toISOString(),source:"Trading Economics"});
}
