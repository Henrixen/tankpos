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
    {label:"Open today/tomorrow",sublabel:"PPT",vessels:ppt,col:"#f78166"},
    {label:"2-4 days",sublabel:"2-4d",vessels:d24,col:C.amber},
    {label:"4-8 days",sublabel:"4-8d",vessels:d48,col:C.blue},
    {label:">8 days",sublabel:">8d",vessels:d48plus,col:"#2ecc71"},
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
              <div style={{width:"100%",background:C.bg3,borderRadius:4,flex:1,display:"flex",alignItems:"flex-end",overflow:"hidden",minHeight:120,height:"100%"}}>
                <div style={{width:"100%",height:b.vessels.length>0?Math.max(barH,8)+"%":"4%",background:b.col+(b.vessels.length>0?"cc":"22"),borderRadius:4,transition:"height 0.3s"}}/>
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

  const mean = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  const avgR = arr => arr.length ? Math.round(mean(arr)) : null;
  const normFWOp = s => (s || "Unknown").trim();

  const byOp = {};
  for(const v of withDays){
    const op = normFWOp(v.operator);
    if(!byOp[op]) byOp[op] = [];
    byOp[op].push(v.days);
  }

  const rows = Object.entries(byOp)
    .map(([op, daysArr], i) => ({
      op,
      days: avgR(daysArr),
      count: daysArr.length,
      col: OP_COLORS[i % OP_COLORS.length],
    }))
    .sort((a,b) => (b.days ?? -999) - (a.days ?? -999));

  const maxDays = Math.max(1, ...rows.map(r => Math.max(0, r.days ?? 0)));

  return(
    <div style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:"14px 16px"}}>
      <div style={{fontSize:12,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>
        ⏱ Fixing window by operator
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:220,overflowY:"auto",paddingRight:2}}>
        {rows.map(r=>{
          const pct = Math.max(4, Math.round((Math.max(0, r.days ?? 0) / maxDays) * 100));
          const active = opFilter===r.op;
          return(
            <div
              key={r.op}
              onClick={()=>onOpFilter&&onOpFilter(r.op)}
              style={{
                cursor:onOpFilter?"pointer":"default",
                padding:"4px 0",
                borderRadius:6,
                background:active?"rgba(88,166,255,0.06)":"transparent"
              }}
              title={`${r.op} · ${r.count} vessel${r.count!==1?"s":""}`}
            >
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,gap:8,alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:700,color:active?C.blue:r.col,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.op}</span>
                <span style={{fontSize:11,color:C.faint,whiteSpace:"nowrap"}}>{r.days!=null?(r.days>=0?"+":"")+r.days+"d":"—"} · {r.count}v</span>
              </div>
              <div style={{height:5,background:C.bg4,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:pct+"%",background:r.col,borderRadius:3,transition:"width .4s",boxShadow:"0 0 6px "+r.col+"66"}}/>
              </div>
            </div>
          );
        })}
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

  // WhatsApp / text format for positions
  function cargoToText(rows){
    // Title case but keep known abbreviations uppercase
    const UPPER_ABBR=new Set(["ARA","USG","USGC","UKC","UKG","MED","ARA","GIB","SPORE","WAF","MEG","AG","CPP","DPP","LNG","LPG","IMO","FOB","CIF","ETA","STS","FSU","ULSD","HVO","GTL","LCO","UCO","FAME","LSFO","HSFO","MGO","VME"]);
    const tc = s => !s?"":s.toLowerCase().split(" ").map(w=>{
      if(!w)return w;
      const up=w.toUpperCase();
      if(UPPER_ABBR.has(up))return up;
      return w[0].toUpperCase()+w.slice(1);
    }).join(" ");
    // Title case cargo type (not all caps)
    const tcCargo = s => !s?"":s.toLowerCase().split(" ").map(w=>w?w[0].toUpperCase()+w.slice(1):"").join(" ");
    // Format qty: replace . with , for decimals
    const fmtQty = q => {const n=normaliseQty(q)||"";return n.replace(/(\d)\.(\d)/g,"$1,$2");};
    // Format laycan: "19 Mar - 21 Mar" → "19-21 Mar", or single date
    const fmtLaycan = (from,to) => {
      if(!from&&!to)return "";
      if(from&&to){
        // Try to compact same-month range: "19 Mar - 21 Mar" → "19-21 Mar"
        const m1=from.match(/^(\d{1,2})\s+([A-Za-z]{3})/);
        const m2=to.match(/^(\d{1,2})\s+([A-Za-z]{3})/);
        if(m1&&m2&&m1[2].toLowerCase()===m2[2].toLowerCase())
          return m1[1]+"-"+m2[1]+" "+m1[2];
        return from+" - "+to;
      }
      return from||to;
    };
    const parts = [];
    for(const c of rows){
      const st = c.status||"";
      const charterer = tc(c.charterer||"");
      const qty = fmtQty(c.qty);
      const cargoType = tcCargo(c.cargo||"");
      const load = tc(c.load||"");
      const disch = tc(c.disch||"");
      const laycanStr = fmtLaycan(c.from,c.to);
      const freight = c.freight||"";
      const vessel = tc(c.vessel||"");
      let line = "";
      if((st==="FIXED"||st==="SUBS") && vessel){
        const fixWord = st==="SUBS"?"on subs":"fixed";
        line = [charterer,fixWord,vessel,qty,cargoType,load,"to",disch,laycanStr,freight?"USD "+freight+" ls":""].filter(Boolean).join(" ");
      } else {
        line = [vessel||charterer,qty,cargoType,load,"to",disch,laycanStr].filter(Boolean).join(" ");
      }
      parts.push(line);
    }
    return parts.join("\n").trim();
  }

  // WhatsApp / text format for cargoes
  function cargoToText(rows){
    const tc = s => !s?"":s.toLowerCase().split(" ").map(w=>w?w[0].toUpperCase()+w.slice(1):"").join(" ");
    const fmtQty = q => normaliseQty(q)||"";
    const parts = [];
    parts.push("\ud83d\udce6 *Cargoes* \u2014 "+fmtDate());
    parts.push("");
    for(const c of rows){
      const st = c.status||"";
      const charterer = tc(c.charterer||"");
      const qty = fmtQty(c.qty);
      const cargoType = (c.cargo||"").toUpperCase();
      const load = tc(c.load||"");
      const disch = tc(c.disch||"");
      const laycanStr = c.from&&c.to?"from "+c.from+" to "+c.to:c.from?"from "+c.from:c.to?"to "+c.to:"";
      const freight = c.freight||"";
      const vessel = tc(c.vessel||"");
      let line = "";
      if((st==="FIXED"||st==="SUBS") && vessel){
        const fixWord = st==="SUBS"?"on subs":"fixed";
        line = [charterer,fixWord,vessel,qty,cargoType,load,"to",disch,laycanStr,freight?"USD "+freight+" ls":""].filter(Boolean).join(" ");
      } else {
        line = [vessel||charterer,qty,cargoType,load,"to",disch,laycanStr].filter(Boolean).join(" ");
      }
      parts.push(line);
    }
    return parts.join("\n").trim();
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
  const btnStyle = {fontSize:12,fontWeight:700,padding:"4px 12px",borderRadius:5,border:"1px solid "+C.bd,
    background:C.bg3,color:C.tx,cursor:"pointer",display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"};

  function copyText(){
    const selC = selCargoes&&selCargoes.size>0 ? selCargoes : null;
    const selV2 = selVessels&&selVessels.size>0 ? selVessels : null;
    const activeRows = mode==="cargo"&&selC ? rows.filter(c=>selC.has(c.id)) : mode==="pos"&&selV2 ? rows.filter(v=>selV2.has(v.vessel)) : rows;
    const txt = mode==="pos" ? posToText(activeRows) : cargoToText(activeRows);
    // Reliable cross-browser copy
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand("copy"); } catch(e){}
    document.body.removeChild(ta);
    // Also try modern API
    if(navigator.clipboard) navigator.clipboard.writeText(txt).catch(()=>{});
    setCopied(true);
    setTimeout(()=>setCopied(false),3000);
  }

  if(!rows.length) return null;
  return(
    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
      <span style={{fontSize:12,color:C.faint,textTransform:"uppercase",letterSpacing:"0.07em"}}>Export</span>
      <button style={{...btnStyle,borderColor:copied?C.green:C.bd,color:copied?C.green:C.tx}}
        onClick={copyText} title="Copy as WhatsApp-ready text">
        {copied?"✓ Copied!":(mode==="cargo"&&selCargoes&&selCargoes.size>0?"📋 Copy ("+selCargoes.size+")":mode==="pos"&&selVessels&&selVessels.size>0?"📋 Copy ("+selVessels.size+")":"📋 Copy all")}
      </button>
      <button style={btnStyle} onClick={()=>exportExcel(rows,"pos"===mode?"pos":"cargo")}
        title="Download as CSV / Excel">
        📊 Export CSV
      </button>
    </div>
  );
}

// ─── Desktop Positions Table ──────────────────────────────────────────────────

// ─── TCE Calculator ───────────────────────────────────────────────────────────

export { OpeningBreakdown, FixingWindow, ExportPanel };
