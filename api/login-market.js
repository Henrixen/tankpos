// Serverless endpoint: /api/login-market
// Never silently reuse old bunker prices as if they were live.
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0, must-revalidate');
  const fetchPage=async(url)=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),9000);
    try{const r=await fetch(url,{signal:controller.signal,cache:'no-store',headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html,application/xhtml+xml'}});if(!r.ok)throw Error(`HTTP ${r.status}`);return await r.text();}
    finally{clearTimeout(timer);}
  };
  const text=s=>String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
  const price=s=>{const m=String(s||'').replace(/,/g,'').match(/\b\d{3,4}(?:\.\d{1,2})?\b/);const n=m?Number(m[0]):null;return n>=500&&n<=2500?n:null;};
  // Extract the MGO column from the named port row, never VLSFO or a different port.
  function tableMgo(html,port){
    for(const table of html.match(/<table\b[\s\S]*?<\/table>/gi)||[]){
      let index=-1;
      for(const row of table.match(/<tr\b[\s\S]*?<\/tr>/gi)||[]){
        const cells=[...row.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(m=>text(m[1]));
        if(!cells.length)continue;
        const h=cells.findIndex(x=>/^MGO(?:\b|\s|\+|\$)/i.test(x));
        if(h>=0){index=h;continue;}
        if(index>=0&&cells.some(c=>new RegExp(`\\b${port}\\b`,'i').test(c))){const n=price(cells[index]);if(n!==null)return n;}
      }
    }
    return null;
  }
  // Named-port page: find 'Latest Prices, MGO' table with Price $/MT as its first numeric column.
  function portMgo(html){
    const heading=html.search(/Latest\s*(?:<[^>]+>\s*)*Prices\s*,?\s*MGO/i);
    if(heading<0)return null;
    const after=html.slice(heading,heading+45000);
    const table=after.match(/<table\b[\s\S]*?<\/table>/i)?.[0];
    if(!table)return null;
    const rows=table.match(/<tr\b[\s\S]*?<\/tr>/gi)||[];
    for(const row of rows){
      const cells=[...row.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map(m=>text(m[1]));
      if(cells.length<3||!/(?:\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\b\d{1,2}\/\d{1,2}\b)/i.test(cells.slice(0,2).join(' ')))continue;
      for(const cell of cells.slice(1,4)){const n=price(cell);if(n!==null)return n;}
    }
    return null;
  }
  let brent=null,mgoAra=null,mgoSingapore=null,mgoUsg=null;
  try{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);
    try{const r=await fetch('https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?interval=1d&range=5d',{signal:controller.signal,cache:'no-store'});if(r.ok){const j=await r.json();const n=Number(j?.chart?.result?.[0]?.meta?.regularMarketPrice);if(Number.isFinite(n)&&n>0)brent=n;}}
    finally{clearTimeout(timer);}
  }catch(e){console.warn('Brent feed:',e.message);}
  const ports=[
    ['mgoAra','https://shipandbunker.com/prices/emea/nwe/nl-rtm-rotterdam','Rotterdam'],
    ['mgoUsg','https://shipandbunker.com/prices/amers/nac/usa-hou-houston','Houston'],
    ['mgoSingapore','https://shipandbunker.com/prices/apac/sea/sg-sin-singapore','Singapore']
  ];
  const results=await Promise.all(ports.map(async([key,url,port])=>{
    try{const html=await fetchPage(url);return [key,portMgo(html)??tableMgo(html,port)];}
    catch(e){console.warn('MGO feed',port,e.message);return [key,null];}
  }));
  for(const [key,value] of results){if(key==='mgoAra')mgoAra=value;else if(key==='mgoUsg')mgoUsg=value;else mgoSingapore=value;}
  res.status(200).json({brent,mgoAra,mgoUsg,mgoSingapore,bunkerSource:'Ship & Bunker',bunkerSourceUrl:'https://shipandbunker.com/prices/emea/nwe/nl-rtm-rotterdam#MGO',updatedAt:new Date().toISOString()});
}
