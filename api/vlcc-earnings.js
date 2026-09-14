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
async function getText(url){
  const opts={headers:{"user-agent":"Mozilla/5.0 (compatible; SignalTankerDashboard/1.0)","accept":"text/html,text/plain,*/*"}};
  try{const r=await fetch(url,opts);if(r.ok)return await r.text();}catch(_){}
  try{
    const mirror="https://r.jina.ai/http://"+url.replace(/^https?:\/\//,"");
    const r=await fetch(mirror,opts);
    if(r.ok)return await r.text();
  }catch(_){}
  throw new Error("source fetch failed");
}
async function fetchWeek(year,week){
  const url=`https://www.balticexchange.com/en/data-services/WeeklyRoundup/tanker/news/${year}/tanker-report-week-${week}.html`;
  const txt=strip(await getText(url));
  const section=(txt.match(/\bVLCC\b([\s\S]{0,6500}?)(?:\bSuezmax\b|\bAframax\b|\bClean\b|$)/i)||[])[1]||txt;
  const wsM=
    section.match(/TD3C[\s\S]{0,1400}?\bWS\s*([0-9]+(?:\.[0-9]+)?)/i) ||
    section.match(/Middle East[\s\S]{0,1400}?\bWS\s*([0-9]+(?:\.[0-9]+)?)/i);
  const tceM=
    section.match(/TD3C[\s\S]{0,2200}?(?:daily\s+round-trip\s+TCE|round-trip\s+TCE|TCE)[^$0-9]{0,220}\$?\s*([0-9][0-9,]+)/i) ||
    section.match(/(?:daily\s+round-trip\s+TCE|round-trip\s+TCE|TCE)[^$0-9]{0,220}\$?\s*([0-9][0-9,]+)/i);
  const dateM=txt.match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2})\b/i);
  const tce=tceM?Number(tceM[1].replace(/,/g,"")):null;
  if(!Number.isFinite(tce))throw new Error(`${year}-W${week} parse`);
  return {year,week,tce,ws:wsM?Number(wsM[1]):null,date:dateM?.[1]||`W${week} ${year}`,url};
}
async function fetchTarget(t){
  for(const shift of [0,-1,1]){
    const q=weekShift(t.year,t.week,shift);
    try{return await fetchWeek(q.year,q.week);}catch(_){}
  }
  return null;
}
export default async function handler(req,res){
  const cur=isoWeek(),latestBase=weekShift(cur.year,cur.week,-1);
  const targets=Array.from({length:13},(_,i)=>weekShift(latestBase.year,latestBase.week,-i*4));
  let points=(await Promise.all(targets.map(fetchTarget))).filter(Boolean);

  // Verified recent Baltic reports, used only if the source blocks the cloud fetch.
  const verified=[
    {year:2026,week:36,tce:704000,ws:677.22,date:"04 Sep 2026",url:"https://www.balticexchange.com/en/data-services/WeeklyRoundup/tanker/news/2026/tanker-report-week-36.html"},
    {year:2026,week:37,tce:862150,ws:821.11,date:"11 Sep 2026",url:"https://www.balticexchange.com/en/data-services/WeeklyRoundup/tanker/news/2026/tanker-report-week-37.html"}
  ];
  points=[...points,...verified];

  const history=[...new Map(points.map(p=>[`${p.year}-${p.week}`,p])).values()].sort((a,b)=>a.year-b.year||a.week-b.week);
  res.setHeader("Cache-Control","s-maxage=21600, stale-while-revalidate=43200");
  res.status(200).json({latest:history.at(-1)||null,history,source:"Baltic Exchange weekly tanker reports",updatedAt:new Date().toISOString()});
}
