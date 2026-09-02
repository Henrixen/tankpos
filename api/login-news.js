export default async function handler(req,res){
  const feeds=[
    {name:"gCaptain",url:"https://gcaptain.com/feed/"},
    {name:"Splash247",url:"https://splash247.com/feed/"},
    {name:"Seatrade Maritime",url:"https://www.seatrade-maritime.com/rss.xml"}
  ];

  const decode=s=>String(s||"")
    .replace(/<!\[CDATA\[|\]\]>/g,"")
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"')
    .replace(/&#39;|&#8217;/g,"'")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/<[^>]+>/g,"")
    .trim();

  const parseFeed=(xml,sourceName)=>{
    const out=[];
    const chunks=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
    for(const m of chunks){
      const x=m[1];
      const get=tag=>{
        const hit=x.match(new RegExp(`<${tag}[^>]*>([\\\\s\\\\S]*?)<\\\\/${tag}>`,"i"));
        return decode(hit?.[1]||"");
      };
      const title=get("title");
      const link=get("link");
      const pub=get("pubDate");
      if(!title)continue;
      let ts=0,published="";
      if(pub){
        const d=new Date(pub);
        if(!Number.isNaN(d.getTime())){
          ts=d.getTime();
          published=d.toLocaleTimeString("en-GB",{
            hour:"2-digit",minute:"2-digit",timeZone:"Europe/Oslo"
          });
        }
      }
      out.push({title,link,source:sourceName,published,ts});
    }
    return out;
  };

  let items=[];
  await Promise.all(feeds.map(async f=>{
    try{
      const r=await fetch(f.url,{
        headers:{
          "User-Agent":"Mozilla/5.0",
          "Accept":"application/rss+xml, application/xml, text/xml, */*"
        }
      });
      if(!r.ok)return;
      const xml=await r.text();
      items.push(...parseFeed(xml,f.name));
    }catch(_){}
  }));

  // Fallback if direct publisher feeds are unavailable.
  if(!items.length){
    try{
      const q=encodeURIComponent("tanker shipping maritime when:2d");
      const url=`https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`;
      const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0"}});
      if(r.ok) items=parseFeed(await r.text(),"Google News");
    }catch(_){}
  }

  // Prefer newer stories and remove duplicate titles.
  const seen=new Set();
  items=items
    .sort((a,b)=>(b.ts||0)-(a.ts||0))
    .filter(x=>{
      const k=x.title.toLowerCase();
      if(seen.has(k))return false;
      seen.add(k);
      return true;
    })
    .slice(0,8)
    .map(({ts,...x})=>x);

  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({items});
}
