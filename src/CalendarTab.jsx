import React, { useState, useEffect, useMemo, useRef } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

const STORAGE_KEY = "signal_calendar_events";

async function loadEventsFromDB() {
  try {
    const { data, error } = await supabase.from("calendar_events").select("*").order("date");
    if (!error && data?.length) {
      return data.map(r => ({
        id: r.id,
        title: r.title,
        date: r.date,
        endDate: r.end_date || "",
        color: r.category || "",
        note: r.note || "",
        image: r.image || null,
      }));
    }
  } catch(e) { console.warn("calendar load error", e); }
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}

async function saveEventsToDB(events) {
  try {
    if (events.length > 0) {
      const rows = events.map(e => ({
        id: e.id,
        title: e.title || "",
        date: e.date || "",
        end_date: e.endDate || null,
        category: e.color || null,
        note: e.note || null,
        image: e.image || null,
      }));
      const { error: upsertErr } = await supabase
        .from("calendar_events")
        .upsert(rows, { onConflict: "id" });
      if (upsertErr) {
        console.error("calendar upsert error:", upsertErr);
        window._calendarSaveError = upsertErr.message;
      } else {
        window._calendarSaveError = null;
        // Clean up deleted events
        const ids = events.map(e => e.id);
        await supabase.from("calendar_events").delete().not("id","in",`(${ids.map(i=>JSON.stringify(i)).join(",")})`);
      }
    } else {
      // Delete all
      const { error } = await supabase.from("calendar_events").delete().neq("id","___none___");
      if (error) console.error("calendar delete error:", error);
    }
  } catch(e) { console.warn("calendar save error", e); }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch {}
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// Parse YYYY-MM-DD as LOCAL date — avoids UTC-midnight timezone shift
function parseLocal(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}
// Date → YYYY-MM-DD local
function toStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
// Today string
function todayStr() {
  return toStr(new Date());
}
// Format dd/mm/yyyy
function fmtShort(str) {
  if (!str) return "";
  const [y, m, d] = str.split("-");
  return d + "/" + m + "/" + y;
}
// Format "9 Jun 2026"
function fmtLong(str) {
  if (!str) return "";
  return parseLocal(str).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function daysUntil(str) {
  const a = parseLocal(todayStr()), b = parseLocal(str);
  return Math.round((b - a) / 86400000);
}

const COLORS = ["#58a6ff","#43e97b","#faa356","#c792ea","#f472b6","#4fc3f7","#fb7185","#a3e635"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const BLANK = { title:"", date:"", endDate:"", color:COLORS[0], note:"", image:null };

// Custom date input — always shows dd/mm/yyyy regardless of OS locale
// value: "YYYY-MM-DD", onChange: (yyyymmdd) => void
function DateInput({ value, onChange, style, placeholder="dd/mm/yyyy" }) {
  // Display as dd/mm/yyyy
  const display = value ? value.split("-").reverse().join("/") : "";
  const [raw, setRaw] = React.useState(display);
  const [focused, setFocused] = React.useState(false);

  // Keep raw in sync when value changes externally (e.g. openAdd sets form.date)
  React.useEffect(() => {
    if (!focused) setRaw(value ? value.split("-").reverse().join("/") : "");
  }, [value, focused]);

  function handleChange(e) {
    let v = e.target.value;
    // Auto-insert slashes
    v = v.replace(/[^0-9]/g, "");
    if (v.length > 2) v = v.slice(0,2) + "/" + v.slice(2);
    if (v.length > 5) v = v.slice(0,5) + "/" + v.slice(5);
    if (v.length > 10) v = v.slice(0,10);
    setRaw(v);
    // Parse complete dates
    const parts = v.split("/");
    if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
      const [dd, mm, yyyy] = parts.map(Number);
      if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yyyy >= 2020 && yyyy <= 2100) {
        const iso = yyyy + "-" + String(mm).padStart(2,"0") + "-" + String(dd).padStart(2,"0");
        onChange(iso);
      }
    } else if (v === "") {
      onChange("");
    }
  }

  function handleBlur() {
    setFocused(false);
    // Reset display to formatted value
    setRaw(value ? value.split("-").reverse().join("/") : "");
  }

  return (
    <input
      value={focused ? raw : display}
      onChange={handleChange}
      onFocus={() => { setFocused(true); setRaw(display); }}
      onBlur={handleBlur}
      placeholder={placeholder}
      maxLength={10}
      style={style}
    />
  );
}

// SmartEndDateInput — type just "27" to get same month as start, "27/7" for July 27
function SmartEndDateInput({ value, startDate, onChange, style }) {
  const [raw, setRaw] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const display = value ? value.split("-").reverse().join("/") : "";

  React.useEffect(() => {
    if (!focused) setRaw(display);
  }, [value, focused]);

  function handleChange(e) {
    let v = e.target.value.replace(/[^0-9/]/g, "");
    setRaw(v);
  }

  function handleBlur() {
    setFocused(false);
    const v = raw.trim();
    if (!v) { onChange(""); setRaw(""); return; }

    const ref = startDate ? parseLocal(startDate) : new Date();
    const refDay = ref.getDate();
    const refMonth = ref.getMonth() + 1;
    const refYear = ref.getFullYear();

    let day, month = refMonth, year = refYear;

    // Just a number: "27" → 27th of same month
    if (/^\d{1,2}$/.test(v)) {
      day = parseInt(v);
    }
    // "27/7" or "27/07" → 27 Jul
    else if (/^\d{1,2}\/\d{1,2}$/.test(v)) {
      const [d, m] = v.split("/").map(Number);
      day = d; month = m;
    }
    // "27/07/2026" or "27/7/26" — full date
    else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v)) {
      const parts = v.split("/").map(Number);
      day = parts[0]; month = parts[1];
      year = parts[2] < 100 ? 2000 + parts[2] : parts[2];
    }
    // Already formatted dd/mm/yyyy
    else {
      // Try to parse as-is using DateInput logic
      const parts = v.split("/");
      if (parts.length === 3) {
        const [dd, mm, yyyy] = parts.map(Number);
        if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
          day = dd; month = mm; year = yyyy < 100 ? 2000 + yyyy : yyyy;
        }
      }
    }

    if (day && day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const iso = year + "-" + String(month).padStart(2,"0") + "-" + String(day).padStart(2,"0");
      onChange(iso);
      setRaw(String(day).padStart(2,"0") + "/" + String(month).padStart(2,"0") + "/" + year);
    } else {
      setRaw(display);
    }
  }

  return (
    <input
      value={focused ? raw : display}
      onChange={handleChange}
      onFocus={() => { setFocused(true); setRaw(""); }}
      onBlur={handleBlur}
      placeholder="dd or dd/mm"
      style={style}
    />
  );
}
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelId, setConfirmDelId] = useState(null);
  const today = todayStr();
  const todayDate = parseLocal(today);
  const [startYear, setStartYear] = useState(todayDate.getFullYear());
  const [startMonth, setStartMonth] = useState(todayDate.getMonth());
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  // Paste screenshot into notes
  function handleNotesPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        const r = new FileReader();
        r.onload = () => setForm(f => ({...f, image: r.result}));
        r.readAsDataURL(file);
        return;
      }
    }
  }
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...BLANK, date: today });
  const imgRef = useRef(null);

  const didLoad = useRef(false);
  useEffect(() => { loadEventsFromDB().then(ev => { setEvents(ev || []); setLoading(false); didLoad.current=true; }); }, []);
  useEffect(() => { if (didLoad.current) saveEventsToDB(events); }, [events]);

  const inp = { background:"rgba(8,16,32,0.95)", border:"1px solid rgba(58,130,246,0.25)", borderRadius:5, color:"#cde", fontFamily:"inherit", fontSize:14, padding:"6px 10px", outline:"none", width:"100%", boxSizing:"border-box", colorScheme:"dark" };
  const btn = (on) => ({ fontSize:13, fontWeight:600, padding:"3px 10px", borderRadius:4, cursor:"pointer", fontFamily:"inherit", border:"1px solid "+(on?"rgba(88,166,255,0.55)":"rgba(58,130,246,0.18)"), background:on?"rgba(88,166,255,0.16)":"rgba(8,16,32,0.85)", color:on?"#d9ecff":"rgba(140,175,230,0.55)" });

  const months = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 3; i++) {
      let m = startMonth + i, y = startYear;
      while (m > 11) { m -= 12; y++; }
      arr.push({ year:y, month:m });
    }
    return arr;
  }, [startYear, startMonth]);

  const byDate = useMemo(() => {
    const idx = {};
    for (const e of events) {
      if (!e.date) continue;
      const start = parseLocal(e.date);
      const end = e.endDate ? parseLocal(e.endDate) : new Date(start);
      let cur = new Date(start);
      while (cur <= end) {
        const k = toStr(cur);
        if (!idx[k]) idx[k] = [];
        idx[k].push(e);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return idx;
  }, [events]);

  const upcoming = useMemo(() =>
    [...events].filter(e => e.date >= today).sort((a,b) => a.date.localeCompare(b.date)),
    [events, today]);

  function buildGrid(year, month) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDow = (first.getDay() + 6) % 7;
    const days = [];
    for (let i = startDow - 1; i >= 0; i--) days.push({ d: new Date(year, month, -i), cur:false });
    for (let i = 1; i <= last.getDate(); i++) days.push({ d: new Date(year, month, i), cur:true });
    while (days.length % 7 !== 0) days.push({ d: new Date(year, month+1, days.length - last.getDate() - startDow + 1), cur:false });
    return days;
  }

  function openAdd(dateStr) {
    setEditId(null);
    setForm({ ...BLANK, date: dateStr || today });
    setShowForm(true);
  }

  function openEdit(e, ev) {
    if (ev) ev.stopPropagation();
    setEditId(e.id);
    setForm({ title:e.title, date:e.date, endDate:e.endDate||"", color:e.color||COLORS[0], note:e.note||"", image:e.image||null });
    setShowForm(true);
  }

  function save() {
    if (!form.title.trim() || !form.date) return;
    if (editId) setEvents(prev => prev.map(e => e.id===editId ? {...e,...form} : e));
    else setEvents(prev => [...prev, { id:"ev_"+Date.now(), ...form }]);
    setShowForm(false); setEditId(null);
  }

  function del(id, ev) {
    if (ev) ev.stopPropagation();
    setConfirmDelId(id);
  }
  function confirmDel() {
    setEvents(prev => prev.filter(e => e.id !== confirmDelId));
    if (editId === confirmDelId) { setShowForm(false); setEditId(null); }
    setConfirmDelId(null);
  }

  function handleImg(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => setForm(f => ({...f, image:r.result}));
    r.readAsDataURL(file);
  }

  function prevPeriod() { let m=startMonth-3,y=startYear; while(m<0){m+=12;y--;} setStartYear(y);setStartMonth(m); }
  function nextPeriod() { let m=startMonth+3,y=startYear; while(m>11){m-=12;y++;} setStartYear(y);setStartMonth(m); }

  const BG = "rgba(8,16,32,0.97)";
  const HDR = "rgba(10,20,40,0.99)";
  const BOR = "rgba(58,130,246,0.16)";

  return (
    <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
      {window._calendarSaveError&&(
        <div style={{position:"fixed",top:60,right:20,zIndex:9999,background:"rgba(255,107,107,0.15)",border:"1px solid rgba(255,107,107,0.5)",borderRadius:6,padding:"8px 14px",fontSize:12,color:"#ff6b6b",maxWidth:400}}>
          ⚠ Calendar not saving to Supabase: {window._calendarSaveError}
        </div>
      )}
      {confirmDelId&&(
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={()=>setConfirmDelId(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#0a1628",border:"1px solid rgba(248,113,113,0.4)",borderRadius:8,padding:"20px 24px",minWidth:300,boxShadow:"0 8px 32px rgba(0,0,0,0.7)"}}>
            <div style={{fontSize:14,fontWeight:600,color:"#e8f2ff",marginBottom:8}}>Delete this event?</div>
            <div style={{fontSize:12,color:"rgba(160,200,255,0.6)",marginBottom:16}}>{events.find(e=>e.id===confirmDelId)?.title||""}</div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={confirmDel} style={{flex:1,background:"rgba(248,113,113,0.15)",border:"1px solid rgba(248,113,113,0.4)",borderRadius:5,color:"#f87171",fontFamily:"inherit",fontWeight:700,fontSize:13,padding:"7px",cursor:"pointer"}}>Delete</button>
              <button onClick={()=>setConfirmDelId(null)} style={{flex:1,background:"rgba(10,20,42,0.9)",border:"1px solid rgba(58,130,246,0.2)",borderRadius:5,color:"rgba(140,175,230,0.7)",fontFamily:"inherit",fontSize:13,padding:"7px",cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── LEFT: 3 months ── */}
      <div style={{flex:1,minWidth:0}}>
        {/* Nav */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <button onClick={prevPeriod} style={{...btn(false),padding:"4px 12px",fontSize:14}}>‹</button>
          <span style={{fontSize:15,fontWeight:700,color:"rgba(200,220,255,0.8)",minWidth:220}}>
            {MONTHS[startMonth]} {startYear}{" — "}{(()=>{let m=startMonth+2,y=startYear;while(m>11){m-=12;y++;}return MONTHS[m]+" "+y;})()}
          </span>
          <button onClick={nextPeriod} style={{...btn(false),padding:"4px 12px",fontSize:14}}>›</button>
          <button onClick={()=>{setStartMonth(todayDate.getMonth());setStartYear(todayDate.getFullYear());}} style={btn(false)}>Today</button>
          <span style={{flex:1}}/>
          <button onClick={()=>openAdd(today)} style={{...btn(true),padding:"6px 18px",fontSize:14,fontWeight:700}}>+ Add Event</button>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {months.map(({year,month})=>{
            const grid=buildGrid(year,month);
            const isCur=year===todayDate.getFullYear()&&month===todayDate.getMonth();
            return(
              <div key={year+"-"+month} style={{border:"1px solid "+BOR,borderRadius:8,overflow:"hidden",background:BG}}>
                {/* Month header */}
                <div style={{padding:"7px 14px",background:HDR,borderBottom:"1px solid "+BOR,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:15,fontWeight:700,letterSpacing:"0.02em",color:isCur?"#58a6ff":"rgba(180,210,255,0.6)"}}>{MONTHS[month]} {year}</span>
                  {isCur&&<span style={{fontSize:11,fontWeight:700,background:"rgba(88,166,255,0.15)",border:"1px solid rgba(88,166,255,0.3)",borderRadius:3,padding:"1px 6px",color:"#58a6ff",textTransform:"uppercase",letterSpacing:"0.08em"}}>Now</span>}
                </div>
                {/* Day name headers */}
                <div style={{display:"grid",gridTemplateColumns:"28px repeat(7,1fr)",background:"rgba(10,20,40,0.96)",borderBottom:"1px solid rgba(58,130,246,0.07)"}}>
                  <div style={{padding:"3px",fontSize:10,color:"rgba(120,160,220,0.25)",textAlign:"center",fontWeight:700}}>Wk</div>
                  {DAYS.map(d=><div key={d} style={{padding:"3px 2px",fontSize:11,fontWeight:700,color:d==="Sat"||d==="Sun"?"rgba(120,160,220,0.25)":"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"center"}}>{d}</div>)}
                </div>
                {/* Week rows */}
                {Array.from({length:grid.length/7},(_,wi)=>{
                  const week=grid.slice(wi*7,wi*7+7);
                  const wn=getWeekNumber(week[0].d);
                  return(
                    <div key={wi} style={{display:"grid",gridTemplateColumns:"28px repeat(7,1fr)",borderTop:"1px solid rgba(58,130,246,0.06)"}}>
                      <div style={{padding:"3px 2px",fontSize:10,color:"rgba(120,160,220,0.2)",textAlign:"center",background:"rgba(10,20,40,0.45)",paddingTop:6}}>{wn}</div>
                      {week.map(({d,cur})=>{
                        const ds=toStr(d);
                        const isToday=ds===today;
                        const evs=byDate[ds]||[];
                        const isSat=d.getDay()===6, isSun=d.getDay()===0;
                        return(
                          <div key={ds} onClick={()=>cur&&openAdd(ds)}
                            style={{minHeight:72,padding:"3px 3px 2px",background:isToday?"rgba(88,166,255,0.07)":"transparent",cursor:cur?"pointer":"default",borderLeft:"1px solid rgba(58,130,246,0.05)",position:"relative"}}>
                            <div style={{fontSize:12,fontWeight:isToday?700:400,marginBottom:2,display:"flex",justifyContent:"flex-end",paddingRight:2}}>
                              {isToday
                                ?<span style={{width:17,height:17,background:"#58a6ff",borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,fontWeight:700}}>{d.getDate()}</span>
                                :<span style={{color:cur?(isSat||isSun?"rgba(120,160,220,0.28)":"rgba(170,200,240,0.5)"):"rgba(90,120,170,0.18)"}}>{d.getDate()}</span>}
                            </div>
                            {evs.slice(0,3).map(e=>(
                              <div key={e.id}
                                onClick={ev=>{ev.stopPropagation();openEdit(e,ev);}}
                                title={e.title}
                                style={{fontSize:11,background:(e.color||"#58a6ff")+"22",border:"1px solid "+(e.color||"#58a6ff")+"45",borderRadius:2,padding:"1px 3px",marginBottom:1,color:e.color||"#58a6ff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.5,cursor:"pointer"}}>
                                {e.title}
                              </div>
                            ))}
                            {evs.length>3&&<div style={{fontSize:10,color:"rgba(120,160,220,0.35)"}}>+{evs.length-3}</div>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT: Form + Upcoming ── */}
      <div style={{width:320,flexShrink:0,display:"flex",flexDirection:"column",gap:12,position:"sticky",top:80}}>

        {/* Form */}
        {showForm?(
          <div style={{border:"1px solid rgba(88,166,255,0.28)",borderRadius:8,overflow:"hidden",background:BG}}>
            <div style={{padding:"8px 12px",background:HDR,borderBottom:"1px solid "+BOR,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:13,fontWeight:700,color:"rgba(120,160,220,0.6)",textTransform:"uppercase",letterSpacing:"0.08em"}}>{editId?"Edit Event":"New Event"}</span>
              {editId&&<button onClick={ev=>del(editId,ev)} style={{background:"none",border:"none",color:"rgba(248,113,113,0.55)",fontSize:13,cursor:"pointer",fontFamily:"inherit",padding:0}}>🗑 Delete</button>}
            </div>
            <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
              {/* Title */}
              <div>
                <div style={{fontSize:12,color:"rgba(120,160,220,0.5)",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em"}}>Title *</div>
                <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} style={inp} placeholder="e.g. BIMCO Annual Meeting" autoFocus/>
              </div>
              {/* Dates */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div>
                  <div style={{fontSize:12,color:"rgba(120,160,220,0.5)",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em"}}>Start *</div>
                  <DateInput value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} style={inp} placeholder="dd/mm/yyyy"/>
                </div>
                <div>
                  <div style={{fontSize:12,color:"rgba(120,160,220,0.5)",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em"}}>End</div>
                  <SmartEndDateInput value={form.endDate} startDate={form.date} onChange={v=>setForm(f=>({...f,endDate:v}))} style={inp}/>
                </div>
              </div>
                <div>
                <div style={{fontSize:12,color:"rgba(120,160,220,0.5)",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em"}}>Notes <span style={{fontWeight:400,textTransform:"none",letterSpacing:0,color:"rgba(120,160,220,0.3)"}}>— paste screenshot with Ctrl+V</span></div>
                <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
                  onPaste={handleNotesPaste}
                  style={{...inp,minHeight:130,resize:"vertical",lineHeight:1.65}}
                  placeholder="Details, contacts, agenda items… paste screenshot here"/>
              </div>
              {/* Image */}
              <div>
                <div style={{fontSize:12,color:"rgba(120,160,220,0.5)",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.07em"}}>Screenshot</div>
                <input ref={imgRef} type="file" accept="image/*" onChange={handleImg} style={{display:"none"}}/>
                <button onClick={()=>imgRef.current?.click()} style={{...btn(false),padding:"5px 14px",fontSize:13}}>
                  📎 {form.image?"Replace image":"Attach screenshot"}
                </button>
                {form.image&&(
                  <div style={{position:"relative",marginTop:6}}>
                    <img src={form.image} alt="" style={{width:"100%",borderRadius:4,border:"1px solid "+BOR}}/>
                    <button onClick={()=>setForm(f=>({...f,image:null}))}
                      style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,0.72)",border:"none",borderRadius:"50%",width:18,height:18,color:"#fff",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>✕</button>
                  </div>
                )}
              </div>
              {/* Color */}
              <div>
                <div style={{fontSize:12,color:"rgba(120,160,220,0.5)",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.07em"}}>Color</div>
                <div style={{display:"flex",gap:6}}>
                  {COLORS.map(col=>(
                    <div key={col} onClick={()=>setForm(f=>({...f,color:col}))}
                      style={{width:18,height:18,borderRadius:"50%",background:col,cursor:"pointer",border:form.color===col?"2px solid #fff":"2px solid transparent",boxShadow:form.color===col?"0 0 6px "+col:"none",transition:"all 0.1s"}}/>
                  ))}
                </div>
              </div>
              {/* Buttons */}
              <div style={{display:"flex",gap:8,marginTop:2}}>
                <button onClick={save} style={{flex:1,...btn(true),padding:"7px 0",fontSize:14,fontWeight:700}}>{editId?"Save changes":"Add event"}</button>
                <button onClick={()=>{setShowForm(false);setEditId(null);}} style={{...btn(false),padding:"7px 14px",fontSize:14}}>Cancel</button>
              </div>
            </div>
          </div>
        ):(
          <button onClick={()=>openAdd(today)} style={{...btn(true),padding:"8px 0",fontSize:14,fontWeight:700,width:"100%"}}>+ New Event</button>
        )}

        {/* Search + Upcoming */}
        <div style={{border:"1px solid "+BOR,borderRadius:8,overflow:"hidden",background:BG}}>
          <div style={{padding:"7px 12px",background:HDR,borderBottom:"1px solid "+BOR,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:13,fontWeight:700,color:"rgba(120,160,220,0.6)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Upcoming</span>
            <div style={{flex:1,position:"relative"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search events…"
                style={{width:"100%",background:"rgba(8,16,40,0.9)",border:"1px solid rgba(58,130,246,0.18)",borderRadius:4,color:"#cde",fontFamily:"inherit",fontSize:12,padding:"2px 22px 2px 7px",outline:"none",boxSizing:"border-box"}}/>
              {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"rgba(120,160,220,0.4)",cursor:"pointer",fontSize:11,padding:0}}>✕</button>}
            </div>
          </div>
          {upcoming.filter(e=>!search||((e.title||"")+(e.note||"")).toLowerCase().includes(search.toLowerCase())).length===0&&(
            <div style={{padding:20,textAlign:"center",color:"rgba(120,160,220,0.3)",fontSize:14}}>{search?"No results":"No upcoming events"}</div>
          )}
          {upcoming.filter(e=>!search||((e.title||"")+(e.note||"")).toLowerCase().includes(search.toLowerCase())).map((e,i)=>{
            const du=daysUntil(e.date);
            const isExp=expanded===e.id;
            return(
              <div key={e.id} style={{background:i%2===0?"rgba(8,16,32,0.96)":"rgba(14,26,52,0.85)",borderBottom:"1px solid rgba(58,130,246,0.06)"}}>
                <div style={{padding:"7px 10px",display:"flex",alignItems:"flex-start",gap:8}}>
                  <div style={{width:3,background:e.color||"#58a6ff",borderRadius:2,alignSelf:"stretch",flexShrink:0,marginTop:2}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,color:"rgba(200,220,255,0.85)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:"pointer"}} onClick={ev=>openEdit(e,ev)}>{e.title}</div>
                    <div style={{fontSize:12,color:"rgba(120,160,220,0.45)",marginTop:1}}>{fmtShort(e.date)}{e.endDate&&e.endDate!==e.date?" – "+fmtShort(e.endDate):""}</div>
                    {e.note&&isExp&&<div style={{fontSize:13,color:"rgba(155,185,225,0.55)",marginTop:4,lineHeight:1.55,whiteSpace:"pre-wrap"}}>{e.note}</div>}
                    {e.image&&isExp&&<img src={e.image} alt="" style={{width:"100%",borderRadius:3,marginTop:6,border:"1px solid "+BOR}}/>}
                  </div>
                  <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                    <span style={{fontSize:13,fontWeight:700,whiteSpace:"nowrap",color:du===0?"#43e97b":du<=7?"#faa356":du<=30?"#58a6ff":"rgba(120,160,220,0.4)"}}>
                      {du===0?"Today":du===1?"Tomorrow":du+"d"}
                    </span>
                    <div style={{display:"flex",gap:3}}>
                      {(e.note||e.image)&&<button onClick={()=>setExpanded(isExp?null:e.id)} style={{...btn(isExp),padding:"1px 5px",fontSize:11}}>📝</button>}
                      <button onClick={ev=>openEdit(e,ev)} style={{...btn(false),padding:"1px 5px",fontSize:11}}>✏</button>
                      <button onClick={ev=>del(e.id,ev)} style={{...btn(false),padding:"1px 5px",fontSize:11,color:"#f87171",borderColor:"rgba(248,113,113,0.25)"}}>✕</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
