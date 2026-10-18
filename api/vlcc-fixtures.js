// Public Tankers International fixture summaries. No paid fields or authentication.
const SOURCE = 'https://app.tankersinternational.com/';
const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
function parseDay(s, now) {
  const m=s.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  if(!m)return null;
  let y=now.getUTCFullYear();
  let d=new Date(Date.UTC(y,MONTHS[m[2].slice(0,3)],+m[1]));
  if(d.getTime()>now.getTime()+86400000)d=new Date(Date.UTC(--y,MONTHS[m[2].slice(0,3)],+m[1]));
  return d;
}
function clean(s){return s.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();}
function extract(text,now){
  const out=[]; let day=null;
  const lines=text.replace(/\r/g,'').split('\n').map(x=>clean(x)).filter(Boolean);
  for(const line of lines){
    const heading=parseDay(line,now);
    if(heading && line.length<90){day=heading;continue;}
    if(!day || (now-day)/86400000>14 || (now-day)<-86400000)continue;
    // Markdown/text rendered cards: "C Vessel(2018)OprOperatorChtrCharterer Fixed 123k/Day".
    const re=/\b([A-E])\s+([^\n()]{2,75}?)\s*\((\d{4})\)\s*(?:Opr\s*)?(.{0,140}?)\s*Chtr\s*(.{2,110}?)\s*(Failed|OnSubs|Fixed)\s*(No Data|[\d,.]+\s*k\/Day)/gi;
    let m;
    while((m=re.exec(line))!==null){
      const earnings=/([\d,.]+)\s*k\/Day/i.exec(m[7]);
      out.push({date:day.toISOString().slice(0,10),vessel:m[2].trim(),built:+m[3],operator:m[4].trim()||null,charterer:m[5].trim(),status:m[6],tce:earnings?Math.round(Number(earnings[1].replace(/,/g,''))*1000):null,route:null,rate:null,duration:null});
    }
  }
  return [...new Map(out.filter(x=>Number.isFinite(x.tce)&&x.tce>0).map(x=>[`${x.date}|${x.vessel.toLowerCase()}|${x.charterer.toLowerCase()}|${x.status}`,x])).values()].sort((a,b)=>b.date.localeCompare(a.date));
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=1800');
  const now=new Date();
  const urls=[SOURCE,'https://r.jina.ai/https://app.tankersinternational.com/'];
  const errors=[];
  for(const url of urls){
    try{
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);
      let response;try{response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html,text/plain,*/*'},signal:controller.signal});}finally{clearTimeout(timer);}
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const text=await response.text();
      const fixtures=extract(text,now);
      if(!fixtures.length)throw Error('No parseable public fixture cards; page layout may have changed');
      return res.status(200).json({fixtures,source:SOURCE,asOf:now.toISOString(),latestFixtureDate:fixtures[0].date,publicOnly:true});
    }catch(e){errors.push(`${url===SOURCE?'direct':'text mirror'}: ${e.message}`);}
  }
  return res.status(503).json({fixtures:[],source:SOURCE,asOf:now.toISOString(),error:'Public fixtures unavailable',details:errors});
}
