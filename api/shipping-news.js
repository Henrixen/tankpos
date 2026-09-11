const FEEDS=[
  {source:"gCaptain",url:"https://feeds.feedburner.com/gcaptain"},
  {source:"Splash247",url:"https://splash247.com/feed/"},
  {source:"Maritime Executive",url:"https://www.maritime-executive.com/rss"},
  {source:"TradeWinds",url:"https://www.tradewindsnews.com/rss"}
];

function decode(s=""){
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function strip(s=""){return decode(s).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();}
function tag(block,name){
  const re=new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i");
  const m=block.match(re);return m?decode(m[1]).trim():"";
}
function parseRss(xml,source){
  const blocks=xml.match(/<item\b[\s\S]*?<\/item>/gi)||xml.match(/<entry\b[\s\S]*?<\/entry>/gi)||[];
  return blocks.map(b=>{
    const title=strip(tag(b,"title"));
    let link=strip(tag(b,"link"))||strip(tag(b,"guid"));
    if(!link){const m=b.match(/<link[^>]+href=["']([^"']+)/i);if(m)link=m[1];}
    const pubDate=strip(tag(b,"pubDate"))||strip(tag(b,"published"))||strip(tag(b,"updated"))||strip(tag(b,"dc:date"));
    const desc=strip(tag(b,"description")||tag(b,"summary")||tag(b,"content")).slice(0,190);
    return {title,link,pubDate,desc,source};
  }).filter(x=>x.title&&x.link);
}
function parseHtml(html,source,base){
  const out=[]; const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
  while((m=re.exec(html))&&out.length<20){
    const title=strip(m[2]);
    if(title.length<28||title.length>180)continue;
    let link=m[1];if(link.startsWith("/"))link=new URL(link,base).href;
    if(!/^https?:/i.test(link))continue;
    out.push({title,link,pubDate:"",desc:"",source});
  }
  return out;
}
async function fetchFeed(f){
  const r=await fetch(f.url,{headers:{"user-agent":"Mozilla/5.0 (compatible; SignalTankerDashboard/1.0)","accept":"application/rss+xml,application/xml,text/xml,text/html,*/*"}});
  if(!r.ok)throw new Error(f.source+" "+r.status);
  const body=await r.text();
  const rss=parseRss(body,f.source);
  return rss.length?rss:parseHtml(body,f.source,f.url);
}
export default async function handler(req,res){
  const settled=await Promise.allSettled(FEEDS.map(fetchFeed));
  let items=settled.flatMap(x=>x.status==="fulfilled"?x.value:[]);
  const seen=new Set();
  items=items.filter(x=>{const k=(x.link||x.title).toLowerCase();if(seen.has(k))return false;seen.add(k);return true;});
  items.sort((a,b)=>(Date.parse(b.pubDate)||0)-(Date.parse(a.pubDate)||0));
  res.setHeader("Cache-Control","s-maxage=600, stale-while-revalidate=1800");
  res.status(200).json({items:items.slice(0,40),updatedAt:new Date().toISOString(),sources:FEEDS.map(x=>x.source),errors:settled.filter(x=>x.status==="rejected").map(x=>String(x.reason?.message||x.reason))});
}
