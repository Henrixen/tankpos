// /api/bunkers.js — shared PBT feed; never invents prices or quote dates.
const PORTS = [
  ['ARA','Rotterdam|Amsterdam|ARA'],['FUJ','Fujairah'],['SIN','Singapore'],
  ['HOU','Houston'],['GIB','Gibraltar'],['PAN','Panama|Balboa|Cristobal'],
  ['SHA','Shanghai'],['DUR','Durban']
];
const strip=s=>String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
const number=s=>{const v=Number(String(s||'').replace(/,/g,'').match(/\b\d{2,4}(?:\.\d{1,2})?\b/)?.[0]);return Number.isFinite(v)&&v>=100&&v<=4000?v:null;};
const empty=()=>Object.fromEntries(PORTS.flatMap(([k])=>['HSFO','VLSFO','MGO'].map(g=>[`${k}_${g}`,null])));
function parse(html){
 const out=empty();let count=0;
 const rows=[...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(m=>[...m[0].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(x=>strip(x[1]))).filter(x=>x.length>=3);
 const hdr=rows.find(r=>r.some(c=>/VLSFO|IFO\s*380/i.test(c))&&r.some(c=>/MGO|LSMGO|MDO/i.test(c)));
 const index=grade=>hdr?.findIndex(c=>grade==='HSFO'?/HSFO|IFO\s*380|380\s*CST/i.test(c):grade==='VLSFO'?/VLSFO|0\.5%|0\.50%/i.test(c):/\b(?:LSMGO|MGO|MDO)\b/i.test(c))??-1;
 const idx={HSFO:index('HSFO'),VLSFO:index('VLSFO'),MGO:index('MGO')};
 for(const cells of rows){
  const port=PORTS.find(([,pattern])=>new RegExp(`\\b(?:${pattern})\\b`,'i').test(cells.slice(0,3).join(' ')));
  if(!port)continue;
  const key=port[0];
  for(const grade of ['HSFO','VLSFO','MGO']){
   const i=idx[grade];const v=i>=0?number(cells[i]):null;
   if(v!==null&&out[`${key}_${grade}`]===null){out[`${key}_${grade}`]=v;count++;}
  }
 }
 // If the provider changes its table format, return unavailable instead of guessing columns.
 return {prices:out,count,headerFound:!!hdr};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 try{
  const ctrl=new AbortController();const timeout=setTimeout(()=>ctrl.abort(),10000);
  let response;
  try{response=await fetch('https://pbt-international.com/price-quotes',{signal:ctrl.signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; TankPos/1.0)','Accept':'text/html'}});}finally{clearTimeout(timeout);}
  if(!response.ok)throw Error(`PBT HTTP ${response.status}`);
  const html=await response.text();const parsed=parse(html);
  const date=strip(html).match(/(?:Last\s+(?:update|updated)|Prices\s+as\s+of)\s*:?\s*((?:\d{4}-\d{2}-\d{2})|(?:\d{1,2}[\/. -]\d{1,2}[\/. -]\d{4})|(?:\w+\s+\d{1,2},?\s+\d{4}))/i)?.[1]||null;
  res.status(200).json({source:'PBT International',sourceUrl:'https://pbt-international.com/price-quotes',date,checkedAt:new Date().toISOString(),available:parsed.count>0,...parsed.prices,...(parsed.count?{}:{error:'PBT table unavailable or its column format has changed'})});
 }catch(e){res.status(502).json({source:'PBT International',date:null,checkedAt:new Date().toISOString(),available:false,...empty(),error:e.message});}
}
