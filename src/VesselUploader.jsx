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

// Barton workbook tab names are fixed — only the filename changes month to
// month. Mode → sheet name mapping so the uploader always reads the right
// tab without relying on filename text.
const SHEET_BY_MODE = {
  fleet:     "Existing Fleet",
  newbuilds: "Ships on Order",
};

// SheetJS (xlsx) loaded via CDN script tag attaching to window — static CDN
// URL imports fail in Vite, so this follows the same pattern already used
// for the html-to-image bundle elsewhere in the app.
let xlsxLoadPromise = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxLoadPromise) return xlsxLoadPromise;
  xlsxLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("Failed to load XLSX parser from CDN"));
    document.head.appendChild(script);
  });
  return xlsxLoadPromise;
}

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

// Handles the three shapes "Dld"/"NB Contract" can arrive in: a real JS
// Date (xlsx parsed with cellDates:true), an Excel serial number (fallback),
// or the legacy "MMM-YY" string from CSV exports.
function toISODate(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear(), m = String(v.getMonth()+1).padStart(2,"0"), d = String(v.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return cleanDate(String(v));
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
    rec.delivery_date = toISODate(row["Dld"]         || null);
    rec.nb_contract   = toISODate(row["NB Contract"] || null);
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
  const [staleRows, setStaleRows]     = useState([]); // vessels in DB but missing from this file
  const [staleLoading, setStaleLoading] = useState(false);
  const [syncMode, setSyncMode] = useState(true); // remove stale vessels on upload
  const [showStale, setShowStale] = useState(false);
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStatus(null); setRows([]); setProgress(null); setStaleRows([]);

    const ext = file.name.toLowerCase().split(".").pop();

    if (ext === "xlsx" || ext === "xls") {
      const isNB = mode === "newbuilds";
      const sheetName = SHEET_BY_MODE[mode];
      setStatus({ type:"info", msg:`Loading workbook and reading "${sheetName}" tab…` });
      try {
        const XLSX = await loadXLSX();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type:"array", cellDates:true });
        const sheet = wb.Sheets[sheetName];
        if (!sheet) {
          setStatus({ type:"warn", msg:`Sheet "${sheetName}" not found in this file. Tabs present: ${wb.SheetNames.join(", ")}` });
          return;
        }
        const parsed = XLSX.utils.sheet_to_json(sheet, { defval:"", raw:true });
        const records = parsed.map(r => rowToRecord(r, isNB)).filter(r => r.vessel);
        setRows(records);
        setStatus({ type:"info", msg:`Parsed ${records.length} vessels from "${sheetName}" (${file.name})` });
        checkStale(records, mode);
      } catch (err) {
        console.error(err);
        setStatus({ type:"warn", msg:`Failed to read workbook: ${err.message}` });
      }
      return;
    }

    // Legacy CSV path (semicolon-delimited single-sheet export)
    const isNB = file.name.toLowerCase().includes("newbuild") || mode === "newbuilds";
    if (isNB) setMode("newbuilds");
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseCSV(ev.target.result);
      const records = parsed.map(r => rowToRecord(r, isNB)).filter(r => r.vessel);
      setRows(records);
      setStatus({ type:"info", msg:`Parsed ${records.length} vessels from ${file.name}` });
      checkStale(records, isNB ? "newbuilds" : "fleet");
    };
    reader.readAsText(file, "utf-8");
  }

  // Compares the freshly parsed file against what's currently in Supabase
  // and finds IMO-matched rows that are no longer present — i.e. vessels
  // that have since delivered / been cancelled / removed from this tab.
  async function checkStale(records, forMode) {
    const table = forMode === "newbuilds" ? "vessels_newbuilds" : "vessels_db";
    const newImos = new Set(records.map(r => r.imo).filter(Boolean));
    setStaleLoading(true);
    const { data, error } = await supabase.from(table).select("imo,vessel").not("imo", "is", null).limit(20000);
    setStaleLoading(false);
    if (error) { console.error("stale-check fetch error:", error); return; }
    const missing = (data || []).filter(d => d.imo && !newImos.has(d.imo));
    setStaleRows(missing);
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

    let removeMsg = "";
    if (errors === 0 && syncMode && staleRows.length > 0) {
      setStatus({ type:"info", msg:`Removing ${staleRows.length} vessel(s) no longer in this file…` });
      const imos = staleRows.map(r => r.imo);
      const DEL_BATCH = 200;
      let delErrors = 0;
      for (let i = 0; i < imos.length; i += DEL_BATCH) {
        const chunk = imos.slice(i, i + DEL_BATCH);
        const { error } = await supabase.from(table).delete().in("imo", chunk);
        if (error) { console.error(error); delErrors++; }
      }
      removeMsg = delErrors === 0
        ? ` Removed ${staleRows.length} vessel(s) no longer in file.`
        : ` Warning: some removals failed — check console.`;
      setStaleRows([]);
    }

    if (errors === 0) {
      setStatus({ type:"ok", msg:`✓ ${total} vessels upserted into ${table} successfully.${removeMsg}` });
    } else {
      setStatus({ type:"warn", msg:`Completed with ${errors} batch error(s). Check console for details.${removeMsg}` });
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
          Upload the Barton .xlsx directly — the correct tab is read automatically per mode. Upserts by IMO and can remove vessels that dropped off the tab (delivered/cancelled). Safe to re-run monthly.
        </div>
      </div>

      {/* Mode selector */}
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        {[["fleet","Existing Fleet","vessels_db"],["newbuilds","Newbuilds","vessels_newbuilds"]].map(([m,label,tbl])=>(
          <button key={m} onClick={()=>{setMode(m);setRows([]);setFileName("");setStatus(null);setStaleRows([]);}}
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
        <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{display:"none"}} onChange={handleFile}/>
        <div style={{fontSize:28, marginBottom:8}}>📂</div>
        <div style={{fontSize:13, color:"rgba(160,200,255,0.7)", fontWeight:600}}>
          {fileName || `Click to select the Barton file (.xlsx or CSV)`}
        </div>
        <div style={{fontSize:11, color:"rgba(100,140,180,0.4)", marginTop:4}}>
          .xlsx reads the "{SHEET_BY_MODE[mode]}" tab automatically — or drop a semicolon-delimited CSV export
        </div>
      </div>

      {/* Stale-vessel warning (vessels in DB but missing from this file — likely delivered/cancelled) */}
      {(staleLoading || staleRows.length > 0) && (
        <div style={{...CARD, borderColor:"rgba(250,184,74,0.3)", background:"rgba(250,184,74,0.05)"}}>
          {staleLoading ? (
            <div style={{fontSize:12, color:"rgba(250,184,74,0.8)"}}>Checking for vessels no longer in this file…</div>
          ) : (
            <>
              <div style={{display:"flex", alignItems:"center", gap:12, flexWrap:"wrap"}}>
                <div style={{fontSize:12, fontWeight:600, color:"#faa356"}}>
                  {staleRows.length} vessel(s) in the database are missing from this file — likely delivered, cancelled, or removed.
                </div>
                <button onClick={()=>setShowStale(v=>!v)} style={{...BTN(true,"#faa356"), padding:"4px 10px"}}>
                  {showStale?"Hide":"Show"} list
                </button>
                <label style={{display:"flex", alignItems:"center", gap:6, fontSize:11, color:"rgba(250,184,74,0.8)", marginLeft:"auto", cursor:"pointer"}}>
                  <input type="checkbox" checked={syncMode} onChange={e=>setSyncMode(e.target.checked)} />
                  Remove these on upload (sync mode)
                </label>
              </div>
              {showStale && (
                <div style={{marginTop:10, maxHeight:180, overflowY:"auto", fontSize:11, color:"rgba(250,220,180,0.8)"}}>
                  {staleRows.map(r=>(
                    <div key={r.imo} style={{padding:"3px 0", borderBottom:"1px solid rgba(250,184,74,0.1)"}}>
                      {r.vessel} <span style={{opacity:0.5}}>· IMO {r.imo}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

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
                {uploading ? `Uploading… ${progress?.done||0}/${progress?.total||rows.length}` :
                  syncMode && staleRows.length>0 ? `⬆ Upload & Remove ${staleRows.length} → ${mode==="newbuilds"?"vessels_newbuilds":"vessels_db"}` :
                  `⬆ Upload to ${mode==="newbuilds"?"vessels_newbuilds":"vessels_db"}`}
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
          ["1","Select mode above","Choose 'Existing Fleet' or 'Newbuilds' — this decides which Barton tab gets read."],
          ["2","Click the upload area","Select the monthly Barton .xlsx file (same file works for both modes — just re-select mode and upload again for the other tab)."],
          ["3","Review the summary","Check vessel count, coating distribution, and the removal warning (if any vessels dropped off the tab)."],
          ["4","Click Upload","Upserts by IMO — existing records update, new ones insert. With sync mode on, vessels missing from the file (delivered/cancelled) are removed too. Safe to re-run."],
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
