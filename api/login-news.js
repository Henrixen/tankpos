export default async function handler(req,res){
  const feeds=[
    {name:"gCaptain",url:"https://gcaptain.com/feed/"},
    {name:"Splash247",url:"https://splash247.com/feed/"},
    {name:"Seatrade Maritime",url:"https://www.seatrade-maritime.com/rss.xml"}
  ];

  const decode=s=>String(s||"")
    .replace(/<!\[CDATA\[|\]\]>/g,"")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)))
    .replace(/&amp;/g,"&")
    .replace(/&quot;/g,'"')
    .replace(/&apos;|&#39;|&#8217;/g,"'")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ")
    .trim();

  const fetchText=async(url,timeoutMs=7000)=>{
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
    try{
      const r=await fetch(url,{
        signal:ctrl.signal,
        headers:{
          "User-Agent":"Mozilla/5.0 (compatible; BrokerDashboard/1.0)",
          "Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml, */*"
        }
      });
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      return await r.text();
    }finally{
      clearTimeout(timer);
    }
  };

  const parseFeed=(xml,sourceName)=>{
    const out=[];

    // Support both RSS <item> and Atom <entry>.
    const chunks=[
      ...[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m=>({type:"rss",body:m[1]})),
      ...[...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(m=>({type:"atom",body:m[1]}))
    ];

    for(const {type,body:x} of chunks){
      const get=tag=>{
        const hit=x.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,"i"));
        return decode(hit?.[1]||"");
      };

      const title=get("title");
      if(!title)continue;

      let link=get("link");
      if(!link&&type==="atom"){
        const href=x.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
        link=decode(href?.[1]||"");
      }

      const pub=get("pubDate")||get("published")||get("updated")||get("dc:date");
      let ts=0,published="";
      if(pub){
        const d=new Date(pub);
        if(!Number.isNaN(d.getTime())){
          ts=d.getTime();
          published=d.toLocaleString("en-GB",{
            day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",
            timeZone:"Europe/Oslo"
          });
        }
      }

      out.push({title,link,source:sourceName,published,ts});
    }
    return out;
  };

  const results=await Promise.all(feeds.map(async f=>{
    try{
      return parseFeed(await fetchText(f.url),f.name);
    }catch(e){
      console.warn(`login-news: ${f.name} failed:`,e?.message||e);
      return [];
    }
  }));

  let items=results.flat();

  // If direct publisher feeds return too few stories, supplement with Google News.
  if(items.length<5){
    try{
      const q=encodeURIComponent("tanker shipping maritime when:2d");
      const url=`https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`;
      items.push(...parseFeed(await fetchText(url),"Google News"));
    }catch(e){
      console.warn("login-news: Google fallback failed:",e?.message||e);
    }
  }

  // Prefer newer stories and remove duplicate titles.
  const seen=new Set();
  items=items
    .sort((a,b)=>(b.ts||0)-(a.ts||0))
    .filter(x=>{
      const k=x.title.toLowerCase().replace(/\s+/g," ").trim();
      if(!k||seen.has(k))return false;
      seen.add(k);
      return true;
    })
    .slice(0,8)
    .map(({ts,...x})=>x);

  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({
    items,
    sources:["gCaptain","Splash247","Seatrade Maritime","Google News fallback"],
    updatedAt:new Date().toISOString()
  });
}
