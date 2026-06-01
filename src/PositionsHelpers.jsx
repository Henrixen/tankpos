import React, { useState } from "react";
import { C, OP_COLORS } from "./constants";
import { daysBetween, isOpenPPT, normaliseQty } from "./utils";

function OpeningBreakdown({vessels, filteredVessels, bucketFilters=new Set(), onBucketFilter}){
  // Use filteredVessels for the bar chart when a filter is active, fall back to all vessels
  const displayVessels = filteredVessels || vessels;
  const isFiltered = filteredVessels && filteredVessels.length !== vessels.length;
  const open = displayVessels.filter(v=>v.openPort&&v.openPort!=="EMPLOYED"&&v.date);
  const total = vessels.length;
  const displayTotal = displayVessels.length;

  // Bucket vessels by days until open
  const ppt=[], d24=[], d48=[], d48plus=[], nodate=[];
  for(const v of open){
    const d=daysBetween(v.date);
    if(d===null){nodate.push(v);continue;}
    if(d<=1)ppt.push(v);
    else if(d<=4)d24.push(v);
    else if(d<=8)d48.push(v);
    else d48plus.push(v);
  }
  const employed=displayVessels.filter(v=>v.openPort==="EMPLOYED");
  const nodateOpen=displayVessels.filter(v=>v.openPort&&v.openPort!=="EMPLOYED"&&!v.date);

  const buckets=[
    {label:"Open today/tomorrow",sublabel:"PPT",vessels:ppt,col:"#2ecc71"},
    {label:"2-4 days",sublabel:"2-4d",vessels:d24,col:"#f5a623"},
    {label:"4-8 days",sublabel:"4-8d",vessels:d48,col:"#e8603c"},
    {label:">8 days",sublabel:">8d",vessels:d48plus,col:"#e74c3c"},
  ];
  const maxCount=Math.max(1,...buckets.map(b=>b.vessels.length));
  const totalCount = buckets.reduce((sum, b) => sum + b.vessels.length, 0) || 1;

  return(
    <div style={{background:C.bg2,border:"1px solid "+C.bd2,borderRadius:7,padding:"10px 14px 14px 14px",flex:1,boxSizing:"border-box",display:"flex",flexDirection:"column",minHeight:220,height:"100%"}}>
      {nodateOpen.length>0&&<div style={{fontSize:11,color:C.faint,marginBottom:8,textAlign:"right"}}>{nodateOpen.length} no date</div>}
      {/* Bar chart */}
      <div style={{display:"flex",gap:8,flex:1}}>
        {buckets.map(b=>{
          const pct = b.vessels.length / totalCount;
const barH = Math.max(pct * 100, b.vessels.length > 0 ? 4 : 0);
          return(
            <div key={b.label} onClick={()=>onBucketFilter&&onBucketFilter(b.sublabel)}
              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",cursor:b.vessels.length>0?"pointer":"default",borderRadius:6,padding:"2px 2px 0 2px",outline:bucketFilters.has(b.sublabel)?"2px solid "+b.col:"2px solid transparent",transition:"outline 0.15s"}}
              title={b.vessels.length>0?b.vessels.map(v=>v.vessel).join(", "):b.sublabel}>
              <div style={{fontSize:13,fontWeight:800,color:b.vessels.length>0?b.col:"transparent",marginBottom:3,minHeight:18}}>{b.vessels.length>0?b.vessels.length:""}</div>
              <div style={{width:"100%",background:"rgba(255,255,255,0.06)",borderRadius:4,flex:1,display:"flex",alignItems:"flex-end",overflow:"hidden",minHeight:120,height:"100%"}}>
                <div style={{width:"100%",height:b.vessels.length>0?Math.max(barH,8)+"%":"4%",background:b.vessels.length>0?b.col:"rgba(255,255,255,0.08)",borderRadius:4,transition:"height 0.3s",boxShadow:b.vessels.length>0?"0 0 8px "+b.col+"88":"none"}}/>
              </div>
              <div style={{fontSize:12,color:b.vessels.length>0?b.col:C.faint,fontWeight:700,textAlign:"center",marginTop:7,lineHeight:1.2}}>{b.sublabel}</div>
              <div style={{fontSize:10,color:C.faint,textAlign:"center",marginTop:3,lineHeight:1.3,maxWidth:"100%",wordBreak:"break-word"}}>{b.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function FixingWindow({vessels, fileDate, opFilter, onOpFilter}){
  const openVessels = vessels.filter(v => v.date && v.openPort && v.openPort !== "EMPLOYED");
  if(!openVessels.length) return null;

  const withDays = openVessels
  .map(v => ({
    ...v,
    days: daysBetween(v.date, v.fileDate)
  }))
  .filter(v => v.days !== null);

  if(!withDays.length) return null;

  const mean=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;
  const avgR=arr=>arr.length?Math.round(mean(arr)):null;
  const allAvg=avgR(withDays.map(v=>v.days));

  const normFWOp=s=>(s||"Unknown").trim();
  const byOp={};
  for(const v of withDays){const op=normFWOp(v.operator);if(!byOp[op])byOp[op]=[];byOp[op].push(v.days);}

  const rows=Object.entries(byOp)
    .sort((a,b)=>avgR(b[1])-avgR(a[1])) // Sort desc by fixing window
    .map(([op,daysArr],i)=>({op,days:avgR(daysArr),count:daysArr.length,col:OP_COLORS[i%OP_COLORS.length]}));

  // Scale: min = min(0, lowestDays), max = maxDays
  // fill = days/maxDays clamped [0,1]
  // Average shown as reference line
  const allDays=[...(allAvg!=null?[allAvg]:[]),...rows.map(r=>r.days).filter(d=>d!=null)];
  const maxDays=allDays.length?Math.max(0,...allDays):30;
  const minDays=Math.min(0,...allDays);  // can be negative (past prompt)
  const range=maxDays-minDays||1;
  const toPct=d=>Math.max(0,Math.min(1,(d-minDays)/range));
  const avgPct=allAvg!=null?toPct(allAvg):0.5;

  // Avg excluding vessels with fixing window > 60 days
  const filteredForAvg = withDays.filter(v => v.days !== null && v.days <= 60);
  const avgExcl60 = filteredForAvg.length ? Math.round(filteredForAvg.reduce((a,b)=>a+b.days,0)/filteredForAvg.length) : null;

  return(
    <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,padding:"8px 12px 10px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:12,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em",flex:1}}>⏱ Fixing Window - Open Fleet by Operator</div>
        {avgExcl60!=null&&(
          <div style={{fontSize:11,color:"rgba(160,200,255,0.5)",fontWeight:600}}>
            Avg <span style={{color:"#58a6ff",fontWeight:700}}>{avgExcl60>=0?"+":""}{avgExcl60}d</span>
            <span style={{fontSize:9,color:"rgba(120,160,200,0.35)",marginLeft:4}}>excl. &gt;60d</span>
          </div>
        )}
      </div>
      {/* Chart area with themed scrollbar */}
      <div style={{position:"relative",marginBottom:6,maxHeight:220,overflowY:"auto",overflowX:"hidden",scrollbarWidth:"thin",scrollbarColor:C.bd2+" transparent"}}>
        {rows.map((r,i)=>{
          const pct=toPct(r.days);
          return(
            <div key={r.op} onClick={()=>onOpFilter&&onOpFilter(r.op)} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,cursor:onOpFilter?"pointer":"default",borderRadius:4,padding:"1px 4px 1px 0",background:opFilter===r.op?"rgba(79,195,247,0.08)":"transparent",outline:opFilter===r.op?"1px solid rgba(79,195,247,0.3)":"none"}}>
              <div style={{minWidth:140,maxWidth:140,fontSize:12,color:opFilter===r.op?C.blue:C.dim,fontWeight:opFilter===r.op?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"right",paddingRight:4}}>{r.op}</div>
              <div style={{flex:1,position:"relative",height:18,background:C.bg3,borderRadius:3}}>
                {/* Filled bar from left up to pct */}
                <div style={{position:"absolute",left:0,top:0,height:"100%",width:(pct*100)+"%",background:r.col+"44",borderRadius:3,transition:"width 0.4s"}}/>
                {/* Bright right edge line */}
                <div style={{position:"absolute",left:"calc("+( pct*100)+"% - 2px)",top:0,height:"100%",width:3,background:r.col,borderRadius:1,boxShadow:"0 0 6px "+r.col}}/>
                {/* Fleet average reference line */}
                <div style={{position:"absolute",left:(avgPct*100)+"%",top:0,height:"100%",width:1,background:"rgba(79,195,247,0.35)"}}/>
              </div>
              <div style={{minWidth:38,textAlign:"right",fontSize:12,fontWeight:700,color:r.col}}>{r.days!=null?(r.days>=0?"+":"")+r.days+"d":"—"}</div>
              <div style={{minWidth:22,textAlign:"right",fontSize:12,color:C.faint}}>{r.count}v</div>
            </div>
          );
        })}
        {/* Fleet avg row */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,paddingTop:8,borderTop:"1px solid "+C.bd2}}>
          <div style={{minWidth:140,maxWidth:140,fontSize:12,color:C.tx,fontWeight:700,textAlign:"right",paddingRight:4}}>Fleet avg</div>
          <div style={{flex:1,position:"relative",height:18,background:C.bg3,borderRadius:3}}>
            <div style={{position:"absolute",left:0,top:0,height:"100%",width:(avgPct*100)+"%",background:"rgba(79,195,247,0.12)",borderRadius:3}}/>
            <div style={{position:"absolute",left:"calc("+(avgPct*100)+"% - 1px)",top:0,height:"100%",width:2,background:"rgba(79,195,247,0.7)"}}/>
          </div>
          <div style={{minWidth:38,textAlign:"right",fontSize:12,fontWeight:700,color:C.tx}}>{allAvg!=null?(allAvg>=0?"+":"")+allAvg+"d":"—"}</div>
          <div style={{minWidth:22,textAlign:"right",fontSize:12,color:C.faint}}>{withDays.length}v</div>
        </div>
      </div>

    </div>
  );
}


// ─── Export Panel ─────────────────────────────────────────────────────────────

function ExportPanel({vessels, cargoes, mode, selCargoes, selVessels}) {
  // mode = "pos" | "cargo"
  const [copied, setCopied] = useState(false);
  const [selRows, setSelRows] = useState(null);

  function fmtDate(){ return new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}); }

  // Copy format: Charterer / Vessel / Qty Cargo / Load to Disch / 2-4 May / USD 440k ls|RNR
  function cargoToText(rows){
    const UPPER=new Set(["ARA","USG","USGC","UKC","UKG","MED","GIB","SPORE","WAF","MEG","AG","CPP","DPP","LNG","LPG","ULSD","HVO","UCO","FAME","LSFO","HSFO","MGO","ARAG","NOLA","LOOP"]);
    const tc=s=>!s?"":s.toLowerCase().split(" ").map(w=>{if(!w)return w;const up=w.toUpperCase();if(UPPER.has(up))return up;return w[0].toUpperCase()+w.slice(1);}).join(" ");
    const tcCargo=s=>!s?"":s.toLowerCase().split(" ").map(w=>w?w[0].toUpperCase()+w.slice(1):"").join(" ");
    const fmtQty=q=>{const n=normaliseQty(q)||"";return n.replace(/(\d)\.(\d)/g,"$1,$2");};
    const fmtLaycan=(from,to)=>{
      if(!from&&!to)return "";
      if(from&&to){
        const m1=from.match(/^(\d{1,2})\s+([A-Za-z]{3})/);
        const m2=to.match(/^(\d{1,2})\s+([A-Za-z]{3})/);
        if(m1&&m2&&m1[2].toLowerCase()===m2[2].toLowerCase())
          return parseInt(m1[1])+"-"+parseInt(m2[1])+" "+m1[2];
        if(m1&&m2) return parseInt(m1[1])+" "+m1[2]+" - "+parseInt(m2[1])+" "+m2[2];
        return from+" - "+to;
      }
      const s=from||to;
      const m=s.match(/^(\d{1,2})\s+([A-Za-z]{3})/);
      return m?parseInt(m[1])+" "+m[2]:s;
    };
    const fmtFreight=f=>{
      const s=String(f||"").trim();
      if(!s||s.toUpperCase()==="RNR")return "RNR";
      // Already formatted
      if(/^(USD|EUR)\s/i.test(s))return s;
      // Detect currency prefix
      const eurMatch=s.match(/^EUR\s*(.+)/i);
      const cur=eurMatch?"EUR":"USD";
      const raw=eurMatch?eurMatch[1]:s;
      // Detect explicit pmt/PMT/per mt suffix
      if(/pmt|per\s*mt|per\s*ton/i.test(raw)){
        const num=raw.replace(/pmt|per\s*mt|per\s*ton/gi,"").trim().replace(/[,\s]/g,"");
        return cur+" "+num+" pmt";
      }
      // Extract numeric value
      const num=parseFloat(raw.replace(/[^0-9.]/g,""));
      if(isNaN(num))return cur+" "+raw;
      // Less than 1000 = per metric ton rate (e.g. 27, 86, 125)
      if(num<1000){
        return cur+" "+num+" pmt";
      }
      // 1000+ = lump sum — format as k
      const k=Math.round(num/1000);
      return cur+" "+k+"k ls";
    };
    const sorted=[...rows].sort((a,b)=>{
      const aHas=!!(a.freight&&String(a.freight).trim()&&String(a.freight).trim().toUpperCase()!=="RNR");
      const bHas=!!(b.freight&&String(b.freight).trim()&&String(b.freight).trim().toUpperCase()!=="RNR");
      return aHas===bHas?0:aHas?-1:1;
    });
    return sorted.map(c=>{
      const charterer=tc(c.charterer||"")||"CNR";
      const vessel=tc(c.vessel||"");
      const qty=fmtQty(c.qty);
      const cargo=tcCargo(c.cargo||"");
      const load=tc(c.load||"");
      const disch=tc(c.disch||"");
      const laycan=fmtLaycan(c.from,c.to);
      const freight=fmtFreight(c.freight);
      const segs=[charterer];
      if(vessel) segs.push(vessel);
      if(qty||cargo) segs.push([qty,cargo].filter(Boolean).join(" "));
      if(load||disch) segs.push(load&&disch?load+" to "+disch:load||disch);
      if(laycan) segs.push(laycan);
      segs.push(freight);
      return segs.join(" / ");
    }).join("\n");
  }

  // Excel / CSV export using blob download
  function exportExcel(rows, type){
    let csvRows;
    if(type==="pos"){
      csvRows = [
        ["Vessel","Operator","Built","DWT","LOA","Beam","CBM","Open Date","Open Port","Comment","Fuel","Ice Class"],
        ...rows.map(v=>[
          v.vessel||"",v.operator||"",v.built||"",v.dwt||"",v.loa||"",v.beam||"",v.cbm||"",
          v.date||"",v.openPort||"",v.comment||"",v.spec?.fuel||"",v.spec?.iceClass||""
        ])
      ];
    } else {
      csvRows = [
        ["Vessel","Charterer","Cargo","Qty","Load Port","Disch Port","Laycan","Freight","Status"],
        ...rows.map(c=>[
          c.vessel||"",c.charterer||"",c.cargo||"",c.qty||"",
          c.load||"",c.disch||"",c.from&&c.to?c.from+" - "+c.to:c.from||c.to||"",c.freight||"",c.status||""
        ])
      ];
    }
    // CSV with proper escaping
    const csv = csvRows.map(row=>row.map(cell=>{
      const s=String(cell).replace(/"/g,"\"\"");
      return s.includes(",")||s.includes("\n")||s.includes('"') ? `"${s}"` : s;
    }).join(",")).join("\n");

    const bom = "\uFEFF"; // UTF-8 BOM for Excel
    const blob = new Blob([bom+csv], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=`tankpos_${type}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  const rows = mode==="pos" ? vessels : cargoes;
  const btnStyle = {fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:4,
    border:"1px solid rgba(120,160,220,0.3)",background:"rgba(15,25,50,0.85)",
    color:"#9fc3f5",cursor:"pointer",display:"flex",alignItems:"center",
    gap:4,whiteSpace:"nowrap",fontFamily:"inherit"};

  function copyText(){
    const selC = selCargoes&&selCargoes.size>0 ? selCargoes : null;
    const selV2 = selVessels&&selVessels.size>0 ? selVessels : null;
    const activeRows = mode==="cargo"&&selC ? rows.filter(c=>selC.has(c.id)) : mode==="pos"&&selV2 ? rows.filter(v=>selV2.has(v.vessel)) : rows;
    const txt = mode==="pos" ? posToText(activeRows) : cargoToText(activeRows);
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand("copy"); } catch(e){}
    document.body.removeChild(ta);
    if(navigator.clipboard) navigator.clipboard.writeText(txt).catch(()=>{});
    setCopied(true);
    setTimeout(()=>setCopied(false),3000);
  }

  if(!rows.length) return null;
  return(
    <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
      <button style={{...btnStyle,borderColor:copied?"rgba(67,233,123,0.5)":undefined,color:copied?"#43e97b":"#9fc3f5"}}
        onClick={copyText} title="Copy fixtures">
        {copied?"✓ Copied!":(mode==="cargo"&&selCargoes&&selCargoes.size>0?"Copy ("+selCargoes.size+")":mode==="pos"&&selVessels&&selVessels.size>0?"Copy ("+selVessels.size+")":"Copy all")}
      </button>
      <button style={btnStyle} onClick={()=>exportExcel(mode==="cargo"&&selCargoes&&selCargoes.size>0?rows.filter(c=>selCargoes.has(c.id)):rows,"pos"===mode?"pos":"cargo")}
        title="Export CSV">
        CSV
      </button>
    </div>
  );
}

// ─── Desktop Positions Table ──────────────────────────────────────────────────

// ─── TCE Calculator ───────────────────────────────────────────────────────────

export { OpeningBreakdown, FixingWindow, ExportPanel };
