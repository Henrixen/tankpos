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
  if(!r.ok)throw new Error(String(r.status));
  const txt=strip(await r.text());
  const section=(txt.match(/\bVLCC\b([\s\S]{0,2200}?)(?:\bSuezmax\b|\bAframax\b|\bClean\b|$)/i)||[])[1]||txt;
  const tceMatches=[...section.matchAll(/(?:TCE|time charter equivalent)[^$]{0,90}\$?([\d,]+)(?:\/day| per day)?/gi)];
  let tce=null;
  for(const m of tceMatches){const n=Number(m[1].replace(/,/g,""));if(n>5000){tce=n;break;}}
  if(!tce){
    const m=section.match(/daily round-trip TCE[^$]{0,80}\$?([\d,]+)/i)||section.match(/TCE of (?:just under |just over |close to |about |over )?\$?([\d,]+)/i);
    if(m)tce=Number(m[1].replace(/,/g,""));
  }
  const wsM=section.match(/TD3C[\s\S]{0,500}?WS\s*([\d.]+)/i);
  const dateM=txt.match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d{2})\b/i);
  if(!tce||!Number.isFinite(tce))throw new Error("parse");
  return {year,week,tce,ws:wsM?Number(wsM[1]):null,date:dateM?dateM[1]:`W${week} ${year}`,url};
}
export default async function handler(req,res){
  const cur=isoWeek();
  // Baltic weekly report is normally the preceding completed week.
  const latestBase=weekShift(cur.year,cur.week,-1);
  const targets=[];
  for(let i=0;i<13;i++)targets.push(weekShift(latestBase.year,latestBase.week,-i*4));
  const points=[];
  for(const t of targets){
    let hit=null;
    for(const shift of [0,-1,1]){
      const q=weekShift(t.year,t.week,shift);
      try{hit=await fetchWeek(q.year,q.week);break;}catch(_){}
    }
    if(hit)points.push(hit);
  }
  points.sort((a,b)=>a.year-b.year||a.week-b.week);
  const latest=points[points.length-1]||null;
  res.setHeader("Cache-Control","s-maxage=21600, stale-while-revalidate=43200");
  res.status(200).json({latest,history:points,source:"Baltic Exchange weekly tanker reports",updatedAt:new Date().toISOString()});
}
