import React, { useState, useRef } from "react";
import { supabase } from "./supabaseclient";

// ── helpers ──────────────────────────────────────────────────────────────────
const COATING_COLS = [
  ["STST",       "Stainless"],
  ["Epoxy",      "Epoxy"],
  ["MarineLine", "MarineLine"],
  ["Interline",  "Interline"],
  ["Zinc",       "Zinc"],
];

function cleanNum(v) {
  if (!v) return 0;
  try { return parseInt(String(v).replace(/[\s\xa0]/g, "").replace(",", ".").split(".")[0], 10) || 0; }
  catch { return 0; }
}

function deriveCoating(row) {
  const best = COATING_COLS.map(([col, label]) => [label, cleanNum(row[col] || 0)])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : "";
}

function cleanDate(v) {
  if (!v || !v.trim()) return null;
  const months = {
    jan:"01",feb:"02",mar:"03",apr:"04",mai:"05",may:"05",
    jun:"06",jul:"07",aug:"08",sep:"09",okt:"10",oct:"10",
    nov:"11",des:"12",dec:"12",
  };
  const m = v.trim().toLowerCase().match(/^([a-z]{3})-(\d{2,4})$/);
  if (!m) return null;
  const yr = m[2].length === 2 ? "20" + m[2] : m[2];
  return `${yr}-${months[m[1]] || "01"}-01`;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  // Detect delimiter
  const delim = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delim).map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(delim).map(v => v.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, i) => row[h] = vals[i] || "");
    return row;
  });
}

function rowToRecord(row, isNB) {
  let cbm = cleanNum(row["CBM"] || 0);
  if (!cbm) {
    for (const [col] of COATING_COLS) {
      const v = cleanNum(row[col] || 0);
      if (v > 0) { cbm = v; break; }
    }
  }
  const imo = String(row["IMO No"] || "").replace(/\s/g, "").trim();
  const rec = {
    vessel:    (row["Ship Name"] || "").trim(),
    imo:       imo && imo !== "0" ? imo : null,
    dwt:       cleanNum(row["DWT"])    || null,
    loa:       cleanNum(row["LOA"])    || null,
    beam:      cleanNum(row["Beam"])   || null,
    cbm:       cbm                    || null,
    coating:   deriveCoating(row),
    built:     cleanNum(row["Built"]) || null,
    flag:      (row["Flag"]          || "").trim() || null,
    operator:  (row["Operator"]      || "").trim() || null,
    owner:     (row["Owner/Manager"] || "").trim() || null,
    ice_class: (row["Ice Class"]     || "").trim() || null,
    fuel_type: (row["Fuel Data"]     || "").trim() || null,
    tanks:     cleanNum(row["Tanks"]) || null,
    tier_name: (row["Tier Name"]     || "").trim() || null,
    comments:  (row["Comments"]      || "").trim() || null,
  };
  if (isNB) {
    rec.delivery_date = cleanDate(row["Dld"]          || "");
    rec.nb_contract   = cleanDate(row["NB Contract"]  || "");
    rec.yard          = (row["Yard"]             || "").trim() || null;
    rec.yard_no       = (row["YdNo"]             || "").trim() || null;
    rec.country_build = (row["Country of Build"] || "").trim() || null;
  }
  return rec;
}

// ─────────────────────────────────────────────────────────────────────────────
const CARD = {
  background:"rgba(12,23,43,0.95)", border:"1px solid rgba(58,130,246,0.18)",
  borderRadius:10, padding:"20px 24px", marginBottom:20,
};
const BTN = (active, col="#58a6ff") => ({
  fontSize:12, fontWeight:600, padding:"7px 18px", borderRadius:6, cursor: active?"pointer":"default",
  border:`1px solid ${active?col+"88":"rgba(58,130,246,0.2)"}`,
  background: active?col+"22":"rgba(58,130,246,0.05)",
  color: active?col:"rgba(120,160,200,0.4)",
  fontFamily:"inherit", opacity: active?1:0.5,
});
const TH = { fontSize:10, fontWeight:700, color:"rgba(120,160,220,0.5)", textTransform:"uppercase",
  letterSpacing:"0.08em", padding:"6px 10px", borderBottom:"1px solid rgba(58,130,246,0.12)",
  textAlign:"left", whiteSpace:"nowrap" };
const TD = { fontSize:11, padding:"5px 10px", borderBottom:"1px solid rgba(22,37,64,0.6)",
  color:"rgba(200,220,255,0.75)", whiteSpace:"nowrap" };

// ─────────────────────────────────────────────────────────────────────────────
export default function VesselUploader() {
  const [mode, setMode]         = useState("fleet"); // "fleet" | "newbuilds"
  const [rows, setRows]         = useState([]);
  const [fileName, setFileName] = useState("");
  const [status, setStatus]     = useState(null); // null | {type,msg}
  const [progress, setProgress] = useState(null); // {done,total}
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]   = useState(false);
  const fileRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStatus(null); setRows([]); setProgress(null);
    const isNB = file.name.toLowerCase().includes("newbuild") || mode === "newbuilds";
    if (isNB) setMode("newbuilds");
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseCSV(ev.target.result);
      const records = parsed.map(r => rowToRecord(r, isNB)).filter(r => r.vessel);
      setRows(records);
      setStatus({ type:"info", msg:`Parsed ${records.length} vessels from ${file.name}` });
    };
    reader.readAsText(file, "utf-8");
  }

  async function handleUpload() {
    if (!rows.length || uploading) return;
    setUploading(true);
    setStatus({ type:"info", msg:"Uploading…" });
    const table = mode === "newbuilds" ? "vessels_newbuilds" : "vessels_db";
    const BATCH = 400;
    let done = 0;
    const total = rows.length;
    let errors = 0;

    for (let i = 0; i < total; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      // Split: rows with IMO upsert on imo, rows without on vessel
      const withIMO    = batch.filter(r => r.imo);
      const withoutIMO = batch.filter(r => !r.imo);

      if (withIMO.length) {
        const { error } = await supabase.from(table).upsert(withIMO, { onConflict: "imo" });
        if (error) { console.error(error); errors++; }
      }
      if (withoutIMO.length) {
        const { error } = await supabase.from(table).upsert(withoutIMO, { onConflict: "vessel" });
        if (error) { console.error(error); errors++; }
      }
      done = Math.min(i + BATCH, total);
      setProgress({ done, total });
      // Small pause to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }

    setUploading(false);
    if (errors === 0) {
      setStatus({ type:"ok", msg:`✓ ${total} vessels upserted into ${table} successfully.` });
    } else {
      setStatus({ type:"warn", msg:`Completed with ${errors} batch error(s). Check console for details.` });
    }
    setProgress(null);
  }

  const coatingCount = {};
  rows.forEach(r => { coatingCount[r.coating || "—"] = (coatingCount[r.coating || "—"] || 0) + 1; });

  return (
    <div style={{ padding:"20px 24px", maxWidth:1100, margin:"0 auto", fontFamily:"Inter,sans-serif" }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:700, color:"#e8f2ff", marginBottom:4 }}>Vessel Database Uploader</div>
        <div style={{ fontSize:12, color:"rgba(120,160,200,0.5)" }}>
          Upload Barton CSV files to update the vessel database. Upserts by IMO — safe to re-run monthly.
        </div>
      </div>

      {/* Mode selector */}
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        {[["fleet","Existing Fleet","vessels_db"],["newbuilds","Newbuilds","vessels_newbuilds"]].map(([m,label,tbl])=>(
          <button key={m} onClick={()=>{setMode(m);setRows([]);setFileName("");setStatus(null);}}
            style={{...BTN(true, mode===m?"#58a6ff":"rgba(88,166,255,0.3)"),
              border:`1px solid ${mode===m?"rgba(88,166,255,0.6)":"rgba(58,130,246,0.2)"}`,
              background:mode===m?"rgba(88,166,255,0.15)":"transparent",
              color:mode===m?"#79c0ff":"rgba(120,160,200,0.5)"}}>
            {label}
            <span style={{fontSize:9,marginLeft:6,opacity:0.6}}>→ {tbl}</span>
          </button>
        ))}
      </div>

      {/* File drop */}
      <div style={{...CARD, borderStyle:"dashed", borderColor:"rgba(88,166,255,0.25)", cursor:"pointer",
        background:"rgba(8,18,38,0.7)", textAlign:"center"}}
        onClick={()=>fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={handleFile}/>
        <div style={{fontSize:28, marginBottom:8}}>📂</div>
        <div style={{fontSize:13, color:"rgba(160,200,255,0.7)", fontWeight:600}}>
          {fileName || `Click to select ${mode === "newbuilds" ? "Newbuilds" : "Existing Fleet"} CSV`}
        </div>
        <div style={{fontSize:11, color:"rgba(100,140,180,0.4)", marginTop:4}}>
          Semicolon-delimited CSV from Barton report
        </div>
      </div>

      {/* Summary */}
      {rows.length > 0 && (
        <div style={CARD}>
          <div style={{display:"flex", alignItems:"center", gap:20, flexWrap:"wrap", marginBottom:14}}>
            <div>
              <div style={{fontSize:24, fontWeight:700, color:"#58a6ff"}}>{rows.length.toLocaleString()}</div>
              <div style={{fontSize:10, color:"rgba(120,160,200,0.5)", textTransform:"uppercase"}}>Vessels parsed</div>
            </div>
            {Object.entries(coatingCount).sort((a,b)=>b[1]-a[1]).map(([k,v])=>(
              <div key={k}>
                <div style={{fontSize:18, fontWeight:700, color:
                  k==="Epoxy"?"#f59e0b":k==="Stainless"?"#67e8f9":k==="MarineLine"?"#4ade80":k==="Zinc"?"#a78bfa":"#f472b6"}}>
                  {v.toLocaleString()}
                </div>
                <div style={{fontSize:9, color:"rgba(120,160,200,0.4)", textTransform:"uppercase"}}>{k}</div>
              </div>
            ))}
            <div style={{marginLeft:"auto", display:"flex", gap:8}}>
              <button onClick={()=>setPreview(v=>!v)} style={{...BTN(true,"#94a3b8"), padding:"6px 14px"}}>
                {preview?"Hide":"Preview"} (first 20)
              </button>
              <button onClick={handleUpload} disabled={uploading}
                style={{...BTN(!uploading, "#43e97b"), padding:"6px 18px", fontSize:13}}>
                {uploading ? `Uploading… ${progress?.done||0}/${progress?.total||rows.length}` : `⬆ Upload to ${mode==="newbuilds"?"vessels_newbuilds":"vessels_db"}`}
              </button>
            </div>
          </div>

          {/* Progress bar */}
          {progress && (
            <div style={{height:4, background:"rgba(58,130,246,0.15)", borderRadius:2, marginBottom:12}}>
              <div style={{height:"100%", borderRadius:2, background:"#43e97b",
                width:`${Math.round(progress.done/progress.total*100)}%`, transition:"width 0.3s"}}/>
            </div>
          )}

          {/* Status */}
          {status && (
            <div style={{fontSize:12, fontWeight:600, padding:"8px 12px", borderRadius:6, marginBottom:preview?12:0,
              background:status.type==="ok"?"rgba(67,233,123,0.1)":status.type==="warn"?"rgba(250,184,74,0.1)":"rgba(88,166,255,0.08)",
              border:`1px solid ${status.type==="ok"?"rgba(67,233,123,0.3)":status.type==="warn"?"rgba(250,184,74,0.3)":"rgba(88,166,255,0.2)"}`,
              color:status.type==="ok"?"#43e97b":status.type==="warn"?"#faa356":"#79c0ff"}}>
              {status.msg}
            </div>
          )}

          {/* Preview table */}
          {preview && (
            <div style={{overflowX:"auto", marginTop:8}}>
              <table style={{borderCollapse:"collapse", width:"100%", minWidth:800}}>
                <thead>
                  <tr style={{background:"rgba(8,18,38,0.8)"}}>
                    {["Vessel","IMO","DWT","Coating","CBM","Built","Operator","Flag",
                      ...(mode==="newbuilds"?["Delivery","Yard"]:[])
                    ].map(h=><th key={h} style={TH}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0,20).map((r,i)=>(
                    <tr key={i} style={{background:i%2===0?"rgba(7,15,28,0.96)":"rgba(22,37,64,0.82)"}}>
                      <td style={{...TD,fontWeight:600,color:"rgba(230,240,255,1)"}}>{r.vessel}</td>
                      <td style={TD}>{r.imo||"—"}</td>
                      <td style={TD}>{r.dwt?.toLocaleString()||"—"}</td>
                      <td style={{...TD,color:
                        r.coating==="Epoxy"?"#f59e0b":r.coating==="Stainless"?"#67e8f9":
                        r.coating==="MarineLine"?"#4ade80":r.coating==="Zinc"?"#a78bfa":
                        r.coating==="Interline"?"#f472b6":"rgba(120,160,200,0.4)"}}>
                        {r.coating||"—"}
                      </td>
                      <td style={TD}>{r.cbm?.toLocaleString()||"—"}</td>
                      <td style={TD}>{r.built||"—"}</td>
                      <td style={TD}>{r.operator||"—"}</td>
                      <td style={TD}>{r.flag||"—"}</td>
                      {mode==="newbuilds"&&<>
                        <td style={{...TD,color:"#4fc3f7"}}>{r.delivery_date||"—"}</td>
                        <td style={TD}>{r.yard||"—"}</td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div style={{...CARD, background:"rgba(8,16,32,0.5)"}}>
        <div style={{fontSize:11, fontWeight:700, color:"rgba(120,160,220,0.5)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10}}>Monthly update workflow</div>
        {[
          ["1","Export CSVs from Barton","Use semicolon delimiter. Two files: Existing Fleet + Newbuilds."],
          ["2","Select mode above","Choose 'Existing Fleet' or 'Newbuilds' to match the file."],
          ["3","Click the upload area","Select the CSV file — it parses instantly in your browser."],
          ["4","Review the summary","Check vessel count and coating distribution looks right."],
          ["5","Click Upload","Upserts by IMO number — existing records update, new ones insert. Safe to re-run."],
        ].map(([n,title,desc])=>(
          <div key={n} style={{display:"flex",gap:12,marginBottom:8,alignItems:"flex-start"}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:"rgba(88,166,255,0.15)",
              border:"1px solid rgba(88,166,255,0.3)",color:"#79c0ff",fontSize:11,fontWeight:700,
              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{n}</div>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:"rgba(200,220,255,0.8)"}}>{title}</div>
              <div style={{fontSize:11,color:"rgba(120,160,200,0.45)",marginTop:1}}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
