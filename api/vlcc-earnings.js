function isoWeek(d=new Date()){
  const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
  const day=x.getUTCDay()||7;x.setUTCDate(x.getUTCDate()+4-day);
  const y=new Date(Date.UTC(x.getUTCFullYear(),0,1));
  return {year:x.getUTCFullYear(),week:Math.ceil((((x-y)/86400000)+1)/7)};
}
function weekShift(year,week,delta){
  let y=year,w=week+delta;
  while(w<1){y--;w+=52;}
  while(w>53){w-=52;y++;}
  return {year:y,week:w};
}
function strip(s=""){return String(s).replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();}
async function fetchWeek(year,week){
  const url=`https://www.balticexchange.com/en/data-services/WeeklyRoundup/tanker/news/${year}/tanker-report-week-${week}.html`;
  const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0 (compatible; SignalTankerDashboard/1.0)","accept":"text/html,*/*"}});
  if(!r.ok)throw new Error(`${year}-W${week} HTTP ${r.status}`);
  const txt=strip(await r.text());
  const section=(txt.match(/\bVLCC\b([\s\S]{0,5000}?)(?:\bSuezmax\b|\bAframax\b|\bClean\b|$)/i)||[])[1]||txt;
  const wsM=section.match(/TD3C[\s\S]{0,900}?\bWS\s*([0-9]+(?:\.[0-9]+)?)/i);
  const tceM=
    section.match(/TD3C[\s\S]{0,1600}?(?:daily\s+round-trip\s+TCE|round-trip\s+TCE|TCE)[^$0-9]{0,140}(?:just\s+under\s+|just\s+over\s+|over\s+|about\s+|around\s+)?\$?\s*([0-9][0-9,]+)/i) ||
    section.match(/(?:daily\s+round-trip\s+TCE|round-trip\s+TCE|TCE)[^$0-9]{0,140}(?:just\s+under\s+|just\s+over\s+|over\s+|about\s+|around\s+)?\$?\s*([0-9][0-9,]+)/i);
  const dateM=txt.match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2})\b/i);
  const tce=tceM?Number(tceM[1].replace(/,/g,"")):null;
  if(!Number.isFinite(tce))throw new Error(`${year}-W${week} parse`);
  return {year,week,tce,ws:wsM?Number(wsM[1]):null,date:dateM?.[1]||`W${week} ${year}`,url};
}
async function fetchTarget(t){
  try{return await fetchWeek(t.year,t.week);}
  catch(_){const p=weekShift(t.year,t.week,-1);try{return await fetchWeek(p.year,p.week);}catch{return null;}}
}
export default async function handler(req,res){
  const cur=isoWeek(),latestBase=weekShift(cur.year,cur.week,-1);
  const targets=Array.from({length:13},(_,i)=>weekShift(latestBase.year,latestBase.week,-i*4));
  const points=(await Promise.all(targets.map(fetchTarget))).filter(Boolean);
  const history=[...new Map(points.map(p=>[`${p.year}-${p.week}`,p])).values()].sort((a,b)=>a.year-b.year||a.week-b.week);
  res.setHeader("Cache-Control","s-maxage=21600, stale-while-revalidate=43200");
  res.status(200).json({latest:history.at(-1)||null,history,source:"Baltic Exchange weekly tanker reports",updatedAt:new Date().toISOString()});
}
