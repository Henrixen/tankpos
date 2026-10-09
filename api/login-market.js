// api/login-market.js — Integr8 LSMGO; Ship & Bunker fallback for Rotterdam/Singapore.
// Returns null, never a hardcoded or stale price, when sources cannot be parsed.
const INTEGR8 = 'https://integr8fuels.com/world-bunker-prices/';
const PORTS = {mgoAra:'Rotterdam',mgoUsg:'Houston',mgoSingapore:'Singapore'};
const SB = {mgoAra:'https://shipandbunker.com/prices/emea/nwe/nl-rtm-rotterdam',mgoSingapore:'https://shipandbunker.com/prices/apac/sea/sg-sin-singapore'};
const decode = s => String(s).replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&#36;|&dollar;/gi,'$').replace(/\s+/g,' ').trim();
const textOf = s => decode(String(s).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' '));
async function fetchPage(url, ms=8500) {
  const c = new AbortController(); const timer = setTimeout(()=>c.abort(),ms);
  try {const r=await fetch(url,{signal:c.signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; TankPos/1.0)','Accept':'text/html,application/xhtml+xml'}});if(!r.ok)throw Error(`HTTP ${r.status}`);return await r.text();}
  finally {clearTimeout(timer);}
}
function valid(n) {const v=Number(String(n).replace(/,/g,''));return Number.isFinite(v)&&v>=100&&v<=4000?v:null;}
function parseIntegr8(html, port) {
  // Prefer an isolated port card containing its LSMGO row; avoid navigation and other ports.
  const matches = [...html.matchAll(new RegExp(`(?:<h[1-6][^>]*>|<[^>]+class=["'][^"']*(?:port|location|title)[^"']*["'][^>]*>)\\s*${port}\\s*<`, 'gi'))];
  for(const m of matches){
    const segment=html.slice(m.index, m.index+4500);
    const plain=textOf(segment);
    const next=plain.search(/\b(?:Balboa|Durban|Fujairah|Gibraltar|Hong Kong|Houston|Las Palmas|Lisbon|Los Angeles|Malta Offshore|New York|Port Suez|Rotterdam|Singapore|Skaw|Zhoushan)\b/i);
    const section=next>port.length+25?plain.slice(0,next):plain.slice(0,450);
    const row=section.match(/\bLSMGO\b[\s\S]{0,90}?(?:\$|USD\s*)\s*([\d,]+(?:\.\d+)?)/i);
    const value=row&&valid(row[1]);if(value!==null&&value!==false)return {value,method:'html-card'};
  }
  // Some versions use client-rendered JSON: find a port and LSMGO close together.
  const escaped=html.replace(/\\u0022/g,'"').replace(/\\\//g,'/');
  for(const m of escaped.matchAll(new RegExp(`(?:"(?:name|port|portName|location|title)"\\s*:\\s*"${port}"|"${port}"\\s*:)`,'gi'))){
    const block=escaped.slice(Math.max(0,m.index-150),m.index+1600);
    const p=block.match(/"(?:LSMGO|lsmgo)"\s*:\s*(?:\{[^}]{0,250}?"(?:price|value|usd)"\s*:\s*"?|(\s*"?))([\d,.]+)/i);
    if(p){const value=valid(p[2]);if(value!==null)return {value,method:'embedded-json'};}
  }
  return null;
}
function parseShipBunker(html){
  const heading=html.search(/Latest\s*(?:<[^>]+>\s*)*Prices\s*,?\s*MGO/i);
  if(heading<0)return null;
  for(const match of html.slice(heading).matchAll(/<table\b[\s\S]*?<\/table>/gi)){
    const rows=[...match[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map(x=>textOf(x[0]));
    if(!rows.some(x=>/^Date\s+Price\s*\$\/mt\s+Change\s+High\s+Low\s+Spread/i.test(x)))continue;
    const row=rows.find(x=>/^(?:[MTWFS]\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d/i.test(x));
    const m=row?.match(/^(?:[MTWFS]\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+([\d,.]+)/i);
    if(m){const value=valid(m[1]);if(value!==null)return {value,method:'history-table',assessmentRow:row};}
  }
  return null;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0, must-revalidate');
  const debug=req.query?.debug==='1';const diagnostics={};
  let brent=null;
  try{const c=new AbortController();const timer=setTimeout(()=>c.abort(),7000);try{const r=await fetch('https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?interval=1d&range=5d',{signal:c.signal});if(r.ok){const j=await r.json();const n=Number(j?.chart?.result?.[0]?.meta?.regularMarketPrice);if(Number.isFinite(n)&&n>0)brent=n;}}finally{clearTimeout(timer);}}catch(e){diagnostics.brent={error:e.message};}
  const values={mgoAra:null,mgoUsg:null,mgoSingapore:null};const sourceByPort={};
  let html=null;
  try{html=await fetchPage(INTEGR8);diagnostics.integr8={htmlLength:html.length};}catch(e){diagnostics.integr8={error:e.message};}
  for(const [key,port] of Object.entries(PORTS)){
    const parsed=html?parseIntegr8(html,port):null;
    if(parsed){values[key]=parsed.value;sourceByPort[key]='Integr8 / ENGINE';}
    diagnostics[key]={integr8Parsed:parsed?.value??null,integr8Method:parsed?.method??null};
  }
  await Promise.all(Object.entries(SB).filter(([key])=>values[key]===null).map(async([key,url])=>{
    try{const page=await fetchPage(url);const parsed=parseShipBunker(page);diagnostics[key].shipBunkerParsed=parsed?.value??null;
      if(parsed){values[key]=parsed.value;sourceByPort[key]='Ship & Bunker';diagnostics[key].assessmentRow=parsed.assessmentRow;}
    }catch(e){diagnostics[key].fallbackError=e.message;}
  }));
  const unique=[...new Set(Object.values(sourceByPort))];
  res.status(200).json({brent,...values,bunkerSource:unique.length===1?unique[0]:unique.length>1?'Mixed (see bunkerSources)': 'Integr8 / ENGINE',bunkerSourceUrl:INTEGR8,bunkerSources:sourceByPort,updatedAt:new Date().toISOString(),...(debug?{diagnostics}:{})});
}
