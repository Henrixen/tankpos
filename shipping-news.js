const FEEDS=[
  {source:"Splash247",url:"https://splash247.com/feed/"},
  {source:"gCaptain",url:"https://gcaptain.com/feed/"},
  {source:"Maritime Executive",url:"https://www.maritime-executive.com/rss"},
  {source:"TradeWinds",url:"https://www.tradewindsnews.com/rss"},
];

function decode(s=""){
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">");
}
function strip(s=""){return decode(s).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();}
function tag(block,name){
  const m=block.match(new RegExp("<"+name+"(?:\\\\s[^>]*)?>([\\\\s\\\\S]*?)<\\\\/"+name+">","i"));
  return m?decode(m[1]).trim():"";
}
function parse(xml,source){
  const blocks=xml.match(/<item\b[\s\S]*?<\/item>/gi)||[];
  return blocks.map(b=>{
    const title=strip(tag(b,"title"));
    const link=strip(tag(b,"link")) || strip(tag(b,"guid"));
    const pubDate=strip(tag(b,"pubDate")) || strip(tag(b,"dc:date"));
    const desc=strip(tag(b,"description")).slice(0,180);
    return {title,link,pubDate,desc,source};
  }).filter(x=>x.title&&x.link);
}
export default async function handler(req,res){
  const settled=await Promise.allSettled(FEEDS.map(async f=>{
    const r=await fetch(f.url,{headers:{"user-agent":"Mozilla/5.0 TankerDashboard RSS","accept":"application/rss+xml,application/xml,text/xml,*/*"}});
    if(!r.ok)throw new Error(f.source+" "+r.status);
    return parse(await r.text(),f.source);
  }));
  let items=settled.flatMap(x=>x.status==="fulfilled"?x.value:[]);
  const seen=new Set();
  items=items.filter(x=>{const k=(x.link||x.title).toLowerCase();if(seen.has(k))return false;seen.add(k);return true;})
    .sort((a,b)=>(Date.parse(b.pubDate)||0)-(Date.parse(a.pubDate)||0)).slice(0,40);
  res.setHeader("Cache-Control","s-maxage=600, stale-while-revalidate=1800");
  res.status(200).json({items,updatedAt:new Date().toISOString(),feeds:FEEDS.map(x=>x.source)});
}
