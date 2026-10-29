import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";
import { classifyRegion, fmtDateShort } from "./utils";
import { calcTCE, lookupDist, BENCHMARK_ROUTES, loadTCEDefaults } from "./TCECalculator";

// Asia–Europe report editor and dated weekly benchmark history.
function GrowText({value,style,...props}){
 const ref=useRef(null);
 useLayoutEffect(()=>{const el=ref.current;if(el){el.style.height="auto";el.style.height=Math.max(el.scrollHeight,24)+"px";}},[value]);
 return <textarea rows={1} {...props} ref={ref} value={value} style={{...style,overflow:"hidden",resize:"none"}}/>;
}
function classifyAsiaLine(text,vessels=[]){
 if(/\b(?:TCT|time\s*charter\s*trip)\b|\b(?:pdpr|pdp?r?|per\s*day|daily)\b|\/\s*day\b/i.test(text))return "MR TCT";
 const num=x=>Number(String(x).replace(/[,\s]/g,""));
 const dwt=text.match(/\b([\d,]+(?:\.\d+)?)\s*(k)?\s*(?:dwt|sdwt)\b/i);
 const explicitDwt=dwt?num(dwt[1])*(dwt[2]?1000:1):null;
 const vessel=vessels.find(v=>String(v.vessel||v.vessel_name||"").length>3&&text.toLowerCase().includes(String(v.vessel||v.vessel_name).toLowerCase()));
 const shipDwt=explicitDwt??Number(vessel?.dwt||vessel?.sdwt||0);
 const withoutDwt=text.replace(/\b[\d,.]+\s*k?\s*(?:dwt|sdwt)\b/ig,"");
 const qty=withoutDwt.match(/\b([\d,]+(?:\.\d+)?)\s*(k\s*(?:t(?:ons?|onnes?)?)?|m(?:e?tric\s*)?t|tons?|tonnes?)\b/i);
 const amount=qty?num(qty[1])*(/^k/i.test(qty[2])?1000:1):null;
 if((amount!=null&&amount<20000)||(shipDwt>0&&shipDwt<25000))return "Sub 20k";
 if(amount>=30000&&amount<=50000)return "Handy–MR";
 if(shipDwt>=30000&&shipDwt<=50000)return "Handy–MR";
 if(/\b(?:quote[ds]?|quoting|inquiry)\b/i.test(text))return "Review";
 return "Review";
}
function normalizeAsiaReport(v){
 const a=v||{};return {...a,title:a.title||"Asia to Europe",matrixTitle:a.matrixTitle||"Freight Assessement",basis:a.basis&&a.basis!=="All freight rates USD/mt, basis 1/1 loading from Straits"?a.basis:"All rates basis 1/1 loading from Mid China",charts:[a.charts?.[0]||null,a.charts?.[1]||null],matrix:(a.matrix||[]).map(r=>({...r,route:({"5kt":"Parcel sub 5kt","10kt":"Parcel 5-10kt","15–18kt":"Inter-J19","15-18kt":"Inter-J19","Handy–MR":"Handy-MR"})[r.route]??r.route??[r.destination,r.size].filter(Boolean).join(" · "),comment:r.comment??""})),groups:["Sub 20k","Handy–MR","MR TCT"].map(title=>{const g=a.groups?.find(x=>x.title===title||(title==="Handy–MR"&&x.title==="Handy-MR"));return g||{title,text:""};}),tc7:{flat:"",costs:"",days:"",commission:"",periods:["","","",""],...a.tc7}};
}
function asiaNewbuildValue(key,value){
 const text=String(value??"");
 if(key==="dwt"&&/^\d+$/.test(text))return text.replace(/\B(?=(\d{3})+(?!\d))/g," ");
 if(key==="delivery"&&/^\d{4}-\d{2}-\d{2}$/.test(text)){const d=new Date(text+"T12:00:00Z");if(!Number.isNaN(d.getTime()))return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});}
 return text;
}
function parseAsiaPaste(text,vessels=[],format="auto"){
 const keys=["charterer","vessel","qty","cargo","laycan","rate","comment"],blank=()=>Object.fromEntries(keys.map(k=>[k,""]));
 const field=h=>{const n=h.toLowerCase().replace(/[^a-z0-9]/g,"");return ({charterer:"charterer",charterers:"charterer",chrtr:"charterer",vessel:"vessel",vesselname:"vessel",ship:"vessel",qty:"qty",quantity:"qty",size:"qty",cargo:"cargo",product:"cargo",laycan:"laycan",open:"laycan",opendate:"laycan",rate:"rate",freight:"rate",comment:"comment",comments:"comment",remarks:"comment",load:"load",loading:"load",disch:"disch",discharge:"disch",status:"status",terms:"terms",dwt:"dwt",sdwt:"dwt"})[n]||null;};
 const split=line=>{const sep=line.includes("|")?"|":line.includes("\t")?"\t":line.includes("·")?"·":null;if(!sep)return null;const out=line.split(sep).map(t=>t.trim());if(sep==="|"){if(out[0]==="")out.shift();if(out[out.length-1]==="")out.pop();}return out;};
 let headers=null;const rows=[];
 for(const raw of text.split(/\r?\n/)){const line=raw.trim();if(!line||/^\s*\|?\s*:?-{2,}/.test(line))continue;const parts=split(line);
 if(parts){const mapped=parts.map(field);if(mapped.filter(Boolean).length>=3&&(mapped.includes("vessel")||mapped.includes("charterer"))){headers=parts;continue;}}
 const cells=blank(),extra=[];let dwt=null,parsed=false;
 // Headerless cargo-table layout used in broker circulars. Never guess from column count alone.
 if(parts&&!headers&&(format==="cargo11"||(format==="auto"&&parts.length>=10&&/^(?:fixed|failed|subs|looking|fixed\s*[–-]\s*.*)$/i.test(parts[1]||""))))headers=["Charterer","Status","Qty","Cargo","Load","Discharge","Laycan","Vessel","Freight","Terms","Comment"];
 if(parts&&!headers&&format==="report7")headers=keys;

 if(parts&&headers){headers.forEach((h,i)=>{const v=parts[i]||"",k=field(h);if(!v)return;if(k==="dwt"){const n=Number(v.replace(/[,\s]/g,"").replace(/k$/i,""));if(Number.isFinite(n))dwt=n*(n<1000||/k$/i.test(v)?1000:1);extra.push(h+": "+v);}else if(["load","disch","status","terms"].includes(k)){if(!/^[—–-]+$/.test(v))extra.push(h+": "+v);}else if(k){cells[k]=[cells[k],v].filter(Boolean).join(" · ");}else extra.push(h+": "+v);});if(parts.length>headers.length)extra.push(parts.slice(headers.length).join(" · "));parsed=true;}
 else if(parts&&parts.length===7){keys.forEach((k,i)=>cells[k]=parts[i]);parsed=true;}
 else {
 // Conservative extraction for unlabelled fixture prose; uncertain remainder stays visible.
 const vessel=vessels.find(v=>{const n=String(v.vessel||v.vessel_name||"");return n.length>3&&line.toLowerCase().includes(n.toLowerCase());});if(vessel)cells.vessel=vessel.vessel||vessel.vessel_name;
 const rate=line.match(/(?:USD|US\$|\$)\s*[\d,.]+(?:\s*[km])?(?:\s*(?:PMT|PDPR|PD|LS|WS|per\s*day))?/i);if(rate)cells.rate=rate[0];
 const qty=line.match(/\b[\d,]+(?:\.\d+)?\s*(?:kt|k\s*tons?|mt|tonnes?|tons?)\b/i);if(qty)cells.qty=qty[0];
 const cargo=line.match(/\b(?:CPP|DPP|PALM|NAPHTHA|METHANOL|JET|GASOIL|ULSD|UCO|FAME|VEGOIL|CHEMS?)\b/i);if(cargo)cells.cargo=cargo[0];
 cells.comment=line;
 }
 if(extra.length)cells.comment=[cells.comment,...extra].filter(Boolean).join(" · ");
 // Header-labelled positions use DWT only for vessel-size grouping, never cargo quantity.
 const section=classifyAsiaLine([cells.qty&&cells.qty+(/^[\d,. ]+$/.test(cells.qty)?" mt":""),cells.rate,cells.vessel,dwt?dwt+" dwt":"",!parsed?line:""].filter(Boolean).join(" "),vessels);
 rows.push({text:line,cells,section,parsed});
 }
 return rows;
}
function asiaFixtureCells(f){
 const raw=f._asiaText||f._asiaCells?.comment||"";
 const onlyRaw=!f.charterer&&!f.vessel&&(!f._asiaCells||Object.entries(f._asiaCells).every(([k,v])=>k==="comment"||!v));
 if(onlyRaw&&raw.includes("|")){
  const p=raw.split("|").map(x=>x.trim());if(p[0]==="")p.shift();if(p[p.length-1]==="")p.pop();
  if(p.length>=9&&/^[\d.]+$/.test(p[2])&&/^[\d,.]+$/.test(p[3]))return parseAsiaPaste("Region|Vessel|YR|DWT|CUB|Ice class|Area|Open|Status|Comments\n"+raw)[0]?.cells||f._asiaCells;
  if(p.length===7)return parseAsiaPaste(raw)[0].cells;
 }
 if(f._asiaCells)return f._asiaCells;
 const cells={charterer:f.charterer||"",vessel:f.vessel||"",qty:f.qty||"",cargo:f.cargo||"",laycan:f.laycan||[f.laycanFrom,f.laycanTo].filter(Boolean).join("–"),rate:f.freight||f.rate||"",comment:f.comment||f.comments||""};
 // Keep legacy pasted text intact when its columns cannot be identified reliably.
 if(f._asiaText){
  const parts=f._asiaText.split(/\t|\s*·\s*/);
  if(parts.length===7&&!Object.values(cells).some(Boolean)){[cells.charterer,cells.vessel,cells.qty,cells.cargo,cells.laycan,cells.rate,cells.comment]=parts;}
  else if(!Object.values(cells).some(Boolean))cells.comment=f._asiaText;
  else {const old=[f.charterer,f.vessel,f.qty,f.cargo,[f.load,f.disch].filter(Boolean).join(" / "),f.freight||f.rate,[f.laycanFrom,f.laycanTo].filter(Boolean).join("–")].filter(Boolean).join(" · ");if(f._asiaText!==old)cells.comment=[cells.comment,f._asiaText].filter(Boolean).join(" · ");else if(f.load||f.disch)cells.comment=[cells.comment,[f.load,f.disch].filter(Boolean).join(" / ")].filter(Boolean).join(" · ");}
 }
 return cells;
}
function AsiaReportEditor({value,onChange,date,name,setName,saveCopy,setSaveCopy,onSave,busy,status,commentary,setCommentary,previewRef,onCopy,onDownload,exportStatus,setDate,fixtures,setFixtures,logo,Sparkline,ffaMonths,vessels=[]}){
 const a=normalizeAsiaReport(value),[message,setMessage]=useState(""),[paste,setPaste]=useState(""),[review,setReview]=useState([]),[pasteFormat,setPasteFormat]=useState("auto"),[exporting,setExporting]=useState(false),files=useRef([]);
 const set=(key,val)=>onChange(p=>({...normalizeAsiaReport(p),[key]:val}));
 const input={width:"100%",boxSizing:"border-box",border:0,background:"#f3f7fb",borderRadius:3,color:"#143656",fontFamily:"Arial,sans-serif",fontSize:13,padding:"3px 4px",lineHeight:"18px",outlineColor:"#7caff0"};
 const btn={padding:"7px 12px",background:"#e2f0ff",color:"#14548c",border:"1px solid #8abbe9",borderRadius:5,cursor:"pointer",fontWeight:700,fontSize:12};
 const red={background:"transparent",border:0,color:"#ef4444",fontSize:18,cursor:"pointer",padding:"0 5px"};
 const heading={background:"#e8f0f8",borderLeft:"3px solid #367ca9",borderRadius:"0 6px 6px 0",padding:"6px 10px",color:"#123b5b",fontWeight:800,margin:"16px 0 6px",fontSize:15};
 const titleInput={...input,background:"transparent",fontSize:15,fontWeight:800,padding:0};
 const matrixTh={padding:"5px 8px",background:"#173f60",color:"white",textAlign:"left",borderBottom:"2px solid #6c9bbd"};
 const td={padding:"4px 5px",borderBottom:"1px solid #dce5ee",textAlign:"left"},th={...td,color:"#fff",background:"#173f64",fontSize:12};
 const line=f=>f._asiaCells?Object.values(f._asiaCells).filter(Boolean).join(" · "):f._asiaText??[f.charterer,f.vessel,f.qty,f.cargo,[f.load,f.disch].filter(Boolean).join(" / "),f.freight||f.rate,[f.laycanFrom,f.laycanTo].filter(Boolean).join("–")].filter(Boolean).join(" · ");
 const category=f=>f._asiaSection==="Quotes"?"Review":f._asiaSection||classifyAsiaLine(line(f)+(f.qty?" "+f.qty+(/^[\d, .]+$/.test(String(f.qty))?" mt":""):""),vessels);
 async function exportReport(action){if(exporting)return;setExporting(true);const node=previewRef.current;try{node?.setAttribute("data-export","true");await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));await action?.();}finally{node?.removeAttribute("data-export");setExporting(false);}}
 const included=key=>a.exportSections?.[key]!==false;
 const exportClass=key=>included(key)?undefined:"no-export";
 const addCargo=section=>setFixtures(p=>[...p,{_asiaCells:{charterer:"",vessel:"",qty:"",cargo:"",laycan:"",rate:"",comment:""},_asiaSection:section,_reportExportId:crypto.randomUUID()}]);
 const reviewRows=review.map((row,index)=>({row,index})).sort((a,b)=>(a.row.section==="Review"?0:a.row.section==="Exclude"?2:1)-(b.row.section==="Review"?0:b.row.section==="Exclude"?2:1));
 const commentaryText=(commentary||"").split("\n").map(t=>t.trim()?"• "+t.replace(/^\s*[•*-]\s*/,""):t).join("\n");
 async function imageFile(file,i){if(!file?.type.startsWith("image/")){setMessage("Choose an image.");return;}if(file.size>6*1024*1024){setMessage("Please use a chart smaller than 6 MB.");return;}const reader=new FileReader();reader.onload=()=>onChange(p=>{const next=normalizeAsiaReport(p);return {...next,charts:next.charts.map((x,j)=>j===i?reader.result:x)};});reader.onerror=()=>setMessage("Could not read image.");reader.readAsDataURL(file);}
 function prepare(){setReview(parseAsiaPaste(paste,vessels,pasteFormat));}
 function importLines(){if(review.some(r=>r.section==="Review")){setMessage("Choose a section for the lines marked Review first.");return;}setFixtures(p=>[...p,...review.filter(r=>r.section!=="Exclude").map(r=>({...r.cells,freight:r.cells.rate,_asiaText:r.text,_asiaCells:r.cells,_asiaSection:r.section,_reportExportId:crypto.randomUUID()}))]);setReview([]);setPaste("");setMessage("Selected cargoes imported into columns. Excluded rows skipped. Review and Save the report.");}
 function importNB(){try{const snap=JSON.parse(localStorage.getItem("tankpos:asia-newbuilds-snapshot:v1")||"null");if(!snap?.rows?.length)throw Error("Refine Upcoming Deliveries in Newbuilds and click Send to Asia–Europe report first.");set("newbuilds",snap);setMessage("Newbuilds list imported. Save the report to retain this snapshot.");}catch(e){setMessage(e.message);}}
 const flat=Number(a.tc7.flat),money=n=>Number.isFinite(n)?n.toLocaleString("en-US",{maximumFractionDigits:0}):"—";
 const lumpsum=ws=>ws!==""&&Number(ws)>0&&flat>0?35000*flat*Number(ws)/100:NaN;
 return <>
 <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",color:"#c9d9eb"}}>
 <input style={{...input,background:"#0d2036",color:"white",width:220,borderRadius:4}} value={name} placeholder="Saved report name" onChange={e=>setName(e.target.value)}/><input type="date" style={{...input,background:"white",width:145}} value={date} onChange={e=>setDate(e.target.value)}/>
 <label style={{fontSize:12}}><input type="checkbox" checked={saveCopy} onChange={e=>setSaveCopy(e.target.checked)}/> Save as copy</label><button style={btn} disabled={busy} onClick={onSave}>{busy?"Saving…":"Save report"}</button><button style={btn} disabled={exporting} onClick={()=>{if(included("activities")&&fixtures.some(f=>category(f)==="Review")){setMessage("Choose a category for the imported cargoes before exporting.");return;}exportReport(onCopy);}}>Copy to email</button><button style={btn} disabled={exporting} onClick={()=>{if(included("activities")&&fixtures.some(f=>category(f)==="Review")){setMessage("Choose a category for the imported cargoes before exporting.");return;}exportReport(onDownload);}}>Download PNG</button><span>{status||exportStatus}</span>
 </div>
 <div style={{display:"flex",gap:12,flexWrap:"wrap",padding:"10px 0",color:"#cce5fa",fontSize:12}}><b>Include in export:</b>{[["commentary","Commentary"],["assessment","Freight assessment"],["graph0","Graph 1"],["graph1","Graph 2"],["activities","Recent Activities"],...a.groups.map(g=>["group:"+g.title,g.label??g.title]),["tc7","TC7"],["newbuilds","Newbuilds"]].map(([key,label])=><label key={key} style={{display:"inline-flex",gap:4,alignItems:"center"}}><input type="checkbox" aria-label={`Include ${label} in export`} checked={included(key)} style={{accentColor:"#389cde"}} onChange={e=>set("exportSections",{...a.exportSections,[key]:e.target.checked})}/>{label}</label>)}</div>
 <details style={{background:"#10223a",color:"#d5e7fa",padding:12,borderRadius:6}}><summary style={{cursor:"pointer",fontWeight:700}}>Paste cargoes &amp; categorise</summary>
 <GrowText style={{...input,background:"#f4f8ff",minHeight:115,marginTop:10}} value={paste} onChange={e=>setPaste(e.target.value)} placeholder="Paste a table with its header row (pipe-separated or tab-separated), or one fixture per line. Review extracted columns before adding."/>
 <div style={{fontSize:12,margin:"8px 0",lineHeight:1.6}}>Use tabs from Excel or <b>|</b> between columns, one cargo per line. Paste the header row when possible.<br/><code>Charterer | Status | Qty | Cargo | Load | Discharge | Laycan | Vessel | Freight | Terms | Comment</code></div>
 <label style={{fontSize:12}}>Paste format <select aria-label="Cargo paste format" value={pasteFormat} onChange={e=>setPasteFormat(e.target.value)} style={{...input,width:260,margin:"0 10px"}}><option value="auto">Auto / use pasted headers</option><option value="cargo11">Cargo table · 11 columns</option><option value="report7">Report table · 7 columns</option></select></label><button style={btn} onClick={prepare}>Review cargoes</button>
 {!!review.length&&<div style={{overflowX:"auto",marginTop:8}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}><thead><tr>{["Section","Charterer","Vessel","Qty","Cargo","Laycan","Rate","Comment",""].map((t,i)=><th key={i} style={{textAlign:"left",padding:5,color:"#dcecff"}}>{t}</th>)}</tr></thead><tbody>{reviewRows.map(({row:r,index:i},position)=><React.Fragment key={i}>{(position===0||reviewRows[position-1].row.section!=="Review"&&r.section==="Review"||reviewRows[position-1].row.section==="Review"&&r.section!=="Review")&&<tr><td colSpan={9} style={{padding:8,background:"#204e70",color:"#e6f4ff",fontWeight:700}}>{r.section==="Review"?`Needs review (${review.filter(x=>x.section==="Review").length})`:"Categorised cargoes"}</td></tr>}<tr style={{background:r.section==="Review"?"#cce7fa":r.section==="Exclude"?"#283342":"#102c43"}}><td style={{padding:4}}><select aria-label={`Paste section ${i+1}`} value={r.section} onChange={e=>setReview(p=>p.map((x,j)=>i===j?{...x,section:e.target.value}:x))} style={{...input,width:110,fontWeight:700,background:r.section==="Review"?"#dff1ff":r.section==="Exclude"?"#d9dee5":"#e7f1fa",color:r.section==="Review"?"#164a70":"#173653"}}>{["Review","Exclude","Sub 20k","Handy–MR","MR TCT"].map(g=><option key={g}>{g}</option>)}</select></td>{["charterer","vessel","qty","cargo","laycan","rate","comment"].map(k=><td key={k} style={{padding:3,verticalAlign:"top"}}><GrowText aria-label={`Paste ${k} ${i+1}`} value={r.cells[k]||""} style={{...input,minWidth:k==="comment"?180:70,fontSize:11}} onChange={e=>setReview(p=>p.map((x,j)=>i===j?{...x,cells:{...x.cells,[k]:e.target.value}}:x))}/></td>)}<td><button aria-label={`Remove pasted row ${i+1}`} style={red} onClick={()=>setReview(p=>p.filter((_,j)=>j!==i))}>×</button></td></tr></React.Fragment>)}</tbody></table><div style={{fontSize:11,color:"#a8d8fc",padding:6}}>Light blue Review rows are grouped first and need a section. Choose Exclude to skip a row. Uncertain text remains in Comment for your review.</div></div>}
 {!!review.length&&<button style={{...btn,marginTop:10}} onClick={importLines}>Add reviewed cargoes</button>}
 </details>
 {message&&<div role="status" style={{color:"#9dccf6",fontSize:12}}>{message}</div>}
 <div style={{overflowX:"auto"}}><div ref={previewRef} className="asia-report" style={{width:950,boxSizing:"border-box",padding:24,background:"white",color:"#173653",fontFamily:"Arial,sans-serif",fontSize:13}}>
 <style>{`.asia-report textarea{display:block;min-height:24px}.asia-report [data-field]{background:#eef5fb}.asia-report[data-export="true"] input,.asia-report[data-export="true"] textarea{background:transparent!important;border-color:transparent!important;box-shadow:none!important}.asia-report[data-export="true"] input::placeholder,.asia-report[data-export="true"] textarea::placeholder{color:transparent!important}.asia-report[data-export="true"] .no-export{display:none!important}`}</style>
 <div style={{display:"grid",gridTemplateColumns:"1fr 190px 1fr",gap:15,alignItems:"center",paddingBottom:16,borderBottom:"3px solid #173f64"}}><input aria-label="Asia report title" style={{...input,background:"transparent",fontFamily:"Georgia,serif",fontSize:24,fontWeight:600,letterSpacing:"-.3px"}} value={a.title} onChange={e=>set("title",e.target.value)}/><img src={logo} style={{width:180,justifySelf:"center"}} alt="Steem1960"/><div style={{textAlign:"right",fontFamily:"Georgia,serif",fontSize:14}}>{date?new Date(date+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}):""}</div></div>
 <div className="asia-top-grid" style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:"12px 12px",marginTop:14,alignItems:"stretch"}}>
 <section className={exportClass("commentary")} style={{minWidth:0,display:"flex",flexDirection:"column",background:"#eef6fc"}}><div style={{...heading,margin:"0 0 5px"}}>Market commentary</div><GrowText aria-label="Market commentary" style={{...input,background:"#eef6fc",minHeight:175,flex:1,padding:"8px 10px"}} value={commentaryText} onChange={e=>setCommentary(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();const el=e.currentTarget,pos=el.selectionStart;setCommentary(el.value.slice(0,pos)+"\n• "+el.value.slice(el.selectionEnd));requestAnimationFrame(()=>el.setSelectionRange(pos+3,pos+3));}}} placeholder="• Market commentary…"/></section>
 <section className={exportClass("assessment")} style={{minWidth:0}}>
 <div style={{...heading,margin:"0 0 5px"}}><input aria-label="Freight assessment title" value={a.matrixTitle} style={titleInput} onChange={e=>set("matrixTitle",e.target.value)}/></div>
 <table style={{width:"100%",borderCollapse:"collapse",borderSpacing:0,tableLayout:"fixed"}}><colgroup><col style={{width:"36%"}}/><col style={{width:"30%"}}/><col/><col className="no-export" style={{width:25}}/></colgroup><thead><tr>{["Trade","Rate","Comment"].map((x,i)=><th key={i} style={matrixTh}><input aria-label={`Matrix header ${i+1}`} value={a.matrixHeaders?.[i]??x} style={{...input,color:"white",background:"transparent",fontWeight:750,fontSize:12,letterSpacing:0}} onChange={e=>set("matrixHeaders",["Trade","Rate","Comment"].map((v,j)=>i===j?e.target.value:a.matrixHeaders?.[j]??v))}/></th>)}<th className="no-export" style={matrixTh}/></tr></thead><tbody>{a.matrix.map((r,i)=><tr key={i}>{["route","current","comment"].map(k=><td style={{padding:"1px 6px",background:i%2?"#f1f7fc":"#eaf3fa",borderBottom:"1px solid #e1eaf1"}} key={k}><GrowText aria-label={`Matrix ${k} ${i+1}`} value={r[k]??""} style={{...input,background:"transparent",fontWeight:k==="route"?750:400}} onChange={e=>set("matrix",a.matrix.map((x,j)=>i===j?{...x,[k]:e.target.value}:x))}/></td>)}<td className="no-export"><button style={red} aria-label="Remove route" onClick={()=>set("matrix",a.matrix.filter((_,j)=>i!==j))}>×</button></td></tr>)}</tbody></table>
 <button className="no-export" style={{...btn,marginTop:8}} onClick={()=>set("matrix",[...a.matrix,{route:"",current:"",comment:""}])}>+ Add trade</button><input style={{...input,background:"transparent",fontSize:11,fontStyle:"italic",marginTop:4}} value={a.basis} onChange={e=>set("basis",e.target.value)}/>
 </section>
 {a.charts.map((src,i)=><div key={i} className={exportClass("graph"+i)} tabIndex={0} aria-label={`Paste graph ${i+1}`} onPaste={e=>{const item=[...e.clipboardData.items].find(x=>x.type.startsWith("image/"));if(item){e.preventDefault();imageFile(item.getAsFile(),i);}}} style={{position:"relative",minWidth:0,minHeight:src?0:110,border:src?0:"1px dashed #84b9e9",borderRadius:6,background:src?"transparent":"#f2f8ff",display:"flex",alignItems:"center",justifyContent:"center"}}>
 <input className="no-export" type="file" accept="image/*" ref={el=>files.current[i]=el} style={{display:"none"}} onChange={e=>imageFile(e.target.files?.[0],i)}/>{src?<><img src={src} alt={`Report graph ${i+1}`} style={{display:"block",width:"100%",height:"auto",objectFit:"contain"}}/><div className="no-export" style={{position:"absolute",right:4,top:4,display:"flex",gap:4}}><button style={btn} onClick={()=>files.current[i]?.click()}>Replace</button><button style={red} onClick={()=>set("charts",a.charts.map((x,j)=>i===j?null:x))}>×</button></div></>:<button className="no-export" style={{...btn,border:0,background:"transparent",textAlign:"center",fontWeight:400}} onClick={()=>files.current[i]?.click()}><span style={{display:"block",fontSize:34}}>+</span>Click to import, or click the box and Ctrl+V</button>}</div>)}
 </div>
 <div className={exportClass("activities")} style={{...heading,display:"flex",gap:8,alignItems:"center"}}><input aria-label="Recent Activities title" style={{...titleInput,flex:1}} value={a.activityTitle??"Recent Activities"} onChange={e=>set("activityTitle",e.target.value)}/></div>
 <table className={exportClass("activities")} aria-label="Recent Activities cargoes" style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}><colgroup>{[14,16,8,11,14,16,21].map((w,i)=><col key={i} style={{width:w+"%"}}/>)}<col className="no-export" style={{width:100}}/></colgroup><thead><tr>{["Charterer","Vessel","Qty","Cargo","Laycan","Rate","Comment"].map(t=><th key={t} style={th}>{t}</th>)}<th className="no-export" style={th}/></tr></thead><tbody>
 {a.groups.map((g,gi)=><React.Fragment key={g.title}><tr className={exportClass("group:"+g.title)}><td colSpan={8} style={{padding:"8px 0 3px"}}><div style={{background:"#e4f1fa",padding:"4px 7px",borderRadius:3,display:"flex",gap:8,alignItems:"center"}}><input aria-label={`Section title ${gi+1}`} style={{...titleInput,fontSize:13,flex:1}} value={g.label??g.title} onChange={e=>set("groups",a.groups.map((x,j)=>gi===j?{...x,label:e.target.value}:x))}/><button className="no-export" aria-label={`Add cargo to ${g.label??g.title}`} title="Add cargo line" style={{...btn,padding:"0 8px",fontSize:20,background:"#174f80",color:"white"}} onClick={()=>addCargo(g.title)}>+</button></div></td></tr>
 {fixtures.map((f,i)=>{if(category(f)!==g.title)return null;const cells=asiaFixtureCells(f);return <tr className={exportClass("group:"+g.title)} key={f._reportExportId||i}>{["charterer","vessel","qty","cargo","laycan","rate","comment"].map(k=><td key={k} style={{...td,padding:"2px 3px",verticalAlign:"top"}}><GrowText aria-label={`Cargo ${k} ${i+1}`} value={cells[k]??""} style={{...input,fontWeight:k==="charterer"||k==="rate"?700:400}} onChange={e=>{const text=e.target.value;setFixtures(p=>p.map((x,j)=>i===j?{...x,_asiaCells:{...asiaFixtureCells(x),[k]:text},[k==="rate"?"freight":k]:text}:x));}}/></td>)}<td className="no-export" style={{...td,padding:"2px 2px",verticalAlign:"top"}}><div style={{display:"flex",alignItems:"center"}}><select aria-label={`Fixture category ${i+1}`} value={g.title} style={{...input,width:78,fontSize:9}} onChange={e=>setFixtures(p=>p.map((x,j)=>i===j?{...x,_asiaSection:e.target.value}:x))}><option value="Exclude">Exclude</option>{a.groups.map(x=><option key={x.title} value={x.title}>{x.label??x.title}</option>)}</select><button aria-label={`Remove cargo ${i+1}`} style={red} onClick={()=>setFixtures(p=>p.filter((_,j)=>i!==j))}>×</button></div></td></tr>;})}
 {!fixtures.some(f=>category(f)===g.title)&&<tr className={exportClass("group:"+g.title)}><td colSpan={8} style={{height:24,borderBottom:"1px solid #dce5ee"}}/></tr>}
 </React.Fragment>)}
 </tbody></table>
 {fixtures.some(f=>category(f)==="Review")&&<div className="no-export" style={{padding:10,background:"#e5f3ff"}}><b>Choose a category for imported cargoes</b>{fixtures.map((f,i)=>category(f)==="Review"?<div key={i} style={{display:"flex",gap:10,alignItems:"center",marginTop:6}}><span style={{flex:1}}>{line(f)}</span><select style={{background:"#dff1ff",color:"#164a70",fontWeight:700,padding:5}} value="Review" onChange={e=>setFixtures(p=>p.map((x,j)=>i===j?{...x,_asiaSection:e.target.value}:x))}><option>Review</option><option>Exclude</option>{a.groups.map(g=><option key={g.title}>{g.title}</option>)}</select></div>:null)}</div>}
 {fixtures.some(f=>category(f)==="Exclude")&&<details className="no-export" style={{marginTop:10,padding:8,background:"#edf1f5",color:"#435568",fontSize:12}}><summary>Excluded rows ({fixtures.filter(f=>category(f)==="Exclude").length}) — not exported</summary>{fixtures.map((f,i)=>category(f)==="Exclude"?<div key={f._reportExportId||i} style={{display:"flex",gap:8,padding:5}}><span style={{flex:1}}>{line(f)}</span><select aria-label={`Excluded cargo ${i+1}`} value="Exclude" onChange={e=>setFixtures(p=>p.map((x,j)=>i===j?{...x,_asiaSection:e.target.value}:x))}><option>Exclude</option><option>Review</option>{a.groups.map(g=><option key={g.title}>{g.title}</option>)}</select></div>:null)}</details>}
 <section className={exportClass("tc7")}><div style={heading}><input aria-label="TC7 section title" style={titleInput} value={a.tc7.title??"TC7 · Singapore–Australia · 35,000 mt CPP"} onChange={e=>set("tc7",{...a.tc7,title:e.target.value})}/></div>
 <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Segment","Spot WS","TCE USD/day",ffaMonths.join(" | "),"Comment"].map(t=><th key={t} style={th}>{t}</th>)}</tr></thead><tbody><tr><td style={td}>TC7</td><td style={td}><input aria-label="TC7 spot WS" type="text" inputMode="decimal" style={{...input,width:65,fontWeight:700}} value={a.tc7.periods[0]} onChange={e=>set("tc7",{...a.tc7,periods:a.tc7.periods.map((x,i)=>i===0?e.target.value:x)})}/><div style={{fontSize:10,color:"#5a7187"}}>{Number.isFinite(lumpsum(a.tc7.periods[0]))?"USD "+money(lumpsum(a.tc7.periods[0]))+" ls":""}</div></td><td style={td}><input aria-label="TC7 TCE" style={{...input,width:90}} value={a.tc7.tce||""} placeholder="Free text" onChange={e=>set("tc7",{...a.tc7,tce:e.target.value})}/></td><td style={td}><div style={{display:"flex",alignItems:"center",gap:6}}><Sparkline aug={a.tc7.periods[1]} sep={a.tc7.periods[2]} oct={a.tc7.periods[3]}/>{a.tc7.periods.slice(1).map((ws,j)=><div key={j}><input aria-label={`TC7 ${ffaMonths[j]}`} type="text" inputMode="decimal" value={ws} style={{...input,width:50}} onChange={e=>set("tc7",{...a.tc7,periods:a.tc7.periods.map((x,i)=>i===j+1?e.target.value:x)})}/><div style={{fontSize:9,color:"#5a7187",whiteSpace:"nowrap"}}>{Number.isFinite(lumpsum(ws))?"$"+money(lumpsum(ws)):""}</div></div>)}</div></td><td style={td}><input aria-label="TC7 comment" style={input} value={a.tc7.comment||""} onChange={e=>set("tc7",{...a.tc7,comment:e.target.value})}/></td></tr></tbody></table>

 </section>
 <div className="no-export" style={{display:"flex",gap:8,marginTop:14}}><button style={btn} onClick={importNB}>Import refined Newbuilds list</button>{a.newbuilds&&<button style={red} onClick={()=>set("newbuilds",null)}>×</button>}</div>
 {a.newbuilds&&<section className={exportClass("newbuilds")}><div style={heading}><input aria-label="Newbuilds section title" style={titleInput} value={a.newbuilds.title??"Newbuilds · coming next 3 months"} onChange={e=>set("newbuilds",{...a.newbuilds,title:e.target.value})}/></div><table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",fontSize:11}}><colgroup>{[17,7,9,12,13,13,15,11].map((w,i)=><col key={i} style={{width:w+"%"}}/>)}<col className="no-export" style={{width:22}}/></colgroup><thead><tr>{["Vessel","DWT","Coating","Delivery","Operator","Owner","Yard","Comment"].map((t,i)=><th key={i} style={th}><GrowText aria-label={`Newbuild header ${i+1}`} value={a.newbuilds.headers?.[i]??t} style={{...input,color:"white",background:"#234e73",fontSize:10,fontWeight:700}} onChange={e=>set("newbuilds",{...a.newbuilds,headers:["Vessel","DWT","Coating","Delivery","Operator","Owner","Yard","Comment"].map((v,j)=>i===j?e.target.value:a.newbuilds.headers?.[j]??v)})}/></th>)}<th className="no-export"/></tr></thead><tbody>{a.newbuilds.rows.map((r,i)=><tr key={i}>{["vessel","dwt","coating","delivery","operator","owner","yard","comment"].map(k=><td key={k} style={{...td,padding:"5px 3px",verticalAlign:"top"}}><GrowText aria-label={`Newbuild ${k} ${i+1}`} value={asiaNewbuildValue(k,r[k])} style={{...input,fontSize:11}} onChange={e=>set("newbuilds",{...a.newbuilds,rows:a.newbuilds.rows.map((x,j)=>i===j?{...x,[k]:e.target.value}:x)})}/></td>)}<td className="no-export"><button aria-label="Remove newbuild" style={red} onClick={()=>set("newbuilds",{...a.newbuilds,rows:a.newbuilds.rows.filter((_,j)=>i!==j)})}>×</button></td></tr>)}</tbody></table></section>}
 </div></div></>;
}

function reportWeek(date){const d=new Date(date+"T12:00:00Z");if(Number.isNaN(d.getTime()))return "";d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
function historyWeeks(date){const anchor=reportWeek(date);if(!anchor)return [];return Array.from({length:12},(_,i)=>{const d=new Date(anchor+"T12:00:00Z");d.setUTCDate(d.getUTCDate()-(11-i)*7);return d.toISOString().slice(0,10);});}
function trimWeeklyHistory(history,date){const weeks=new Set(historyWeeks(date));return {...history,series:Object.fromEntries(Object.entries(history.series||{}).map(([key,values])=>[key,Object.fromEntries(Object.entries(values).filter(([day])=>weeks.has(day)))]))};}
function historyNumber(value){if(value==null||String(value).trim()==="")return null;const s=String(value).replace(/USD|\$/ig,"").replace(/[,\s]/g,"");const n=parseFloat(s);return Number.isFinite(n)?n*(/\d(?:\.\d+)?k\b/i.test(s)?1000:1):null;}
function WeeklyBenchmarkPlot({values={},date,title="Benchmark freight · 12 weeks",light=false}){
 const weeks=historyWeeks(date),points=weeks.map((w,i)=>({x:i,value:historyNumber(values[w]),week:w})).filter(p=>p.value!=null);
 if(!points.length)return <div style={{padding:15,color:light?"#64748b":"#91accb",fontSize:12}}>Enter weekly values to display the chart.</div>;
 const W=820,H=185,L=72,R=22,T=20,B=32;const rawMin=Math.min(...points.map(p=>p.value)),rawMax=Math.max(...points.map(p=>p.value)),span=rawMax-rawMin||Math.max(Math.abs(rawMax)*.1,1),lo=rawMin-span*.15,hi=rawMax+span*.15;
 const x=i=>L+i/11*(W-L-R),y=v=>H-B-(v-lo)/(hi-lo)*(H-T-B),ink=light?"#46637d":"#a7c5e9",line=light?"#246ba6":"#79c0ff";
 const path=weeks.map((w,i)=>{const n=historyNumber(values[w]);return n==null?null:{i,n};}).reduce((a,p,i,all)=>a+(p?`${i&&all[i-1]?"L":"M"}${x(p.i)},${y(p.n)} `:""),"");
 return <div style={{padding:"8px 10px",color:ink}}><div style={{fontSize:12,fontWeight:700,marginBottom:6}}>{title}</div><svg role="img" aria-label={title} viewBox={`0 0 ${W} ${H}`} style={{display:"block",width:"100%",height:"auto"}}>{[0,1,2,3].map(i=>{const v=lo+(hi-lo)*i/3;return <g key={i}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} stroke={light?"#dce6ef":"#2c425a"}/><text x={L-8} y={y(v)+4} fill={ink} textAnchor="end" fontSize="10">{Math.round(v).toLocaleString("en-US")}</text></g>})}<path d={path} fill="none" stroke={line} strokeWidth="2.5"/>{points.map(p=><g key={p.week}><circle cx={x(p.x)} cy={y(p.value)} r="3" fill={line}/><title>{p.week+": "+p.value.toLocaleString("en-US")}</title></g>)}{weeks.map((w,i)=><text key={w} x={x(i)} y={H-10} fill={ink} textAnchor="middle" fontSize="9">{new Date(w+"T12:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"UTC"})}</text>)}</svg></div>;
}
function WeeklyBenchmarkHistory({history,setHistory,rows,date}){
 const key=history.routeKey||rows[0]?.key||"",values=history.series?.[key]||{},route=rows.find(r=>r.key===key);
 return <div style={{background:"#0e1d32",border:"1px solid #2b4563",borderRadius:7,padding:12,color:"#cce1f8"}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><b style={{fontSize:12}}>Weekly benchmark · rolling 12 weeks</b><select aria-label="Benchmark history route" value={key} onChange={e=>setHistory(p=>({...p,routeKey:e.target.value}))} style={{marginLeft:"auto",background:"#10233c",color:"#bdd9f7",padding:6,border:"1px solid #42678d",borderRadius:4}}>{rows.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}</select></div>
 <div style={{fontSize:11,color:"#91accb",marginBottom:8}}>Weeks follow the report date. Import the preceding report to carry its history forward; changing to a later week opens a blank current-week cell.</div>
 <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",minWidth:760}}><thead><tr>{historyWeeks(date).map((w,i)=><th key={w} style={{padding:5,fontSize:10,color:i===11?"#86efac":"#91accb"}}>{new Date(w+"T12:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"UTC"})}</th>)}</tr></thead><tbody><tr>{historyWeeks(date).map((w,i)=><td key={w} style={{padding:3}}><input aria-label={`Benchmark week ${w}`} value={values[w]??""} onChange={e=>setHistory(p=>({...p,routeKey:key,series:{...p.series,[key]:{...p.series?.[key],[w]:e.target.value}}}))} placeholder={i===11?"This week":""} style={{boxSizing:"border-box",width:"100%",minWidth:55,padding:"6px 4px",fontSize:11,border:"1px solid "+(i===11?"#70b994":"#34516e"),background:"#0a1728",color:"#dcecff",borderRadius:3}}/></td>)}</tr></tbody></table></div>
 <WeeklyBenchmarkPlot values={values} date={date} title={`${route?.label||"Benchmark"} · weekly freight`}/></div>;
}


const STEEM_LOGO = "data:image/png;base64,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";

const INTERMEDIATE_HEADER_LOGO = "data:image/png;base64,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";

const ASIA_NB_KEY="tankpos:asia-newbuilds-snapshot:v1";
function asiaBlank(){return {title:"Asia to Europe",matrixTitle:"Freight Assessement",matrix:[
 {route:"Parcel sub 5kt",current:"",comment:""},{route:"Parcel 5-10kt",current:"",comment:""},{route:"Inter-J19",current:"",comment:""},{route:"Handy-MR",current:"",comment:""},{route:"TCT",current:"",comment:""}],
 basis:"All rates basis 1/1 loading from Mid China",charts:[null,null],
 groups:[{title:"Sub 20k",text:""},{title:"Handy–MR",text:""},{title:"MR TCT",text:""}],
 tc7:{flat:"",costs:"",days:"",commission:"",periods:["","","",""]},newbuilds:null};}

const MARKET_TYPES = ["Intermediate", "Asia to Europe", "Transatlantic", "TimeCharter"];
const SEG_ORDER = ["Sub 10k", "City", "Inter", "J19", "Flexi", "Handy", "MR"];
const DRAFT_KEY = "tankpos_poslist_v4";
const DRAFT_META_KEY = "tankpos_poslist_meta_v4";

// Compact column pixel widths — no wrapping, comment truncates with hover
const CW = { vessel:148, dwt:62, built:48, coating:66, open:54, port:86, comment:104, operator:122, del:28 };
const HEADS = ["VESSEL","DWT","BUILT","COATING","OPEN","PORT","COMMENT","OPERATOR",""];
// fr units instead of fixed px — always fills 100% of the row exactly,
// regardless of padding/gap math, instead of needing to hand-tune pixel
// sums every time a wrapper's padding changes.
const GRID = Object.values(CW).map(w=>w+"fr").join(" ");

// UMD script-tag loader — avoids Vite URL import failures
let _htiP = null;
function loadHTI() {
  if (_htiP) return _htiP;
  _htiP = new Promise((res, rej) => {
    if (window.htmlToImage) { res(window.htmlToImage); return; }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/html-to-image/dist/html-to-image.js";
    s.onload = () => res(window.htmlToImage);
    s.onerror = () => { _htiP = null; rej(new Error("CDN unavailable — try Download PNG after reconnecting.")); };
    document.head.appendChild(s);
  });
  return _htiP;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDwt(n) {
  if (n == null || n === "") return "";
  return Number(n).toLocaleString("en-US").replace(/,/g, "\u2009");
}
function fmtCoating(s) { return s ? String(s).toUpperCase() : ""; }

// Segment tags that aren't numbered (e.g. "FLEXI", "J19", "MR") but are still
// genuine segments — these are the exact same values used as group headers
// in the Position List table itself. Used both for AND/OR filter logic and
// for the tag-list grouping display, so the two stay consistent.
const SEGMENT_ALIASES = new Set(["small","cityclass","city","intermediate","inter","j19","flexi","handy","mr","liftert","liftert2","sub10k"]);
function isSegmentTag(t) {
  if (/^\d+\.\s/.test(t)) return true;
  const n = String(t).toLowerCase().replace(/[^a-z0-9]/g, "");
  return SEGMENT_ALIASES.has(n);
}

function fmtUSD(val) {
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) || !n ? "" : "USD " + Math.round(n).toLocaleString("nb-NO");
}
function fmtOpen(d) { if (!d) return ""; try { return fmtDateShort(d); } catch { return d; } }
function parseTags(v) {
  if (!v?.tag) return [];
  const r = Array.isArray(v.tag) ? v.tag : String(v.tag).split(",");
  return r.map(t => String(t).toUpperCase().trim()).filter(Boolean);
}
// Quick-list selection is report-local; it never changes source position tags.
function quickInterUKC(v,config){
  const cfg=config||{dwtMin:15,dwtMax:21,owners:["Stenersen","Furetank","Carl F","Maersk","Harren","Navix","Donso","Relet"],reletsFrom:["Exxon","Shell","Circle K","Essar","Total","CSS SA"]};
  const dwt=parseFloat(v.dwt)||0,op=String(v.operator||"").toLowerCase();
  return !(dwt>0&&(dwt<cfg.dwtMin*1000||dwt>cfg.dwtMax*1000))&&[...(cfg.owners||[]),...(cfg.reletsFrom||[])].some(name=>op.includes(String(name).toLowerCase()));
}
function quickPositionMatches(v,selected,config){
  return selected.some(tag=>tag==="__INTER_UKC__"?quickInterUKC(v,config):parseTags(v).includes(tag));
}
function quickUpdatedMatches(v,filter,now=new Date()){
  if(filter==="all")return true;
  const raw=v.updatedAt||v.updated_at;if(!raw)return false;
  const updated=new Date(raw);if(Number.isNaN(updated.getTime())||updated>now)return false;
  const start=new Date(now);start.setHours(0,0,0,0);
  if(filter==="week")start.setDate(start.getDate()-((start.getDay()+6)%7));
  else if(filter!=="today")start.setDate(start.getDate()-(Number(filter)-1));
  return updated>=start;
}
function reconcileQuickSelections(rows,vessels,selected,config,updatedFilter="all"){
  const matching=new Map(vessels.filter(v=>quickPositionMatches(v,selected,config)&&quickUpdatedMatches(v,updatedFilter)).map(v=>[positionNameKey(v),v]));
  const kept=rows.filter(r=>!r._quickTagImported||matching.has(positionNameKey(r)));
  const existing=new Set(kept.map(positionNameKey));
  matching.forEach((v,key)=>{if(!key||existing.has(key))return;existing.add(key);kept.push({id:newPositionId(),operator:v.operator||"",vessel:v.vessel||"",port:v.openPort||"",date:fmtOpen(v.date),direction:"",updatedAt:v.updatedAt||v.updated_at||"",_quickTagImported:true});});
  return kept.length===rows.length&&kept.every((row,i)=>row===rows[i])?rows:kept;
}
function savedQuickRows(report){
  const rows=report.rate_grid?.__quickEditor?.rows;
  return Array.isArray(rows)?rows:Array.isArray(report.quick_rows)?report.quick_rows:[];
}
function savedQuickTitle(report){return report.rate_grid?.__quickEditor?.title??report.quick_title??"Available tonnage";}
function quickUpdatedValue(row,vessels){
  if(row._quickTagImported){
    const source=vessels.find(v=>positionNameKey(v)===positionNameKey(row));
    return row.updatedAt||row.updated_at||source?.updatedAt||source?.updated_at||"";
  }
  if(row._quickAddedAt||row.updatedAt||row.updated_at)return row._quickAddedAt||row.updatedAt||row.updated_at;
  // Older manual/parsed quick rows encoded their creation time in the ID.
  const legacy=String(row.id||"").match(/^q(\d{13})/);
  return legacy?new Date(Number(legacy[1])).toISOString():"";
}
function quickUpdatedDate(row,vessels){
  const value=quickUpdatedValue(row,vessels);
  if(!value)return "";const date=new Date(value);
  return Number.isNaN(date.getTime())?String(value):date.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
}
function stampQuickRows(rows,now=new Date().toISOString()){
  return rows.map(row=>({...row,id:row.id||newPositionId(),_quickAddedAt:now,updatedAt:now,_quickTagImported:false}));
}
// Common single-line broker format; ordinal dates do not require an AI call.
function parseQuickOpenLine(line){
  const open=String(line).trim().match(/^(.+?)\s+open\s+(.+)$/i);
  if(!open)return null;
  const match=open[2].match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b(?:\s+(\d{4}))?/i);
  if(!match)return null;
  const port=open[2].slice(0,match.index).trim().replace(/[–—,;-]+$/,"").trim();
  const date=Number(match[1])+" "+match[2].slice(0,3).toUpperCase()+(match[3]?" "+match[3]:"");
  if(!port||reportDay(date)===null)return null;
  const direction=open[2].slice(match.index+match[0].length).trim().replace(/^[–—,;:-]+\s*/,"");
  return {vessel:open[1].replace(/^[*_]+|[*_]+$/g,"").trim().toUpperCase(),port:port.toUpperCase(),date,direction};
}
// Quick-list presentation only: source position text stays untouched.
const QUICK_ABBREVIATIONS = new Set(["ARA","WCUK","ECUK","UK","UKC","NWE","NWC","MED","US","USA","USG","USAC","USEC","USWC","EU","UAE","UCOME","IMO","DWT","CBM","PPT","TBC","TBN","ETA","ETD","AG","PG","WAF","EAF","SAF","WCNA","WCSA"]);
const quickOperatorKey = value => String(value || "Unknown").trim().toUpperCase();
function quickDisplayText(value) {
  return String(value || "").toLowerCase().replace(/[\p{L}\p{N}]+/gu, word => QUICK_ABBREVIATIONS.has(word.toUpperCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1));
}
function quickDisplayDate(value) {
  const raw=String(value||"").trim();
  const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if(iso){const month=Number(iso[2])-1;return month>=0&&month<12?Number(iso[3])+" "+quickDisplayText(MN_SORT[month]):raw;}
  return quickDisplayText(raw).replace(/\b0(\d)\b/g,"$1").replace(/\bNo\b/g,"Nov");
}
function quickRowLine(row,byDate=false){
  const vessel=quickDisplayText(row.vessel),port=quickDisplayText(row.port),date=quickDisplayDate(row.date);
  const comment=quickDisplayText(String(row.comment??row.direction??"").trim());
  return (byDate?[date,comment,vessel,port]:[vessel,port,date,comment]).filter(Boolean).join(" – ");
}
const MN_SORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const POSITION_COLUMNS=[
  ["vessel","VESSEL",148],["dwt","DWT",62],["cbm","CBM",64],["built","BUILT",48],["coating","COATING",70],
  ["date","OPEN",60],["openPort","PORT",86],["comment","COMMENT",104],["operator","OPERATOR",122],
  ["loa","LOA",58],["beam","BEAM",58],["flag","FLAG",70],["iceClass","ICE CLASS",64],["tag","TAGS",90],
  ["segment","SEGMENT",70],["superRegion","S.REGION",80],["updatedAt","UPDATED",75]
].map(([key,label,width])=>({key,label,width}));
const DEFAULT_POSITION_COLUMNS=["vessel","dwt","built","coating","date","openPort","comment","operator"];
const positionNameKey=v=>String(v.vessel||"").trim().toUpperCase().replace(/\s+/g," ");
const newPositionId=()=>"pos-"+(globalThis.crypto?.randomUUID?.()||Date.now()+"-"+Math.random().toString(36).slice(2));
function normalizePositionRows(rows){
  const names=new Set(),ids=new Set();
  return (Array.isArray(rows)?rows:[]).filter(v=>v&&typeof v==="object").flatMap(v=>{
    const name=positionNameKey(v);if(name&&names.has(name))return [];if(name)names.add(name);
    const id=v._rid&&!ids.has(v._rid)?v._rid:newPositionId();ids.add(id);return [{...v,_rid:id}];
  });
}
function reportDay(value,reference=new Date()){
  const ref=new Date(reference),year=ref.getFullYear();
  const today=Date.UTC(year,ref.getMonth(),ref.getDate())/86400000;
  const text=String(value??"").trim();if(!text)return null;
  if(/^(PPT|PROMPT|TODAY)$/i.test(text))return today;
  if(/^TOMORROW$/i.test(text))return today+1;
  let y=year,m,d,explicit=false,match=text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(match){[,y,m,d]=match.map(Number);m--;explicit=true;}
  else{
    match=text.match(/(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s*([A-Za-z]{3,})(?:\s+(\d{4}))?/);
    if(match){d=+match[1];m=MN_SORT.indexOf(match[2].slice(0,3).toUpperCase());if(match[3]){y=+match[3];explicit=true;}}
    else{match=text.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}))?/);if(!match)return null;d=+match[1];m=+match[2]-1;if(match[3]){y=+match[3];explicit=true;}}
  }
  if(m<0||m>11||d<1||d>31)return null;
  let day=Date.UTC(y,m,d)/86400000;
  const check=new Date(day*86400000);if(check.getUTCMonth()!==m||check.getUTCDate()!==d)return null;
  if(!explicit&&day-today>183)day=Date.UTC(y-1,m,d)/86400000;
  else if(!explicit&&today-day>183)day=Date.UTC(y+1,m,d)/86400000;
  return day;
}
function positionValue(v,key){return v[key]??v.spec?.[key]??(key==="updatedAt"?v.updated_at:"")??"";}
function positionCell(v,key){const raw=positionValue(v,key);if(key==="dwt"||key==="cbm")return fmtDwt(raw);if(key==="date"||key==="updatedAt")return fmtOpen(raw);if(key==="coating")return fmtCoating(raw);return Array.isArray(raw)?raw.join(", "):String(raw??"");}
function canonicalSegment(value){
  const n=String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  if(/sub10|small/.test(n))return "sub10";if(/city/.test(n))return "city";if(/inter/.test(n))return "inter";
  if(/j19/.test(n))return "j19";if(/flexi/.test(n))return "flexi";if(/handy/.test(n))return "handy";if(n==="mr"||/\dmr$/.test(n))return "mr";return n;
}
const canonicalRegion=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"");
function positionDraftValue(key,fallback){try{return JSON.parse(localStorage.getItem(DRAFT_META_KEY)||"{}")[key]??fallback;}catch{return fallback;}}
function defaultPositionChartSettings(){const today=new Date();const past=new Date(today);past.setDate(past.getDate()-84);return {anchor:today.toLocaleDateString("en-CA"),ahead:30,bars:5,bucketDays:7,historyFrom:past.toLocaleDateString("en-CA"),historyTo:today.toLocaleDateString("en-CA"),historyBars:12,maxWindow:60,segments:[],regions:[]};}
function positionOpenBuckets(rows,settings){
  const anchor=reportDay(settings.anchor),ahead=Math.max(2,Number(settings.ahead)||30),bars=Math.max(2,Math.min(20,Number(settings.bars)||5));
  const result=[{label:"PPT",count:0}];
  const interval=Math.max(1,+settings.bucketDays||7);
  for(let i=0,start=2;i<bars-1&&start<=ahead;i++){
    const end=i===bars-2?ahead:Math.min(ahead,Math.max(start,(i+1)*interval));
    result.push({label:`${start}–${end}d`,count:0,start,end});start=end+1;
  }
  rows.forEach(v=>{const day=reportDay(v.date,new Date(settings.anchor+"T12:00:00"));if(day===null)return;const delta=day-anchor;if(delta<0||delta>ahead)return;if(delta<=1)result[0].count++;else{const bin=result.find(b=>delta>=b.start&&delta<=b.end);if(bin)bin.count++;}});
  return result;
}
function buildPositionFixingHistory(rows,settings,segments,regions){
  const from=reportDay(settings.historyFrom),to=reportDay(settings.historyTo),count=Math.max(1,Math.min(30,+settings.historyBars||12));
  const span=Math.max(1,Math.ceil((to-from+1)/count));
  const bins=Array.from({length:Math.ceil((to-from+1)/span)},(_,i)=>({start:from+i*span,ships:0,sum:0,cnt:0}));
  rows.forEach(row=>{
    if(!segments.includes(canonicalSegment(row.segment)))return;
    if(regions.length&&!regions.includes(canonicalRegion(row.super_region)))return;
    const updated=reportDay(row.updated_at),open=reportDay(row.open_date,new Date(row.updated_at));if(updated===null||open===null||updated<from||updated>to)return;
    const days=open-updated;if(days<0||days>Math.max(1,+settings.maxWindow||60))return;
    const bin=bins[Math.floor((updated-from)/span)];if(!bin)return;bin.ships++;bin.cnt++;bin.sum+=days;
  });
  if(!bins.some(b=>b.ships))return [];
  return bins.map(b=>({label:new Date(b.start*86400000).toLocaleDateString("en-GB",{day:"2-digit",month:"short",timeZone:"UTC"}),ships:b.ships,avgWindow:b.cnt?Math.round(b.sum/b.cnt):0}));
}

function dateSortKey(str){return reportDay(str)??Number.MAX_SAFE_INTEGER;}

function groupVessels(list, by, sortByDate, regionMode, matchCustomRegion, outputSort) {
  const fn = by === "region"
    ? (regionMode === "region"
        ? v => (matchCustomRegion && matchCustomRegion(v.openPort)) || classifyRegion(v.openPort) || "Other"
        : v => v.superRegion || (matchCustomRegion && matchCustomRegion(v.openPort)) || classifyRegion(v.openPort) || "Other")
    : v => v.segment || "Other";
  const out = {};
  list.forEach(v => { const k = v._reportGroups?.[by === "segment" ? "segment" : regionMode] ?? fn(v); if (!out[k]) out[k] = []; out[k].push(v); });
  if (outputSort?.key) {
    const field = POSITION_COLUMNS.find(c=>c.label===outputSort.key)?.key;
    Object.keys(out).forEach(k => out[k].sort((a,b) => {
      const av = field === "date" ? dateSortKey(a.date) : (["dwt","built","cbm","loa","beam"].includes(field)) ? Number(positionValue(a,field)) || 0 : String(positionValue(a,field) || "").toLowerCase();
      const bv = field === "date" ? dateSortKey(b.date) : (["dwt","built","cbm","loa","beam"].includes(field)) ? Number(positionValue(b,field)) || 0 : String(positionValue(b,field) || "").toLowerCase();
      return (typeof av === "number" ? av - bv : av.localeCompare(bv)) * (outputSort.desc ? -1 : 1);
    }));
  } else if (sortByDate) {
    Object.keys(out).forEach(k => out[k].sort((a, b) => dateSortKey(a.date) - dateSortKey(b.date)));
  }
  if (by === "segment") {
    const s = {};
    SEG_ORDER.forEach(k => { if (out[k]) s[k] = out[k]; });
    Object.keys(out).forEach(k => { if (!s[k]) s[k] = out[k]; });
    return s;
  }
  return out;
}

// Measure the actual plot area so report charts fill their panels without stretching text.
function useReportPlotSize(defaultWidth,defaultHeight){
  const ref=useRef(null);
  const [size,setSize]=useState({width:defaultWidth,height:defaultHeight});
  useEffect(()=>{
    const node=ref.current;
    if(!node)return;
    const update=()=>{
      const {width,height}=node.getBoundingClientRect();
      if(width>0&&height>0)setSize(previous=>Math.abs(previous.width-width)<1&&Math.abs(previous.height-height)<1?previous:{width,height});
    };
    update();
    const observer=new ResizeObserver(update);
    observer.observe(node);
    return()=>observer.disconnect();
  });
  return [ref,size];
}

// ─── Generic bar+line SVG chart ───────────────────────────────────────────────
function BarLineChart({ data, barKey, lineKey, barLabel, lineLabel, title, accent = "#3a82f6", loading = false, fillHeight = false, separateTitle = false }) {
  const [plotRef,plotSize]=useReportPlotSize(440,170);
  if (!data?.length) return (
    <div style={{ padding: 20, textAlign: "center", color: "rgba(219,230,245,0.3)", fontSize: 11 }}>
      {title} · {loading ? "loading..." : "no data in this window"}
    </div>
  );
  const W = fillHeight?plotSize.width:440, H = fillHeight?plotSize.height:170;
  const P = { t: separateTitle?44:26, r: 44, b: 28, l: 26 };
  const legendY=separateTitle?18:0;
  const w = W - P.l - P.r, h = H - P.t - P.b;
  const maxB = Math.max(...data.map(d => d[barKey] || 0), 1);
  const maxL = lineKey ? Math.max(...data.map(d => d[lineKey] || 0), 1) : 1;
  const bw = (w / data.length) * 0.58;
  const xc = i => P.l + (i + 0.5) * (w / data.length);
  const yB = v => P.t + h - (v / maxB) * h;
  const yL = v => P.t + h - (v / maxL) * h;
  const hasLine = lineKey && data.some(d => d[lineKey] > 0);
  const pts = hasLine ? data.map((d, i) => `${xc(i)},${yL(d[lineKey] || 0)}`).join(" ") : "";
  return (
    <div ref={plotRef} style={{width:"100%",height:fillHeight?undefined:170,flex:fillHeight?1:undefined,minHeight:0}}><svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
      <text x={P.l} y={14} fill="#dbe6f5" fontSize="11" fontWeight="700">{title}</text>
      <rect x={P.l} y={5+legendY} width={9} height={9} fill={accent} opacity="0.55" rx="1" />
      <text x={P.l + 12} y={13+legendY} fill="rgba(219,230,245,0.65)" fontSize="9">{barLabel}</text>
      {hasLine && <>
        <line x1={P.l + 58} y1={10+legendY} x2={P.l + 72} y2={10+legendY} stroke="#9fd0ff" strokeWidth="2" />
        <text x={P.l + 75} y={13+legendY} fill="rgba(219,230,245,0.65)" fontSize="9">{lineLabel}</text>
      </>}
      {data.map((d, i) => (
        <g key={i}>
          <rect x={xc(i) - bw / 2} y={yB(d[barKey] || 0)} width={bw}
            height={h - (yB(d[barKey] || 0) - P.t)} fill={accent} opacity="0.58" rx="2" />
          {data.length <= 10 && d[barKey] > 0 && (
            <text x={xc(i)} y={yB(d[barKey] || 0) - 4} fill="#dbe6f5" fontSize="10" textAnchor="middle">{d[barKey]}</text>
          )}
          {(i % Math.max(1,Math.ceil(data.length / 5)) === 0 || i === data.length - 1) && <text x={xc(i)} y={H - 7} fill="rgba(219,230,245,0.5)" fontSize="9" textAnchor="middle">
            {String(d.label || "").slice(0, 7)}
          </text>}
        </g>
      ))}
      {hasLine && <>
        <polyline points={pts} fill="none" stroke="#9fd0ff" strokeWidth="2" strokeLinejoin="round" />
        {data.map((d, i) => (
          <circle key={i} cx={xc(i)} cy={yL(d[lineKey] || 0)} r="2.5" fill="#9fd0ff" />
        ))}
        {/* Right axis max label */}
        <text x={W - P.r + 3} y={P.t} fill="rgba(219,230,245,0.35)" fontSize="8" textAnchor="start">{maxL}d</text>
        <text x={W - P.r + 3} y={P.t + h} fill="rgba(219,230,245,0.35)" fontSize="8" textAnchor="start">0d</text>
      </>}
    </svg></div>
  );
}

// ─── Small TCE trend chart: Last month vs Spot, with a dashed YTD reference line ──
function TCETrendMini({ lastMonth, current, ytd }) {
  const [plotRef,plotSize]=useReportPlotSize(440,160);
  const lm = parseFloat(lastMonth) || null;
  const cur = parseFloat(current) || null;
  const y = parseFloat(ytd) || null;
  if (lm == null && cur == null) return (
    <div style={{ padding: 20, textAlign: "center", color: "rgba(219,230,245,0.3)", fontSize: 11 }}>Enter TCE figures below to see the trend</div>
  );
  const W = plotSize.width, H = plotSize.height, P = { t: 28, r: 22, b: 25, l: 28 };
  const w = W - P.l - P.r, h = H - P.t - P.b;
  const vals = [lm, cur, y].filter(v => v != null);
  const maxV = Math.max(...vals, 1) * 1.15, minV = Math.min(...vals, 0) * 0.9;
  const yFor = v => P.t + h - ((v - minV) / (maxV - minV || 1)) * h;
  const bw = w * 0.29;
  const x1 = P.l + w * 0.28, x2 = P.l + w * 0.72;
  return (
    <div ref={plotRef} style={{width:"100%",flex:1,minHeight:0}}><svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{display:"block"}}>
      {y != null && <>
        <line x1={P.l} y1={yFor(y)} x2={W - P.r} y2={yFor(y)} stroke="#f0f6ff" strokeWidth="1.8" strokeDasharray="5,4" />
        <text x={W - P.r} y={13} fill="rgba(219,230,245,0.5)" fontSize="9" textAnchor="end">YTD AVG ${y.toLocaleString("nb-NO")}/d</text>
      </>}
      {lm != null && <>
        <rect x={x1 - bw / 2} y={yFor(lm)} width={bw} height={h - (yFor(lm) - P.t)} fill="rgba(219,230,245,0.35)" rx="2" />
        <text x={x1} y={Math.max(28,yFor(lm) - 7)} fill="#dbe6f5" fontSize="10" textAnchor="middle">${lm.toLocaleString("nb-NO")}/d</text>
        <text x={x1} y={H - 8} fill="#f0f6ff" fontSize="9" textAnchor="middle">Last month</text>
      </>}
      {cur != null && <>
        <rect x={x2 - bw / 2} y={yFor(cur)} width={bw} height={h - (yFor(cur) - P.t)} fill="#3a82f6" rx="2" />
        <text x={x2} y={Math.max(28,yFor(cur) - 7)} fill="#dbe6f5" fontSize="10" textAnchor="middle">${cur.toLocaleString("nb-NO")}/d</text>
        <text x={x2} y={H - 8} fill="#f0f6ff" fontSize="9" textAnchor="middle">Spot</text>
      </>}
    </svg></div>
  );
}

// Calendar month labels for the three forward FFA periods (BALMO, +1, +2).
function reportFfaMonths(dateValue){
  const parsed = dateValue ? new Date(`${dateValue}T12:00:00`) : new Date();
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return [0,1,2].map(offset=>{
    const d = new Date(base.getFullYear(),base.getMonth()+offset,1);
    return d.toLocaleDateString("en-GB",{month:"short"});
  });
}

// ─── Tiny inline sparkline for Handy FFA Aug/Sep/Oct trend ──
function FfaSparkline({ aug, sep, oct }) {
  const vals = [aug, sep, oct].map(v => parseFloat(v)).filter(v => !isNaN(v));
  if (vals.length < 2) return <span style={{ fontSize: 10, color: C.faint }}>—</span>;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = [aug, sep, oct].map((v, i) => {
    const n = parseFloat(v);
    const x = 4 + i * 31;
    const y = isNaN(n) ? 11 : 18 - ((n - min) / range) * 14;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width="70" height="22" viewBox="0 0 70 22">
      <polyline points={pts} fill="none" stroke="#79c0ff" strokeWidth="1.6" />
      <circle cx="66" cy={pts.split(" ")[2]?.split(",")[1] || 11} r="2" fill="#79c0ff" />
    </svg>
  );
}

// ─── Single interactive+capturable vessel row ─────────────────────────────────
function VesselRow({v,localIdx,editing,onEdit,onSave,onDelete,onDragStart,onDragEnter,onDragEnd,onDrop,isDragOver,columns}){
  const [vals,setVals]=useState({...v});
  useEffect(()=>{if(editing)setVals({...v});},[editing,v]);
  const grid=columns.map(c=>c.width+"fr").join(" ")+" 28fr";
  const style={display:"grid",gridTemplateColumns:grid,width:"100%",boxSizing:"border-box",background:isDragOver?"#193657":localIdx%2===0?"#111f35":"#0c1729",color:"#dbe6f5",fontSize:11,padding:"5px 8px",borderTop:"1px solid rgba(58,130,246,.16)",alignItems:"center",gap:2};
  return <div draggable={!editing} onDragStart={onDragStart} onDragEnter={onDragEnter} onDragEnd={onDragEnd} onDragOver={e=>e.preventDefault()} onDrop={onDrop} onClick={editing?undefined:onEdit} title="Click to edit · drag to reorder or move to another report group" style={style}>
    {columns.map(c=>editing?<input key={c.key} aria-label={c.label} value={positionValue(vals,c.key)} onChange={e=>setVals(p=>({...p,[c.key]:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")onSave(vals);}} style={{width:"100%",minWidth:0,background:"transparent",border:0,borderBottom:"1px solid #3a82f6",color:"#dbe6f5",fontSize:11,fontFamily:"inherit",outline:"none"}}/>:<div key={c.key} title={positionCell(v,c.key)} style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,fontWeight:c.key==="vessel"?700:400,color:c.key==="vessel"?"#58a6ff":c.key==="comment"?"rgba(219,230,245,.6)":"#dbe6f5"}}>{positionCell(v,c.key)}</div>)}
    <button className="no-export" onClick={e=>{e.stopPropagation();editing?onSave(vals):onDelete();}} style={{background:"none",border:0,color:editing?"#43e97b":"#fb7185",cursor:"pointer",padding:0}}>{editing?"✓":"✕"}</button>
  </div>;
}

function fixingWindowReportTitle(snapshot){
  const segments=Array.isArray(snapshot?.segments)?snapshot.segments:[];
  const names={"Inter":"Intermediate","Sub 10":"Sub 10","City":"City","J19":"J19","Flexi":"Flexi","Handy":"Handy","MR":"MR"};
  const segmentLabel=segments.length?segments.map(s=>names[s]||s).join(" / "):"All Segments";
  const periods={"7D":"7 Day","14D":"14 Day","1M":"1 Month","3M":"3 Month","6M":"6 Month","1Y":"1 Year","ALL":"All-Time"};
  const periodLabel=periods[snapshot?.period]||snapshot?.period||"All-Time";
  const region=snapshot?.region;
  return `Fixing Window${region&&region!=="All"&&region!=="ALL"&&region!=="All Regions"?` · ${region}`:""} ${periodLabel} Average`;
}

function ImportedFixingWindowChart({snapshot}){
  const [plotRef,plotSize]=useReportPlotSize(440,160);
  const rows=Array.isArray(snapshot?.rows)?snapshot.rows:[];
  const segments=Array.isArray(snapshot?.segments)&&snapshot.segments.length?snapshot.segments:["Inter"];
  const colors={"Sub 10":"#8b949e",City:"#58a6ff",Inter:"#22d3ee",J19:"#a78bfa",Flexi:"#fd79a8",Handy:"#3fb950",MR:"#f5a623"};
  const W=plotSize.width,H=plotSize.height,L=39,R=44,T=14,B=26,iw=W-L-R,ih=H-T-B;
  const valueAt=(row,seg)=>{const raw=row?.[seg];if(raw==null||raw==="")return null;const n=Number(raw);return Number.isFinite(n)&&n>=0?n:null;};
  const valid=segments.flatMap(seg=>rows.map(r=>valueAt(r,seg))).filter(v=>v!==null);
  if(!valid.length)return <div style={{fontSize:11,color:"#9fb4cd",padding:20}}>Imported fixing-window data has no values.</div>;
  const maximum=Math.max(...valid),max=Math.max(4,Math.ceil((maximum+1)/2)*2);
  const x=i=>L+i*iw/Math.max(1,rows.length-1),y=v=>T+ih-v/max*ih;
  const smooth=(pts)=>{
    if(!pts.length)return "";
    let d=`M ${pts[0][0]} ${pts[0][1]}`;
    for(let i=0;i<pts.length-1;i++){
      const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2;
      const dx=(p2[0]-p1[0]);
      const c1x=p1[0]+dx/3,c2x=p2[0]-dx/3;
      const c1y=p1[1]+(p2[1]-p0[1])/6,c2y=p2[1]-(p3[1]-p1[1])/6;
      d+=` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
    }
    return d;
  };
  const fmtDate=v=>{const str=String(v||"");const dt=new Date(str);return !Number.isNaN(dt.getTime())?dt.toLocaleDateString("en-GB",{day:"numeric",month:"short"}):str.slice(0,11);};
  const tickIndices=[0,Math.floor((rows.length-1)/4),Math.floor((rows.length-1)/2),Math.floor((rows.length-1)*3/4),rows.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  return <div style={{width:"100%",minWidth:0,flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
    <div style={{fontSize:11,color:"#dbe6f5",marginBottom:5,fontWeight:700,textAlign:"center"}}>{fixingWindowReportTitle(snapshot)}</div>
    <div ref={plotRef} style={{width:"100%",flex:1,minHeight:0}}><svg viewBox={`0 0 ${W} ${H}`} style={{display:"block",width:"100%",height:"100%",overflow:"visible"}} role="img" aria-label="Imported fixing window historical average">
      {Array.from({length:6},(_,i)=>i/5).map(t=><g key={t}><line x1={L} y1={T+t*ih} x2={W-R} y2={T+t*ih} stroke="rgba(130,160,200,.18)"/><text x={L-9} y={T+t*ih+3.5} textAnchor="end" fontSize="10" fontWeight="600" fill="#a7bdd9">{Math.round(max*(1-t)).toLocaleString("en-GB")}</text></g>)}
      {segments.map(seg=>{
        const groups=[rows.map((r,i)=>{const v=valueAt(r,seg);return v===null?null:[x(i),y(v)];}).filter(Boolean)];
        const lastIndex=rows.findLastIndex(r=>valueAt(r,seg)!==null);
        const last=lastIndex>=0?valueAt(rows[lastIndex],seg):null;
        return <g key={seg}>
          {groups.map((pts,i)=>pts.length>1?<path key={i} d={smooth(pts)} fill="none" stroke={colors[seg]||"#58a6ff"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>:null)}
          {last!==null&&<g><circle cx={x(lastIndex)} cy={y(last)} r="2.7" fill={colors[seg]||"#58a6ff"}/><text x={Math.min(W-6,x(lastIndex)+7)} y={Math.max(12,y(last)-7)} textAnchor={lastIndex===rows.length-1?"end":"start"} fontSize="10" fontWeight="750" fill={colors[seg]||"#58a6ff"}>{Math.round(last)}d</text></g>}
        </g>;
      })}
      {tickIndices.map(i=><text key={i} x={x(i)} y={H-9} textAnchor={i===0?"start":i===rows.length-1?"end":"middle"} fontSize={Math.min(10,W/36)} fontWeight="600" fill="#a7bdd9">{fmtDate(rows[i]?.date||rows[i]?.label)}</text>)}
    </svg></div>
    <div style={{display:"flex",flexWrap:"wrap",gap:12,justifyContent:"center",marginTop:0}}>{segments.map(seg=><span key={seg} style={{fontSize:10,color:colors[seg]||"#58a6ff",fontWeight:700}}>● {seg==="Inter"?"Intermediate":seg}</span>)}</div>
  </div>;
}

// Update shared route values by identity, keeping this report's own row order.
function mergeReportBenchmarkRows(rows,savedRows,appendNew=false){
  const savedByKey=new Map(savedRows.map(row=>[row.route_key,row]));
  const updated=rows.map(row=>{
    const saved=savedByKey.get(row.key);
    return saved?{...row,label:saved.label??row.label,freight:String(saved.freight??""),tce:saved.tce??null,override:false}:row;
  });
  if(!appendNew)return updated;
  const existingKeys=new Set(rows.map(row=>row.key));
  return [...updated,...savedRows.filter(row=>!existingKeys.has(row.route_key)).map(row=>({
    key:row.route_key,label:row.label||row.route_key,from:"",to:"",dist:row.nm_laden??null,
    freight:String(row.freight??""),lastWeek:"",tce:row.tce??null,tceLastWeek:null,override:false,
  }))];
}

function savedMarketReportName(report){
  if(report.report_type==="Position List")return report.rate_grid?.__positionEditor?.name||report.pos_title||"Position List";
  if(report.report_type==="Quick Positions")return report.rate_grid?.__quickEditor?.name||report.quick_title||"Quick Positions";
  return report.rate_grid?.__marketEditor?.reportName || report.report_type || "Report";
}
function marketReportSaveName(name,type,saveCopy,savedReports){
  const base=name.trim()||type;
  if(!saveCopy)return base;
  const existing=new Set(savedReports.map(savedMarketReportName));
  if(!existing.has(base))return base;
  let copy=base+" (copy)",number=2;
  while(existing.has(copy))copy=base+` (copy ${number++})`;
  return copy;
}

function reportHeaderDate(value){const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?String(value||""):d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});}
const REPORT_FIXTURE_TEXT_FIELDS=["charterer","cargo","vessel","load","disch"];
function reportNaturalCase(value){
  const text=String(value??"").trim();
  const acronyms=new Set(["ARA","WRG","ULSD","UMS","CPP","HVO","FAME","UCO","MR","NWE","UKC","USG","BP","CSS","SA","ST","SPK","LVN","HVN","LSR","HSFO","VLSFO","LSFO","MGO","IFO","LNG","LPG","MTBE","ETBE","BTX","EDC","MEG","SAF","TX","TBA","TBC"]);
  return text.replace(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu,word=>{
    if(acronyms.has(word.toUpperCase()))return word.toUpperCase();
    // Preserve deliberate mixed-case names such as SeaRiver and McKinney.
    if(word!==word.toUpperCase()&&word!==word.toLowerCase())return word;
    return word.charAt(0).toUpperCase()+word.slice(1).toLowerCase();
  });
}
function normalizeReportFixture(fixture){
  const next={...fixture};
  for(const field of REPORT_FIXTURE_TEXT_FIELDS){
    if(!fixture._textOverrides?.[field])next[field]=reportNaturalCase(fixture[field]);
  }
  return next;
}
function reportFixtureFreight(value){
  const raw=String(value??"").trim();
  if(!raw)return "";
  const stripped=raw.replace(/^(?:USD|US\$|\$)\s*/i,"").trim();
  const perTon=/\b(?:PMT|P\/?MT|PER\s*(?:METRIC\s*)?TON(?:NE)?)\b/i.test(stripped);
  const lumpSum=/\b(?:LS|L\/?S|LUMP\s*SUM)\b/i.test(stripped);
  const compact=stripped.replace(/\b(?:PMT|P\/?MT|PER\s*(?:METRIC\s*)?TON(?:NE)?|LS|L\/?S|LUMP\s*SUM)\b/gi,"").replace(/\s/g,"").trim();
  const match=compact.match(/^([\d.,]+)([kKmM]?)$/);
  if(!match)return raw;
  const [,digits,suffix]=match;
  // Commas are decimal separators when followed by 1–2 digits; otherwise grouping.
  const decimalComma=/,\d{1,2}$/.test(digits)&&!digits.includes(".");
  const numeric=decimalComma?digits.replace(",","."):digits.replace(/,/g,"");
  const n=Number(numeric);
  if(!Number.isFinite(n)||n<=0)return raw;
  const multiplier=suffix.toLowerCase()==="m"?1000000:suffix.toLowerCase()==="k"?1000:1;
  const amount=n*multiplier;
  const format=x=>Number(x.toFixed(2)).toLocaleString("de-DE",{maximumFractionDigits:2,useGrouping:false});
  if(perTon || (!suffix&&!lumpSum&&amount<1000))return `USD ${format(amount)} PMT`;
  return `USD ${format(amount/1000)}K LS`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function ReportsTab({ selectedVessels = [], allVessels = [], selectedCargoes = [], dashboardFixingImport = null, onDashboardFixingImportHandled }) {
  const [section, setSection] = useState("poslist");

  // Position list
  const [reportVessels, updateReportVessels] = useState(() => {
    try { const s = localStorage.getItem(DRAFT_KEY); return normalizePositionRows(s ? JSON.parse(s) : []); } catch { return []; }
  });
  const setReportVessels=update=>updateReportVessels(prev=>normalizePositionRows(typeof update==="function"?update(prev):update));
  const [positionSettingsOpen,setPositionSettingsOpen]=useState(false);
  const [positionColumns,setPositionColumns]=useState(()=>positionDraftValue("positionColumns",DEFAULT_POSITION_COLUMNS));
  const [positionChartSettings,setPositionChartSettings]=useState(()=>({...defaultPositionChartSettings(),...positionDraftValue("positionChartSettings",{})}));
  const [positionChartDraft,setPositionChartDraft]=useState(()=>({...defaultPositionChartSettings(),...positionDraftValue("positionChartSettings",{})}));
  const [positionSettingsError,setPositionSettingsError]=useState("");
  const [positionReportName,setPositionReportName]=useState(()=>positionDraftValue("positionReportName",""));
  const [activePositionId,setActivePositionId]=useState(null);
  const [positionSaveCopy,setPositionSaveCopy]=useState(false);
  const [pendingClear,setPendingClear]=useState(null);
  const [listSaveBusy,setListSaveBusy]=useState(false);
  const positionColumnsChosen=POSITION_COLUMNS.filter(c=>positionColumns.includes(c.key));
  const positionGrid=positionColumnsChosen.map(c=>c.width+"fr").join(" ")+" 28fr";
  const [posTitle, setPosTitle] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_META_KEY))?.title || "CHEMS & SPECIALIZED POSITION LIST"; } catch { return "CHEMS & SPECIALIZED POSITION LIST"; }
  });
  const [posSubtitle, setPosSubtitle] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_META_KEY))?.subtitle || "10-22,000 DWT · COATED AND STST"; } catch { return "10-22,000 DWT · COATED AND STST"; }
  });
  const [posGroupBy, setPosGroupBy] = useState(()=>positionDraftValue("posGroupBy","segment"));
  const [outputSort, setOutputSort] = useState(()=>positionDraftValue("outputSort",{key:null,desc:false}));
  const [positionCharts, setPositionCharts] = useState(()=>positionDraftValue("positionCharts",{open:true,fixing:true}));
  const [positionPreviewWidth, setPositionPreviewWidth] = useState(()=>positionDraftValue("positionPreviewWidth",820));
  const [segmentNames, setSegmentNames] = useState(()=>positionDraftValue("segmentNames",{}));
  const [regionMode, setRegionMode] = useState(()=>positionDraftValue("regionMode","superRegion")); // "superRegion" | "region"

  // Custom Region Filter Groups from Settings (localStorage — same key,
  // no import coupling needed). Falls back to the original hardcoded list
  // if nothing's been configured yet.
  const [customRegionGroups] = useState(() => {
    try {
      const raw = localStorage.getItem("signal_region_filter_groups");
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return [
    {id:"wcuk", label:"WCUK", aliases:["Belfast","Cork","Dublin","Milford Haven","Liverpool","Clyde","Mersey","Glasgow","Avonmouth","Bristol","Swansea","Barrow","Stanlow","Clydebank","Fawley","Plymouth"]},
    {id:"ecuk", label:"ECUK", aliases:["Thames","Humber","Immingham","Teesport","Tees","Teesside","Tyne","Sunderland","Middlesbrough","Grangemouth","Forth","Leith","Dundee","Medway","Wilton","Braefoot Bay","BB","Bbay"]},
    {id:"canal", label:"Canal", aliases:["Rotterdam","ARA","Amsterdam","Antwerp","Ghent","Flushing","Le Havre","Dunkirk","Rouen","Hamburg","Brunsbuttel","Wilhelmshaven","Bremerhaven","Bremen","Zeebrugge","Brest","Calais","Dieppe"]},
    {id:"biscay", label:"Biscay", aliases:["Bordeaux","BDX","Nantes","La Pallice","Bayonne","Bilbao","Santander","Le Verdon","Donges","Montoir","Gijon","Ferrol","Brest"]},
    {id:"skaw", label:"Skaw", aliases:["Gothenburg","Goteborg","Oslo","Stavanger","Mongstad","Sture","Kalundborg","Fredericia","Copenhagen","Malmo","Helsingborg","Flensburg","Kiel","Aarhus","Esbjerg","Aalborg","Sarroch"]},
    {id:"baltic", label:"Baltic", aliases:["Gdansk","Gdynia","Klaipeda","Ventspils","Riga","Tallinn","Helsinki","Naantali","Porvoo","Kotka","Stockholm","Nynashamn","Karlshamn","Lulea","Oulu","Baltiysk","Stettin","Szczecin"]},
    {id:"med", label:"Med", aliases:["Gibraltar","Algeciras","Ceuta","Barcelona","Tarragona","Valencia","Cartagena","Alicante","Almeria","Malaga","Huelva","Cadiz","Sines","Leixoes","Setubal","Lisbon","Marseille","FOS","Lavera","Port Jerome","Genoa","Savona","Livorno","La Spezia","Trieste","Venice","Ravenna","Porto Marghera","Naples","Napoli","Augusta","Milazzo","Messina","Sicily","Palermo","Catania","Cagliari","Porto Torres","Civitavecchia","Brindisi","Taranto","Bari","Ancona","Split","Rijeka","Piraeus","Athens","Thessaloniki","Kavala","Alexandroupolis","Constanta","Odessa","Novorossiysk","Tuapse","Batumi","Trabzon","Samsun","Izmit","Aliaga","Izmir","Canakkale","Istanbul","Marmara","Bandirma","Mudanya","Derince","Gebze","N Spain","Spain Med","Adriatic","Wmed","W Med","Span MED","E Med","E.Med","Levant","Malta","Tunis","Tunisia","La Goulette","Bizerte","Sfax","Porto Empedocle"]},
    ];
  });
  // Same safe-substring-match rule as classifyRegion's fix — short aliases
  // only match exactly, longer ones can match as a substring either way.
  function matchCustomRegion(openPort) {
    if (!openPort) return null;
    const n = String(openPort).toLowerCase().trim();
    if (!n) return null;
    for (const g of customRegionGroups) {
      for (const a of g.aliases) {
        const p = String(a).toLowerCase().trim();
        if (!p) continue;
        if (n === p) return g.label;
        if (p.length >= 4 && n.length >= 4 && (n.includes(p) || p.includes(n))) return g.label;
      }
    }
    return null;
  }
  const [sortByDate, setSortByDate] = useState(()=>positionDraftValue("sortByDate",false));
  const [posDate, setPosDate] = useState(new Date().toISOString().split("T")[0]);
  const [exportStatus, setExportStatus] = useState("");
  const [editingRid, setEditingRid] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const dragFrom = useRef(null);
  const dragTo = useRef(null);
  const previewRef = useRef(null);
  const marketPreviewRef = useRef(null);

  // Pool filters
  const [tagFilter, setTagFilter] = useState(new Set());
  const [regionFilter, setRegionFilter] = useState(new Set());       // WCUK/ECUK/Canal/Biscay/Skaw/Baltic/Med — derived from openPort
  const [superRegionFilter, setSuperRegionFilter] = useState(new Set()); // Africa/Atlantic/Med/NWE/etc — v.superRegion
  const [segmentFilter, setSegmentFilter] = useState(new Set());     // Sub 10k/City/Inter/J19/Flexi/Handy/MR — v.segment
  const [dwtFilter, setDwtFilter] = useState(new Set());
  const [dwtRange, setDwtRange] = useState({ min: "", max: "" });
  const [builtFilter, setBuiltFilter] = useState(new Set());
  const [coatingFilter, setCoatingFilter] = useState(new Set());
  const [poolSort, setPoolSort] = useState({ key: "Updated", desc: true });
  const [builtRange, setBuiltRange] = useState({ min: "", max: "" });
  const [dateFilter, setDateFilter] = useState("all");
  const [poolSearch, setPoolSearch] = useState("");
  const [vesselPoolPage, setVesselPoolPage] = useState(1);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [posPasteText, setPosPasteText] = useState("");
  const [posPasteOpen, setPosPasteOpen] = useState(false);
  const [posPasting, setPosPasting] = useState(false);
  const [posPasteMsg, setPosPasteMsg] = useState("");

  // Fixing window history (Supabase)
  const [fixHistory, setFixHistory] = useState([]);
  
  const [posFixHistoryLoading, setPosFixHistoryLoading] = useState(false);

  // Market report
  const [reportType, setReportType] = useState("");
  const [asiaReport,setAsiaReport]=useState(asiaBlank);
  const [weeklyHistory,setWeeklyHistory]=useState({routeKey:"",series:{}});
  const [priorReportOpen,setPriorReportOpen]=useState(false);
  const [priorReportChoice,setPriorReportChoice]=useState("");
  const [priorReportStatus,setPriorReportStatus]=useState("");
  const [commentary, setCommentary] = useState("");
  const [rateGrid, setRateGrid] = useState({});
  const [tceEarnings, setTceEarnings] = useState({});
  const [fixtures, setFixtures] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [reportDate, setReportDate] = useState("2026-10-16");
  const [intermediateTitle, setIntermediateTitle] = useState("Intermediate Summary");
  const [savedReports, setSavedReports] = useState([]);
  const [pendingSavedDelete, setPendingSavedDelete] = useState(null);
  const [deleteReportError, setDeleteReportError] = useState("");
  const [marketHeadings, setMarketHeadings] = useState({drivers:"Market drivers / What to watch",benchmark:"Benchmark rates",tce:"TCE earnings",handy:"Handy",ffa:"FFA trend (BALMO / +1 / +2)"});
  const [activeMarketReportId, setActiveMarketReportId] = useState(null);
  const [reportName,setReportName]=useState("");
  const [saveReportCopy,setSaveReportCopy]=useState(false);
  const [marketSaveStatus,setMarketSaveStatus] = useState("");
  const [marketSaveBusy,setMarketSaveBusy] = useState(false);
  const [deleteReportBusy,setDeleteReportBusy] = useState(false);
  const editMarketHeading = (key, style) => <input aria-label={"Edit " + key + " heading"} value={marketHeadings[key]}
    onChange={e => setMarketHeadings(p => ({...p,[key]:e.target.value}))}
    className="rpt-edit" style={{...style,width:"100%",minWidth:90,background:"transparent",border:"none",padding:0}} />;

  // ── Intermediate report rebuild: drivers, benchmark rates, Handy, TCE stats ──
  const [driverBullets, setDriverBullets] = useState([""]);
  const [benchmarkRows, setBenchmarkRows] = useState(
    BENCHMARK_ROUTES.map(r => ({ ...r, freight: "", lastWeek: "", tce: null, tceLastWeek: null, override: false }))
  );
  const [tceDefaults, setTceDefaults] = useState(null); // vessel profile shared with TCECalculator
  const [tceStats, setTceStats] = useState({ current: "", lastMonth: "", ytd: "" });
  const [handyCommentary, setHandyCommentary] = useState("");
  const [intermediateRoutesLabel,setIntermediateRoutesLabel] = useState("Intermediate routes");
  const [handy, setHandy] = useState({
    tc23: { spotWS: "", ffaAug: "", ffaSep: "", ffaOct: "" },
    tc6:  { spotWS: "", ffaAug: "", ffaSep: "", ffaOct: "" },
  });
  const [handySegments, setHandySegments] = useState(["tc23","tc6"]);
  const [benchmarkRefreshStatus, setBenchmarkRefreshStatus] = useState(null);
  const [pendingDriverDelete, setPendingDriverDelete] = useState(null);
  const [pendingFixtureDelete, setPendingFixtureDelete] = useState(null);
  const [handyParseMsg, setHandyParseMsg] = useState("");
  const importedCargoIds = useRef(new Set());

  const importedNames = useRef(new Set(reportVessels.map(v => v.vessel)));
  // Quick positions state
  const [quickRows, setQuickRows] = useState([]);
  const [quickTableSort,setQuickTableSort]=useState({key:null,desc:false});
  const [quickExcludedOperators,setQuickExcludedOperators]=useState([]);
  const quickOperators=[...new Map(quickRows.map(r=>[quickOperatorKey(r.operator),r.operator||"Unknown"])).entries()];
  const quickOutputRows=quickRows.filter(r=>!quickExcludedOperators.includes(quickOperatorKey(r.operator)));
  const quickEditorRows=useMemo(()=>{
    if(!quickTableSort.key)return quickRows;
    const key=quickTableSort.key;
    const value=r=>key==="date"?dateSortKey(quickDisplayDate(r.date)):key==="updatedAt"?(Date.parse(quickUpdatedValue(r,allVessels))||0):String((key==="direction"?(r.comment??r.direction):r[key])||"");
    return [...quickRows].sort((a,b)=>{const av=value(a),bv=value(b);return (typeof av==="number"?av-bv:av.localeCompare(bv,undefined,{numeric:true,sensitivity:"base"}))*(quickTableSort.desc?-1:1);});
  },[quickRows,quickTableSort,allVessels]);
  function toggleQuickOperator(key){setQuickExcludedOperators(p=>p.includes(key)?p.filter(k=>k!==key):[...p,key]);}
  function sortQuickColumn(key){setQuickTableSort(p=>({key,desc:p.key===key?!p.desc:false}));}
  const [quickSelectedTags,setQuickSelectedTags]=useState([]);
  const [quickUpdatedFilter,setQuickUpdatedFilter]=useState("all");
  const quickAvailableTags=useMemo(()=>[...new Set(allVessels.flatMap(parseTags))].sort(),[allVessels]);
  useEffect(()=>{
    let config=null;try{config=JSON.parse(localStorage.getItem("signal_interukc_config")||"null");}catch{}
    setQuickRows(rows=>reconcileQuickSelections(rows,allVessels,quickSelectedTags,config,quickUpdatedFilter));
  },[quickSelectedTags,quickUpdatedFilter,allVessels]);
  function toggleQuickTag(tag){setQuickSelectedTags(tags=>tags.includes(tag)?tags.filter(t=>t!==tag):[...tags,tag]);}
  const [quickTitle, setQuickTitle] = useState("Available tonnage");
  const [quickReportName,setQuickReportName]=useState("");
  const [activeQuickId,setActiveQuickId]=useState(null);
  const [quickSaveCopy,setQuickSaveCopy]=useState(false);
  const [quickWhatsAppCopied,setQuickWhatsAppCopied]=useState(false);
  const [quickPaste, setQuickPaste] = useState("");
  const [quickCopied, setQuickCopied] = useState(false);
  const [quickParseMsg, setQuickParseMsg] = useState("");
  const [vesselOpDb, setVesselOpDb] = useState({}); // vessel name → operator lookup

  const ACCENT = C.blue || "#3a82f6";

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => { loadHTI().catch(() => {}); }, []);

  useEffect(() => {
    if (!selectedVessels?.length) return;
    const toAdd = selectedVessels
      .filter(v => !importedNames.current.has(v.vessel))
      .map(v => ({ ...v, _rid: newPositionId() + "_" + Math.random().toString(36).slice(2) }));
    if (toAdd.length) {
      toAdd.forEach(v => importedNames.current.add(v.vessel));
      setReportVessels(p => [...p, ...toAdd]);
      setSection("poslist");
    }
  }, [selectedVessels]);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(reportVessels)); } catch {}
  }, [reportVessels]);
  useEffect(() => {
    try { localStorage.setItem(DRAFT_META_KEY, JSON.stringify({ title: posTitle, subtitle: posSubtitle,positionColumns,positionChartSettings,positionCharts,posGroupBy,regionMode,outputSort,sortByDate,segmentNames,positionReportName,positionPreviewWidth })); } catch {}
  }, [posTitle,posSubtitle,positionColumns,positionChartSettings,positionCharts,posGroupBy,regionMode,outputSort,sortByDate,segmentNames,positionReportName,positionPreviewWidth]);

  useEffect(() => { loadSavedReports(); }, []);

  const [fixHistoryLoading, setFixHistoryLoading] = useState(true);

  useEffect(() => {
    async function fetchFixHistory() {
      setFixHistoryLoading(true);
      try {
        const since = new Date(); since.setDate(since.getDate() - 84);
        // positions_latest is the unified view (manual + external feed) — the
        // plain "positions" table alone misses almost all feed-sourced rows.
        // Filtered to Intermediate segment, UKC/NWE region, matching this report's scope.
        const { data, error } = await supabase
          .from("positions_latest")
          .select("updated_at, open_date, segment, super_region")
          .gte("updated_at", since.toISOString())
          .ilike("segment", "%intermediate%")
          .or("super_region.ilike.%ukc%,super_region.ilike.%nwe%")
          .not("open_date", "is", null);
        if (error) { console.error("fixHistory:", error); setFixHistoryLoading(false); return; }
        if (!data?.length) { setFixHistoryLoading(false); return; }
        const weeks = {};
        data.forEach(row => {
          if (!row.updated_at) return;
          const d = new Date(row.updated_at);
          const ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
          const key = ws.toISOString().slice(0, 10);
          if (!weeks[key]) weeks[key] = { ships: 0, totalDays: 0, cnt: 0 };
          weeks[key].ships++;
          if (row.open_date) {
            const days = Math.round((new Date(row.open_date) - d) / 86400000);
            if (days >= 0 && days <= 60) { weeks[key].totalDays += days; weeks[key].cnt++; }
          }
        });
        setFixHistory(Object.entries(weeks)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, v]) => ({
            label: new Date(key).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
            ships: v.ships,
            avgWindow: v.cnt > 0 ? Math.round(v.totalDays / v.cnt) : 0
          })));
      } catch (e) { console.error("fixHistory:", e); }
      setFixHistoryLoading(false);
    }
    fetchFixHistory();
  }, []);

  const [positionHistoryRows,setPositionHistoryRows]=useState([]);
  const [positionHistoryError,setPositionHistoryError]=useState("");
  const historyCache=useRef(new Map());
  const hasReportPositions=reportVessels.length>0;
  const historyRangeKey=positionChartSettings.historyFrom+"|"+positionChartSettings.historyTo;
  useEffect(()=>{
    if(section!=="poslist"||!hasReportPositions)return;
    let cancelled=false;
    const cached=historyCache.current.get(historyRangeKey);
    if(cached){setPositionHistoryRows(cached);setPosFixHistoryLoading(false);setPositionHistoryError("");return;}
    async function load(){
      setPosFixHistoryLoading(true);setPositionHistoryRows([]);setPositionHistoryError("");
      try{
        const records=[],end=new Date((reportDay(positionChartSettings.historyTo)+1)*86400000).toISOString();
        for(let offset=0;;offset+=1000){
          const {data,error}=await supabase.from("positions_latest").select("updated_at,open_date,segment,super_region").gte("updated_at",positionChartSettings.historyFrom+"T00:00:00Z").lt("updated_at",end).not("open_date","is",null).order("updated_at",{ascending:true}).range(offset,offset+999);
          if(error)throw error;if(cancelled)return;records.push(...(data||[]));if(!data||data.length<1000)break;
        }
        historyCache.current.set(historyRangeKey,records);if(!cancelled)setPositionHistoryRows(records);
      }catch(error){if(!cancelled)setPositionHistoryError(error.message||"Unable to load fixing-window data");}
      finally{if(!cancelled)setPosFixHistoryLoading(false);}
    }
    load();return()=>{cancelled=true;};
  },[section,hasReportPositions,historyRangeKey]);
  const positionSegmentOptions=[...new Set(reportVessels.map(v=>v.segment).filter(Boolean))];
  const positionRegionOptions=[...new Set(reportVessels.map(v=>v.superRegion||classifyRegion(v.openPort)||"Other"))];
  const fixingSegments=(positionChartSettings.segments.length?positionChartSettings.segments:positionSegmentOptions).map(canonicalSegment);
  const fixingRegions=(positionChartSettings.regions.length?positionChartSettings.regions:positionRegionOptions).map(canonicalRegion);
  const positionFixingData=buildPositionFixingHistory(positionHistoryRows,positionChartSettings,fixingSegments,fixingRegions);
  function applyPositionSettings(){
    const d=positionChartDraft;
    if(!d.anchor||!d.historyFrom||!d.historyTo||reportDay(d.historyFrom)>reportDay(d.historyTo)){setPositionSettingsError("Enter valid dates; history end must be on or after start.");return;}
    if(!Number.isFinite(+d.ahead)||+d.bucketDays<1||+d.ahead<2||+d.bars<2||+d.bars>20||+d.historyBars<1||+d.historyBars>30||+d.maxWindow<1){setPositionSettingsError("Use at least 2 days ahead, 2–20 open bars, 1–30 history bars and a positive maximum window.");return;}
    setPositionChartSettings({...d});setPositionSettingsError("");
  }

  // Load the shared vessel profile (same one used in TCECalculator) so
  // benchmark-route TCE figures stay consistent across the app.
  useEffect(() => { loadTCEDefaults().then(d => setTceDefaults(d)); }, []);

  // Load saved benchmark route freight/TCE from Supabase for the Intermediate report
  useEffect(() => {
    if (reportType !== "Intermediate") return;
    let cancelled=false;
    const refresh=async()=>{
      const {data,error}=await supabase.from("tce_routes").select("*");
      if(cancelled||error||!data)return;
      setBenchmarkRows(prev=>mergeReportBenchmarkRows(prev,data));
    };
    refresh();
    window.addEventListener("tankpos:tce-routes-saved",refresh);
    return()=>{cancelled=true;window.removeEventListener("tankpos:tce-routes-saved",refresh);};
  }, [reportType]);

  // Dashboard fixing-window import: explicit destination and persisted chart snapshot.
  const [fixingImportOpen,setFixingImportOpen]=useState(false);
  const [fixingImportChoice,setFixingImportChoice]=useState("new");
  const [fixingImportBusy,setFixingImportBusy]=useState(false);
  const [fixingImportError,setFixingImportError]=useState("");
  const [importedFixingChart,setImportedFixingChart]=useState(null);
  const fixingImportSeen=useRef(null);
  useEffect(()=>{
    if(!dashboardFixingImport || dashboardFixingImport.kind!=="dashboard-fixing-window")return;
    if(fixingImportSeen.current===dashboardFixingImport.requestId)return;
    fixingImportSeen.current=dashboardFixingImport.requestId;
    setFixingImportChoice("new");setFixingImportError("");setFixingImportOpen(true);
    loadSavedReports();
  },[dashboardFixingImport]);
  async function confirmFixingImport(){
    if(fixingImportBusy||!dashboardFixingImport)return;
    setFixingImportBusy(true);setFixingImportError("");
    try{
      const snap={kind:"dashboard-fixing-window",region:dashboardFixingImport.region||"All",period:dashboardFixingImport.period||"ALL",segments:Array.isArray(dashboardFixingImport.segments)?dashboardFixingImport.segments:[],rows:Array.isArray(dashboardFixingImport.rows)?dashboardFixingImport.rows:[],importedAt:dashboardFixingImport.importedAt||new Date().toISOString()};
      if(!snap.rows.length)throw new Error("No fixing-window observations to import");
      if(fixingImportChoice!=="new"){
        const {data,error}=await supabase.from("reports").select("*").eq("id",fixingImportChoice).single();
        if(error||!data)throw error||new Error("Report not found");
        if(data.report_type!=="Intermediate")throw new Error("Choose an Intermediate report");
        await loadReport(fixingImportChoice);
      }else{
        setActiveMarketReportId(null);setReportName("");setSaveReportCopy(false);setReportType("Intermediate");setReportDate("2026-10-16");setIntermediateTitle("Intermediate Summary");
        setCommentary("");setRateGrid({});setTceEarnings({});setQuotes([]);setFixtures([]);
        initRateGrid("Intermediate");
      }
      setImportedFixingChart(snap);setSection("market");setFixingImportOpen(false);
      onDashboardFixingImportHandled?.();
    }catch(e){setFixingImportError(e?.message||"Import failed");}
    finally{setFixingImportBusy(false);}
  }

  // Explicit destination selection for cargo imports (never silently change a report).
  const [cargoImportOpen, setCargoImportOpen] = useState(false);
  const [cargoImportChoice, setCargoImportChoice] = useState("new");
  const [cargoImportBusy, setCargoImportBusy] = useState(false);
  const [cargoImportError, setCargoImportError] = useState("");
  const lastCargoImportSignature = useRef("");
  useEffect(() => {
    if (!selectedCargoes?.length) { lastCargoImportSignature.current = ""; return; }
    const signature = selectedCargoes.map(c => String(c.id ?? [c.vessel,c.cargo,c.from,c.to].join("|"))).join(";");
    if (signature === lastCargoImportSignature.current) return;
    lastCargoImportSignature.current = signature;
    setCargoImportChoice("new");
    setCargoImportError("");
    setCargoImportOpen(true);
    loadSavedReports();
  }, [selectedCargoes]);
  const mapImportedCargo = c => normalizeReportFixture({
    vessel:c.vessel||"", charterer:c.charterer||"", qty:c.qty??"", cargo:c.cargo||"",
    load:c.load||c.loadPort||"", disch:c.disch||c.dischPort||"",
    laycanFrom:c.from||c.laycanFrom||"", laycanTo:c.to||c.laycanTo||"",
    freight:reportFixtureFreight(c.freight)
  });
  async function confirmCargoImport() {
    if (!selectedCargoes?.length || cargoImportBusy) return;
    setCargoImportBusy(true); setCargoImportError("");
    try {
      const incoming = selectedCargoes.map(mapImportedCargo);
      if (cargoImportChoice !== "new") {
        const {data,error} = await supabase.from("reports").select("*").eq("id",cargoImportChoice).single();
        if (error || !data) throw error || new Error("Saved report not found");
        await loadReport(cargoImportChoice);
        setFixtures([...(Array.isArray(data.fixtures)?data.fixtures:[]).map(f=>normalizeReportFixture({...f,freight:reportFixtureFreight(f.freight)})),...incoming]);
      } else {
        setActiveMarketReportId(null);setReportName("");setSaveReportCopy(false);
        setReportType("Intermediate");
        setReportDate(new Date().toISOString().split("T")[0]);
        setCommentary(""); setRateGrid({}); setTceEarnings({}); setQuotes([]);
        setFixtures(incoming);
        initRateGrid("Intermediate");
      }
      setSection("market"); setCargoImportOpen(false);
    } catch(e) { setCargoImportError(e?.message || "Import failed"); }
    finally { setCargoImportBusy(false); }
  }

  // Recalculate a benchmark row's TCE from its freight input, using the
  // shared vessel profile and the route's single-leg laden distance.
  function recalcBenchmarkTCE(row, freightVal) {
    if (!tceDefaults || !row.dist) return null;
    const f = parseFloat(String(freightVal).replace(/[^0-9.\-]/g, ""));
    if (!f) return null;
    const r = calcTCE({ freight: f, ballastNm: 0, ladenNm: row.dist, repoNm: 0, ...tceDefaults });
    return r ? r.tce : null;
  }

  function updateBenchmarkFreight(key, val) {
    setBenchmarkRows(prev => prev.map(r => {
      if (r.key !== key) return r;
      const dist = r.dist ?? lookupDist(r.from, r.to);
      const tce = recalcBenchmarkTCE({ ...r, dist }, val);
      // Marked as override — this only affects the current report and does
      // not write back to tce_routes, so refreshing pulls the saved value again.
      return { ...r, dist, freight: val, tce, override: true };
    }));
  }

  function refreshBenchmarkFromSaved() {
    setBenchmarkRefreshStatus("Refreshing…");
    (async () => {
      const { data, error } = await supabase.from("tce_routes").select("*");
      if (error) { setBenchmarkRefreshStatus("Refresh failed"); setTimeout(() => setBenchmarkRefreshStatus(null), 2500); return; }
      if (!data || !data.length) { setBenchmarkRefreshStatus("No saved routes found — save some in the TCE tab first"); setTimeout(() => setBenchmarkRefreshStatus(null), 3500); return; }
      setBenchmarkRows(prev=>mergeReportBenchmarkRows(prev,data,true));
      setBenchmarkRefreshStatus("Refreshed ✓");
      setTimeout(() => setBenchmarkRefreshStatus(null), 2000);
    })();
  }

  async function handleHandyImagePaste(e) {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(i => i.type.startsWith("image/"));
    if (!imgItem) return;
    e.preventDefault();
    setHandyParsing(true);
    setHandyParseMsg("Reading image...");
    try {
      const file = imgItem.getAsFile();
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      setHandyParseMsg("Extracting Handy WS/FFA levels...");
      const resp = await fetch("/api/parse-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, mediaType: file.type || "image/png" }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${resp.status}`);
      }
      const json = await resp.json();
      const raw = (json.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
      let parsed;
      try { parsed = JSON.parse(raw); } catch { throw new Error("Could not parse API response — try pasting text instead"); }
      // Expected shape: { tc23: {spotWS,ffaAug,ffaSep,ffaOct}, tc6: {...} } — merge
      // whatever fields came back, leaving anything not found untouched.
      setHandy(prev => ({
        tc23: { ...prev.tc23, ...(parsed.tc23 || {}) },
        tc6:  { ...prev.tc6,  ...(parsed.tc6  || {}) },
      }));
      setHandyParseMsg("✓ Handy levels extracted from image.");
    } catch (err) {
      console.error("handyImagePaste:", err);
      setHandyParseMsg("Image parse failed: " + err.message);
    } finally {
      setHandyParsing(false);
    }
  }

  // Plain-text fallback (no AI call) — matches lines like "TC23 WS 160" or
  // "FFA Aug TC6 158" so a pasted broker note can populate Handy without a screenshot.
  function parseHandyText(text) {
    const next = { tc23: { ...handy.tc23 }, tc6: { ...handy.tc6 } };
    const lines = text.split("\n");
    lines.forEach(line => {
      const seg = /tc\s*23/i.test(line) ? "tc23" : /tc\s*6\b/i.test(line) ? "tc6" : null;
      if (!seg) return;
      const wsMatch = line.match(/ws\s*(\d+)/i);
      if (!wsMatch) return;
      const monthMatch = line.match(/\b(aug|sep|oct)\b/i);
      if (monthMatch) {
        const key = "ffa" + monthMatch[1][0].toUpperCase() + monthMatch[1].slice(1).toLowerCase();
        next[seg][key] = wsMatch[1];
      } else if (/spot/i.test(line)) {
        next[seg].spotWS = wsMatch[1];
      }
    });
    setHandy(next);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const posGrouped = useMemo(() => groupVessels(reportVessels, posGroupBy, sortByDate, regionMode, matchCustomRegion, outputSort), [reportVessels, posGroupBy, sortByDate, regionMode, customRegionGroups, outputSort]);
  const reportedNames = useMemo(() => new Set(reportVessels.map(v => v.vessel)), [reportVessels]);

  const openTimingData=useMemo(()=>positionOpenBuckets(reportVessels,positionChartSettings),[reportVessels,positionChartSettings]);
  const [dbTags, setDbTags] = useState([]);

  // Load all known filter values (tags + regions + segments) from Supabase
  useEffect(() => {
    if (section !== "poslist") return;
    async function fetchTags() {
      try {
        const { data } = await supabase
          .from("positions_latest")
          .select("tag, super_region, segment");
        if (!data) return;
        const s = new Set();
        data.forEach(r => {
          if (r.tag) {
            const raw = Array.isArray(r.tag) ? r.tag : String(r.tag).split(",");
            raw.forEach(t => { const v = t.trim().toUpperCase(); if (v) s.add(v); });
          }
          if (r.super_region) s.add(String(r.super_region).toUpperCase().trim());
          if (r.segment) s.add(String(r.segment).toUpperCase().trim());
        });
        setDbTags([...s].sort());
      } catch (e) { console.error("fetchTags:", e); }
    }
    fetchTags();
  }, [section]);

  const allTags = useMemo(() => {
    const s = new Set([...dbTags]);
    allVessels.forEach(v => {
      parseTags(v).forEach(t => s.add(t));
      if (v.superRegion) s.add(v.superRegion.toUpperCase().trim());
      if (v.segment) s.add(v.segment.toUpperCase().trim());
    });
    return [...s].sort();
  }, [allVessels, dbTags]);

  const vesselPool = useMemo(() => {
    const now = new Date();
    const inRange = (val, range) => {
      const n = parseFloat(val);
      if (isNaN(n)) return false;
      if (range.min !== "" && n < parseFloat(range.min)) return false;
      if (range.max !== "" && n > parseFloat(range.max)) return false;
      return true;
    };
    const DWT_BUCKETS = { "<10": [0,10000], "10-15": [10000,15000], "15-20": [15000,20000], "20-30": [20000,30000], "30-40": [30000,40000], ">40": [40000,Infinity] };
    const BUILT_BUCKETS = { "<2005": [0,2004], "2005-10": [2005,2010], "2010-15": [2010,2015], "2015-20": [2015,2020], ">2020": [2021,9999] };

    return allVessels.filter(v => {
      if (reportedNames.has(v.vessel)) return false;
      if (poolSearch && !(
        v.vessel?.toLowerCase().includes(poolSearch.toLowerCase()) ||
        v.operator?.toLowerCase().includes(poolSearch.toLowerCase()) ||
        v.openPort?.toLowerCase().includes(poolSearch.toLowerCase())
      )) return false;

      if (tagFilter.size > 0) {
        const vTags = parseTags(v).map(t => t.toUpperCase());
        if (![...tagFilter].some(t => vTags.includes(t.toUpperCase()))) return false;
      }
      if (segmentFilter.size > 0 && !segmentFilter.has(v.segment)) return false;
      if (superRegionFilter.size > 0 && !superRegionFilter.has(v.superRegion)) return false;
      if (regionFilter.size > 0) {
        const r = matchCustomRegion(v.openPort) || classifyRegion(v.openPort);
        if (![...regionFilter].includes(r)) return false;
      }
      if (dwtFilter.size > 0 || dwtRange.min !== "" || dwtRange.max !== "") {
        const dwt = parseFloat(v.dwt);
        const inBucket = [...dwtFilter].some(b => { const [lo,hi] = DWT_BUCKETS[b]; return dwt >= lo && dwt < hi; });
        const inCustomRange = (dwtRange.min !== "" || dwtRange.max !== "") ? inRange(v.dwt, dwtRange) : false;
        if (!inBucket && !inCustomRange) return false;
      }
      if (builtFilter.size > 0 || builtRange.min !== "" || builtRange.max !== "") {
        const built = parseFloat(v.built);
        const inBucket = [...builtFilter].some(b => { const [lo,hi] = BUILT_BUCKETS[b]; return built >= lo && built <= hi; });
        const inCustomRange = (builtRange.min !== "" || builtRange.max !== "") ? inRange(v.built, builtRange) : false;
        if (!inBucket && !inCustomRange) return false;
      }
      if (coatingFilter.size > 0) {
        const coating = String(v.coating || "").trim().toUpperCase();
        const normalized = coating.includes("MARINELINE") || coating === "ML" ? "ML" : coating.includes("INTERLINE") ? "INTERLINE" : coating.includes("STAINLESS") || coating === "STST" || coating === "SS" ? "STST" : coating.includes("EPOXY") ? "EPOXY" : coating;
        if (!coatingFilter.has(normalized)) return false;
      }
      if (dateFilter !== "all" && v.updatedAt) {
        const diff = (now - new Date(v.updatedAt)) / 86400000;
        if (dateFilter === "today" && diff > 1) return false;
        if (dateFilter === "2d" && diff > 2) return false;
        if (dateFilter === "7d" && diff > 7) return false;
      }
      return true;
    });
  }, [allVessels, reportedNames, tagFilter, segmentFilter, superRegionFilter, regionFilter, dwtFilter, dwtRange, builtFilter, builtRange, coatingFilter, poolSearch, dateFilter]);

  const sortedVesselPool = useMemo(() => [...vesselPool].sort((a,b) => {
    const field = {Vessel:"vessel",DWT:"dwt",Built:"built",Coating:"coating","Open date":"date","Open port":"openPort",Operator:"operator",Updated:"updatedAt"}[poolSort.key] || "updatedAt";
    const val = v => { const raw = v[field] ?? ""; if (field === "updatedAt") return new Date(raw || 0).getTime() || 0; if (["dwt","built","cbm","loa","beam"].includes(field)) return Number(String(raw).replace(/[^0-9.]/g,"")) || 0; if (field === "date") { const t = Date.parse(raw); return Number.isFinite(t) ? t : String(raw).toLowerCase(); } return String(raw).toLowerCase(); };
    const av=val(a),bv=val(b); const cmp=typeof av === "number" && typeof bv === "number" ? av-bv : String(av).localeCompare(String(bv)); return (poolSort.desc ? -1 : 1)*cmp;
  }), [vesselPool,poolSort]);

  // Pagination only affects the Add Vessels pool; filtering, sorting and Import all use the full result set.
  const VESSEL_POOL_PAGE_SIZE = 200;
  const vesselPoolPageCount = Math.max(1, Math.ceil(sortedVesselPool.length / VESSEL_POOL_PAGE_SIZE));
  const currentVesselPoolPage = Math.min(vesselPoolPage, vesselPoolPageCount);
  const pagedVesselPool = sortedVesselPool.slice((currentVesselPoolPage - 1) * VESSEL_POOL_PAGE_SIZE, currentVesselPoolPage * VESSEL_POOL_PAGE_SIZE);
  useEffect(() => { setVesselPoolPage(1); }, [poolSearch, tagFilter, dateFilter, regionFilter, superRegionFilter, coatingFilter, segmentFilter, dwtFilter, dwtRange, builtFilter, builtRange, poolSort]);

  function renameBucketInline(bucket, rows, text) {
    const clean = String(text || "").trim();
    if (!clean || !rows?.length) return;
    if (posGroupBy === "segment") {
      setSegmentNames(prev => ({...prev, [bucket]:clean}));
      return;
    }
    const modeKey = regionMode === "region" ? "region" : "superRegion";
    const ids = new Set(rows.map(r => r._rid || r.vessel));
    setReportVessels(prev => prev.map(v => ids.has(v._rid || v.vessel) ? {
      ...v,
      _reportRegionNames: {
        ...(v._reportRegionNames || {}),
        [modeKey]: {...((v._reportRegionNames || {})[modeKey] || {}), [bucket]:clean}
      }
    } : v));
  }

  function displayRegionBucket(bucket, rows) {
    if (posGroupBy === "segment") return segmentNames[bucket] || bucket;
    if (!rows?.length) return bucket;
    const modeKey = regionMode === "region" ? "region" : "superRegion";
    return rows[0]?._reportRegionNames?.[modeKey]?.[bucket] || bucket;
  }

  function startPositionResize(e) {
    e.preventDefault();
    const startX = e.clientX, startWidth = positionPreviewWidth;
    const move = ev => setPositionPreviewWidth(Math.max(480, Math.min(1250, startWidth + ev.clientX - startX)));
    const stop = () => {window.removeEventListener("mousemove",move);window.removeEventListener("mouseup",stop);document.body.style.cursor="";document.body.style.userSelect="";};
    document.body.style.cursor="col-resize";document.body.style.userSelect="none";
    window.addEventListener("mousemove",move);window.addEventListener("mouseup",stop);
  }

  function positionChartTick(key, label) {
    return <label className="no-export" title="Include this graph in copy, PNG and PDF export" style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:10,color:"#dbe6f5",cursor:"pointer",fontWeight:650,whiteSpace:"nowrap"}}>
      <input type="checkbox" checked={positionCharts[key]} onChange={e=>setPositionCharts(p=>({...p,[key]:e.target.checked}))} style={{width:15,height:15,margin:0,accentColor:"#377dc8",cursor:"pointer",flexShrink:0}}/>
      {label}
    </label>;
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function addFromPool(v) {
    if (reportedNames.has(v.vessel)) return;
    importedNames.current.add(v.vessel);
    setReportVessels(p => [...p, { ...v, _rid: newPositionId() }]);
  }

  // Paste positions straight into this list — tries the two most common
  // quick patterns first, falls back to the same AI text endpoint Quick
  // Positions uses for anything messier. Vessels found in allVessels get
  // added with their real DWT/segment/etc; anything not recognized is added
  // as a lightweight manual entry so it still shows up in the list.
  async function parsePositionListPaste() {
    if (!posPasteText.trim()) { setPosPasteMsg("Paste some positions first."); return; }
    const raw = posPasteText
      .replace(/\r\n?/g, "\n")
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
    const nonEmpty = raw.split("\n").map(l => l.trim()).filter(Boolean);
    let parsedRows = [];

    // Quick pattern 1: dash-separated "VESSEL – PORT – DATE"
    nonEmpty.forEach(line => {
      const parts = line.split(/\s*[\u2013\u2014]\s*|\s+-\s+/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) parsedRows.push({ vessel: parts[0].toUpperCase(), port: (parts[1]||"").toUpperCase(), date: parts[2]||"", direction: parts.slice(3).join(" ") });
    });
    // Quick pattern 2: space-separated "VESSEL (multi-word) PORT DAY"
    if (!parsedRows.length) {
      const LINE_RE = /^(.+?)\s+([A-Za-z]{2,})\s+(\d{1,2})$/;
      const MN2 = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
      const curMonth = MN2[new Date().getMonth()];
      nonEmpty.forEach(line => {
        const m = line.match(LINE_RE);
        if (m) parsedRows.push({ vessel: m[1].toUpperCase(), port: m[2].toUpperCase(), date: `${parseInt(m[3])} ${curMonth}`, direction: "" });
      });
    }

    // Fallback: AI text parsing for anything messier
    if (!parsedRows.length) {
      setPosPasting(true); setPosPasteMsg("No fixed pattern matched — trying AI parsing...");
      try {
        const resp = await fetch("/api/parse-positions-text", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: raw }),
        });
        if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error || `Server error ${resp.status}`); }
        const json = await resp.json();
        const rawText = (json.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(rawText);
        parsedRows = (Array.isArray(parsed) ? parsed : []).filter(r => r.vessel).map(r => ({
          vessel: (r.vessel || "").toUpperCase(), port: (r.port || "").toUpperCase(), date: r.date || "", direction: r.direction || "",
        }));
      } catch (err) {
        console.error("Position list AI parse:", err);
        setPosPasting(false); setPosPasteMsg("Parsing failed: " + err.message);
        return;
      }
      setPosPasting(false);
    }

    if (!parsedRows.length) { setPosPasteMsg("No positions detected in this text."); return; }

    let matched = 0;
    parsedRows.forEach(r => {
      const found = allVessels.find(v => v.vessel?.toUpperCase() === r.vessel);
      if (found && !reportedNames.has(found.vessel)) {
        // Use the vessel's real DWT/segment/etc data, but the freshly-parsed
        // port/date/comment — the whole point of pasting is to report a new
        // position, not silently re-add the vessel's old cached position.
        addFromPool({ ...found, openPort: r.port || found.openPort, date: r.date || found.date, comment: r.direction || found.comment });
        matched++;
      }
      else if (!found) {
        importedNames.current.add(r.vessel);
        setReportVessels(p => [...p, {
          vessel: r.vessel, openPort: r.port, date: r.date, comment: r.direction,
          operator: lookupOp ? lookupOp(r.vessel) : "", segment: "", dwt: null, superRegion: "",
          _rid: r.vessel + "_" + Date.now() + Math.random().toString(36).slice(2),
        }]);
      }
    });
    setPosPasteMsg(`✓ ${parsedRows.length} position${parsedRows.length!==1?"s":""} added (${matched} matched from your vessel database, ${parsedRows.length-matched} added manually).`);
    setPosPasteText("");
  }

  function deleteRow(rid) {
    setReportVessels(p => { const rem = p.find(x => x._rid === rid); if (rem) importedNames.current.delete(rem.vessel); return p.filter(x => x._rid !== rid); });
    if (editingRid === rid) setEditingRid(null);
  }
  function saveEdit(rid, vals) { setReportVessels(p => p.map(v => v._rid === rid ? { ...v, ...vals } : v)); setEditingRid(null); }
  function addManualVessel(bucket) {
    const rid = newPositionId();
    const preset = bucket
      ? {_reportGroups:{[posGroupBy === "segment"?"segment":regionMode]:bucket}}
      : {};
    setReportVessels(p => [...p, { vessel: "", dwt: "", built: "", coating: "", date: "", openPort: "", comment: "", operator: "", segment: "", superRegion: "", ...preset, _rid: rid }]);
    setEditingRid(rid);
  }
  function clearAll(){importedNames.current=new Set();setReportVessels([]);setEditingRid(null);setPendingClear(null);}
  function dragStart(id,event){dragFrom.current=id;dragTo.current=null;if(event?.dataTransfer){event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",id);}}
  function dragEnter(id){dragTo.current=id;setDragOver(id);}
  function dragEnd(){dragFrom.current=null;dragTo.current=null;setDragOver(null);}
  function dropPosition(bucket,targetId,event){
    event.preventDefault();event.stopPropagation();
    const id=dragFrom.current;if(!id)return;
    const ordered=Object.values(posGrouped).flat(),item=ordered.find(v=>v._rid===id);if(!item){dragEnd();return;}
    if(id===targetId){dragEnd();return;}
    const next=ordered.filter(v=>v._rid!==id),groupKey=posGroupBy==="segment"?"segment":regionMode;
    const moved={...item,_reportGroups:{...item._reportGroups,[groupKey]:bucket}};
    let at=targetId?next.findIndex(v=>v._rid===targetId):-1;
    if(at<0){const ids=new Set((posGrouped[bucket]||[]).map(v=>v._rid));at=next.reduce((index,v,i)=>ids.has(v._rid)?i+1:index,-1);}
    next.splice(at<0?next.length:at,0,moved);setOutputSort({key:null,desc:false});setSortByDate(false);setReportVessels(next);dragEnd();
  }


  // ── Export ────────────────────────────────────────────────────────────────
  const exportFilter = node => !node.classList?.contains("no-export") && !node.classList?.contains("exclude-position-chart");
  async function capturePng() {
    setEditingRid(null);
    await new Promise(r => setTimeout(r, 70));
    const lib = await loadHTI();
    return lib.toPng(previewRef.current, { backgroundColor: "#070f1c", pixelRatio: 2, filter: exportFilter });
  }
  async function handleCopyEmail() {
    setExportStatus("Copying...");
    try {
      setEditingRid(null); await new Promise(r => setTimeout(r, 70));
      const lib = await loadHTI();
      const blob = await lib.toBlob(previewRef.current, { backgroundColor: "#070f1c", pixelRatio: 2, filter: exportFilter });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setExportStatus("Copied — paste into your email body."); setTimeout(() => setExportStatus(""), 2800);
    } catch (e) { setExportStatus("Copy failed: " + e.message); }
  }
  async function handleDownloadPng() {
    setExportStatus("Rendering...");
    try { const url = await capturePng(); const a = document.createElement("a"); a.download = `positions-${posDate}.png`; a.href = url; a.click(); setExportStatus("Downloaded."); setTimeout(() => setExportStatus(""), 2800); }
    catch (e) { setExportStatus("Failed: " + e.message); }
  }

  // ── Market report export — same html-to-image pattern as Position List ──
  const [marketExportStatus, setMarketExportStatus] = useState("");
  const [routeColumns,setRouteColumns] = useState({lastWeek:true,comment:true});
  const [routeTitles,setRouteTitles] = useState({spot:"Spot",lastWeek:"Last week",comment:"Comment"});
  const [fixtureSort,setFixtureSort] = useState({key:null,dir:1});
  const sortedFixtures = fixtureSort.key ? [...fixtures].sort((a,b)=>fixtureSort.dir*String(a[fixtureSort.key]??"").localeCompare(String(b[fixtureSort.key]??""),undefined,{numeric:true,sensitivity:"base"})) : fixtures;
  const toggleFixtureSort = key=>setFixtureSort(p=>({key,dir:p.key===key?-p.dir:1}));
  const moveBenchmarkRow=(from,to)=>setBenchmarkRows(prev=>{if(to<0||to>=prev.length)return prev;const next=[...prev];next.splice(to,0,next.splice(from,1)[0]);return next;});
  const reportHeadingStyle={background:"#d8e7f8",color:"#0b2850",padding:"7px 10px",borderLeft:"4px solid #377dc8",fontWeight:800,fontSize:12,letterSpacing:"0.055em",textTransform:"uppercase"};
  // Export-only visibility: keep the underlying fixtures and benchmark rows intact.
  const [excludedFixtureIds, setExcludedFixtureIds] = useState([]);
  const [excludedBenchmarkKeys, setExcludedBenchmarkKeys] = useState([]);
  const [excludedCharterers, setExcludedCharterers] = useState([]);
  const [recipientCharterer, setRecipientCharterer] = useState("");
  const fixtureId = (f, i) => String(f._reportExportId || `legacy-${i}`);
  const chartererKey = v => String(v || "").trim().toUpperCase().replace(/\s+/g, " ");
  const reportCharterers = [...new Set(fixtures.map(f => chartererKey(f.charterer)).filter(Boolean))].sort();
  const chartererIsExcluded = f => excludedCharterers.includes(chartererKey(f.charterer)) || (!!recipientCharterer && chartererKey(f.charterer) === recipientCharterer);
  const fixtureIsIncluded = (f, i) => !excludedFixtureIds.includes(fixtureId(f, i)) && !chartererIsExcluded(f);
  const visibleExportFixtures = sortedFixtures.filter(f =>
    fixtureIsIncluded(f, fixtures.indexOf(f))
  );
  const toggleExcluded = (setter, value) => setter(p => p.includes(value) ? p.filter(x => x !== value) : [...p, value]);
  const exportCheckboxStyle = {width:14,height:14,accentColor:"#377dc8",cursor:"pointer"};
  const [emailSections,setEmailSections] = useState({drivers:true,rates:true,tce:true,handy:true,fixtures:true,tceChart:false,fixingChart:false});
  const emailSectionTick = (key) => <label className="no-export" title="Toggle inclusion in exported report" style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:10,color:C.tx,cursor:"pointer",whiteSpace:"nowrap",marginLeft:"auto",fontWeight:500,textTransform:"none",letterSpacing:0}} onClick={()=>setEmailSections(p=>({...p,[key]:!p[key]}))}><span style={{width:14,height:14,display:"inline-flex",alignItems:"center",justifyContent:"center",background:emailSections[key]?"#225c9d":"#10213b",border:"1px solid #5d789d",borderRadius:3,color:"#fff",fontSize:11,fontWeight:800}}>{emailSections[key]?"✓":""}</span> Include</label>;
  const lightExportRef = useRef(null);
  async function captureMarketPng() {
    const lib = await loadHTI();
    return lib.toPng(lightExportRef.current, { backgroundColor: "#ffffff", pixelRatio: 2, filter: node => !node.classList?.contains("no-export") });
  }
  async function handleMarketCopyEmail() {
    setMarketExportStatus("Copying...");
    try {
      const lib = await loadHTI();
      const blob = await lib.toBlob(lightExportRef.current, { backgroundColor: "#ffffff", pixelRatio: 2, filter: node => !node.classList?.contains("no-export") });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setMarketExportStatus("Copied — paste into your email body.");
    } catch (e) { setMarketExportStatus("Copy failed: " + e.message); }
    setTimeout(() => setMarketExportStatus(""), 3000);
  }
  async function handleMarketDownloadPng() {
    setMarketExportStatus("Rendering...");
    try { const url = await captureMarketPng(); const a = document.createElement("a"); a.download = `${reportType || "market"}-report-${reportDate}.png`; a.href = url; a.click(); setMarketExportStatus("Downloaded."); }
    catch (e) { setMarketExportStatus("Failed: " + e.message); }
    setTimeout(() => setMarketExportStatus(""), 3000);
  }

  // ── Market report ─────────────────────────────────────────────────────────
  async function loadSavedReports() {
    try { const { data } = await supabase.from("reports").select("*").order("created_at", { ascending: false }); if (Array.isArray(data)) setSavedReports(data); } catch {}
  }
  async function deleteSavedReport() {
    if (!pendingSavedDelete) return;
    setDeleteReportError("");
    setDeleteReportBusy(true);
    try {
      const { error } = await supabase.from("reports").delete().eq("id", pendingSavedDelete.id);
      if (error) throw error;
      setSavedReports(prev => (Array.isArray(prev)?prev:[]).filter(r => r.id !== pendingSavedDelete.id));
      if (activeMarketReportId === pendingSavedDelete.id) setActiveMarketReportId(null);
      if(activePositionId===pendingSavedDelete.id)setActivePositionId(null);
      if(activeQuickId===pendingSavedDelete.id)setActiveQuickId(null);
      setPendingSavedDelete(null);
    } catch (e) { setDeleteReportError(e.message || "Could not delete report"); }
    finally { setDeleteReportBusy(false); }
  }
  function initRateGrid(type) {
    const G = {
      "Intermediate": { "5kt": { "ARA-Dublin": "", "ARA-Thames": "", "Mongstad-ARA": "" }, "10kt": { "ARA-Dublin": "", "ARA-Thames": "", "Mongstad-ARA": "" }, "18kt": { "ARA-Dublin": "", "ARA-Thames": "", "Mongstad-ARA": "" } },
      "Asia to Europe": { "25kt": { "Sing-ARA": "", "China-ARA": "" }, "35kt": { "Sing-ARA": "", "China-ARA": "" }, "45kt": { "Sing-ARA": "", "China-ARA": "" } },
      "Transatlantic": { "30kt": { "ARA-USG": "", "USG-ARA": "" }, "37kt": { "ARA-USG": "", "USG-ARA": "" } },
      "TimeCharter": { "12m": { "10k": "", "15k": "", "20k": "" }, "24m": { "10k": "", "15k": "", "20k": "" } },
    };
    setRateGrid(G[type] || {});
  }
  // Position List save/load — the Position List had a "Saved" display but no
  // actual way to create a save; saveReport()/loadReport() above only ever
  // handled Market report fields (commentary/rates/fixtures), never the
  // vessel list itself.
  const [posSaveStatus, setPosSaveStatus] = useState("");
  async function savePositionList(){
    if(listSaveBusy)return;setListSaveBusy(true);setPosSaveStatus("Saving...");
    try{
      const name=marketReportSaveName(positionReportName||posTitle,"Position List",positionSaveCopy,savedReports);
      const payload={report_type:"Position List",report_date:posDate,pos_title:posTitle,pos_subtitle:posSubtitle,pos_vessels:reportVessels,
        rate_grid:{__positionEditor:{name,columns:positionColumns,chartSettings:positionChartSettings,charts:positionCharts,posGroupBy,regionMode,outputSort,sortByDate,segmentNames,width:positionPreviewWidth}}};
      const query=activePositionId&&!positionSaveCopy?supabase.from("reports").update(payload).eq("id",activePositionId):supabase.from("reports").insert([payload]);
      const {data,error}=await query.select("id").single();if(error)throw error;
      setActivePositionId(data.id);setPositionReportName(name);setPositionSaveCopy(false);setPosSaveStatus("Saved ✓");await loadSavedReports();
    }catch(error){setPosSaveStatus("Save failed: "+(error.message||error));}
    finally{setListSaveBusy(false);setTimeout(()=>setPosSaveStatus(""),3500);}
  }
  async function loadPositionList(id){
    try{
      const {data,error}=await supabase.from("reports").select("*").eq("id",id).single();if(error)throw error;if(!data)return;
      const editor=data.rate_grid?.__positionEditor||{},rows=normalizePositionRows(data.pos_vessels);
      setPosTitle(data.pos_title||"CHEMS & SPECIALIZED POSITION LIST");setPosSubtitle(data.pos_subtitle||"");setPosDate(data.report_date||posDate);
      setPositionReportName(editor.name||data.pos_title||"");setActivePositionId(id);setPositionSaveCopy(false);
      setPositionColumns(Array.isArray(editor.columns)&&editor.columns.length?editor.columns:DEFAULT_POSITION_COLUMNS);
      const settings={...defaultPositionChartSettings(),...editor.chartSettings};setPositionChartSettings(settings);setPositionChartDraft(settings);
      setPositionCharts(editor.charts||{open:true,fixing:true});setPosGroupBy(editor.posGroupBy||"segment");setRegionMode(editor.regionMode||"superRegion");
      setOutputSort(editor.outputSort||{key:null,desc:false});setSortByDate(!!editor.sortByDate);setSegmentNames(editor.segmentNames||{});setPositionPreviewWidth(editor.width||820);
      importedNames.current=new Set(rows.map(v=>v.vessel));setReportVessels(rows);setEditingRid(null);setPendingClear(null);setSection("poslist");
    }catch(error){setPosSaveStatus("Load failed: "+(error.message||error));}
  }

  async function openPriorReportImport(){
    await loadSavedReports();setPriorReportChoice("");setPriorReportStatus("");setPriorReportOpen(true);
  }
  function importPriorReport(){
    const candidates=savedReports.filter(r=>r.report_type==="Intermediate"&&reportWeek(r.report_date||"")&&reportWeek(r.report_date)<reportWeek(reportDate)).sort((a,b)=>String(b.report_date).localeCompare(String(a.report_date)));
    const same=candidates.find(r=>r.rate_grid?.__marketEditor?.reportName===reportName);
    const source=candidates.find(r=>String(r.id)===priorReportChoice)||same||candidates[0];
    if(!source){setPriorReportStatus("No saved Intermediate report from an earlier week.");return;}
    const editor=source.rate_grid?.__marketEditor||{},prior=editor.benchmarks||[];
    const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");let matched=0;
    setBenchmarkRows(rows=>rows.map(row=>{const hit=prior.find(x=>x.key===row.key)||prior.find(x=>norm(x.label)===norm(row.label));if(!hit)return row;matched++;return {...row,lastWeek:hit.freight??"",tceLastWeek:hit.tce??null};}));
    setWeeklyHistory(current=>{const incoming=editor.weeklyHistory||{series:{}};const series={...current.series};for(const [key,values] of Object.entries(incoming.series||{}))series[key]={...values,...series[key]};return {...current,routeKey:current.routeKey||incoming.routeKey||"",series};});
    setRouteColumns(p=>({...p,lastWeek:true}));setPriorReportOpen(false);setPriorReportStatus(`Imported last-week rates and history from ${source.rate_grid?.__marketEditor?.reportName||source.report_type} · ${source.report_date}. Unmatched routes retained.`);
  }

  async function saveReport() {
    if (marketSaveBusy) return;
    setMarketSaveBusy(true); setMarketSaveStatus("Saving...");
    try {
      const savedName=marketReportSaveName(reportName,reportType,saveReportCopy,savedReports);
      const payload = { report_type: reportType, report_date: reportDate, commentary,
        rate_grid: { ...rateGrid, __marketEditor: { headings: marketHeadings, intermediateTitle, reportName:savedName, asiaReport, weeklyHistory:trimWeeklyHistory(weeklyHistory,reportDate),
          benchmarks: benchmarkRows, drivers: driverBullets, tceStats, handy, handyCommentary, handySegments, importedFixingChart,routeColumns,routeTitles,intermediateRoutesLabel,marketHeadings, excludedFixtureIds, excludedBenchmarkKeys, excludedCharterers, recipientCharterer } },
        tce_earnings: tceEarnings, fixtures:fixtures.map(normalizeReportFixture), quotes };
      // A copy always inserts a new report, even when its date matches the original.
      const query = activeMarketReportId && !saveReportCopy
        ? supabase.from("reports").update(payload).eq("id", activeMarketReportId).select("id").single()
        : supabase.from("reports").insert([payload]).select("id").single();
      const { data, error } = await query;
      if (error) throw error;
      if (data?.id) setActiveMarketReportId(data.id);
      setReportName(savedName);setSaveReportCopy(false);
      setMarketSaveStatus("Saved!");
      await loadSavedReports();
    } catch (e) { setMarketSaveStatus("Save failed: " + (e.message || e)); }
    finally { setMarketSaveBusy(false); setTimeout(() => setMarketSaveStatus(""), 2800); }
  }
  async function loadReport(id) {
    try {
      const { data, error } = await supabase.from("reports").select("*").eq("id", id).single();
      if (error || !data) return;
      setAsiaReport(normalizeAsiaReport(data.rate_grid?.__marketEditor?.asiaReport || asiaBlank()));
      setReportType(data.report_type); setReportDate(data.report_date || reportDate);
      setCommentary(data.commentary || ""); setRateGrid(data.rate_grid && typeof data.rate_grid==="object" ? data.rate_grid : {});
      setImportedFixingChart(data.rate_grid?.__marketEditor?.importedFixingChart||null);
      setTceEarnings(data.tce_earnings && typeof data.tce_earnings==="object" ? data.tce_earnings : {}); setFixtures(Array.isArray(data.fixtures)?data.fixtures.map(normalizeReportFixture):[]); setQuotes(Array.isArray(data.quotes)?data.quotes:[]);
      const editor = data.rate_grid?.__marketEditor;
      setWeeklyHistory(editor?.weeklyHistory||{routeKey:"",series:{}});
      setReportName(editor?.reportName || "");setSaveReportCopy(false);
      setIntermediateTitle(editor?.intermediateTitle || "Intermediate Summary");
      setExcludedFixtureIds(Array.isArray(editor?.excludedFixtureIds)?editor.excludedFixtureIds:[]);
      setExcludedBenchmarkKeys(Array.isArray(editor?.excludedBenchmarkKeys)?editor.excludedBenchmarkKeys:[]);
      setExcludedCharterers(Array.isArray(editor?.excludedCharterers)?editor.excludedCharterers:[]);
      setRecipientCharterer(editor?.recipientCharterer || "");
      if (editor) {
        if (editor.headings) setMarketHeadings(p => ({...p,...editor.headings}));
        if (Array.isArray(editor.benchmarks)) setBenchmarkRows(editor.benchmarks);
        if (Array.isArray(editor.drivers)) setDriverBullets(editor.drivers);
        if (editor.tceStats) setTceStats(editor.tceStats);
        if (editor.handy) setHandy(editor.handy);
        setHandyCommentary(editor.handyCommentary || "");
        if (Array.isArray(editor.handySegments)) setHandySegments(editor.handySegments);
        if (typeof editor.intermediateRoutesLabel === "string") setIntermediateRoutesLabel(editor.intermediateRoutesLabel);
        if (editor.marketHeadings) setMarketHeadings(p=>({...p,...editor.marketHeadings}));
        if(editor.routeColumns)setRouteColumns(editor.routeColumns);
        if(editor.routeTitles)setRouteTitles(editor.routeTitles);
      }
      setActiveMarketReportId(id);
      setSection("market");
    } catch (e) { console.error("loadReport:",e); }
  }

  // ── Quick Positions save/load — same "reports" table, so drafts pick up
  // instantly on any device you're signed into, not just localStorage.
  const [quickSaveStatus, setQuickSaveStatus] = useState("");
  async function saveQuickPositions(){
    if(listSaveBusy)return;setListSaveBusy(true);setQuickSaveStatus("Saving...");
    try{
      const name=marketReportSaveName(quickReportName||quickTitle,"Quick Positions",quickSaveCopy,savedReports);
      const payload={report_type:"Quick Positions",report_date:new Date().toISOString().slice(0,10),rate_grid:{__quickEditor:{name,title:quickTitle,rows:quickRows,selectedTags:quickSelectedTags,updatedFilter:quickUpdatedFilter,excludedOperators:quickExcludedOperators,tableSort:quickTableSort}}};
      const query=activeQuickId&&!quickSaveCopy?supabase.from("reports").update(payload).eq("id",activeQuickId):supabase.from("reports").insert([payload]);
      const {data,error}=await query.select("id").single();if(error)throw error;
      setActiveQuickId(data.id);setQuickReportName(name);setQuickSaveCopy(false);setQuickSaveStatus("Saved ✓");await loadSavedReports();
    }catch(error){setQuickSaveStatus("Save failed: "+(error.message||error));}
    finally{setListSaveBusy(false);setTimeout(()=>setQuickSaveStatus(""),3500);}
  }
  async function loadQuickPositions(id){
    try{
      const {data,error}=await supabase.from("reports").select("*").eq("id",id).single();if(error)throw error;if(!data)return;
      setQuickTitle(savedQuickTitle(data));setQuickReportName(data.rate_grid?.__quickEditor?.name||savedQuickTitle(data));setActiveQuickId(id);setQuickSaveCopy(false);
      setQuickUpdatedFilter(data.rate_grid?.__quickEditor?.updatedFilter||"all");
      setQuickExcludedOperators(data.rate_grid?.__quickEditor?.excludedOperators||[]);
      setQuickTableSort(data.rate_grid?.__quickEditor?.tableSort||{key:null,desc:false});
      setQuickSelectedTags(Array.isArray(data.rate_grid?.__quickEditor?.selectedTags)?data.rate_grid.__quickEditor.selectedTags:[]);
      setQuickRows(savedQuickRows(data).map(r=>({...r,id:r.id||newPositionId()})));setPendingClear(null);setSection("quick");
    }catch(error){setQuickSaveStatus("Load failed: "+(error.message||error));}
  }

  const SB = { background:C.bg3,color:C.tx,fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 5, cursor: "pointer", border: "1px solid " + C.bd, fontFamily: "inherit", whiteSpace: "nowrap" };
  const IS = { background: C.bg3, border: "1px solid " + C.bd, borderRadius: 5, color: C.tx, fontSize: 11, padding: "5px 8px", outline: "none", fontFamily: "inherit" };
  const rateValues=Object.entries(rateGrid||{}).filter(([key,value])=>key!=="__marketEditor"&&value&&typeof value==="object").flatMap(([,group])=>Object.values(group).filter(v=>v!==null&&v!==undefined&&v!==""));
  const avgRate = rateValues.map(v=>parseFloat(v)||0).reduce((a,b)=>a+b,0)/Math.max(1,rateValues.length)||0;
  const avgTCE = Object.values(tceEarnings).filter(v => v).map(v => parseFloat(v) || 0).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(tceEarnings).filter(v => v).length) || 0;

  // Load vessel→operator lookup when Quick tab opens
  useEffect(() => {
    if (section !== "quick" || Object.keys(vesselOpDb).length > 0) return;
    async function fetchVesselOps() {
      try {
        // Try vessels_db first, fallback to positions_latest
        const { data: dbData } = await supabase
          .from("vessels_db").select("vessel_name, operator").not("operator", "is", null);
        const { data: posData } = await supabase
          .from("positions_latest").select("vessel, operator").not("operator", "is", null);
        const lookup = {};
        (posData || []).forEach(r => { if (r.vessel && r.operator) lookup[r.vessel.toUpperCase().trim()] = r.operator; });
        (dbData || []).forEach(r => { if (r.vessel_name && r.operator) lookup[r.vessel_name.toUpperCase().trim()] = r.operator; });
        setVesselOpDb(lookup);
      } catch (e) { console.error("vesselOpDb:", e); }
    }
    fetchVesselOps();
  }, [section]);
  // ── Quick Positions helpers ───────────────────────────────────────────────
  function lookupOp(vesselName) {
    if (!vesselName || !Object.keys(vesselOpDb).length) return "";
    const key = vesselName.toUpperCase().trim();
    if (vesselOpDb[key]) return vesselOpDb[key];
    const match = Object.keys(vesselOpDb).find(k => k.startsWith(key) || key.startsWith(k));
    return match ? vesselOpDb[match] : "";
  }

  async function parsePaste() {
    if (!quickPaste.trim()) { setQuickParseMsg("Paste some positions first."); return; }
    // Normalize invisible/non-standard characters that different sources
    // (PDF exports, Numbers/Excel, WhatsApp) sometimes embed — these look
    // identical to a normal space/newline but silently break regex matching.
    const raw = quickPaste
      .replace(/\r\n?/g, "\n")                          // CRLF/CR -> LF
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")  // NBSP + various Unicode spaces -> regular space
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, "");        // zero-width chars/BOM -> remove
    const lines = raw.split("\n").map(l => l.trim());
    const nonEmpty = lines.filter(Boolean);

    // ── Format A: Tab-separated (TSV from Excel/email tables) ─────────────────
    const tabLines = lines.filter(l => (l.match(/\t/g) || []).length >= 2);
    if (tabLines.length >= 2) {
      const hdrIdx = lines.findIndex(l => /vessel/i.test(l) || /position/i.test(l));
      let ci = { vessel: 0, port: 5, date: 6, comment: 7 };
      if (hdrIdx >= 0) {
        const hdrs = lines[hdrIdx].toLowerCase().split("\t").map(h => h.trim());
        ci = {
          vessel:  hdrs.findIndex(h => h === "vessel"),
          port:    hdrs.findIndex(h => h === "position" || h === "port" || h === "open port"),
          date:    hdrs.findIndex(h => h === "date"),
          comment: hdrs.findIndex(h => h === "comment"),
        };
      }
      const rows = []; let curRegion = "";
      lines.forEach(line => {
        if (!line.trim()) return;
        const cols = line.split("\t").map(c => c.trim());
        if (cols.length <= 1) { curRegion = cols[0].toUpperCase(); return; }
        const vessel = (cols[ci.vessel >= 0 ? ci.vessel : 0] || "").toUpperCase();
        if (!vessel) return;
        const port = (cols[ci.port >= 0 ? ci.port : 5] || "").toUpperCase();
        const date = (cols[ci.date >= 0 ? ci.date : 6] || "").toUpperCase();
        const dir  = ci.comment >= 0 ? (cols[ci.comment] || "") : "";
        rows.push({ id:"q"+Date.now()+Math.random().toString(36).slice(2), operator: lookupOp(vessel), vessel, port, date, direction: dir || curRegion });
      });
      if (rows.length) {
        appendQuickRows(rows); setQuickPaste("");
        const m = rows.filter(r=>!r.operator).length;
        setQuickParseMsg("✓ "+rows.length+" position"+(rows.length!==1?"s":"")+" parsed from table"+(m?" — "+m+" operators not found.":"."));
        return;
      }
    }

    // ── Format B: Column-per-line (each cell on its own line, from PDF/email copy) ─
    // Detect: several of the first lines are single known column-header words
    const KNOWN_HDRS = ["vessel","dwt","cbm","built","last cargo","position","date","comment","loa","beam"];
    const firstFew = nonEmpty.slice(0, 12).map(l => l.toLowerCase().trim());
    const hdrCount = firstFew.filter(l => KNOWN_HDRS.some(h => l === h || l.startsWith(h))).length;
    if (hdrCount >= 3) {
      // Find how many header columns there are (consecutive known-header lines at start)
      let colCount = 0;
      for (const l of nonEmpty) {
        if (KNOWN_HDRS.some(h => l.toLowerCase() === h || l.toLowerCase().startsWith(h))) colCount++;
        else break;
      }
      colCount = colCount || 8;
      // Build column name → index map
      const headers = nonEmpty.slice(0, colCount).map(l => l.toLowerCase().trim());
      const ci2 = {
        vessel:  headers.findIndex(h => h === "vessel"),
        port:    headers.findIndex(h => h === "position" || h === "port"),
        date:    headers.findIndex(h => h === "date"),
        comment: headers.findIndex(h => h === "comment"),
      };
      const dataLines = nonEmpty.slice(colCount);
      const rows = []; let curRegion = "";
      for (let i = 0; i < dataLines.length; i += colCount) {
        const group = dataLines.slice(i, i + colCount);
        while (group.length < colCount) group.push("");
        // Single value + rest empty = region header
        if (group[0] && group.slice(1).every(f => !f.trim())) {
          curRegion = group[0].toUpperCase(); continue;
        }
        const vessel = (group[ci2.vessel >= 0 ? ci2.vessel : 0] || "").toUpperCase();
        if (!vessel) continue;
        const port    = (group[ci2.port    >= 0 ? ci2.port    : 5] || "").toUpperCase();
        const date    = (group[ci2.date    >= 0 ? ci2.date    : 6] || "").toUpperCase();
        const comment = ci2.comment >= 0 ? (group[ci2.comment] || "") : "";
        rows.push({ id:"q"+Date.now()+Math.random().toString(36).slice(2), operator: lookupOp(vessel), vessel, port, date, direction: comment || curRegion });
      }
      if (rows.length) {
        appendQuickRows(rows); setQuickPaste("");
        const m = rows.filter(r=>!r.operator).length;
        setQuickParseMsg("✓ "+rows.length+" position"+(rows.length!==1?"s":"")+" parsed"+(m?" — "+m+" operators not found.":"."));
        return;
      }
    }

    // ── Format C: Dash-separated (WhatsApp/email, original format) ─────────────
    const MN = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    function fmtDate(str) {
      // DD.MM. → "D MMM"
      const dot = str.match(/(\d{1,2})\.(\d{1,2})\.?/);
      if (dot) { const d=parseInt(dot[1]),m=parseInt(dot[2])-1; return `${d} ${MN[m]||dot[2]}`; }
      // DD MMM already
      const txt = str.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
      if (txt) return `${parseInt(txt[1])} ${txt[2].toUpperCase()}`;
      return str.toUpperCase();
    }
    function extractFromText(text) {
      // Date: try DD.MM. first, then D MMM
      let date = "", port = "";
      const dotM = text.match(/(\d{1,2})\.(\d{1,2})\.?\s*(?:\d{2,4})?/);
      const txtM = text.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
      if (dotM) { date = fmtDate(dotM[0]); text = text.replace(dotM[0], " ").trim(); }
      else if (txtM) { date = fmtDate(txtM[0]); text = text.replace(txtM[0], " ").trim(); }
      // Port: word after "open" keyword OR last uppercase word(s) remaining
      const openM = text.match(/\bopen\s+([A-Z]{2,})/i);
      if (openM) { port = openM[1].toUpperCase(); }
      else {
        // Take the last non-comment word (skip "CII", "rating", single letters)
        const words = text.split(/\s+/).filter(w => w.length >= 2 && !/^(CII|RATING|OPEN|THE|AND|OR|WITH|CLEAN|DIRTY|ANY|DIRECTION|ALL|OPTION|!!+)$/i.test(w));
        if (words.length) port = words[words.length-1].toUpperCase();
      }
      return { port, date };
    }

    const rows = []; let curOp = "";
    nonEmpty.forEach(line => {
      const openRow=parseQuickOpenLine(line);
      if(openRow){rows.push({...openRow,id:newPositionId(),operator:curOp||lookupOp(openRow.vessel)});return;}
      if (/^\*[^*]+\*$/.test(line) || /^_[^_]+_$/.test(line)) {
        curOp = line.replace(/[*_]/g, "").trim(); return;
      }
      const parts = line.split(/\s*[\u2013\u2014]\s*|\s+-\s+/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const vessel = parts[0].toUpperCase();
        const rest = parts.slice(1).join(" ");
        const { port, date } = extractFromText(rest);
        const op = curOp || lookupOp(vessel);
        rows.push({ id:"q"+Date.now()+Math.random().toString(36).slice(2), operator: op, vessel, port, date, direction: "" });
      } else if (line.length > 1 && !line.startsWith("||")) {
        curOp = line.replace(/[*_]/g, "").trim();
      }
    });
    if (!rows.length) {
      // ── Format D: one field per line, grouped per vessel (e.g. gas/chem
      // position lists) — no header row, variable blank-line spacing between
      // blocks. Anchor on the DWT-range line ("17.999 / 19.844"), since it's
      // the one line pattern that reliably appears exactly once per vessel.
      const DWT_RE = /^\d[\d.,]*\s*\/\s*\d[\d.,]*$/;
      const YEAR_RE = /^(19|20)\d{2}$/;
      const ICE_RE = /^[1-3][A-C]$/i;
      const DATE_RE = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;

      const anchors = [];
      lines.forEach((l, i) => { if (DWT_RE.test(l)) anchors.push(i); });

      if (anchors.length) {
        const dRows = [];
        anchors.forEach((idx, ai) => {
          // Walk backward for built year, then vessel name
          let year = "", vessel = "";
          for (let j = idx - 1; j >= 0 && j >= idx - 6; j--) {
            const l = lines[j];
            if (!l.trim()) continue;
            if (!year && YEAR_RE.test(l.trim())) { year = l.trim(); continue; }
            if (year && l.trim() && !YEAR_RE.test(l.trim())) { vessel = l.trim().toUpperCase(); break; }
          }
          if (!vessel) return;

          // Walk forward (until the next anchor) for ice class, cargo types, port, date, destination
          const forwardEnd = ai + 1 < anchors.length ? anchors[ai + 1] : Math.min(lines.length, idx + 8);
          const rest = lines.slice(idx + 1, forwardEnd).map(l => l.trim()).filter(Boolean);
          let ri = 0;
          let iceClass = "", cargoTypes = "", port = "", dateStr = "", destination = "";
          if (rest[ri] && ICE_RE.test(rest[ri])) { iceClass = rest[ri]; ri++; }
          if (rest[ri]) { cargoTypes = rest[ri]; ri++; }
          if (rest[ri]) { port = rest[ri].toUpperCase(); ri++; }
          if (rest[ri]) {
            const m = rest[ri].match(DATE_RE);
            dateStr = m ? fmtDate(m[0]) : rest[ri].toUpperCase();
            ri++;
          }
          if (rest[ri]) { destination = rest[ri].replace(/\s{2,}/g, " ").toUpperCase(); ri++; }

          dRows.push({
            id: "q" + Date.now() + Math.random().toString(36).slice(2),
            operator: lookupOp(vessel), vessel, port, date: dateStr,
            direction: destination,
            comment: [year && "built " + year, iceClass, cargoTypes].filter(Boolean).join(" · "),
          });
        });
        if (dRows.length) {
          appendQuickRows(dRows); setQuickPaste("");
          const m = dRows.filter(r => !r.operator).length;
          setQuickParseMsg("✓ " + dRows.length + " position" + (dRows.length !== 1 ? "s" : "") + " parsed" + (m ? " — " + m + " operators not found." : "."));
          return;
        }
      }
    }

    if (!rows.length) {
      // ── Format E: single line per vessel, space-separated —
      // "VESSEL (multi-word) PORT DAY", no dashes, no month (day-of-month
      // only, assumed to mean the current month). A standalone short line
      // right before or after the block (e.g. "stenersen") is treated as a
      // shared operator applying to every vessel in the block.
      const LINE_RE = /^(.+?)\s+([A-Za-z]{2,})\s+(\d{1,2})$/;
      const MN2 = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
      const curMonth = MN2[new Date().getMonth()];
      const matchIdx = [];
      nonEmpty.forEach((line, i) => { if (LINE_RE.test(line)) matchIdx.push(i); });

      let sharedOperator = "";
      const looksLikeOperatorLine = (line) => line && line.split(/\s+/).length <= 3 && !/\d/.test(line) && !LINE_RE.test(line);
      if (matchIdx.length) {
        const before = nonEmpty[matchIdx[0] - 1];
        const after = nonEmpty[matchIdx[matchIdx.length - 1] + 1];
        if (looksLikeOperatorLine(after)) sharedOperator = after.toUpperCase();
        else if (looksLikeOperatorLine(before)) sharedOperator = before.toUpperCase();
      }

      const eRows = [];
      matchIdx.forEach(i => {
        const line = nonEmpty[i];
        const m = line.match(LINE_RE);
        const vessel = m[1].toUpperCase();
        const port = m[2].toUpperCase();
        const day = parseInt(m[3]);
        if (day < 1 || day > 31) return;
        eRows.push({
          id: "q" + Date.now() + Math.random().toString(36).slice(2),
          operator: sharedOperator || lookupOp(vessel), vessel, port, date: `${day} ${curMonth}`, direction: "",
        });
      });
      if (eRows.length) {
        appendQuickRows(eRows); setQuickPaste("");
        const m = eRows.filter(r => !r.operator).length;
        setQuickParseMsg("✓ " + eRows.length + " position" + (eRows.length !== 1 ? "s" : "") + " parsed" + (sharedOperator ? " — operator \"" + sharedOperator + "\" applied to all" : "") + " — date assumed current month (" + curMonth + "), check before sending" + (m ? "; " + m + " operators not found." : "."));
        return;
      }
    }

    if (!rows.length) {
      // ── Format F: AI fallback — none of the deterministic formats above
      // confidently matched. Send the raw text to Claude, which handles
      // headers, region markers, optional/missing fields, and arbitrary
      // layouts without needing a bespoke parser for every new source.
      setQuickImgParsing(true);
      setQuickParseMsg("No fixed pattern matched — trying AI parsing...");
      try {
        const resp = await fetch("/api/parse-positions-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: raw }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || `Server error ${resp.status}`);
        }
        const json = await resp.json();
        const rawText = (json.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
        let parsed;
        try { parsed = JSON.parse(rawText); } catch { throw new Error("Could not parse AI response"); }
        const aiRows = (Array.isArray(parsed) ? parsed : []).filter(r => r.vessel).map(r => ({
          id: "q" + Date.now() + Math.random().toString(36).slice(2),
          operator: r.operator || lookupOp(r.vessel), vessel: (r.vessel || "").toUpperCase(),
          port: (r.port || "").toUpperCase(), date: r.date || "", direction: r.comment ?? r.direction ?? "",
        }));
        setQuickImgParsing(false);
        if (aiRows.length) {
          appendQuickRows(aiRows); setQuickPaste("");
          const m = aiRows.filter(r => !r.operator).length;
          setQuickParseMsg("✓ " + aiRows.length + " position" + (aiRows.length !== 1 ? "s" : "") + " parsed by AI — check dates/fields before sending" + (m ? "; " + m + " operators not found." : "."));
        } else {
          setQuickParseMsg("AI couldn't find any positions in this text either. Try a screenshot instead, or check the format.");
        }
      } catch (err) {
        console.error("AI positions parse:", err);
        setQuickImgParsing(false);
        setQuickParseMsg("AI parsing failed: " + err.message);
      }
      return;
    }
    rows.forEach(r => { if (!r.operator) r.operator = lookupOp(r.vessel); });
    appendQuickRows(rows); setQuickPaste("");
    const missing = rows.filter(r => !r.operator).length;
    setQuickParseMsg("\u2713 "+rows.length+" position"+(rows.length!==1?"s":"")+" added"+(missing?" \u2014 "+missing+" operator(s) not found, fill in manually.":"."));
  }

  function appendQuickRows(rows){setQuickRows(p=>[...p,...stampQuickRows(rows)]);}
  function addQuickRow() {
    appendQuickRows([{id:newPositionId(),operator:"",vessel:"",port:"",date:"",direction:""}]);
  }
  function updateQuickRow(id,field,val){
    setQuickRows(p=>p.map(r=>r.id===id?{...r,[field]:val,...(field==="direction"?{comment:val}:{}),...(!r._quickTagImported?{_quickAddedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}: {})}:r));
  }
  function deleteQuickRow(id) { setQuickRows(p => p.filter(r => r.id!==id)); }

  function buildQuickText(whatsapp=false) {
    if (!quickOutputRows.length) return "";
    const byOp = new Map();
    quickOutputRows.forEach(r=>{const key=quickOperatorKey(r.operator);if(!byOp.has(key))byOp.set(key,[]);byOp.get(key).push(r);});
    const lines=["|| "+quickDisplayText(quickTitle)+" ||",""];
    byOp.forEach((rows,key)=>{
      const op=quickDisplayText(key);lines.push(whatsapp?"*"+op+"*":op);
      [...rows].sort((a,b)=>dateSortKey(quickDisplayDate(a.date))-dateSortKey(quickDisplayDate(b.date))).forEach(r=>lines.push(quickRowLine(r)));
      lines.push("");
    });
    return lines.join("\n").trim();
  }
  function buildQuickTextByDate() {
    if (!quickOutputRows.length) return "";
    const sorted=[...quickOutputRows].sort((a,b)=>dateSortKey(quickDisplayDate(a.date))-dateSortKey(quickDisplayDate(b.date)));
    return ["|| "+quickDisplayText(quickTitle)+" ||","",...sorted.map(r=>quickRowLine(r,true))].join("\n").trim();
  }

  const [quickCopiedDate, setQuickCopiedDate] = useState(false);
  async function copyQuickByDate() {
    const text = buildQuickTextByDate(); if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch { const ta=document.createElement("textarea"); ta.value=text; ta.style.cssText="position:fixed;top:0;left:0;width:2px;height:2px;background:transparent;"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    setQuickCopiedDate(true); setTimeout(()=>setQuickCopiedDate(false), 2500);
  }

  const [quickImgParsing, setQuickImgParsing] = useState(false);

  async function handleImagePaste(e) {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(i => i.type.startsWith("image/"));
    if (!imgItem) return; // no image — let default text paste through
    e.preventDefault();
    setQuickImgParsing(true);
    setQuickParseMsg("Reading image...");
    try {
      const file = imgItem.getAsFile();
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      setQuickParseMsg("Extracting positions from image...");
      const resp = await fetch("/api/parse-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64, mediaType: file.type || "image/png" }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${resp.status}`);
      }
      const json = await resp.json();
      const raw = (json.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
      let parsed;
      try { parsed = JSON.parse(raw); } catch { throw new Error("Could not parse API response — try text paste instead"); }
      if (!Array.isArray(parsed) || !parsed.length) throw new Error("No positions found in image");
      const rows = parsed.map(r => ({
        id: "q" + Date.now() + Math.random().toString(36).slice(2),
        operator: r.operator || lookupOp((r.vessel || "").toUpperCase()) || "",
        vessel: (r.vessel || "").toUpperCase(),
        port: (r.port || "").toUpperCase(),
        date: (r.date || "").toUpperCase(),
        direction: r.comment ?? r.direction ?? ""
      }));
      appendQuickRows(rows);
      const missing = rows.filter(r => !r.operator).length;
      setQuickParseMsg(`✓ ${rows.length} position${rows.length !== 1 ? "s" : ""} extracted from image${missing ? ` — ${missing} operator(s) not matched, fill manually` : "."}`);
    } catch (err) {
      console.error("imagePaste:", err);
      setQuickParseMsg("Image parse failed: " + err.message);
    } finally {
      setQuickImgParsing(false);
    }
  }

  async function copyQuick(whatsapp=false) {
    const text = buildQuickText(whatsapp); if (!text) return;
    try { await navigator.clipboard.writeText(text); }
    catch { const ta=document.createElement("textarea"); ta.value=text; ta.style.cssText="position:fixed;top:0;left:0;width:2px;height:2px;background:transparent;"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); }
    const setter=whatsapp?setQuickWhatsAppCopied:setQuickCopied;setter(true);setTimeout(()=>setter(false),2500);
  }

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: C.bg, fontFamily: "Inter,system-ui,sans-serif", overflow: "hidden" }}>
      <style>{`@media print{body>*{visibility:hidden;}.pos-print,.pos-print *{visibility:visible;}.pos-print{position:absolute;left:0;top:0;width:100%;}.pos-print-wrap{height:auto!important;overflow:visible!important;}.no-export,.exclude-position-chart{display:none!important;}}.pool-row:hover{background:rgba(58,130,246,0.14)!important;}`}</style>

      {fixingImportOpen && <div className="no-export" style={{position:"fixed",inset:0,zIndex:100001,background:"rgba(0,0,0,.76)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <div role="dialog" aria-modal="true" aria-label="Choose report for fixing-window import" style={{width:"min(480px,100%)",background:C.bg2,border:"1px solid "+C.bd,borderRadius:9,padding:20,color:C.tx,boxShadow:"0 24px 70px rgba(0,0,0,.6)"}}>
          <div style={{fontSize:17,fontWeight:750,marginBottom:8}}>Import fixing-window graph</div>
          <div style={{fontSize:12,color:C.dim,marginBottom:16}}>Import the selected Dashboard graph ({dashboardFixingImport?.period||"ALL"} · {dashboardFixingImport?.region||"All"}) into an Intermediate report.</div>
          <label style={{display:"block",fontSize:11,color:C.dim,marginBottom:6}}>DESTINATION REPORT</label>
          <select value={fixingImportChoice} onChange={e=>setFixingImportChoice(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:5,background:C.bg3,color:C.tx,border:"1px solid "+C.bd,fontSize:13}}>
            <option value="new">+ New Intermediate report</option>
            {(Array.isArray(savedReports)?savedReports:[]).filter(r=>r.report_type==="Intermediate").map(r=><option key={r.id} value={r.id}>{savedMarketReportName(r)} — {r.report_date||"No date"}</option>)}
          </select>
          <div style={{fontSize:11,color:C.dim,marginTop:12}}>The imported graph will replace the fixing-window graph in this report. Click Save afterwards to store it in Supabase.</div>
          {fixingImportError&&<div style={{color:"#ff8585",fontSize:12,marginTop:10}}>{fixingImportError}</div>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:20}}>
            <button disabled={fixingImportBusy} onClick={()=>{setFixingImportOpen(false);onDashboardFixingImportHandled?.();}} style={{padding:"9px 16px",background:"transparent",border:"1px solid "+C.bd,borderRadius:5,color:C.tx,cursor:"pointer"}}>Cancel</button>
            <button disabled={fixingImportBusy} onClick={confirmFixingImport} style={{padding:"9px 16px",background:"#2563eb",border:"1px solid #3b82f6",borderRadius:5,color:"white",fontWeight:700,cursor:"pointer"}}>{fixingImportBusy?"Importing…":"Import graph"}</button>
          </div>
        </div>
      </div>}

      {cargoImportOpen && <div className="no-export" style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,.72)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <div role="dialog" aria-modal="true" aria-label="Choose report for cargo import" style={{width:"min(480px,100%)",maxHeight:"85vh",overflowY:"auto",background:C.bg2,border:"1px solid "+C.bd,borderRadius:9,padding:20,boxShadow:"0 24px 70px rgba(0,0,0,.6)",color:C.tx}}>
          <div style={{fontSize:17,fontWeight:750,marginBottom:6}}>Import cargoes to report</div>
          <div style={{fontSize:12,color:C.dim,marginBottom:16}}>{selectedCargoes.length} cargo{selectedCargoes.length===1?"":"es"} selected from Cargoes. Choose a destination before importing.</div>
          <label style={{display:"block",fontSize:11,color:C.dim,marginBottom:6}}>DESTINATION REPORT</label>
          <select value={cargoImportChoice} onChange={e=>setCargoImportChoice(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:5,background:C.bg3,color:C.tx,border:"1px solid "+C.bd,fontSize:13}}>
            <option value="new">+ New Intermediate report</option>
            {(Array.isArray(savedReports)?savedReports:[]).filter(r=>MARKET_TYPES.includes(r.report_type)).map(r=><option key={r.id} value={r.id}>{savedMarketReportName(r)} — {r.report_date||"No date"}</option>)}
          </select>
          <div style={{fontSize:11,color:C.dim,marginTop:12}}>Imported cargoes will appear under Recent Fixtures. Review and save the report afterwards.</div>
          {cargoImportError&&<div style={{color:"#ff8585",fontSize:12,marginTop:10}}>{cargoImportError}</div>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:20}}>
            <button disabled={cargoImportBusy} onClick={()=>setCargoImportOpen(false)} style={{padding:"9px 16px",background:"transparent",border:"1px solid "+C.bd,borderRadius:5,color:C.tx,cursor:"pointer"}}>Cancel</button>
            <button disabled={cargoImportBusy} onClick={confirmCargoImport} style={{padding:"9px 16px",background:"#2563eb",border:"1px solid #3b82f6",borderRadius:5,color:"white",fontWeight:700,cursor:"pointer"}}>{cargoImportBusy?"Importing…":"Import cargoes"}</button>
          </div>
        </div>
      </div>}

      {priorReportOpen&&<div style={{position:"fixed",inset:0,zIndex:50000,background:"#0009",display:"flex",alignItems:"center",justifyContent:"center"}}><div role="dialog" aria-modal="true" aria-label="Import last week benchmark rates" style={{background:C.bg2,border:"1px solid "+C.bd,borderRadius:8,padding:20,width:500,color:C.tx}}><b>Import last week rates</b><p style={{fontSize:12,color:C.dim}}>Select the saved Intermediate report to use. Rates match by route identity or name, not table order. Its weekly history will also carry forward.</p><select value={priorReportChoice} onChange={e=>setPriorReportChoice(e.target.value)} style={{...IS,width:"100%"}}><option value="">Latest earlier report with the same name, otherwise latest earlier report</option>{savedReports.filter(r=>r.report_type==="Intermediate"&&reportWeek(r.report_date||"")&&reportWeek(r.report_date)<reportWeek(reportDate)).sort((a,b)=>String(b.report_date).localeCompare(String(a.report_date))).map(r=><option key={r.id} value={r.id}>{savedMarketReportName(r)} · {r.report_date}</option>)}</select><div style={{display:"flex",gap:8,marginTop:15}}><button onClick={importPriorReport} style={{...SB,background:"#174d7b",color:"white"}}>Import rates &amp; history</button><button onClick={()=>setPriorReportOpen(false)} style={SB}>Cancel</button></div>{priorReportStatus&&<p>{priorReportStatus}</p>}</div></div>}
      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <div style={{ width: 210, minWidth: 210, display: "flex", flexDirection: "column", background: C.bg2, borderRight: "1px solid " + C.bd, overflow: "hidden" }}>
        <div style={{ display: "flex", gap:8,padding:10,borderBottom: "1px solid " + C.bd, flexShrink: 0 }}>
          {[["poslist", "Positions"], ["market", "Market"]].map(([k, l]) => (
            <button key={k} onClick={() => setSection(k === "poslist" && section === "quick" ? "quick" : k)}
              style={{flex:1,padding:"7px 10px",fontSize:12,fontWeight:700,cursor:"pointer",borderRadius:5,border:"1px solid "+((section===k||(k==="poslist"&&section==="quick"))?"#86efac":C.bd),background:(section===k||(k==="poslist"&&section==="quick"))?"rgba(134,239,172,.20)":C.bg3,color:(section===k||(k==="poslist"&&section==="quick"))?"#bbf7d0":"#9fc3f5",fontFamily:"inherit" }}>
              {l}
            </button>
          ))}
        </div>
        {(section === "poslist" || section === "quick") && (
          <div style={{ padding: "8px 10px", borderBottom: "1px solid " + C.bd, flexShrink: 0 }}>
            {[["poslist", "Position List"], ["quick", "Quick list"]].map(([k, l]) => (
              <button key={k} onClick={() => setSection(k)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "13px 14px", marginBottom: 9, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: section === k ? 700 : 400,
                  border: `1px solid ${section === k ? ACCENT : C.bd}`, background: section === k ? "rgba(88,166,255,0.13)" : "transparent", color: section === k ? "#e8f2ff" : C.dim, fontFamily: "inherit" }}>
                {l}
              </button>
            ))}
          </div>
        )}

        {section === "poslist" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid " + C.bd, flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.tx }}>{reportVessels.length} vessel{reportVessels.length !== 1 ? "s" : ""} in report</div>
            <div style={{ fontSize: 9, color: C.faint, marginTop: 2 }}>Draft auto-saved · persists across tabs</div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Saved list — Save/Clear buttons now live in the top toolbar */}
          {(Array.isArray(savedReports)?savedReports:[]).filter(r => r.report_type === "Position List").length > 0 && (
            <div style={{ flexShrink: 0, borderTop: "1px solid " + C.bd, padding: "8px 10px", maxHeight: 160, overflowY: "auto" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Saved</div>
              {(Array.isArray(savedReports)?savedReports:[]).filter(r => r.report_type === "Position List").map(r => (
                <div key={r.id} onClick={() => loadPositionList(r.id)} style={{ position:"relative",padding: "6px 25px 6px 7px", borderRadius: 3, background: C.bg3, cursor: "pointer", marginBottom: 3 }}>
                  <button aria-label="Delete saved report" title="Delete saved report" onClick={e=>{e.stopPropagation();setPendingSavedDelete(r);setDeleteReportError("");}} style={{position:"absolute",right:4,top:5,background:"none",border:0,color:"#fb7185",cursor:"pointer",fontSize:15}}>×</button><div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{savedMarketReportName(r)}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{(r.pos_vessels || []).length} vessels · {new Date(r.report_date).toLocaleDateString("en-GB")}</div>
                </div>
              ))}
            </div>
          )}
          </div>
        )}

        {section === "market" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Report type</div>
            {MARKET_TYPES.map(t => (
              <button key={t} onClick={() => { setReportType(t); setCommentary(""); setFixtures([]); setQuotes([]); setTceEarnings({}); if(t==="Asia to Europe")setAsiaReport(asiaBlank()); setActiveMarketReportId(null); setReportName(""); setSaveReportCopy(false); setMarketSaveStatus(""); initRateGrid(t); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "13px 14px", marginBottom: 9, borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: reportType === t ? 700 : 400, border: `1px solid ${reportType === t ? ACCENT : C.bd}`, background: reportType === t ? "rgba(58,130,246,0.1)" : "transparent", color: "#ffffff", fontFamily: "inherit" }}>{t}</button>
            ))}
            {(Array.isArray(savedReports)?savedReports:[]).filter(r => r.report_type === reportType).length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid " + C.bd }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Saved</div>
                {(Array.isArray(savedReports)?savedReports:[]).filter(r => r.report_type === reportType).map(r => (
                  <div key={r.id} onClick={() => loadReport(r.id)} style={{ padding: "5px 7px", borderRadius: 4, background: C.bg3, cursor: "pointer", marginBottom: 3, position: "relative", paddingRight: 28 }}>
                    <button aria-label="Delete saved report" title="Delete saved report" onClick={e => {e.stopPropagation();setPendingSavedDelete(r);setDeleteReportError("");}} style={{position:"absolute",right:4,top:5,border:"none",background:"transparent",color:"#fb7185",fontSize:15,cursor:"pointer"}}>×</button>
                    <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>{savedMarketReportName(r)}</div>
                    <div style={{ fontSize: 10, color: C.dim }}>{new Date(r.report_date).toLocaleDateString("en-GB")}</div>
                  </div>
                ))}
              </div>
            )}
            {reportType === "Intermediate" && <div style={{marginTop:16,paddingTop:12,borderTop:"1px solid "+C.bd}}>
              <div style={{fontSize:10,fontWeight:800,color:C.tx,letterSpacing:"0.06em",marginBottom:6}}>CHARTERER TAG FILTER</div>
              <div style={{fontSize:10,color:C.dim,marginBottom:8}}>Uncheck charterers to exclude their fixtures from the email report. The report data remains unchanged.</div>
              <label style={{display:"block",fontSize:10,color:C.dim,marginBottom:4}}>Sending report to</label>
              <select value={recipientCharterer} onChange={e=>setRecipientCharterer(e.target.value)} style={{width:"100%",padding:"7px 6px",marginBottom:8,background:C.bg3,color:C.tx,border:"1px solid "+C.bd,borderRadius:4}}>
                <option value="">All clients / no automatic exclusion</option>
                {reportCharterers.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              {recipientCharterer && <div style={{fontSize:10,color:C.blue,marginBottom:8}}>Automatically excluding {recipientCharterer}'s own fixtures.</div>}
              <div style={{display:"flex",gap:8,marginBottom:7}}><button onClick={()=>setExcludedCharterers([])} style={{...SB,fontSize:10}}>All</button><button onClick={()=>setExcludedCharterers([...reportCharterers])} style={{...SB,fontSize:10}}>None</button></div>
              {reportCharterers.map(c=><label key={c} style={{display:"flex",gap:7,alignItems:"center",padding:"4px 2px",fontSize:10,color:C.tx,cursor:"pointer"}}>
                <input type="checkbox" style={exportCheckboxStyle} checked={!excludedCharterers.includes(c)} onChange={()=>toggleExcluded(setExcludedCharterers,c)}/><span>{c}</span>
              </label>)}
              {!reportCharterers.length && <div style={{fontSize:10,color:C.faint}}>Import fixtures to show charterers.</div>}
              <div style={{fontSize:10,color:C.dim,marginTop:9}}>{visibleExportFixtures.length} of {fixtures.length} fixtures included</div>
            </div>}
          </div>
        )}

        {section === "quick" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px 10px", gap: 8, overflow: "hidden", minHeight: 0 }}>
            <div style={{overflowY:"auto",maxHeight:"55%",flexShrink:1,minHeight:0}}>
              <div style={{fontSize:10,fontWeight:700,color:ACCENT,marginBottom:7}}>TAGS</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {quickAvailableTags.map(tag=><button key={tag} aria-pressed={quickSelectedTags.includes(tag)} onClick={()=>toggleQuickTag(tag)} style={{...SB,fontSize:10,padding:"4px 7px",background:quickSelectedTags.includes(tag)?"rgba(88,166,255,0.2)":C.bg3,borderColor:quickSelectedTags.includes(tag)?ACCENT:C.bd,color:quickSelectedTags.includes(tag)?"#79c0ff":C.dim}}>{tag}</button>)}
              </div>
              <div style={{fontSize:10,fontWeight:700,color:ACCENT,marginTop:14,marginBottom:7}}>UPDATED</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {[["all","ALL"],["today","TODAY"],["week","THIS WEEK"],["7","7 DAYS"],["14","14 DAYS"],["30","30 DAYS"]].map(([key,label])=><button key={key} aria-pressed={quickUpdatedFilter===key} onClick={()=>setQuickUpdatedFilter(key)} style={{...SB,fontSize:10,padding:"4px 7px",background:quickUpdatedFilter===key?"rgba(88,166,255,0.2)":C.bg3,borderColor:quickUpdatedFilter===key?ACCENT:C.bd,color:quickUpdatedFilter===key?"#79c0ff":C.dim}}>{label}</button>)}
              </div>
              <div style={{fontSize:10,fontWeight:700,color:ACCENT,marginTop:14,marginBottom:7}}>INTER UKC</div>
              <button aria-pressed={quickSelectedTags.includes("__INTER_UKC__")} onClick={()=>toggleQuickTag("__INTER_UKC__")} style={{...SB,fontSize:10,padding:"4px 7px",background:quickSelectedTags.includes("__INTER_UKC__")?"rgba(88,166,255,0.2)":C.bg3,borderColor:quickSelectedTags.includes("__INTER_UKC__")?ACCENT:C.bd,color:quickSelectedTags.includes("__INTER_UKC__")?"#79c0ff":C.dim}}>INTER UKC</button>
            </div>
            {quickOperators.length>0 ? (
              <div aria-label="Operators included in output" style={{flex:"0 1 auto",minHeight:0,maxHeight:"min(36vh, 430px)",overflowY:"auto",borderTop:"1px solid "+C.bd,paddingTop:8}}>
                <div style={{fontSize:10,fontWeight:700,color:ACCENT,marginBottom:7}}>OPERATORS</div>
                {quickOperators.map(([key,name])=><label key={key} style={{fontSize:11,color:C.tx,display:"flex",alignItems:"flex-start",gap:6,padding:"4px 2px",cursor:"pointer"}}>
                  <input type="checkbox" checked={!quickExcludedOperators.includes(key)} onChange={()=>toggleQuickOperator(key)} style={{width:12,height:12,margin:"1px 0 0",flexShrink:0,accentColor:ACCENT}}/>
                  <span style={{minWidth:0,overflowWrap:"anywhere"}}>{quickDisplayText(name)}</span>
                </label>)}
              </div>
            ) : null}
            {(Array.isArray(savedReports)?savedReports:[]).filter(r => r.report_type === "Quick Positions").length > 0 && (
              <div style={{ flexShrink: 0, borderTop: "1px solid " + C.bd, paddingTop: 8, maxHeight: "min(200px, 26vh)", overflowY: "auto" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Saved</div>
                {(Array.isArray(savedReports)?savedReports:[]).filter(r => r.report_type === "Quick Positions").map(r => (
                  <div key={r.id} onClick={() => loadQuickPositions(r.id)}
                    style={{ position:"relative",padding: "6px 25px 6px 7px", borderRadius: 3, background: C.bg3, cursor: "pointer", marginBottom: 3 }}>
                    <button aria-label="Delete saved report" title="Delete saved report" onClick={e=>{e.stopPropagation();setPendingSavedDelete(r);setDeleteReportError("");}} style={{position:"absolute",right:4,top:5,background:"none",border:0,color:"#fb7185",cursor:"pointer",fontSize:15}}>×</button><div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{savedMarketReportName(r)}</div>
                    <div style={{ fontSize: 9, color: C.dim }}>{savedQuickRows(r).length} rows · {new Date(r.report_date).toLocaleDateString("en-GB")}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {pendingClear&&<div className="no-export" role="dialog" aria-label="Clear report positions" style={{position:"fixed",left:20,bottom:20,zIndex:99999,background:C.bg2,border:"1px solid #fb7185",borderRadius:7,padding:13,boxShadow:"0 8px 28px #0009",color:C.tx,maxWidth:"calc(100vw - 40px)"}}>
        <div style={{fontSize:12,marginBottom:10}}>Remove all {pendingClear==="positions"?reportVessels.length:quickRows.length} positions from this report?</div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:7}}><button onClick={()=>setPendingClear(null)} style={SB}>Cancel</button><button onClick={()=>{if(pendingClear==="positions")clearAll();else{setQuickSelectedTags([]);setQuickUpdatedFilter("all");setQuickExcludedOperators([]);setQuickTableSort({key:null,desc:false});setQuickRows([]);setQuickParseMsg("");setPendingClear(null);}}} style={{...SB,background:"#ef4444",border:"1px solid #ef4444",color:"white"}}>Delete</button></div>
      </div>}
      {pendingSavedDelete && <div className="no-export" style={{position:"fixed",left:20,bottom:20,zIndex:99999,maxWidth:"calc(100vw - 40px)"}}>
        <div style={{width:340,maxWidth:"100%",background:C.bg2,border:"1px solid rgba(248,113,113,.5)",borderRadius:8,padding:14,boxShadow:"0 8px 28px #0009"}}>
          <div style={{fontSize:13,fontWeight:700,color:C.tx,marginBottom:6}}>Delete saved report?</div>
          <div style={{fontSize:12,color:C.dim,marginBottom:18}}>Delete {savedMarketReportName(pendingSavedDelete)} — {pendingSavedDelete.report_date}? This cannot be undone.</div>
          {deleteReportError && <div style={{color:"#fb7185",fontSize:12,marginBottom:10}}>{deleteReportError}</div>}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>setPendingSavedDelete(null)} style={{...SB,padding:"9px 13px"}}>Cancel</button>
            <button onClick={deleteSavedReport} style={{...SB,padding:"9px 13px",background:"rgba(248,113,113,.12)",border:"1px solid rgba(248,113,113,.45)",color:"#fda4af",fontWeight:700}} disabled={deleteReportBusy}>{deleteReportBusy?"Deleting...":"Delete"}</button>
          </div>
        </div>
      </div>}

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>

        {section === "poslist" && <>
          {/* Primary actions — separate from report layout settings */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", background: C.bg2, borderBottom: "1px solid " + C.bd, flexWrap: "wrap", flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 750, color: C.tx, marginRight: 8 }}>POSITION LIST</span>
            <input aria-label="Position report name" value={positionReportName} onChange={e=>setPositionReportName(e.target.value)} style={{...IS,width:180}} placeholder="Saved report name"/>
            <label style={{fontSize:11,color:C.tx}}><input type="checkbox" checked={positionSaveCopy} onChange={e=>setPositionSaveCopy(e.target.checked)}/>Save as copy</label>
            <button onClick={()=>{setActivePositionId(null);setPositionReportName("");setPositionSaveCopy(false);clearAll();}} style={{...SB,color:C.dim}}>New list</button>
            <button onClick={()=>{setPositionChartDraft({...positionChartSettings});setPositionSettingsOpen(v=>!v);}} style={{...SB,color:ACCENT}}>Settings</button>
            <input type="date" value={posDate} onChange={e => setPosDate(e.target.value)} style={{ ...IS }} />
            <div style={{ flex: 1 }} />
            {posSaveStatus && <span style={{ fontSize: 10, color: posSaveStatus === "Saved ✓" ? "#43e97b" : C.dim }}>{posSaveStatus}</span>}
            {exportStatus && <span style={{ fontSize: 10, color: C.dim, maxWidth: 220 }}>{exportStatus}</span>}
            {reportVessels.length > 0 && (
              <button onClick={() => { setPendingClear("positions"); }}
                style={{ ...SB, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.45)", color: "#ef4444" }}>Clear all</button>
            )}
            <button disabled={listSaveBusy} onClick={savePositionList} style={{ ...SB, background: C.bg3, border: "1px solid " + C.bd, color: C.tx }}>Save</button>
            <button onClick={handleCopyEmail} style={{ ...SB, background: exportStatus.startsWith("Copied") ? "rgba(63,185,80,.16)" : C.bg3, border: "1px solid " + (exportStatus.startsWith("Copied") ? "#3fb950" : C.bd), color: exportStatus.startsWith("Copied") ? "#65d68b" : C.tx }}>{exportStatus.startsWith("Copied") ? "✓ Copied!" : "Copy for Email"}</button>
            <button onClick={handleDownloadPng} style={{ ...SB, background: exportStatus === "Downloaded." ? "rgba(63,185,80,.16)" : "transparent", border: "1px solid " + (exportStatus === "Downloaded." ? "#3fb950" : C.bd), color: exportStatus === "Downloaded." ? "#65d68b" : C.dim }}>{exportStatus === "Downloaded." ? "✓ Saved!" : "Download PNG"}</button>
            <button onClick={() => window.print()} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: C.dim }}>Print / PDF</button>
          </div>
          {/* Secondary layout toolbar */}
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 12px",background:C.bg,borderBottom:"1px solid "+C.bd2,flexShrink:0,flexWrap:"wrap"}}>
            <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "5px 8px", background: "transparent", border: "1px solid " + C.bd2, borderRadius: 6 }}>
              <span style={{fontSize:10,color:C.dim,fontWeight:700,marginRight:9,letterSpacing:"0.07em"}}>GROUP & SORT</span>
              {[["segment", "By Segment"], ["region", "By Region"]].map(([k, l]) => (
                <button key={k} onClick={() => setPosGroupBy(k)}
                  style={{ ...SB, border: `1px solid ${posGroupBy === k ? ACCENT : C.bd}`, background: posGroupBy === k ? C.bg4 : "transparent", color: posGroupBy === k ? C.tx : C.dim }}>{l}</button>
              ))}
              {posGroupBy === "region" && (
                <>
                  <span style={{ fontSize: 10, color: C.faint, alignSelf: "center", marginLeft: 2 }}>using</span>
                  {[["superRegion", "S.Region"], ["region", "Region"]].map(([k, l]) => (
                    <button key={k} onClick={() => setRegionMode(k)}
                      style={{ ...SB, fontSize: 10, border: `1px solid ${regionMode === k ? "#c792ea" : C.bd}`, background: regionMode === k ? "rgba(199,146,234,0.15)" : "transparent", color: regionMode === k ? "#c792ea" : C.dim }}>{l}</button>
                  ))}
                </>
              )}
              <button onClick={() => {setOutputSort({key:null,desc:false});setSortByDate(s=>!s);}}
                style={{ ...SB, border: `1px solid ${sortByDate ? ACCENT : C.bd}`, background: sortByDate ? C.bg4 : "transparent", color: sortByDate ? C.tx : C.dim }}>
                {sortByDate ? "✓ " : ""}Sort by date ↑
              </button>
              <button onClick={()=>addManualVessel()} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: ACCENT }}>+ Add manual row</button>
            </div>
          </div>
          {positionSettingsOpen&&<div className="no-export" style={{padding:12,background:C.bg2,borderBottom:"1px solid "+C.bd,maxHeight:360,overflowY:"auto",flexShrink:0}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,color:C.tx,fontWeight:700}}>Position report settings<button onClick={()=>setPositionSettingsOpen(false)} style={SB}>Close</button></div>
            <div style={{fontSize:11,color:C.dim,marginBottom:6}}>Columns — applies to this report and its email, PNG and PDF output</div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:12}}>{POSITION_COLUMNS.map(c=><label key={c.key} style={{color:C.tx,fontSize:11}}><input type="checkbox" checked={positionColumns.includes(c.key)} disabled={positionColumns.length===1&&positionColumns.includes(c.key)} onChange={e=>setPositionColumns(p=>e.target.checked?[...p,c.key]:p.filter(k=>k!==c.key))}/>{c.label}</label>)}</div>
            <div style={{display:"flex",gap:18,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:260,color:C.tx,fontSize:11}}><b>Open timing (vessels in this report)</b><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
                <label>Reference date <input type="date" value={positionChartDraft.anchor} onChange={e=>setPositionChartDraft(p=>({...p,anchor:e.target.value}))} style={IS}/></label>
                <label>Days ahead <input type="number" min="2" max="365" value={positionChartDraft.ahead} onChange={e=>setPositionChartDraft(p=>({...p,ahead:e.target.value}))} style={{...IS,width:65}}/></label>
                <label>Days per range <input type="number" min="1" value={positionChartDraft.bucketDays||7} onChange={e=>setPositionChartDraft(p=>({...p,bucketDays:e.target.value}))} style={{...IS,width:55}}/></label>
                <label>Bars <input type="number" min="2" max="20" value={positionChartDraft.bars} onChange={e=>setPositionChartDraft(p=>({...p,bars:e.target.value}))} style={{...IS,width:55}}/></label>
              </div><div style={{color:C.dim,marginTop:6}}>PPT = reference date and tomorrow. Overdue/unknown dates are excluded. Remaining days use non-overlapping ranges (default 2–7, 8–14, 15–21, 22–30). The last bar covers the rest of the horizon.</div></div>
              <div style={{flex:1,minWidth:300,color:C.tx,fontSize:11}}><b>Fixing-window basis</b><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
                <label>From <input type="date" value={positionChartDraft.historyFrom} onChange={e=>setPositionChartDraft(p=>({...p,historyFrom:e.target.value}))} style={IS}/></label>
                <label>To <input type="date" value={positionChartDraft.historyTo} onChange={e=>setPositionChartDraft(p=>({...p,historyTo:e.target.value}))} style={IS}/></label>
                <label>Bars <input type="number" min="1" max="30" value={positionChartDraft.historyBars} onChange={e=>setPositionChartDraft(p=>({...p,historyBars:e.target.value}))} style={{...IS,width:55}}/></label>
                <label>Max days ahead <input type="number" min="1" value={positionChartDraft.maxWindow} onChange={e=>setPositionChartDraft(p=>({...p,maxWindow:e.target.value}))} style={{...IS,width:55}}/></label>
              </div>
              <div style={{marginTop:7}}>Segments (none selected = all segments in report)</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{positionSegmentOptions.map(seg=><label key={seg}><input type="checkbox" checked={positionChartDraft.segments.includes(seg)} onChange={e=>setPositionChartDraft(p=>({...p,segments:e.target.checked?[...p.segments,seg]:p.segments.filter(v=>v!==seg)}))}/>{seg}</label>)}</div>
              <div style={{marginTop:7}}>Super regions (none selected = all super regions in report)</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{positionRegionOptions.map(region=><label key={region}><input type="checkbox" checked={positionChartDraft.regions.includes(region)} onChange={e=>setPositionChartDraft(p=>({...p,regions:e.target.checked?[...p.regions,region]:p.regions.filter(v=>v!==region)}))}/>{region}</label>)}</div>
              <div style={{color:C.dim,marginTop:7}}>Source: positions_latest, grouped by updated_at. Line = average days from update date to open_date; bars = matching records with a 0–{positionChartDraft.maxWindow} day lead time. This uses current position records, not historical daily snapshots or concluded fixtures. Date-range results are cached; no polling.</div></div>
            </div>
            {positionSettingsError&&<div style={{color:"#fb7185",fontSize:11,marginTop:6}}>{positionSettingsError}</div>}
            <button onClick={applyPositionSettings} style={{...SB,marginTop:10,color:ACCENT}}>Apply graph settings</button>
          </div>}
          {/* Editable title strip */}
          <div style={{ display: "flex", gap: 8, padding: "5px 12px", background: C.bg3, borderBottom: "1px solid " + C.bd, flexShrink: 0 }}>
            <input value={posTitle} onChange={e => setPosTitle(e.target.value)} style={{ ...IS, flex: 2 }} placeholder="Report title" />
            <input value={posSubtitle} onChange={e => setPosSubtitle(e.target.value)} style={{ ...IS, flex: 3 }} placeholder="Subtitle" />
          </div>


          {/* Report preview (left) + Add Vessels panel (right) */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

          {/* Scrollable report area — sized to its content, not stretched, so the vessel table sits right next to it with no gap */}
          <div style={{ flex: `0 0 ${positionPreviewWidth + 24}px`, minWidth: 0, minHeight: 0, overflowY: reportVessels.length ? "auto" : "hidden", overflowX: "auto", padding: 12 }}>
            {/* Captured node — entire report */}
            <div ref={previewRef} className="pos-print" style={{ background: "#070f1c", fontFamily: "Inter,system-ui,sans-serif", width: positionPreviewWidth, border: "1px solid rgba(88,166,255,0.2)", borderRadius: 8, overflow: "hidden" }}>
              {/* Date bar */}
              <div style={{ background: "#0c1e3d", padding: "7px 14px", textAlign: "right" }}>
                <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>{posDate ? new Date(posDate + "T12:00:00").toLocaleDateString("en-GB", {day:"numeric",month:"short",year:"numeric"}) : ""}</span>
              </div>
              {/* Logo */}
              <div style={{ background: "#fff", padding: "11px 0", textAlign: "center" }}>
                <img src={STEEM_LOGO} alt="Steem1960 Shipbrokers" style={{ height: 38 }} />
              </div>
              {/* Title — styled inputs look like text in PNG capture */}
              <div style={{ background: "#0c1e3d", padding: "12px 14px 10px", textAlign: "center", color: "#fff" }}>
                <input value={posTitle} onChange={e => setPosTitle(e.target.value)}
                  style={{ display: "block", width: "100%", background: "transparent", border: "none", color: "#fff", fontSize: 14, fontWeight: 800, textAlign: "center", outline: "none", letterSpacing: 0.5, fontFamily: "inherit" }} />
                <input value={posSubtitle} onChange={e => setPosSubtitle(e.target.value)}
                  style={{ display: "block", width: "100%", background: "transparent", border: "none", color: "rgba(255,255,255,0.8)", fontSize: 11, textAlign: "center", outline: "none", marginTop: 2, fontFamily: "inherit" }} />
              </div>

              {/* Table */}
              <div style={{ padding: "8px 0 4px" }}>
                {reportVessels.length === 0 ? (
                  <div style={{ padding: 28, textAlign: "center", color: "rgba(219,230,245,0.3)", fontSize: 12 }}>
                    No vessels — add from the left panel.
                  </div>
                ) : <>
                  {/* Column headers */}
                  <div style={{ display: "grid", gridTemplateColumns: positionGrid, width: "100%", boxSizing: "border-box", background: ACCENT, color: "#fff", fontSize: 10, fontWeight: 700, padding: "5px 8px", gap: 2 }}>
                    {[...positionColumnsChosen.map(c=>c.label),""].map((h, i) => <div key={i} className="no-export-click" onClick={() => h && setOutputSort(p => ({key:h,desc:p.key === h ? !p.desc : false}))} title={h ? `Sort ${h.toLowerCase()} within each ${posGroupBy}` : undefined} style={{ overflow: "hidden", whiteSpace: "nowrap", cursor:h ? "pointer":"default", userSelect:"none" }}>{h}{outputSort.key === h ? (outputSort.desc ? " ▼" : " ▲") : ""}</div>)}
                  </div>
                  {/* Rows grouped */}
                  {Object.entries(posGrouped).map(([bucket, rows]) => (
                    <div key={bucket} onDragOver={e=>e.preventDefault()} onDrop={e=>dropPosition(bucket,null,e)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(88,166,255,0.14)", borderTop: "1px solid rgba(88,166,255,0.25)", borderBottom: "1px solid rgba(88,166,255,0.25)" }}>
                        <span key={`${posGroupBy}-${regionMode}-${bucket}`} contentEditable suppressContentEditableWarning
                          onBlur={e => renameBucketInline(bucket, rows, e.currentTarget.textContent)}
                          onKeyDown={e => {if(e.key === "Enter"){e.preventDefault();e.currentTarget.blur();} if(e.key === "Escape"){e.currentTarget.textContent=displayRegionBucket(bucket,rows);e.currentTarget.blur();}}}
                          title="Click and type to rename this group in the report"
                          className="no-export-click"
                          style={{ color: "#9fc4f0", fontSize: 11, fontWeight: 700, padding: "5px 8px", letterSpacing: 0.5, textTransform: "uppercase", cursor: "text", outlineOffset: -2, minWidth: 70 }}
                        >{displayRegionBucket(bucket, rows)}</span>
                        <button onClick={() => addManualVessel(bucket)} className="no-export" title={`Add a vessel to ${bucket}`}
                          style={{ background: "none", border: "none", color: "#9fc4f0", cursor: "pointer", fontSize: 14, fontWeight: 700, padding: "0 8px", lineHeight: 1 }}>+</button>
                      </div>
                      {rows.map((v, localIdx) => {
                        const globalIdx = reportVessels.findIndex(r => r._rid === v._rid);
                        return (
                          <VesselRow key={v._rid || v.vessel}
                            v={v} localIdx={localIdx} columns={positionColumnsChosen}
                            editing={editingRid === (v._rid || v.vessel)}
                            onEdit={() => setEditingRid(editingRid === (v._rid || v.vessel) ? null : (v._rid || v.vessel))}
                            onSave={vals => saveEdit(v._rid || v.vessel, vals)}
                            onDelete={() => deleteRow(v._rid || v.vessel)}
                            onDragStart={e=>dragStart(v._rid,e)}
                            onDragEnter={()=>dragEnter(v._rid)}
                            onDrop={e=>dropPosition(bucket,v._rid,e)}
                            onDragEnd={dragEnd}
                            isDragOver={dragOver === v._rid}
                          />
                        );
                      })}
                    </div>
                  ))}
                </>}
              </div>

              {/* Charts — each has an independent export toggle, without hiding the preview. */}
              {reportVessels.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8, padding: "6px 6px 12px" }}>
                  <div className={positionCharts.open ? "" : "exclude-position-chart"} style={{ background: "#0c1729", border: "1px solid rgba(58,130,246,0.12)", padding: "8px 10px",minWidth:0 }}>
                    <div className="no-export" style={{display:"flex",justifyContent:"flex-end",paddingBottom:3}}>{positionChartTick("open","Include in export")}</div>
                    <div className={positionCharts.open ? "" : "exclude-position-chart"}><BarLineChart data={openTimingData} barKey="count" title="Open timing" barLabel="Ships" accent={ACCENT} separateTitle={true} /></div>
                  </div>
                  <div className={positionCharts.fixing ? "" : "exclude-position-chart"} style={{ background: "#0c1729", border: "1px solid rgba(58,130,246,0.12)", padding: "8px 10px",minWidth:0 }}>
                    <div className="no-export" style={{display:"flex",justifyContent:"flex-end",paddingBottom:3}}>{positionChartTick("fixing","Include in export")}</div>
                    {positionHistoryError&&<div style={{fontSize:10,color:"#fb7185"}}>{positionHistoryError}</div>}<div className={positionCharts.fixing ? "" : "exclude-position-chart"}><BarLineChart data={positionFixingData} barKey="ships" lineKey="avgWindow" title="Open-date lead time by update date" barLabel="Ships" lineLabel="Avg days" accent={ACCENT} loading={posFixHistoryLoading} separateTitle={true} /></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="no-export" onMouseDown={startPositionResize} title="Drag to resize output / vessel selection panels" style={{width:7,flex:"0 0 7px",cursor:"col-resize",background:"#183456",borderLeft:"1px solid #31547d",borderRight:"1px solid #31547d",alignSelf:"stretch",zIndex:2}} />
          {/* ── Vessel pool table — fills the space between the report preview and the controls sidebar ── */}
          <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid " + C.bd, overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid " + C.bd, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {vesselPool.length} vessel{vesselPool.length !== 1 ? "s" : ""} match{vesselPool.length === 1 ? "es" : ""}
              </span>
              {vesselPool.length > 0 && (
                <button onClick={() => { vesselPool.forEach(v => addFromPool(v)); }}
                  style={{ fontSize: 10, fontWeight: 700, padding: "5px 10px", borderRadius: 4, cursor: "pointer", border: `1px solid ${ACCENT}`, background: `${ACCENT}22`, color: ACCENT, fontFamily: "inherit" }}>
                  Import all ({vesselPool.length})
                </button>
              )}
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"6px 12px",borderBottom:"1px solid " + C.bd,flexShrink:0,fontSize:10,color:C.faint}}>
              <span>{vesselPool.length ? `${(currentVesselPoolPage - 1) * VESSEL_POOL_PAGE_SIZE + 1}–${Math.min(currentVesselPoolPage * VESSEL_POOL_PAGE_SIZE, vesselPool.length)} of ${vesselPool.length}` : "0 vessels"} · 200 per page</span>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <button disabled={currentVesselPoolPage <= 1} onClick={() => setVesselPoolPage(p => Math.max(1,p-1))} style={{...IS,padding:"3px 8px",cursor:currentVesselPoolPage<=1?"default":"pointer",opacity:currentVesselPoolPage<=1?.4:1}}>‹ Prev</button>
                <span style={{whiteSpace:"nowrap"}}>{currentVesselPoolPage} / {vesselPoolPageCount}</span>
                <button disabled={currentVesselPoolPage >= vesselPoolPageCount} onClick={() => setVesselPoolPage(p => Math.min(vesselPoolPageCount,p+1))} style={{...IS,padding:"3px 8px",cursor:currentVesselPoolPage>=vesselPoolPageCount?"default":"pointer",opacity:currentVesselPoolPage>=vesselPoolPageCount?.4:1}}>Next ›</button>
              </div>
            </div>
            <div key={poolSearch + "|" + [...tagFilter].sort().join(",") + "|" + dateFilter + "|" + currentVesselPoolPage} style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
              {vesselPool.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: C.faint, fontSize: 11 }}>
                  {allVessels.length === 0 ? "Select vessels on Positions tab" : "No vessels match your search/tags"}
                </div>
              ) : (
                <table style={{ width: "100%", minWidth: 940, tableLayout: "fixed", borderCollapse: "collapse", fontSize: 12 }}>
                  <colgroup>
                    {[175,78,72,110,105,125,160,105,28].map((w,i)=><col key={i} style={{width:w}} />)}
                  </colgroup>
                  <thead>
                    <tr style={{ position: "sticky", top: 0, background: "#101d30" }}>
                      {["Vessel", "DWT", "Built", "Coating", "Open date", "Open port", "Operator", "Updated", ""].map(h => (
                        <th key={h} onClick={() => h && setPoolSort(p => ({key:h,desc:p.key === h ? !p.desc : h === "Updated"}))} style={{ cursor:h ? "pointer" : "default", userSelect:"none", padding: "6px 6px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase", borderBottom: "1px solid " + C.bd, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h}{h && poolSort.key === h ? (poolSort.desc ? " ▼" : " ▲") : ""}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedVesselPool.map((v, i) => (
                      <tr key={(v.imoNo || v.vessel) + "_" + i} onClick={() => addFromPool(v)} className="pool-row"
                        style={{ cursor: "pointer", background: i % 2 === 0 ? "#101d30" : "#0b1626", borderBottom:"1px solid rgba(58,130,246,0.055)" }}>
                        <td style={{ padding: "6px 6px", fontWeight: 700, color: "#58b6ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.vessel}</td>
                        <td style={{ padding: "5px 6px", color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.dwt ? fmtDwt(v.dwt) : ""}</td>
                        <td style={{ padding: "5px 6px", color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.built || ""}</td>
                        <td title={v.coating || ""} style={{ padding: "5px 6px", color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtCoating(v.coating)}</td>
                        <td style={{ padding: "5px 6px", color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.date || ""}</td>
                        <td style={{ padding: "5px 6px", color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.openPort || ""}</td>
                        <td title={v.operator || ""} style={{ padding: "5px 6px", color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.operator || ""}</td>
                        <td style={{ padding: "5px 6px", color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.updatedAt ? new Date(v.updatedAt).toLocaleDateString("en-GB") : ""}</td>
                        <td style={{ padding: "5px 6px" }}><span style={{ fontSize: 14, color: ACCENT, fontWeight: 700 }}>+</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Controls — paste, then the same category structure as the Positions tab filter panel ── */}
          <div style={{ width: 298, flexShrink: 0, borderLeft: "1px solid " + C.bd, display: "flex", flexDirection: "column", overflowY: "auto", padding: "7px 18px 7px 10px", gap: 5 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em" }}>Add vessels</div>

            <button onClick={() => setPosPasteOpen(o => !o)}
              style={{ fontSize: 10, fontWeight: 700, padding: "5px 8px", borderRadius: 4, cursor: "pointer", border: "1px solid " + C.bd, background: "transparent", color: ACCENT, fontFamily: "inherit", textAlign: "left" }}>
              {posPasteOpen ? "▾" : "▸"} Paste positions
            </button>
            {posPasteOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <textarea value={posPasteText} onChange={e => setPosPasteText(e.target.value)}
                  placeholder="Paste positions — any format, e.g. VESSEL – PORT – DATE"
                  style={{ ...IS, width: "100%", minHeight: 60, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
                <button onClick={parsePositionListPaste} disabled={posPasting}
                  style={{ fontSize: 10, fontWeight: 700, padding: "5px 8px", borderRadius: 4, cursor: posPasting ? "default" : "pointer", border: "none", background: ACCENT, color: "#fff", fontFamily: "inherit", opacity: posPasting ? 0.6 : 1 }}>
                  {posPasting ? "Parsing..." : "Parse & add"}
                </button>
                {posPasteMsg && <div style={{ fontSize: 9, color: posPasteMsg.startsWith("✓") ? "#43e97b" : "#f5a623" }}>{posPasteMsg}</div>}
              </div>
            )}

            <input value={poolSearch} onChange={e => setPoolSearch(e.target.value)} placeholder="Search vessel, operator, or port..."
              style={{ ...IS, width: "100%", boxSizing: "border-box" }} />

            <div style={{ borderTop: "1px solid " + C.bd, margin: "2px 0" }} />

            {/* Same category structure/colors as the Positions tab filter panel — stacked vertically here since this sidebar is narrower than that full-width grid */}
            {(() => {
              const RCOL = ({ label, col, children }) => (
                <div style={{ marginBottom: 2 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: col, textTransform: "uppercase", letterSpacing: "0.08em", paddingBottom: 1, borderBottom: "1px solid " + C.bd, marginBottom: 2 }}>{label}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>{children}</div>
                </div>
              );
              const RB = ({ active, onClick, children }) => (
                <button onClick={onClick} style={{ fontSize: 11, fontWeight: 650, padding: "5px 9px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                  border: "1px solid " + (active ? C.blue : "rgba(120,160,220,0.35)"), background: active ? "rgba(88,166,255,.22)" : C.bg3, color: active ? "#d9ecff" : "#9fc3f5" }}>
                  {children}
                </button>
              );
              const toggleIn = (setter) => (val) => setter(prev => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n; });

              const usedTags = [...new Set(allVessels.map(v => (v.tag || "").trim()).filter(Boolean))].sort();
              const usedSegments = [...new Set(allVessels.map(v => v.segment).filter(Boolean))]
                .sort((a, b) => ["Sub 10k","City","Inter","J19","Flexi","Handy","MR"].indexOf(a) - ["Sub 10k","City","Inter","J19","Flexi","Handy","MR"].indexOf(b));
              const usedSuperRegions = [...new Set(allVessels.map(v => v.superRegion).filter(Boolean))].sort();
              const usedCoatings = ["EPOXY", "STST", "ML", "INTERLINE"];

              return (
                <>
                  {usedTags.length > 0 && (
                    <RCOL label="Tags" col="#79c0ff">
                      {usedTags.map(t => (<RB key={t} active={tagFilter.has(t)} onClick={() => toggleIn(setTagFilter)(t)}>{t.toUpperCase()}</RB>))}
                      {tagFilter.size > 0 && <RB active={false} onClick={() => setTagFilter(new Set())}><span style={{ color: C.red }}>✕</span></RB>}
                    </RCOL>
                  )}
                  <RCOL label="Updated" col={C.blue}>
                    {[["all","All"],["today","Today"],["2d","2d"],["7d","7d"]].map(([v,l]) => (
                      <RB key={v} active={dateFilter===v} onClick={() => setDateFilter(v)}>{l}</RB>
                    ))}
                  </RCOL>
                  <RCOL label="Region" col="#7dd3fc">
                    {customRegionGroups.map(g => (
                      <RB key={g.id} active={regionFilter.has(g.label)} onClick={() => toggleIn(setRegionFilter)(g.label)}>{g.label}</RB>
                    ))}
                    {regionFilter.size > 0 && <RB active={false} onClick={() => setRegionFilter(new Set())}><span style={{ color: C.red }}>✕</span></RB>}
                  </RCOL>
                  {usedSuperRegions.length > 0 && (
                    <RCOL label="S.Region" col={C.purple || "#c792ea"}>
                      {usedSuperRegions.map(r => (<RB key={r} active={superRegionFilter.has(r)} onClick={() => toggleIn(setSuperRegionFilter)(r)}>{r}</RB>))}
                      {superRegionFilter.size > 0 && <RB active={false} onClick={() => setSuperRegionFilter(new Set())}><span style={{ color: C.red }}>✕</span></RB>}
                    </RCOL>
                  )}
                  {usedCoatings.length > 0 && (
                    <RCOL label="Coating" col="#f5a623">
                      {usedCoatings.map(c => (<RB key={c} active={coatingFilter.has(c)} onClick={() => toggleIn(setCoatingFilter)(c)}>{c.toUpperCase()}</RB>))}
                      {coatingFilter.size > 0 && <RB active={false} onClick={() => setCoatingFilter(new Set())}><span style={{ color: C.red }}>✕</span></RB>}
                    </RCOL>
                  )}
                  {usedSegments.length > 0 && (
                    <RCOL label="Segment" col={C.green}>
                      {usedSegments.map(s => (<RB key={s} active={segmentFilter.has(s)} onClick={() => toggleIn(setSegmentFilter)(s)}>{s}</RB>))}
                      {segmentFilter.size > 0 && <RB active={false} onClick={() => setSegmentFilter(new Set())}><span style={{ color: C.red }}>✕</span></RB>}
                    </RCOL>
                  )}
                  <RCOL label="DWT" col="#f59e0b">
                    {[["<10","<10k"],["10-15","10-15k"],["15-20","15-20k"],["20-30","20-30k"],["30-40","30-40k"],[">40",">40k"]].map(([v,l]) => (
                      <RB key={v} active={dwtFilter.has(v)} onClick={() => toggleIn(setDwtFilter)(v)}>{l}</RB>
                    ))}
                    <input value={dwtRange.min} onChange={e => setDwtRange(r => ({ ...r, min: e.target.value }))} placeholder="from"
                      style={{ width: 52, fontSize: 10, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 3, color: C.tx, padding: "3px 5px", outline: "none", fontFamily: "inherit" }} />
                    <input value={dwtRange.max} onChange={e => setDwtRange(r => ({ ...r, max: e.target.value }))} placeholder="to"
                      style={{ width: 52, fontSize: 10, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 3, color: C.tx, padding: "3px 5px", outline: "none", fontFamily: "inherit" }} />
                    {(dwtFilter.size > 0 || dwtRange.min || dwtRange.max) && <RB active={false} onClick={() => { setDwtFilter(new Set()); setDwtRange({min:"",max:""}); }}><span style={{ color: C.red }}>✕</span></RB>}
                  </RCOL>
                  <RCOL label="Built" col="#94a3b8">
                    {[["<2005","<2005"],["2005-10","2005-10"],["2010-15","2010-15"],["2015-20","2015-20"],[">2020",">2020"]].map(([v,l]) => (
                      <RB key={v} active={builtFilter.has(v)} onClick={() => toggleIn(setBuiltFilter)(v)}>{l}</RB>
                    ))}
                    <input value={builtRange.min} onChange={e => setBuiltRange(r => ({ ...r, min: e.target.value }))} placeholder="from"
                      style={{ width: 52, fontSize: 10, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 3, color: C.tx, padding: "3px 5px", outline: "none", fontFamily: "inherit" }} />
                    <input value={builtRange.max} onChange={e => setBuiltRange(r => ({ ...r, max: e.target.value }))} placeholder="to"
                      style={{ width: 52, fontSize: 10, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 3, color: C.tx, padding: "3px 5px", outline: "none", fontFamily: "inherit" }} />
                    {(builtFilter.size > 0 || builtRange.min || builtRange.max) && <RB active={false} onClick={() => { setBuiltFilter(new Set()); setBuiltRange({min:"",max:""}); }}><span style={{ color: C.red }}>✕</span></RB>}
                  </RCOL>
                </>
              );
            })()}
          </div>

          </div>
        </>}

        {section === "market" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: reportType ? "auto" : "hidden", scrollbarWidth: reportType === "Intermediate" && !fixtures.length && !quotes.length && !commentary.trim() ? "none" : "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            {!reportType ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
                <div style={{ textAlign: "center", color: C.dim }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Select a report type from the left panel</div>
                </div>
              </div>
            ) : reportType === "Intermediate" ? <>
              <style>{`.driver-list{margin:0;padding-left:16px;font-size:12px;line-height:1.7;color:${C.tx}}.driver-list:has(li:nth-child(5)){column-count:2;column-gap:24px}
                .rpt-edit{background:transparent;border:none;border-bottom:1px dashed transparent;color:inherit;font-family:inherit;font-size:inherit;outline:none;padding:2px 3px;border-radius:2px;transition:border-color .15s,background .15s;box-sizing:border-box}
                .rpt-edit:hover{border-bottom-color:rgba(74,144,226,0.4)}
                .rpt-edit:focus{border-bottom-color:#4a90e2;background:rgba(74,144,226,0.08)}
              `}</style>

              {/* ── Toolbar (not captured in export/print) ── */}
              <div className="no-export" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap:"wrap", gap: 8 }}>
                {marketSaveStatus.startsWith("Save failed") && <span style={{ fontSize: 11, color: "#fb7185" }}>{marketSaveStatus}</span>}
                {marketExportStatus && !marketExportStatus.startsWith("Copied") && marketExportStatus !== "Downloaded." && <span style={{ fontSize: 11, color: C.dim }}>{marketExportStatus}</span>}
                <input aria-label="Report name" value={reportName} onChange={e=>setReportName(e.target.value)} placeholder={`${reportType} report name, e.g. Aramco`} style={{...IS,width:240,minWidth:120}} />
                <label style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,color:C.tx,whiteSpace:"nowrap",cursor:"pointer"}}><input type="checkbox" checked={saveReportCopy} onChange={e=>setSaveReportCopy(e.target.checked)} disabled={marketSaveBusy}/>Save as copy</label>
                <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} style={IS} />
                <button disabled={marketSaveBusy} onClick={saveReport} style={{ ...SB, background: marketSaveStatus === "Saved!" ? "rgba(63,185,80,.16)" : C.bg3, border: "1px solid " + (marketSaveStatus === "Saved!" ? "#3fb950" : C.bd), color: marketSaveStatus === "Saved!" ? "#65d68b" : C.tx }}>{marketSaveStatus === "Saved!" ? "✓ Saved!" : marketSaveBusy ? "Saving..." : saveReportCopy ? "Save copy" : "Save"}</button>
                <button onClick={() => window.print()} style={{ ...SB, background: C.bg3, border: "1px solid " + C.bd, color: C.tx }}>Print</button>
                <button onClick={handleMarketCopyEmail} style={{ ...SB, background: marketExportStatus.startsWith("Copied") ? "rgba(63,185,80,.16)" : C.bg3, border: "1px solid " + (marketExportStatus.startsWith("Copied") ? "#3fb950" : C.bd), color: marketExportStatus.startsWith("Copied") ? "#65d68b" : C.tx }}>{marketExportStatus.startsWith("Copied") ? "✓ Copied!" : "Copy for email"}</button>
                <button onClick={handleMarketDownloadPng} style={{ ...SB, background: marketExportStatus === "Downloaded." ? "rgba(63,185,80,.16)" : "transparent", border: "1px solid " + (marketExportStatus === "Downloaded." ? "#3fb950" : C.bd), color: marketExportStatus === "Downloaded." ? "#65d68b" : C.dim }}>{marketExportStatus === "Downloaded." ? "✓ Saved!" : "Download PNG"}</button>
              </div>

              {/* ── Printable/exportable report content ── */}
              <div ref={marketPreviewRef} style={{ display: "flex", flexDirection: "column", gap: 12, background: "#0b1f3f", padding: 10, borderRadius: 8 }}>

              {/* ── Compact, single-row report header ── */}
              <div style={{background:"#0b1f3f",borderRadius:8,padding:"12px 16px",display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:14,minHeight:66}}>
                <input className="rpt-edit" aria-label="Intermediate report title" value={intermediateTitle} onChange={e=>setIntermediateTitle(e.target.value)} style={{fontSize:12,fontWeight:600,color:"#c9d8ee",background:"transparent",border:"none",outline:"none",width:"100%",minWidth:0}} />
                <img src={INTERMEDIATE_HEADER_LOGO} alt="Steem1960 Shipbrokers" style={{width:190,height:50,objectFit:"contain",background:"#fff",borderRadius:4,padding:"3px 6px",boxSizing:"border-box"}} />
                <div style={{fontSize:12,color:"#c9d8ee",whiteSpace:"nowrap",textAlign:"right"}}>{reportHeaderDate(reportDate)}</div>
              </div>

              {/* ── Market drivers / What to watch ── */}
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  {editMarketHeading("drivers",{fontSize:12,fontWeight:700,color:C.tx,textTransform:"uppercase",letterSpacing:"0.05em"})}
                  <span className="no-export" style={{ fontSize: 10, color: C.faint }}>Press Enter to add a line</span>
                  {emailSectionTick("drivers")}
                </div>
                <ul className="driver-list">
                  {driverBullets.map((b, i) => (
                    <li key={i} style={{ marginBottom: 4, display: "flex", alignItems: "flex-start", gap: 6, listStyle: "none", marginLeft: -16 }}>
                      <span style={{ marginTop: 2 }}>•</span>
                      <input value={b} onChange={e => setDriverBullets(p => { const n = [...p]; n[i] = e.target.value; return n; })}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            setDriverBullets(p => { const n = [...p]; n.splice(i + 1, 0, ""); return n; });
                            setTimeout(() => {
                              const els = document.querySelectorAll(".driver-list input");
                              els[i + 1]?.focus();
                            }, 0);
                          } else if (e.key === "Backspace" && b === "" && driverBullets.length > 1) {
                            e.preventDefault();
                            setDriverBullets(p => p.filter((_, j) => j !== i));
                          }
                        }}
                        placeholder="e.g. general weather delays" className="rpt-edit"
                        style={{ flex: 1, fontSize: 12 }} />
                      {pendingDriverDelete === i ? (
                        <span className="no-export" style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <button onClick={() => { setDriverBullets(p => p.filter((_, j) => j !== i)); setPendingDriverDelete(null); }}
                            style={{ background: C.red, border: "none", borderRadius: 3, color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 7px", cursor: "pointer" }}>Delete</button>
                          <button onClick={() => setPendingDriverDelete(null)} style={{ background: "none", border: "1px solid " + C.bd, borderRadius: 3, color: C.dim, fontSize: 9, padding: "2px 7px", cursor: "pointer" }}>Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setPendingDriverDelete(i)} className="no-export" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 11 }}>✕</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* ── Benchmark rates ── */}
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "10px 13px", background: "rgba(74,144,226,0.17)", borderLeft:"4px solid #377dc8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {editMarketHeading("benchmark",{fontSize:12,fontWeight:700,color:"#79c0ff",textTransform:"uppercase",letterSpacing:"0.05em"})}
                  <div className="no-export" style={{ display: "flex", alignItems: "center", gap: 15,flexWrap:"wrap" }}>
                    <button className="no-export" onClick={openPriorReportImport} style={{...SB,background:"#163a61",color:"#b9dcff",border:"1px solid #497fae"}}>Import last week rates</button>
                    {benchmarkRefreshStatus && <span style={{ fontSize: 10, color: C.dim }}>{benchmarkRefreshStatus}</span>}
                    {emailSectionTick("rates")}{[ ["lastWeek", "Last week"], ["comment", "Comment"] ].map(([key, caption]) => <label key={key} style={{fontSize:10,color:C.dim,display:"inline-flex",alignItems:"center",gap:6,marginLeft:key==="lastWeek"?20:16,cursor:"pointer"}}><input type="checkbox" checked={!!routeColumns[key]} onChange={e=>setRouteColumns(p=>({...p,[key]:e.target.checked}))} style={exportCheckboxStyle}/>{caption}</label>)}
                    <button className="no-export" onClick={()=>setBenchmarkRows(p=>[...p,{key:"custom-"+Date.now(),label:"New route",from:"",to:"",freight:"",lastWeek:"",tce:null,tceLastWeek:null,manualTce:"",override:true}])} style={{...SB,background:C.bg3,color:C.blue,border:"1px solid "+C.bd}}>+ Add route</button>
                    <button onClick={refreshBenchmarkFromSaved} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: C.dim, fontSize: 10 }}>↻ Refresh from saved</button>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}><input aria-label="Intermediate routes column title" className="rpt-edit" value={intermediateRoutesLabel} onChange={e=>setIntermediateRoutesLabel(e.target.value)} style={{width:150,fontSize:10,fontWeight:700}}/></th>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}><input className="rpt-edit" aria-label="Spot column title" value={routeTitles.spot} onChange={e=>setRouteTitles(p=>({...p,spot:e.target.value}))} style={{width:85}}/></th>
                      {routeColumns.lastWeek&&<th style={{padding:"6px 10px",textAlign:"left"}}><input className="rpt-edit" aria-label="Last week column title" value={routeTitles.lastWeek} onChange={e=>setRouteTitles(p=>({...p,lastWeek:e.target.value}))} style={{width:90}}/></th>}
                      {routeColumns.comment&&<th style={{padding:"6px 10px",textAlign:"left"}}><input className="rpt-edit" aria-label="Comment column title" value={routeTitles.comment} onChange={e=>setRouteTitles(p=>({...p,comment:e.target.value}))} style={{width:130}}/></th>}
                    </tr></thead>
                    <tbody>
                      {benchmarkRows.map((r, i) => (
                        <tr key={r.key} style={{ borderTop: "1px solid " + C.bd, background: i % 2 === 0 ? C.bg3 : C.bg2 }}>
                          <td style={{ padding: "6px 10px", fontWeight: 700, color: C.tx }}><div style={{display:"flex",alignItems:"center",gap:5}}>
                            <input className="no-export" type="checkbox" style={exportCheckboxStyle} aria-label={`Include ${r.label} benchmark in email`} checked={!excludedBenchmarkKeys.includes(String(r.key))} onChange={()=>toggleExcluded(setExcludedBenchmarkKeys,String(r.key))}/>
                            <input aria-label="Route name" className="rpt-edit" value={r.label} onChange={e=>setBenchmarkRows(p=>p.map(x=>x.key===r.key?{...x,label:e.target.value}:x))} style={{width:155,fontWeight:700,fontSize:12}} />
                            <span className="no-export" style={{display:"inline-flex",gap:2}}><button title="Move route up" onClick={()=>moveBenchmarkRow(i,i-1)} style={{border:0,background:"transparent",color:C.blue,cursor:"pointer"}}>↑</button><button title="Move route down" onClick={()=>moveBenchmarkRow(i,i+1)} style={{border:0,background:"transparent",color:C.blue,cursor:"pointer"}}>↓</button></span><button title="Remove benchmark row" onClick={()=>setBenchmarkRows(p=>p.filter(x=>x.key!==r.key))} style={{border:"none",background:"transparent",color:"#fb7185",cursor:"pointer"}}>×</button>
                          </div></td>
                          <td style={{ padding: "6px 10px" }}>
                            <input aria-label="Spot freight" className="rpt-edit" value={r.freight ?? ""} onChange={e=>updateBenchmarkFreight(r.key,e.target.value)} placeholder="USD" style={{width:110,fontSize:12,fontWeight:600,color:C.tx}} />
                            {(r.key?.startsWith("custom-") || r.override && !r.from && !r.to) ? <input aria-label="Manual TCE in USD thousands per day" className="rpt-edit" value={r.manualTce||""} onChange={e=>setBenchmarkRows(p=>p.map(x=>x.key===r.key?{...x,manualTce:e.target.value}:x))} placeholder="USD XXk pd" title="Enter TCE manually, e.g. 25 or USD 25k pd" style={{width:108,fontSize:10,color:C.faint,marginLeft:6}}/> : r.tce != null && <span style={{ fontSize: 10, color: C.faint, marginLeft: 6 }}>(USD {Math.round(r.tce / 1000)}k pd)</span>}
                          </td>
                          {routeColumns.lastWeek&&<td style={{ padding: "6px 10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input value={r.lastWeek} onChange={e => setBenchmarkRows(p => p.map(x => x.key === r.key ? { ...x, lastWeek: e.target.value, tceLastWeek: recalcBenchmarkTCE({ ...x, dist: x.dist ?? lookupDist(x.from, x.to) }, e.target.value) } : x))}
                                onFocus={e => { e.target.value = String(r.lastWeek).replace(/[^0-9.\-]/g, ""); }}
                                onBlur={e => { const n = parseFloat(e.target.value.replace(/[^0-9.\-]/g, "")); if (!isNaN(n)) e.target.value = n.toLocaleString("nb-NO"); }}
                                placeholder="USD" className="rpt-edit"
                                style={{ width: 90, fontSize: 12, color: C.faint }} />
                              <span style={{ fontSize: 10, color: C.faint }}>{r.tceLastWeek != null ? `(USD ${Math.round(r.tceLastWeek / 1000)}k pd)` : ""}</span>
                            </div>
                          </td>}{routeColumns.comment&&<td style={{padding:"6px 10px"}}><input className="rpt-edit" aria-label="Route comment" value={r.comment||""} onChange={e=>setBenchmarkRows(p=>p.map(x=>x.key===r.key?{...x,comment:e.target.value}:x))} style={{width:"100%",minWidth:110}}/></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {priorReportStatus&&<div style={{fontSize:11,color:C.dim}}>{priorReportStatus}</div>}
              <WeeklyBenchmarkHistory history={weeklyHistory} setHistory={setWeeklyHistory} rows={benchmarkRows} date={reportDate}/>
              {/* ── TCE earnings ── */}
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, overflow:"hidden" }}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 13px",background:"rgba(74,144,226,0.17)",borderLeft:"4px solid #377dc8"}}>{editMarketHeading("tce",{fontSize:12,fontWeight:700,color:"#79c0ff",textTransform:"uppercase",letterSpacing:"0.05em"})}{emailSectionTick("tce")}</div><div style={{padding:13}}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,180px))", gap: 16, justifyContent: "center", textAlign: "center" }}>
                  {[["current", "Current"], ["lastMonth", "Last month avg"], ["ytd", "YTD avg"]].map(([k, label]) => (
                    <div key={k}>
                      <label style={{ display: "block", fontSize: 10, color: C.dim, marginBottom: 4, fontWeight: 700, textTransform: "uppercase" }}>{label}</label>
                      <input value={tceStats[k]} onChange={e => setTceStats(p => ({ ...p, [k]: e.target.value }))} placeholder="e.g. 31000" className="rpt-edit"
                        style={{ width: "100%", fontSize: 18, fontWeight: 700, textAlign: "center" }} />
                      <div style={{ fontSize: 10, color: C.faint, marginTop: 3, textAlign: "center" }}>{tceStats[k] ? `USD ${Math.round(parseFloat(tceStats[k]) / 1000)}k pd` : ""}</div>
                    </div>
                  ))}
                </div></div>
              </div>

              {/* ── Handy ── */}
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "8px 13px", background: "rgba(74,144,226,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  {editMarketHeading("handy",{fontSize:12,fontWeight:700,color:"#79c0ff",textTransform:"uppercase",letterSpacing:"0.05em"})}
                  <div style={{display:"flex",alignItems:"center",gap:10}}>{emailSectionTick("handy")}<button className="no-export" onClick={()=>{const k="seg"+Date.now();setHandySegments(p=>[...p,k]);setHandy(p=>({...p,[k]:{name:"New segment",spotWS:"",ffaAug:"",ffaSep:"",ffaOct:""}}));}} style={{...SB,background:C.bg3,color:C.blue,border:"1px solid "+C.bd}}>+ Add segment</button></div>
                </div>
                <div style={{ padding: "9px 13px" }}>
                  <textarea value={handyCommentary} onChange={e=>setHandyCommentary(e.target.value)}
                    placeholder="Handy market commentary / what to watch…"
                    style={{ width: "100%", minHeight: 75, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 5, color: C.tx, fontSize: 12, padding: 9, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>Segment</th>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>Spot WS</th><th style={{padding:"6px 10px",textAlign:"left",fontSize:10,color:C.dim}}>TCE</th>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>{reportFfaMonths(reportDate).join(" | ")}</th>
                      <th style={{padding:"6px 10px",textAlign:"left",fontSize:10,color:C.dim}}>Comment</th>
                    </tr></thead>
                    <tbody>
                      {handySegments.map((seg, i) => (
                        <tr key={seg} style={{ borderTop: "1px solid " + C.bd, background: i % 2 === 0 ? C.bg3 : C.bg2 }}>
                          <td style={{ padding: "6px 10px", fontWeight: 700, color: C.tx }}><input className="rpt-edit" value={handy[seg]?.name || (seg === "tc23" ? "TC23" : seg === "tc6" ? "TC6" : seg)} onChange={e=>setHandy(p=>({...p,[seg]:{...p[seg],name:e.target.value}}))} style={{width:100,color:C.blue,fontWeight:700}} />
                            <button className="no-export" title="Remove segment" onClick={()=>setHandySegments(p=>p.filter(k=>k!==seg))} style={{border:0,background:"transparent",color:C.faint,cursor:"pointer"}}>×</button></td>
                          <td style={{ padding: "6px 10px" }}>
                            <input value={handy[seg].spotWS} onChange={e => setHandy(p => ({ ...p, [seg]: { ...p[seg], spotWS: e.target.value } }))} placeholder="WS" className="rpt-edit"
                              style={{ width: 55, fontSize: 12, fontWeight: 600 }} />
                          </td>
                          <td style={{padding:"6px 10px"}}><input aria-label={`${seg} TCE`} className="rpt-edit" value={handy[seg]?.tce||""} onChange={e=>setHandy(p=>({...p,[seg]:{...p[seg],tce:e.target.value}}))} placeholder="Free text" style={{width:100}}/></td>
                          <td style={{ padding: "6px 10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <FfaSparkline aug={handy[seg].ffaAug} sep={handy[seg].ffaSep} oct={handy[seg].ffaOct} />
                              <div style={{ display: "flex", gap: 4 }}>
                                {["ffaAug", "ffaSep", "ffaOct"].map(f => (
                                  <input key={f} value={handy[seg][f]} onChange={e => setHandy(p => ({ ...p, [seg]: { ...p[seg], [f]: e.target.value } }))}
                                    placeholder={({ffaAug:"BALMO",ffaSep:"+1",ffaOct:"+2"})[f]} className="rpt-edit"
                                    style={{ width: 55, fontSize: 10, color: C.dim }} />
                                ))}
                              </div>
                            </div>
                          </td>
                          <td style={{padding:"6px 10px"}}><input className="rpt-edit" value={handy[seg]?.comment||""} onChange={e=>setHandy(p=>({...p,[seg]:{...p[seg],comment:e.target.value}}))} placeholder="Comment" style={{width:"100%",minWidth:125}}/></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Recent fixtures — seeded from Cargoes tab selections, amendable here ── */}
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, textTransform: "uppercase", letterSpacing: "0.05em" }}>Recent fixtures</div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>{emailSectionTick("fixtures")}<button type="button" className="no-export" disabled={!fixtures.length} title="Remove all cargoes from this report only" onClick={()=>{setFixtures([]);setExcludedFixtureIds([]);setPendingFixtureDelete(null);}} style={{background:"transparent",border:"1px solid rgba(251,113,133,.4)",borderRadius:3,color:"#fb7185",fontSize:10,fontWeight:700,padding:"3px 8px",cursor:fixtures.length?"pointer":"default",opacity:fixtures.length?1:0.4}}>Remove all cargoes</button><button onClick={() => setFixtures(p => [...p, { vessel: "", charterer: "", qty: "", cargo: "", load: "", disch: "", laycanFrom: "", laycanTo: "", freight: "" }])} className="no-export"
                    style={{ background: ACCENT, border: "none", borderRadius: 3, color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 8px", cursor: "pointer" }}>+ Add</button></div>
                </div>
                {fixtures.length === 0 ? <div style={{ padding: 10, textAlign: "center", color: C.faint, fontSize: 10 }}>None yet — select cargoes in the Cargoes tab to import, or add manually</div> : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 640 }}>
                      <thead><tr>
                        <th className="no-export" style={{padding:"5px 6px",width:24}} title="Include all fixtures"><input type="checkbox" aria-label="Include all fixtures in email" style={exportCheckboxStyle} checked={fixtures.length>0 && fixtures.every((f,i)=>fixtureIsIncluded(f,i))} onChange={e=>setExcludedFixtureIds(e.target.checked?[]:fixtures.map((f,i)=>fixtureId(f,i)))}/></th>
                        {["Charterer", "Vessel", "Qty", "Cargo", "Load", "Disch", "From", "To", "Freight", ""].map((h,hi) => (
                          <th key={h} onClick={()=>h&&toggleFixtureSort(["charterer","vessel","qty","cargo","load","disch","laycanFrom","laycanTo","freight"][hi])} style={{ padding: "5px 8px", textAlign: "left", fontSize: 9, fontWeight: 700, color: C.dim, textTransform: "uppercase",cursor:h?"pointer":"default" }}>{h}{fixtureSort.key===["charterer","vessel","qty","cargo","load","disch","laycanFrom","laycanTo","freight"][hi]?(fixtureSort.dir===1?" ▲":" ▼"):""}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {sortedFixtures.map((f, displayIndex) => {const i=fixtures.indexOf(f);return (
                          <tr key={i} style={{ borderTop: "1px solid " + C.bd, opacity: fixtureIsIncluded(f,i)?1:0.42 }}>
                            <td className="no-export" style={{padding:"3px 6px"}}><input type="checkbox" aria-label={`Include ${f.vessel || f.charterer || "fixture"} in email`} style={exportCheckboxStyle} checked={fixtureIsIncluded(f,i)} disabled={chartererIsExcluded(f)} title={chartererIsExcluded(f)?"Excluded by charterer filter / recipient selection":"Include in email"} onChange={()=>toggleExcluded(setExcludedFixtureIds,fixtureId(f,i))}/></td>
                            {["charterer", "vessel", "qty", "cargo", "load", "disch", "laycanFrom", "laycanTo", "freight"].map(field => (
                              <td key={field} style={{ padding: "3px 5px" }}>
                                {field === "freight" ? (
                                  <input value={f.freight || ""} onChange={e => setFixtures(p => { const n = [...p]; n[i] = { ...n[i], freight: e.target.value }; return n; })}
                                    
                                    onBlur={() => setFixtures(p => p.map((row,j) => j===i ? {...row,freight:reportFixtureFreight(row.freight)} : row))}
                                    className="rpt-edit" style={{ width: 135, fontSize: 11 }} placeholder="USD 250K LS" />
                                ) : (
                                  <input value={f[field] || ""} onChange={e => setFixtures(p => { const n = [...p]; n[i] = { ...n[i], [field]: e.target.value, ...(REPORT_FIXTURE_TEXT_FIELDS.includes(field)?{_textOverrides:{...n[i]._textOverrides,[field]:true}}:{}) }; return n; })}
                                    className="rpt-edit" style={{ width: field === "qty" ? 65 : field === "vessel" ? 155 : field === "load" || field === "disch" ? 145 : field === "charterer" ? 120 : 100, fontSize: 11 }} />
                                )}
                              </td>
                            ))}
                            <td style={{ padding: "3px 5px" }}>
                              {pendingFixtureDelete === i ? (
                                <span className="no-export" style={{ display: "flex", gap: 4 }}>
                                  <button onClick={() => { setFixtures(p => p.filter((_, j) => j !== i)); setPendingFixtureDelete(null); }}
                                    style={{ background: C.red, border: "none", borderRadius: 3, color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 6px", cursor: "pointer" }}>Delete</button>
                                  <button onClick={() => setPendingFixtureDelete(null)} style={{ background: "none", border: "1px solid " + C.bd, borderRadius: 3, color: C.dim, fontSize: 9, padding: "2px 6px", cursor: "pointer" }}>✕</button>
                                </span>
                              ) : (
                                <button onClick={() => setPendingFixtureDelete(i)} className="no-export" style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>✕</button>
                              )}
                            </td>
                          </tr>
                        );})}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── TCE trend (50%) + Fixing window (50%) ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, alignItems:"stretch" }}>
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 10, minHeight:210,height:210,display:"flex",flexDirection:"column",overflow:"hidden",boxSizing:"border-box" }}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}><div style={{fontSize:11,fontWeight:700,color:C.tx}}>TCE trend</div>{emailSectionTick("tceChart")}</div>
                  <TCETrendMini lastMonth={tceStats.lastMonth} current={tceStats.current} ytd={tceStats.ytd} />
                </div>
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 10,minHeight:210,height:210,display:"flex",flexDirection:"column",overflow:"hidden",boxSizing:"border-box" }}>
                  <div style={{display:"flex",justifyContent:"flex-end",marginBottom:2}}>{emailSectionTick("fixingChart")}</div>
                  {importedFixingChart?.rows?.length
                    ? <ImportedFixingWindowChart snapshot={importedFixingChart}/>
                    : <BarLineChart data={fixHistory} barKey="ships" lineKey="avgWindow" barLabel="No. of ships" lineLabel="Avg. fix window" title="Fixing window (days)" accent="#4a90e2" loading={fixHistoryLoading} fillHeight={true} />}
                </div>
              </div>

              </div>{/* /marketPreviewRef */}

              {/* ── Hidden light-themed export node — captured for PNG/print instead of the dark editor above ── */}
              <div className="pos-print-wrap" style={{ height: 0, overflow: "hidden" }}>
              <div ref={lightExportRef} className="pos-print" style={{ width: 700, background: "#ffffff", color: "#16233f", fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" }}>
                <div style={{background:"#0b1f3f",padding:"14px 18px",display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:14}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#c9d8ee"}}>{intermediateTitle}</div>
                  <img src={INTERMEDIATE_HEADER_LOGO} alt="Steem1960 Shipbrokers" style={{width:190,height:50,objectFit:"contain",background:"#fff",borderRadius:4,padding:"3px 6px",boxSizing:"border-box"}} />
                  <div style={{fontSize:12,color:"#c9d8ee",textAlign:"right",whiteSpace:"nowrap"}}>{reportHeaderDate(reportDate)}</div>
                </div>
                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  {emailSections.drivers && (
                  <div style={{ background: "#eaf2fc", borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#0b1f3f", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{marketHeadings.drivers}</div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.6 }}>
                      {driverBullets.filter(b => b.trim()).map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                  )}

                  {emailSections.rates && (
                  <div>
                    <div style={{...reportHeadingStyle,marginBottom:8}}>{marketHeadings.benchmark}</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead><tr style={{ background: "#eaf2fc" }}>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>{intermediateRoutesLabel}</th>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>{routeTitles.spot}</th>
                        {routeColumns.lastWeek&&<th style={{padding:"5px 8px",textAlign:"left",color:"#6b7280"}}>{routeTitles.lastWeek}</th>}
                        {routeColumns.comment&&<th style={{padding:"5px 8px",textAlign:"left",color:"#6b7280"}}>{routeTitles.comment}</th>}
                      </tr></thead>
                      <tbody>
                        {benchmarkRows.filter(r=>!excludedBenchmarkKeys.includes(String(r.key))).map((r, i) => (
                          <tr key={r.key} style={{ borderTop: "1px solid #d9e2ef" }}>
                            <td style={{ padding: "5px 8px", fontWeight: 700 }}>{r.label}</td>
                            <td style={{ padding: "5px 8px" }}>{r.freight ? fmtUSD(r.freight) : "—"} {r.manualTce?.trim() ? <span style={{color:"#6b7280"}}>({/^usd/i.test(r.manualTce.trim())?r.manualTce.trim():`USD ${r.manualTce.trim().replace(/\s*k\s*(pd)?$/i,"")}k pd`})</span> : r.tce != null && <span style={{ color: "#6b7280" }}>(USD {Math.round(r.tce / 1000)}k pd)</span>}</td>
                            {routeColumns.lastWeek&&<td style={{padding:"5px 8px",color:"#6b7280"}}>{r.lastWeek ? fmtUSD(r.lastWeek) : "—"} {r.tceLastWeek != null && `(USD ${Math.round(r.tceLastWeek / 1000)}k pd)`}</td>}
                            {routeColumns.comment&&<td style={{padding:"5px 8px",color:"#6b7280"}}>{r.comment||""}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}

                  {emailSections.rates&&!excludedBenchmarkKeys.includes(String(weeklyHistory.routeKey||benchmarkRows[0]?.key))&&historyWeeks(reportDate).some(w=>String(weeklyHistory.series?.[weeklyHistory.routeKey||benchmarkRows[0]?.key]?.[w]??"").trim())&&<WeeklyBenchmarkPlot light values={weeklyHistory.series?.[weeklyHistory.routeKey||benchmarkRows[0]?.key]||{}} date={reportDate} title={(benchmarkRows.find(r=>r.key===(weeklyHistory.routeKey||benchmarkRows[0]?.key))?.label||"Benchmark")+" · weekly freight"}/>}

                  {emailSections.handy && (
                  <div>
                    <div style={{...reportHeadingStyle,marginBottom:8}}>{marketHeadings.handy}</div>
                    {handyCommentary && <div style={{fontSize:11,color:"#334155",whiteSpace:"pre-wrap",lineHeight:1.6,marginBottom:8}}>{handyCommentary}</div>}
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead><tr style={{ background: "#eaf2fc" }}>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>Segment</th>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>Spot WS</th><th style={{padding:"5px 8px",textAlign:"left",color:"#6b7280"}}>TCE</th>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 600, color: "#6b7280" }}>{reportFfaMonths(reportDate).join(" | ")}</th>
                        <th style={{padding:"5px 8px",textAlign:"left",color:"#6b7280"}}>Comment</th>
                      </tr></thead>
                      <tbody>
                        {handySegments.map((seg, i) => (
                          <tr key={seg} style={{ borderTop: "1px solid #d9e2ef" }}>
                            <td style={{ padding: "5px 8px", fontWeight: 700 }}>{handy[seg]?.name || (seg === "tc23" ? "TC23" : seg === "tc6" ? "TC6" : seg)}</td>
                            <td style={{ padding: "5px 8px" }}>{handy[seg].spotWS ? "WS " + handy[seg].spotWS : "—"}</td><td style={{padding:"5px 8px"}}>{handy[seg]?.tce||"—"}</td>
                            <td style={{ padding: "5px 8px", color: "#6b7280" }}><div style={{display:"flex",alignItems:"center",gap:10}}><FfaSparkline aug={handy[seg].ffaAug} sep={handy[seg].ffaSep} oct={handy[seg].ffaOct}/><span>{[handy[seg].ffaAug, handy[seg].ffaSep, handy[seg].ffaOct].filter(Boolean).map(v => "WS " + v).join(" / ") || "—"}</span></div></td>
                            <td style={{padding:"5px 8px",color:"#6b7280"}}>{handy[seg]?.comment||""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}



                  {emailSections.fixtures && (
                  <div>
                    <div style={{...reportHeadingStyle,marginBottom:8}}>Recent fixtures</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 10 }}>
                      <colgroup>
                        <col style={{width:"11%"}}/><col style={{width:"16%"}}/><col style={{width:"7%"}}/><col style={{width:"10%"}}/>
                        <col style={{width:"13%"}}/><col style={{width:"13%"}}/><col style={{width:"17%"}}/>
                        <col style={{width:"13%"}}/>
                      </colgroup>
                      <thead><tr style={{ background: "#eaf2fc" }}>
                        {["Charterer", "Vessel", "Qty", "Cargo", "Load", "Disch", "Laycan", "Freight"].map(h => (
                          <th key={h} style={{ padding: "4px 6px", textAlign: "left", fontWeight: 600, color: "#6b7280", whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {visibleExportFixtures.map((f, i) => (
                          <tr key={i} style={{ borderTop: "1px solid #d9e2ef" }}>
                            <td style={{ padding: "4px 6px" }}>{f.charterer || ""}</td>
                            <td style={{ padding: "4px 6px" }}>{f.vessel || ""}</td>
                            <td style={{ padding: "4px 6px" }}>{f.qty ?? ""}</td>
                            <td style={{ padding: "4px 6px" }}>{f.cargo || ""}</td>
                            <td style={{ padding: "4px 6px" }}>{f.load || ""}</td>
                            <td style={{ padding: "4px 6px" }}>{f.disch || ""}</td>
                            <td style={{ padding: "4px 6px", whiteSpace:"nowrap" }}>{[f.laycanFrom, f.laycanTo].filter(Boolean).join(" - ")}</td>
                            <td style={{ padding: "4px 6px", whiteSpace:"nowrap", paddingLeft:14 }}>{reportFixtureFreight(f.freight)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}

                  {emailSections.tce && (
                  <div>
                    <div style={{...reportHeadingStyle,marginBottom:8}}>{marketHeadings.tce}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,180px))", gap: 16, justifyContent: "center", textAlign: "center" }}>
                      {[["current", "Current"], ["lastMonth", "Last month avg"], ["ytd", "YTD avg"]].map(([k, label]) => (
                        <div key={k} style={{ background: "#eaf2fc", borderRadius: 6, padding: "6px 9px" }}>
                          <div style={{ fontSize: 9, color: "#6b7280", textTransform: "uppercase" }}>{label}</div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{tceStats[k] ? `USD ${Math.round(parseFloat(tceStats[k]) / 1000)}k pd` : "—"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  )}

                  {(emailSections.tceChart || emailSections.fixingChart) && (
                    <div style={{display:"grid",gridTemplateColumns:emailSections.tceChart&&emailSections.fixingChart?"1fr 1fr":"1fr",gap:12,padding:"12px 18px 12px",alignItems:"stretch"}}>
                      {emailSections.tceChart && <div style={{background:"#0b1f3f",borderRadius:6,padding:10,color:"#dbe6f5",minWidth:0,height:210,display:"flex",flexDirection:"column",overflow:"hidden",boxSizing:"border-box"}}>
                        <div style={{fontSize:11,fontWeight:700,marginBottom:6}}>TCE trend</div>
                        <TCETrendMini lastMonth={tceStats.lastMonth} current={tceStats.current} ytd={tceStats.ytd}/>
                      </div>}
                      {emailSections.fixingChart && <div style={{background:"#0b1f3f",borderRadius:6,padding:10,color:"#dbe6f5",minWidth:0,height:210,display:"flex",flexDirection:"column",overflow:"hidden",boxSizing:"border-box"}}>
                        {importedFixingChart?.rows?.length
                          ? <ImportedFixingWindowChart snapshot={importedFixingChart}/>
                          : <BarLineChart data={fixHistory} barKey="ships" lineKey="avgWindow" barLabel="No. of ships" lineLabel="Avg. fix window" title="Fixing window (days)" accent="#4a90e2" loading={fixHistoryLoading} fillHeight={true}/>}
                      </div>}
                    </div>
                  )}
                </div>
              </div>
              </div>
            </> : reportType === "Asia to Europe" ? <AsiaReportEditor logo={STEEM_LOGO} Sparkline={FfaSparkline} ffaMonths={reportFfaMonths(reportDate)} vessels={allVessels} value={asiaReport} onChange={setAsiaReport} fixtures={fixtures} setFixtures={setFixtures} setDate={setReportDate} date={reportDate} name={reportName} setName={setReportName} saveCopy={saveReportCopy} setSaveCopy={setSaveReportCopy} onSave={saveReport} busy={marketSaveBusy} status={marketSaveStatus} commentary={commentary} setCommentary={setCommentary} previewRef={lightExportRef} onCopy={handleMarketCopyEmail} onDownload={handleMarketDownloadPng} exportStatus={marketExportStatus}/> : <>
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: ACCENT }}>{reportType}</span>
                  <input aria-label="Report name" value={reportName} onChange={e=>setReportName(e.target.value)} placeholder={`${reportType} report name, e.g. Aramco`} style={{...IS,width:240,minWidth:120}} />
                <label style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,color:C.tx,whiteSpace:"nowrap",cursor:"pointer"}}><input type="checkbox" checked={saveReportCopy} onChange={e=>setSaveReportCopy(e.target.checked)} disabled={marketSaveBusy}/>Save as copy</label>
                <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} style={IS} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button disabled={marketSaveBusy} onClick={saveReport} style={{ ...SB, background: marketSaveStatus === "Saved!" ? "rgba(63,185,80,.16)" : C.bg3, border: "1px solid " + (marketSaveStatus === "Saved!" ? "#3fb950" : C.bd), color: marketSaveStatus === "Saved!" ? "#65d68b" : C.tx }}>{marketSaveStatus === "Saved!" ? "✓ Saved!" : marketSaveBusy ? "Saving..." : saveReportCopy ? "Save copy" : "Save"}</button>
                  <button onClick={() => window.print()} style={{ ...SB, background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.45)", color: "#6366f1" }}>Print</button>
                  <button onClick={async () => { try { await navigator.clipboard.writeText(`${reportType} · ${reportDate}\n\n${commentary}`); } catch {} }} style={{ ...SB, background: C.bg3, border: "1px solid " + C.bd, color: C.tx }}>Copy</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 11 }}>
                {[[avgRate > 0 ? avgRate.toFixed(0) : "—", "Average Rate", "WS Points", "rgba(102,126,234,0.12)", "rgba(102,126,234,0.3)", ACCENT],
                  [avgTCE > 0 ? `$${avgTCE.toFixed(0)}` : "—", "Average TCE", "per day", "rgba(63,185,80,0.12)", "rgba(63,185,80,0.3)", "#3fb950"],
                  [fixtures.length + quotes.length, "Market Activity", `${fixtures.length} fix · ${quotes.length} quotes`, "rgba(245,166,35,0.12)", "rgba(245,166,35,0.3)", "#f5a623"]
                ].map(([val, label, sub, bg, bdr, col]) => (
                  <div key={label} style={{ background: `linear-gradient(135deg,${bg},${bg})`, border: `1px solid ${bdr}`, borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 10, color: C.dim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: col }}>{val}</div>
                    <div style={{ fontSize: 10, color: C.faint, marginTop: 3 }}>{sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 13 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 10 }}>Freight Rates</div>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px" }}>
                  <thead><tr>
                    <th style={{ padding: "5px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>Size</th>
                    {Object.keys(rateGrid).length > 0 && Object.keys(Object.values(rateGrid)[0] || {}).map(r => (
                      <th key={r} style={{ padding: "5px 10px", textAlign: "center", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>{r}</th>
                    ))}
                  </tr></thead>
                  <tbody>{Object.keys(rateGrid).map(size => (
                    <tr key={size}>
                      <td style={{ padding: "5px 10px", background: C.bg3, borderRadius: "4px 0 0 4px", fontSize: 11, fontWeight: 700, color: C.tx }}>{size}</td>
                      {Object.keys(rateGrid[size]).map((route, j, arr) => (
                        <td key={route} style={{ padding: "3px 5px", background: C.bg3, borderRadius: j === arr.length - 1 ? "0 4px 4px 0" : 0, textAlign: "center" }}>
                          <input type="text" value={rateGrid[size][route]} onChange={e => setRateGrid(p => ({ ...p, [size]: { ...p[size], [route]: e.target.value } }))} placeholder="WS"
                            style={{ width: "100%", background: C.bg, border: "1px solid " + C.bd, borderRadius: 3, color: C.tx, fontSize: 11, padding: "4px 7px", textAlign: "center", outline: "none" }} />
                        </td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {reportType !== "TimeCharter" && (
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 13 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 10 }}>Indicative TCE ($/day)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,180px))", gap: 16, justifyContent: "center", textAlign: "center" }}>
                    {["10k", "15k", "20k"].map(seg => (
                      <div key={seg}>
                        <label style={{ display: "block", fontSize: 10, color: C.dim, marginBottom: 4, fontWeight: 700, textTransform: "uppercase" }}>{seg}</label>
                        <input type="text" value={tceEarnings[seg] || ""} onChange={e => setTceEarnings(p => ({ ...p, [seg]: e.target.value }))} placeholder="$"
                          style={{ width: "100%", background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 12, padding: "7px 9px", outline: "none", boxSizing: "border-box" }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 13 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 10 }}>Market Commentary</div>
                <textarea value={commentary} onChange={e => setCommentary(e.target.value)} placeholder="Market analysis, trends, outlook..."
                  style={{ width: "100%", minHeight: 80, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 12, padding: 9, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, alignItems:"stretch" }}>
                {[["Recent Fixtures", fixtures, setFixtures, ["charterer", "vessel", "route", "qty", "rate"]],
                  ["Market Quotes", quotes, setQuotes, ["route", "size", "rate", "basis"]]].map(([label, list, setList, fields]) => (
                  <div key={label} style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.tx }}>{label}</div>
                      <button onClick={() => setList(p => [...p, Object.fromEntries(fields.map(f => [f, ""]))])}
                        style={{ background: ACCENT, border: "none", borderRadius: 3, color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 8px", cursor: "pointer" }}>+ Add</button>
                    </div>
                    {list.length === 0 ? <div style={{ padding: 10, textAlign: "center", color: C.faint, fontSize: 10 }}>None added</div> : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {list.map((item, i) => (
                          <div key={i} style={{ background: C.bg3, borderRadius: 4, padding: 7, border: "1px solid " + C.bd }}>
                            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                              <button onClick={() => setList(p => p.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>✕</button>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: fields.length > 3 ? "1fr 1fr" : "1fr", gap: 4 }}>
                              {fields.map(f => (
                                <input key={f} type="text" value={item[f] || ""} onChange={e => setList(p => { const n = [...p]; n[i] = { ...n[i], [f]: e.target.value }; return n; })}
                                  placeholder={f.charAt(0).toUpperCase() + f.slice(1)}
                                  style={{ background: C.bg, border: "1px solid " + C.bd, borderRadius: 3, color: C.tx, fontSize: 10, padding: "3px 5px", outline: "none" }} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>}
          </div>
        )}

        {/* ── QUICK POSITIONS ──────────────────────────────────────────────── */}
        {section === "quick" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", background: C.bg2, borderBottom: "1px solid " + C.bd, flexWrap: "wrap", flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>Quick Positions</span>
              <input aria-label="Quick report name" value={quickReportName} onChange={e=>setQuickReportName(e.target.value)} style={{...IS,width:170}} placeholder="Saved report name"/>
              <label style={{fontSize:12,color:C.tx}}><input type="checkbox" checked={quickSaveCopy} onChange={e=>setQuickSaveCopy(e.target.checked)}/>Save as copy</label>
              <button onClick={()=>{setActiveQuickId(null);setQuickReportName("");setQuickSaveCopy(false);setQuickSelectedTags([]);setQuickUpdatedFilter("all");setQuickExcludedOperators([]);setQuickTableSort({key:null,desc:false});setQuickRows([]);}} style={{...SB,color:C.dim}}>New list</button>
              <input value={quickTitle} onChange={e => setQuickTitle(e.target.value)} style={{ ...IS, minWidth: 160 }} placeholder="Available tonnage" />
              <div style={{ flex: 1 }} />
              {quickSaveStatus && <span style={{ fontSize: 13, color: quickSaveStatus === "Saved ✓" ? "#43e97b" : C.dim }}>{quickSaveStatus}</span>}
              <button onClick={saveQuickPositions} disabled={listSaveBusy}
                style={{ ...SB, background: C.bg3, border: "1px solid " + C.bd, color: C.tx }}>
                Save
              </button>
              {quickRows.length > 0 && (
                <button onClick={() => { setPendingClear("quick"); }}
                  style={{ ...SB, background: "transparent", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}>Clear all</button>
              )}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Step 1 (25%) + Step 2 (75%) side by side */}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                {/* Step 1 */}
                <div style={{ flex: "0 0 25%", minWidth: 220, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 7, padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, marginBottom: 6 }}>Step 1 — Paste positions</div>
                  <textarea value={quickPaste}
                    onChange={e => { setQuickPaste(e.target.value); setQuickParseMsg(""); }}
                    onPaste={handleImagePaste}
                    placeholder="Paste text or picture"
                    style={{ width: "100%", minHeight: 200, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 5, color: C.tx, fontSize: 13, padding: 9, outline: "none", resize: "vertical", fontFamily: "monospace", lineHeight: 1.6, boxSizing: "border-box", opacity: quickImgParsing ? 0.5 : 1 }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button onClick={parsePaste} disabled={quickImgParsing} style={{ ...SB, background: "#0c1729", color: "#79c0ff", border: "1px solid #377dc8", opacity: quickImgParsing ? 0.5 : 1 }}>▶ Parse and add</button>
                    {quickPaste.trim() && <button onClick={() => { setQuickPaste(""); setQuickParseMsg(""); }} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: C.dim }}>Clear paste</button>}
                    <button onClick={addQuickRow} style={{ ...SB, background: "transparent", border: "1px solid " + C.bd, color: C.dim }} title="Add a blank row to fill in manually">+ Add row manually</button>
                    {quickImgParsing && <span style={{ fontSize: 13, color: ACCENT }}>⏳ {quickParseMsg}</span>}
                    {!quickImgParsing && quickParseMsg && <span style={{ fontSize: 13, color: quickParseMsg.startsWith("✓") ? "#43e97b" : "#f5a623" }}>{quickParseMsg}</span>}
                  </div>

                </div>

                {/* Step 2: Edit */}
                {quickRows.length > 0 && (
                  <div style={{ flex: "1 1 75%", minWidth: 0, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 7, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: 520 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderBottom: "1px solid " + C.bd, flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>Step 2 — Check &amp; edit ({quickRows.length} row{quickRows.length !== 1 ? "s" : ""}) — <span style={{ fontWeight: 400, color: C.faint }}>orange = operator not yet matched</span></div>
                      <button onClick={addQuickRow} style={{ fontSize: 12, color: ACCENT, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>+ Add row</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.85fr 0.65fr 1fr 85px 22px", background: ACCENT, color: "#fff", fontSize: 11, fontWeight: 700, padding: "5px 10px", gap: 6, flexShrink: 0 }}>
                      {[["operator","OPERATOR"],["vessel","VESSEL"],["port","PORT"],["date","DATE"],["direction","COMMENT"],["updatedAt","UPDATED"]].map(([key,label])=><button key={key} onClick={()=>sortQuickColumn(key)} title={key==="updatedAt"?"For selection only — excluded from output":"Sort by "+label} style={{background:"none",border:0,padding:0,color:"inherit",font:"inherit",textAlign:"left",cursor:"pointer"}}>{label}{quickTableSort.key===key?(quickTableSort.desc?" ▼":" ▲"):""}</button>)}<div></div>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                      {quickEditorRows.map((r, i) => {
                        const iOp = r.operator ? C.tx : "#f5a623";
                        const INP = (col) => ({ background: "transparent", border: "none", borderBottom: "1px solid rgba(58,130,246,0.28)", color: col || C.tx, fontSize: 10, outline: "none", padding: "1px 2px", width: "100%", fontFamily: "inherit", minWidth: 0 });
                        // Enter jumps to the same column, next row down — same field index across the grid
                        const jumpDown = (fieldIdx) => (e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          const cells = document.querySelectorAll(".quick-row-input");
                          const cols = 5; // operator, vessel, port, date, direction
                          const target = cells[(i + 1) * cols + fieldIdx];
                          target?.focus();
                        };
                        return (
                          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 0.85fr 0.65fr 1fr 85px 22px", background: i%2===0?"rgba(255,255,255,0.025)":"transparent", padding: "5px 10px", gap: 6, borderTop: "1px solid rgba(58,130,246,0.1)", alignItems: "center" }}>
                            <input className="quick-row-input" style={INP(iOp)} value={String(r.operator||"").toUpperCase()} onChange={e => updateQuickRow(r.id, "operator", e.target.value.toUpperCase())} onKeyDown={jumpDown(0)} placeholder="Type operator..." title={r.operator ? r.operator : "Not found in DB — type it here"} />
                            <input className="quick-row-input" style={{ ...INP(), fontWeight: 600 }} value={String(r.vessel||"").toUpperCase()} onChange={e => updateQuickRow(r.id, "vessel", e.target.value.toUpperCase())} onKeyDown={jumpDown(1)} placeholder="VESSEL" />
                            <input className="quick-row-input" style={INP()} value={String(r.port||"").toUpperCase()} onChange={e => updateQuickRow(r.id, "port", e.target.value.toUpperCase())} onKeyDown={jumpDown(2)} placeholder="PORT" />
                            <input className="quick-row-input" style={INP()} value={String(r.date||"").toUpperCase()} onChange={e => updateQuickRow(r.id, "date", e.target.value.toUpperCase())} onKeyDown={jumpDown(3)} placeholder="DATE" />
                            <input className="quick-row-input" style={{ ...INP(C.dim) }} value={String(r.comment??r.direction??"").toUpperCase()} onChange={e => updateQuickRow(r.id, "direction", e.target.value.toUpperCase())} onKeyDown={jumpDown(4)} placeholder="COMMENT" />
                            <span title="Position last updated — excluded from output" style={{fontSize:10,color:C.dim}}>{quickUpdatedDate(r,allVessels).toUpperCase()}</span>
                            <button onClick={() => deleteQuickRow(r.id)} style={{ background: "none", border: "none", color: "rgba(239,68,68,0.55)", cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 3: Preview + Copy */}
              {quickRows.length > 0 && (
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 7, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>Step 3 — Copy &amp; send</div>

                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:6}}><span style={{fontSize:12,color:C.dim,fontWeight:700}}>By operator</span><div style={{display:"flex",gap:6}}>
                        <button onClick={()=>copyQuick(false)} style={{...SB,color:quickCopied?"#43e97b":"#79c0ff",background:quickCopied?"rgba(67,233,123,.15)":C.bg3,borderColor:quickCopied?"#43e97b":C.bd}}>{quickCopied?"✓ Copied!":"Copy by operator"}</button>
                        <button onClick={()=>copyQuick(true)} style={{...SB,color:quickWhatsAppCopied?"#43e97b":"#79c0ff",background:quickWhatsAppCopied?"rgba(67,233,123,.15)":C.bg3,borderColor:quickWhatsAppCopied?"#43e97b":C.bd}}>{quickWhatsAppCopied?"✓ Copied!":"Copy for WhatsApp"}</button>
                      </div></div>
                      <pre style={{ margin: 0, fontFamily: "monospace", fontSize: 14, color: C.tx, lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word", background: C.bg3, padding: "10px 12px", borderRadius: 5 }}>
                        {buildQuickText()}
                      </pre>
                    </div>
                    <div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:6}}><span style={{fontSize:12,color:C.dim,fontWeight:700}}>By date (ascending)</span><button onClick={copyQuickByDate} style={{...SB,color:quickCopiedDate?"#43e97b":"#79c0ff",background:quickCopiedDate?"rgba(67,233,123,.15)":C.bg3,borderColor:quickCopiedDate?"#43e97b":C.bd}}>{quickCopiedDate?"✓ Copied!":"Copy by date ↑"}</button></div>
                      <pre style={{ margin: 0, fontFamily: "monospace", fontSize: 14, color: C.tx, lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word", background: C.bg3, padding: "10px 12px", borderRadius: 5 }}>
                        {buildQuickTextByDate()}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReportsTab;
