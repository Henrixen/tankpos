export default async function handler(req,res){
  try{
    const q=encodeURIComponent("tanker shipping maritime when:1d");
    const url=`https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`;
    const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0"}});
    if(!r.ok)throw new Error(`RSS ${r.status}`);
    const xml=await r.text();
    const dec=s=>String(s||"").replace(/<!\\[CDATA\\[|\\]\\]>/g,"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">");
    const items=[...xml.matchAll(/<item>([\\s\\S]*?)<\\/item>/g)].slice(0,8).map(m=>{
      const x=m[1];
      const get=tag=>{const hit=x.match(new RegExp(`<${tag}[^>]*>([\\\\s\\\\S]*?)<\\\\/${tag}>`,"i"));return dec(hit?.[1]?.trim());};
      const pub=get("pubDate");
      let published="";
      if(pub){const d=new Date(pub);if(!Number.isNaN(d.getTime()))published=d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Oslo"});}
      return {title:get("title"),link:get("link"),source:get("source"),published};
    }).filter(x=>x.title);
    res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({items});
  }catch(e){
    res.status(200).json({items:[],error:"news_unavailable"});
  }
}
