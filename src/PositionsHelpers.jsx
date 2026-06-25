import React, { useState, useEffect, useRef } from "react";
import { C, OP_COLORS } from "./constants";
import { daysBetween, isOpenPPT, normaliseQty } from "./utils";
import { supabase } from "./supabaseclient";

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
    {label:">8 days",sublabel:">8d",vessels:d48plus,col:"#58a6ff"},
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

function ExportPanel({vessels, cargoes, mode, selCargoes, selVessels, allFilteredCargoes, onExportAll}) {
  // mode = "pos" | "cargo"
  const [copied, setCopied] = useState(false);
  const [csvCopied, setCsvCopied] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selRows, setSelRows] = useState(null);

  function fmtDate(){ return new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}); }

  // Format positions for copy — grouped by operator
  function posToText(rows){
    if(!rows.length) return "";
    const byOp={};
    rows.forEach(v=>{
      const op=v.operator||"Unknown";
      if(!byOp[op]) byOp[op]=[];
      byOp[op].push(v);
    });
    const lines=["|| Positions ||",""];
    Object.entries(byOp).sort(([a],[b])=>a.localeCompare(b)).forEach(([op,vs])=>{
      lines.push("*"+op+"*");
      vs.forEach(v=>{
        const parts=[v.vessel,v.openPort,v.date];
        if(v.comment) parts.push(v.comment);
        lines.push(parts.filter(Boolean).join(" – "));
      });
      lines.push("");
    });
    return lines.join("\n").trim();
  }

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
      // Only include freight if it has an actual value (not RNR, not empty)
      if(freight && freight.toUpperCase() !== "RNR") segs.push(freight);
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
          (v.vessel||"").toUpperCase(),(v.operator||"").toUpperCase(),v.built||"",v.dwt||"",v.loa||"",v.beam||"",v.cbm||"",
          v.date||"",(v.openPort||"").toUpperCase(),v.comment||"",v.spec?.fuel||"",v.spec?.iceClass||""
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
    if(!txt) return;
    // execCommand approach — most reliable including mobile/iPad
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.setAttribute("readonly","");
    ta.style.cssText = "position:fixed;top:0;left:0;width:2px;height:2px;padding:0;border:none;outline:none;background:transparent;";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch(e){}
    document.body.removeChild(ta);
    if(ok){ setCopied(true); setTimeout(()=>setCopied(false),2500); return; }
    // Fallback to clipboard API
    if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(txt)
        .then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2500); })
        .catch(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2500); }); // show feedback anyway
      return;
    }
    setCopied(true); setTimeout(()=>setCopied(false),2500);
  }

  if(!rows.length) return null;
  return(
    <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
      <button style={{...btnStyle,borderColor:copied?"rgba(67,233,123,0.5)":undefined,color:copied?"#43e97b":"#9fc3f5"}}
        onClick={copyText} title="Copy fixtures">
        {copied?"✓ Copied!":(mode==="cargo"&&selCargoes&&selCargoes.size>0?"Copy ("+selCargoes.size+")":mode==="pos"&&selVessels&&selVessels.size>0?"Copy ("+selVessels.size+")":"Copy all")}
      </button>
      <button style={{...btnStyle,borderColor:csvCopied?"rgba(67,233,123,0.5)":undefined,color:csvCopied?"#43e97b":"#9fc3f5"}}
        onClick={()=>{
          const activeRows=mode==="cargo"&&selCargoes&&selCargoes.size>0?rows.filter(c=>selCargoes.has(c.id)):rows;
          // Build CSV string same as exportExcel but copy instead of download
          let csvRows;
          if(mode==="pos"){
            csvRows=[["Vessel","Operator","Built","DWT","LOA","Beam","CBM","Open Date","Open Port","Comment","Fuel","Ice Class"],...activeRows.map(v=>[(v.vessel||"").toUpperCase(),(v.operator||"").toUpperCase(),v.built||"",v.dwt||"",v.loa||"",v.beam||"",v.cbm||"",v.date||"",(v.openPort||"").toUpperCase(),v.comment||"",v.spec?.fuel||"",v.spec?.iceClass||""])];
          } else {
            csvRows=[["Vessel","Charterer","Cargo","Qty","Load Port","Disch Port","Laycan","Freight","Status"],...activeRows.map(c=>[c.vessel||"",c.charterer||"",c.cargo||"",c.qty||"",c.load||"",c.disch||"",c.from&&c.to?c.from+" - "+c.to:c.from||c.to||"",c.freight||"",c.status||""])];
          }
          const csv=csvRows.map(row=>row.map(cell=>{const s=String(cell).replace(/"/g,'""');return s.includes(",")||s.includes("\n")||s.includes('"')?`"${s}"`:s;}).join(",")).join("\n");
          if(navigator.clipboard) navigator.clipboard.writeText(csv).catch(()=>{});
          else{const ta=document.createElement("textarea");ta.value=csv;ta.style.cssText="position:fixed;opacity:0;";document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);}
          setCsvCopied(true);setTimeout(()=>setCsvCopied(false),2500);
        }}
        title="Copy as CSV (paste to Excel)">
        {csvCopied?"✓ CSV Copied!":"Copy CSV"}
      </button>
            {mode==="cargo"&&(onExportAll||allFilteredCargoes)&&(
        <button style={{...btnStyle,borderColor:exportCopied?"rgba(67,233,123,0.5)":undefined,color:exportCopied?"#43e97b":exporting?"rgba(250,184,74,0.8)":"#9fc3f5"}}
          onClick={async()=>{
            setExporting(true);
            let exportRows=allFilteredCargoes||cargoes;
            if(onExportAll){try{exportRows=await onExportAll();}catch(e){console.error(e);}}
            const csvRows=[["Vessel","Charterer","Cargo","Qty","Load","Disch","From","To","Freight","Status","Tag","Updated"],...exportRows.map(c=>[c.vessel||"",c.charterer||"",c.cargo||"",c.qty||"",c.load||"",c.disch||"",c.from||"",c.to||"",c.freight||"",c.status||"",c.tag||"",c.updated||""])];
            const csv=csvRows.map(row=>row.map(cell=>{const s=String(cell).replace(/"/g,'""');return s.includes(",")||s.includes("\n")||s.includes('"')?`"${s}"`:s;}).join(",")).join("\n");
            if(navigator.clipboard) navigator.clipboard.writeText(csv).catch(()=>{});
            else{const ta=document.createElement("textarea");ta.value=csv;ta.style.cssText="position:fixed;opacity:0;";document.body.appendChild(ta);ta.select();document.execCommand("copy");document.body.removeChild(ta);}
            setExporting(false);setExportCopied(true);setTimeout(()=>setExportCopied(false),2500);
          }}
          title="Export all matching cargoes from database">
          {exporting?"⟳ Fetching…":exportCopied?"✓ Copied!":"Export all"}
        </button>
      )}
    </div>
  );
}

// ─── Desktop Positions Table ──────────────────────────────────────────────────

// ─── TCE Calculator ───────────────────────────────────────────────────────────

// ─── Fixing Window Historic Chart ─────────────────────────────────────────────

const FW_SEGMENTS = [
  { key:"sub10",  label:"Sub 10k",  color:"#58a6ff", dwt:[0,       10000] },
  { key:"city",   label:"City",     color:"#4ade80", dwt:[10001,   14500] },
  { key:"inter",  label:"Inter",    color:"#f778ba", dwt:[14501,   22000] },
  { key:"flexi",  label:"Flexi",    color:"#ea9a00", dwt:[22001,   28000] },
  { key:"handy",  label:"Handy",    color:"#a78bfa", dwt:[28001,   39000] },
  { key:"mr",     label:"MR",       color:"#22d3ee", dwt:[39001,   60000] },
];

function weekStart(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const day = d.getDay();                       // 0=Sun..6=Sat
  const back = day === 0 ? 6 : day - 1;         // days back to Monday
  const mon = new Date(d.getTime() - back * 86400000);
  return mon.toISOString().slice(0, 10);
}

function fmtWeek(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function mean(arr) {
  const v = arr.filter(x => x !== null && x !== undefined && isFinite(x));
  return v.length ? v.reduce((a,b) => a+b, 0) / v.length : null;
}

function FixingWindowChart({ vessels = [], tagFilter, filterActive = false }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [activeSeg, setActiveSeg] = React.useState(new Set(FW_SEGMENTS.map(s => s.key)));
  const [hover, setHover] = React.useState(null);          // {x,y,week,items:[{seg,val}]}
  const [brush, setBrush] = React.useState(null);          // {x0,x1} pixel drag
  const [range, setRange] = React.useState(null);          // {from,to} committed week range
  const [showList, setShowList] = React.useState(false);
  const [excluded, setExcluded] = React.useState(new Set()); // vessel names to drop
  const wrapRef = useRef(null);
  const [W, setW] = React.useState(760);
  const H = 200;
  const PAD = { top: 16, right: 16, bottom: 38, left: 40 };

  // responsive width
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(Math.max(360, e.contentRect.width));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch 12 weeks from positions_external using last_update_spotship as time axis
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 84);
      // positions_external is large (60k+). Supabase caps at 1000/req by default,
      // so paginate ordered by most-recent until we've covered the window.
      const PAGE = 1000;
      let all = [], from = 0, done = false;
      while (!done && alive) {
        const { data, error } = await supabase
          .from("positions_external")
          .select("vessel_name,operator,dwt,open_date,last_update_spotship,segment,tag")
          .gte("last_update_spotship", since.toISOString())
          .not("open_date", "is", null)
          .not("dwt", "is", null)
          .not("last_update_spotship", "is", null)
          .order("last_update_spotship", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) { console.error("FixingWindowChart fetch error:", error); break; }
        all = all.concat(data || []);
        if (!data || data.length < PAGE) done = true;
        else from += PAGE;
        if (from > 80000) done = true; // safety cap
      }
      if (!alive) return;
      setRows(all);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // DWT lookup from in-memory vessels (fallback) + a set of currently-visible vessel names
  // (so search / tag filtering in the table flows through to the chart)
  const dwtMap = {};
  const visibleNames = new Set();
  (vessels || []).forEach(v => {
    if (v.vessel) {
      visibleNames.add(v.vessel.toUpperCase());
      if (v.dwt) dwtMap[v.vessel.toUpperCase()] = Number(v.dwt);
    }
  });
  const useVisibleFilter = filterActive && (vessels || []).length > 0;

  // Per-row fixing-window computation → keep the raw enriched rows so we can both
  // build the chart AND list the vessels behind it.
  const enriched = [];
  const tagFiltered = tagFilter ? rows.filter(r => r.tag === tagFilter) : rows;
  for (const r of tagFiltered) {
    const nm = (r.vessel_name || "").toUpperCase();
    if (useVisibleFilter && !visibleNames.has(nm)) continue;   // respect table search/tags
    if (excluded.has(nm)) continue;                            // user-deselected
    const reportMs = new Date(r.last_update_spotship).getTime();
    const openMs = new Date(r.open_date).getTime();
    if (isNaN(reportMs) || isNaN(openMs)) continue;
    const fw = Math.round((openMs - reportMs) / 86400000);
    if (fw < 0 || fw > 180) continue;                          // forward-only, drop negatives & junk
    const dwt = r.dwt ? Number(r.dwt) : (dwtMap[nm] || null);
    if (!dwt || dwt < 500) continue;
    const seg = FW_SEGMENTS.find(s => dwt >= s.dwt[0] && dwt <= s.dwt[1]);
    if (!seg) continue;
    const wk = weekStart(r.last_update_spotship);
    if (!wk) continue;
    enriched.push({
      vessel: r.vessel_name, operator: r.operator || "", dwt, fw, seg: seg.key,
      week: wk, openDate: r.open_date, updated: r.last_update_spotship,
    });
  }

  // Build weekly averages, honouring committed date range
  const weekMap = {};
  for (const e of enriched) {
    if (range && (e.week < range.from || e.week > range.to)) continue;
    (weekMap[e.week] = weekMap[e.week] || {});
    (weekMap[e.week][e.seg] = weekMap[e.week][e.seg] || []).push(e.fw);
  }
  const weeks = Object.keys(weekMap).sort();
  const chartData = weeks.map(wk => ({
    week: wk, label: fmtWeek(wk),
    ...Object.fromEntries(FW_SEGMENTS.map(s => [s.key, mean(weekMap[wk][s.key] || [])])),
  }));

  // vessel count + avg behind the current view
  const inView = enriched.filter(e => !range || (e.week >= range.from && e.week <= range.to));
  const vesselCount = new Set(inView.map(e => e.vessel.toUpperCase())).size;
  const avgFW = inView.length ? Math.round(inView.reduce((a, b) => a + b.fw, 0) / inView.length) : null;

  // Scales
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const activeVals = chartData.flatMap(d => FW_SEGMENTS.filter(s => activeSeg.has(s.key)).map(s => d[s.key])).filter(v => v != null);
  const yMin = 0;                                              // never negative
  const yMax = Math.max(15, Math.ceil(Math.max(0, ...activeVals)));
  const yRange = yMax - yMin || 1;
  const xOf = i => chartData.length === 1 ? PAD.left + cW / 2 : PAD.left + (i / (chartData.length - 1)) * cW;
  const yOf = v => PAD.top + cH - ((v - yMin) / yRange) * cH;
  const iFromX = px => {
    if (chartData.length <= 1) return 0;
    const t = (px - PAD.left) / cW;
    return Math.max(0, Math.min(chartData.length - 1, Math.round(t * (chartData.length - 1))));
  };

  // pointer handlers for hover + brush
  const svgX = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    return (e.clientX - rect.left) * (W / rect.width);
  };
  const onMove = e => {
    const px = svgX(e);
    if (brush) { setBrush(b => ({ ...b, x1: px })); return; }
    if (!chartData.length) return;
    const i = iFromX(px);
    const d = chartData[i];
    const items = FW_SEGMENTS.filter(s => activeSeg.has(s.key) && d[s.key] != null)
      .map(s => ({ seg: s, val: d[s.key] }));
    setHover({ x: xOf(i), i, week: d.label, items });
  };
  const onDown = e => { const px = svgX(e); setBrush({ x0: px, x1: px }); setHover(null); };
  const onUp = () => {
    if (brush) {
      const lo = Math.min(brush.x0, brush.x1), hi = Math.max(brush.x0, brush.x1);
      if (hi - lo > 8 && chartData.length) {
        const i0 = iFromX(lo), i1 = iFromX(hi);
        setRange({ from: chartData[i0].week, to: chartData[i1].week });
      }
      setBrush(null);
    }
  };

  const linePath = seg => {
    let d = "", started = false;
    chartData.forEach((row, i) => {
      const v = row[seg.key];
      if (v == null) return;            // skip missing weeks but keep the line going
      const X = xOf(i), Y = yOf(v);
      d += (started ? "L" : "M") + X.toFixed(1) + "," + Y.toFixed(1) + " ";
      started = true;
    });
    return d.trim();
  };

  const AX = "rgba(210,225,245,0.85)";   // brighter axis text

  return (
    <div ref={wrapRef} style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 7, padding: "10px 12px", marginBottom: 10, position: "relative" }}>
      {/* Header row: title + segment toggles */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          📈 Fixing Window History
        </div>
        {tagFilter && (
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, border: "1px solid rgba(88,166,255,0.3)", color: "#79c0ff", background: "rgba(88,166,255,0.1)" }}>{tagFilter}</span>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {FW_SEGMENTS.map(s => {
            const on = activeSeg.has(s.key);
            return (
              <button key={s.key} onClick={() => setActiveSeg(prev => { const n = new Set(prev); n.has(s.key) ? n.delete(s.key) : n.add(s.key); return n; })}
                style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", border: "1px solid " + (on ? s.color : "rgba(88,166,255,0.15)"), background: on ? s.color + "22" : "transparent", color: on ? s.color : "rgba(140,170,210,0.35)" }}>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-header: avg/count + range + vessel-list toggle (own line, below buttons) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, fontSize: 10, color: "rgba(150,180,220,0.6)" }}>
        {avgFW != null && <span>Avg <span style={{ color: "#58a6ff", fontWeight: 700 }}>{avgFW}d</span></span>}
        <span>{vesselCount} vessels in chart</span>
        {range && (
          <span style={{ color: "#79c0ff", cursor: "pointer" }} onClick={() => setRange(null)}>
            {fmtWeek(range.from)}–{fmtWeek(range.to)} ✕ clear range
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowList(v => !v)} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", border: "1px solid rgba(88,166,255,0.25)", background: showList ? "rgba(88,166,255,0.12)" : "transparent", color: "#79c0ff" }}>
          {showList ? "Hide vessels" : `Vessels (${vesselCount})`}
        </button>
      </div>

      {loading ? (
        <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 12 }}>Loading…</div>
      ) : chartData.length === 0 ? (
        <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 12 }}>No data in range</div>
      ) : (
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", userSelect: "none", cursor: brush ? "ew-resize" : "crosshair" }}
          onMouseMove={onMove} onMouseLeave={() => { setHover(null); }} onMouseDown={onDown} onMouseUp={onUp}>
          {/* gridlines + y labels */}
          {Array.from({ length: 6 }).map((_, i) => {
            const v = yMin + (yRange * i / 5), y = yOf(v);
            return (
              <g key={i}>
                <line x1={PAD.left} y1={y} x2={PAD.left + cW} y2={y} stroke="rgba(58,100,180,0.18)" strokeWidth="1" />
                <text x={PAD.left - 5} y={y + 3} fill={AX} fontSize="10" textAnchor="end">{Math.round(v)}d</text>
              </g>
            );
          })}
          {/* x labels */}
          {chartData.map((d, i) => {
            const show = chartData.length <= 9 || i % Math.ceil(chartData.length / 9) === 0;
            return show ? <text key={i} x={xOf(i)} y={PAD.top + cH + 16} fill={AX} fontSize="10" textAnchor="middle">{d.label}</text> : null;
          })}
          {/* committed range shading */}
          {range && (() => {
            const i0 = chartData.findIndex(d => d.week === range.from);
            const i1 = chartData.findIndex(d => d.week === range.to);
            if (i0 < 0 || i1 < 0) return null;
            const x0 = xOf(i0), x1 = xOf(i1);
            return <rect x={Math.min(x0, x1)} y={PAD.top} width={Math.abs(x1 - x0) || 2} height={cH} fill="rgba(88,166,255,0.08)" />;
          })()}
          {/* active brush */}
          {brush && <rect x={Math.min(brush.x0, brush.x1)} y={PAD.top} width={Math.abs(brush.x1 - brush.x0)} height={cH} fill="rgba(88,166,255,0.15)" stroke="rgba(88,166,255,0.4)" />}
          {/* segment lines + dots */}
          {FW_SEGMENTS.filter(s => activeSeg.has(s.key)).map(seg => (
            <g key={seg.key}>
              <path d={linePath(seg)} fill="none" stroke={seg.color} strokeWidth="2" strokeLinejoin="round" />
              {chartData.map((d, i) => d[seg.key] == null ? null : (
                <circle key={i} cx={xOf(i)} cy={yOf(d[seg.key])} r={hover && hover.i === i ? 4 : 2.5} fill={seg.color} />
              ))}
            </g>
          ))}
          {/* hover guide line */}
          {hover && <line x1={hover.x} y1={PAD.top} x2={hover.x} y2={PAD.top + cH} stroke="rgba(120,160,220,0.35)" strokeWidth="1" strokeDasharray="3,3" />}
        </svg>
      )}

      {/* hover tooltip */}
      {hover && hover.items.length > 0 && (
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: Math.min(Math.max(hover.x, 60), W - 120), top: -H + 6, transform: "translateX(-50%)", background: "#0a1628", border: "1px solid " + C.bd, borderRadius: 6, padding: "6px 8px", pointerEvents: "none", zIndex: 5, boxShadow: "0 6px 20px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.tx, marginBottom: 3 }}>{hover.week}</div>
            {hover.items.map(it => (
              <div key={it.seg.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: it.seg.color }} />
                <span style={{ color: "rgba(180,210,240,0.8)", flex: 1 }}>{it.seg.label}</span>
                <span style={{ color: it.seg.color, fontWeight: 700 }}>{it.val.toFixed(1)}d</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 9, color: "rgba(120,150,190,0.45)", marginTop: 2 }}>Drag across the chart to select a date range · hover for values</div>

      {/* vessel list — fixed overlay anchored below chart (escapes overflow:hidden clipping) */}
      {showList && (() => {
        const r = wrapRef.current ? wrapRef.current.getBoundingClientRect() : null;
        const left = r ? r.left : 20;
        const top = r ? r.bottom - 2 : 200;
        const width = r ? r.width : 360;
        return (
          <div style={{ position: "fixed", left, top, width, zIndex: 200, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, boxShadow: "0 18px 55px rgba(0,0,0,0.75)", maxHeight: 340, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: "1px solid " + C.bd, position: "sticky", top: 0, background: C.bg2 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.tx }}>{vesselCount} vessels in chart</span>
              <button onClick={() => setShowList(false)} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", border: "1px solid rgba(88,166,255,0.25)", background: "transparent", color: "#79c0ff" }}>Hide vessels</button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ position: "sticky", top: 33, background: "#0c1729" }}>
                  {["", "Owner", "Vessel", "DWT", "Open", "Updated"].map((h, i) => (
                    <th key={i} style={{ textAlign: i > 2 ? "right" : "left", padding: "5px 8px", fontSize: 9, color: AX, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid " + C.bd }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(new Map(enriched
                  .filter(e => !range || (e.week >= range.from && e.week <= range.to))
                  .map(e => [e.vessel.toUpperCase(), e])).values())
                  .sort((a, b) => a.vessel.localeCompare(b.vessel))
                  .map(e => {
                    const off = excluded.has(e.vessel.toUpperCase());
                    return (
                      <tr key={e.vessel} style={{ opacity: off ? 0.4 : 1, borderBottom: "1px solid rgba(58,100,180,0.08)" }}>
                        <td style={{ padding: "4px 8px" }}>
                          <input type="checkbox" checked={!off} onChange={() => setExcluded(prev => { const n = new Set(prev); const k = e.vessel.toUpperCase(); n.has(k) ? n.delete(k) : n.add(k); return n; })} />
                        </td>
                        <td style={{ padding: "4px 8px", color: "rgba(160,190,230,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{e.operator}</td>
                        <td style={{ padding: "4px 8px", color: C.tx, fontWeight: 600 }}>{e.vessel}</td>
                        <td style={{ padding: "4px 8px", textAlign: "right", color: "rgba(160,190,230,0.7)" }}>{Math.round(e.dwt / 1000)}K</td>
                        <td style={{ padding: "4px 8px", textAlign: "right", color: "rgba(160,190,230,0.7)" }}>{fmtWeek(e.openDate)}</td>
                        <td style={{ padding: "4px 8px", textAlign: "right", color: "rgba(160,190,230,0.7)" }}>{fmtWeek(e.updated)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}

export { OpeningBreakdown, FixingWindow, FixingWindowChart, ExportPanel };
