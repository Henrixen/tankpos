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
            csvRows=[["Vessel","Operator","Built","DWT","LOA","Beam","CBM","Open Date","Open Port","Comment","Fuel","Ice Class"],...activeRows.map(v=>[v.vessel||"",v.operator||"",v.built||"",v.dwt||"",v.loa||"",v.beam||"",v.cbm||"",v.date||"",v.openPort||"",v.comment||"",v.spec?.fuel||"",v.spec?.iceClass||""])];
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
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Mon
  const mon = new Date(d.setDate(diff));
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

function FixingWindowChart({ vessels = [], tagFilter }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [activeSeg, setActiveSeg] = React.useState(new Set(FW_SEGMENTS.map(s=>s.key)));
  const canvasRef = useRef(null);

  // Fetch 12 weeks from positions_external using last_update_spotship as time axis
  useEffect(() => {
    async function fetch() {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 84); // 12 weeks back
      const { data, error } = await supabase
        .from("positions_external")
        .select("vessel_name,dwt,open_date,last_update_spotship,segment")
        .gte("last_update_spotship", since.toISOString())
        .not("open_date", "is", null)
        .not("dwt", "is", null)
        .not("last_update_spotship", "is", null);
      if (!error) {
        setRows(data || []);
        if (!data?.length) console.warn("FixingWindowChart: 0 rows from positions_external — check grants");
      } else console.error("FixingWindowChart fetch error:", error);
      setLoading(false);
    }
    fetch();
  }, []);

  // Build DWT lookup from in-memory vessels array (fallback)
  const dwtMap = {};
  (vessels || []).forEach(v => { if (v.vessel && v.dwt) dwtMap[v.vessel.toUpperCase()] = Number(v.dwt); });

  const filtered = tagFilter ? rows.filter(r => r.tag === tagFilter) : rows;

  // Build weekly data — open_date minus last_update_spotship = fixing window days
  const weekMap = {};
  for (const r of filtered) {
    if (!r.last_update_spotship || !r.open_date) continue;
    // Calculate fixing window: days from report date to open date
    const reportMs = new Date(r.last_update_spotship).getTime();
    const openMs = new Date(r.open_date).getTime();
    if (isNaN(reportMs) || isNaN(openMs)) continue;
    const fw = Math.round((openMs - reportMs) / 86400000);
    if (fw < -90 || fw > 180) continue;
    const wk = weekStart(r.last_update_spotship);
    const dwt = r.dwt ? Number(r.dwt) : (dwtMap[(r.vessel_name||"").toUpperCase()] || null);
    if (!dwt || dwt < 500) continue; // filter junk rows
    const seg = FW_SEGMENTS.find(s => dwt >= s.dwt[0] && dwt <= s.dwt[1]);
    if (!seg) continue;
    if (!weekMap[wk]) weekMap[wk] = {};
    if (!weekMap[wk][seg.key]) weekMap[wk][seg.key] = [];
    weekMap[wk][seg.key].push(fw);
  }

  const weeks = Object.keys(weekMap).sort();
  const chartData = weeks.map(wk => ({
    week: wk,
    label: fmtWeek(wk),
    ...Object.fromEntries(FW_SEGMENTS.map(s => [s.key, mean(weekMap[wk][s.key] || [])]))
  }));

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartData.length) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const PAD = { top: 20, right: 20, bottom: 32, left: 38 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#08111e";
    ctx.fillRect(0, 0, W, H);

    if (!chartData.length) return;

    // Y range
    const allVals = chartData.flatMap(d => FW_SEGMENTS.filter(s=>activeSeg.has(s.key)).map(s => d[s.key])).filter(v => v !== null);
    if (!allVals.length) return;
    const yMin = Math.floor(Math.min(0, ...allVals));
    const yMax = Math.ceil(Math.max(15, ...allVals));
    const yRange = yMax - yMin || 1;

    const xOf = i => chartData.length === 1 
      ? PAD.left + cW / 2  // center single point
      : PAD.left + (i / (chartData.length - 1)) * cW;
    const yOf = v => PAD.top + cH - ((v - yMin) / yRange) * cH;

    // Grid lines
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const v = yMin + (yRange * i / ticks);
      const y = yOf(v);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(58,100,180,0.15)";
      ctx.lineWidth = 1;
      ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(140,170,210,0.5)";
      ctx.font = "10px Inter,sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(Math.round(v) + "d", PAD.left - 4, y + 3);
    }

    // X axis labels
    ctx.fillStyle = "rgba(140,170,210,0.5)";
    ctx.font = "10px Inter,sans-serif";
    ctx.textAlign = "center";
    chartData.forEach((d, i) => {
      if (chartData.length <= 8 || i % Math.ceil(chartData.length / 8) === 0) {
        ctx.fillText(d.label, xOf(i), PAD.top + cH + 18);
      }
    });

    // Zero line
    if (yMin < 0 && yMax > 0) {
      const y0 = yOf(0);
      ctx.beginPath();
      ctx.strokeStyle = "rgba(120,160,220,0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4,4]);
      ctx.moveTo(PAD.left, y0); ctx.lineTo(PAD.left + cW, y0);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw segment lines
    FW_SEGMENTS.filter(s => activeSeg.has(s.key)).forEach(seg => {
      const pts = chartData.map((d,i) => ({ x: xOf(i), y: d[seg.key] !== null ? yOf(d[seg.key]) : null }));
      const valid = pts.filter(p => p.y !== null);
      if (!valid.length) return;

      // Line
      ctx.beginPath();
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      let first = true;
      pts.forEach(p => {
        if (p.y === null) { first = true; return; }
        if (first) { ctx.moveTo(p.x, p.y); first = false; }
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      // Dots + labels
      pts.forEach((p, i) => {
        if (p.y === null) return;
        ctx.beginPath();
        ctx.fillStyle = seg.color;
        ctx.arc(p.x, p.y, 3, 0, Math.PI*2);
        ctx.fill();

        const v = chartData[i][seg.key];
        if (v !== null) {
          ctx.fillStyle = seg.color;
          ctx.font = "bold 9px Inter,sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(v.toFixed(1), p.x, p.y - 7);
        }
      });
    });
  }, [chartData, activeSeg]);

  return (
    <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:7,padding:"10px 12px",marginBottom:10}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <div style={{fontSize:12,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em",flex:1}}>
          📈 Fixing Window History
        </div>
        {tagFilter && (
          <span style={{fontSize:10,padding:"2px 7px",borderRadius:4,border:"1px solid rgba(88,166,255,0.3)",color:"#79c0ff",background:"rgba(88,166,255,0.1)"}}>
            {tagFilter}
          </span>
        )}
        {/* Segment toggles */}
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {FW_SEGMENTS.map(s => {
            const on = activeSeg.has(s.key);
            return (
              <button key={s.key} onClick={() => setActiveSeg(prev => {
                const n = new Set(prev);
                if (n.has(s.key)) n.delete(s.key); else n.add(s.key);
                return n;
              })} style={{
                fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, cursor:"pointer",
                fontFamily:"inherit", border:"1px solid "+(on ? s.color : "rgba(88,166,255,0.15)"),
                background: on ? s.color+"22" : "transparent",
                color: on ? s.color : "rgba(140,170,210,0.35)"
              }}>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div style={{height:160,display:"flex",alignItems:"center",justifyContent:"center",color:C.faint,fontSize:12}}>
          Loading…
        </div>
      ) : chartData.length === 0 ? (
        <div style={{height:160,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,color:C.faint,fontSize:12}}>
          <span>No chart data ({rows.length} raw rows fetched)</span>
          {rows.length > 0 && <span style={{fontSize:10}}>All rows filtered — check open_date vs last_update_spotship range</span>}
        </div>
      ) : (
        <canvas ref={canvasRef} width={800} height={180}
          style={{width:"100%",height:180,display:"block",borderRadius:4}}/>
      )}
    </div>
  );
}

export { OpeningBreakdown, FixingWindow, FixingWindowChart, ExportPanel };
