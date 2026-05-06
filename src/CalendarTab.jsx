import React, { useState, useEffect, useMemo, useRef } from "react";
import { C } from "./constants";

const STORAGE_KEY = "signal_calendar_events";
function loadEvents() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
function saveEvents(ev) { localStorage.setItem(STORAGE_KEY, JSON.stringify(ev)); }

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

export default function CalendarTab() {
  const [events, setEvents] = useState(loadEvents);
  const today = todayStr();
  const todayDate = parseLocal(today);
  const [startYear, setStartYear] = useState(todayDate.getFullYear());
  const [startMonth, setStartMonth] = useState(todayDate.getMonth());
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...BLANK, date: today });
  const [expanded, setExpanded] = useState(null);
  const imgRef = useRef(null);

  useEffect(() => { saveEvents(events); }, [events]);

  const inp = { background:"rgba(8,16,32,0.95)", border:"1px solid rgba(58,130,246,0.25)", borderRadius:5, color:"#cde", fontFamily:"inherit", fontSize:12, padding:"6px 10px", outline:"none", width:"100%", boxSizing:"border-box", colorScheme:"dark" };
  const btn = (on) => ({ fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:4, cursor:"pointer", fontFamily:"inherit", border:"1px solid "+(on?"rgba(88,166,255,0.55)":"rgba(58,130,246,0.18)"), background:on?"rgba(88,166,255,0.16)":"rgba(8,16,32,0.85)", color:on?"#d9ecff":"rgba(140,175,230,0.55)" });

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
    setEvents(prev => prev.filter(e => e.id !== id));
    if (editId === id) { setShowForm(false); setEditId(null); }
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

      {/* ── LEFT: 3 months ── */}
      <div style={{flex:1,minWidth:0}}>
        {/* Nav */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <button onClick={prevPeriod} style={{...btn(false),padding:"4px 12px",fontSize:14}}>‹</button>
          <span style={{fontSize:13,fontWeight:700,color:"rgba(200,220,255,0.8)",minWidth:220}}>
            {MONTHS[startMonth]} {startYear}{" — "}{(()=>{let m=startMonth+2,y=startYear;while(m>11){m-=12;y++;}return MONTHS[m]+" "+y;})()}
          </span>
          <button onClick={nextPeriod} style={{...btn(false),padding:"4px 12px",fontSize:14}}>›</button>
          <button onClick={()=>{setStartMonth(todayDate.getMonth());setStartYear(todayDate.getFullYear());}} style={btn(false)}>Today</button>
          <span style={{flex:1}}/>
          <button onClick={()=>openAdd(today)} style={{...btn(true),padding:"6px 18px",fontSize:12,fontWeight:700}}>+ Add Event</button>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {months.map(({year,month})=>{
            const grid=buildGrid(year,month);
            const isCur=year===todayDate.getFullYear()&&month===todayDate.getMonth();
            return(
              <div key={year+"-"+month} style={{border:"1px solid "+BOR,borderRadius:8,overflow:"hidden",background:BG}}>
                {/* Month header */}
                <div style={{padding:"7px 14px",background:HDR,borderBottom:"1px solid "+BOR,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:13,fontWeight:700,letterSpacing:"0.02em",color:isCur?"#58a6ff":"rgba(180,210,255,0.6)"}}>{MONTHS[month]} {year}</span>
                  {isCur&&<span style={{fontSize:9,fontWeight:700,background:"rgba(88,166,255,0.15)",border:"1px solid rgba(88,166,255,0.3)",borderRadius:3,padding:"1px 6px",color:"#58a6ff",textTransform:"uppercase",letterSpacing:"0.08em"}}>Now</span>}
                </div>
                {/* Day name headers */}
                <div style={{display:"grid",gridTemplateColumns:"28px repeat(7,1fr)",background:"rgba(10,20,40,0.96)",borderBottom:"1px solid rgba(58,130,246,0.07)"}}>
                  <div style={{padding:"3px",fontSize:8,color:"rgba(120,160,220,0.25)",textAlign:"center",fontWeight:700}}>Wk</div>
                  {DAYS.map(d=><div key={d} style={{padding:"3px 2px",fontSize:9,fontWeight:700,color:d==="Sat"||d==="Sun"?"rgba(120,160,220,0.25)":"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.06em",textAlign:"center"}}>{d}</div>)}
                </div>
                {/* Week rows */}
                {Array.from({length:grid.length/7},(_,wi)=>{
                  const week=grid.slice(wi*7,wi*7+7);
                  const wn=getWeekNumber(week[0].d);
                  return(
                    <div key={wi} style={{display:"grid",gridTemplateColumns:"28px repeat(7,1fr)",borderTop:"1px solid rgba(58,130,246,0.06)"}}>
                      <div style={{padding:"3px 2px",fontSize:8,color:"rgba(120,160,220,0.2)",textAlign:"center",background:"rgba(10,20,40,0.45)",paddingTop:6}}>{wn}</div>
                      {week.map(({d,cur})=>{
                        const ds=toStr(d);
                        const isToday=ds===today;
                        const evs=byDate[ds]||[];
                        const isSat=d.getDay()===6, isSun=d.getDay()===0;
                        return(
                          <div key={ds} onClick={()=>cur&&openAdd(ds)}
                            style={{minHeight:62,padding:"3px 3px 2px",background:isToday?"rgba(88,166,255,0.07)":"transparent",cursor:cur?"pointer":"default",borderLeft:"1px solid rgba(58,130,246,0.05)",position:"relative"}}>
                            <div style={{fontSize:10,fontWeight:isToday?700:400,marginBottom:2,display:"flex",justifyContent:"flex-end",paddingRight:2}}>
                              {isToday
                                ?<span style={{width:17,height:17,background:"#58a6ff",borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:9,fontWeight:700}}>{d.getDate()}</span>
                                :<span style={{color:cur?(isSat||isSun?"rgba(120,160,220,0.28)":"rgba(170,200,240,0.5)"):"rgba(90,120,170,0.18)"}}>{d.getDate()}</span>}
                            </div>
                            {evs.slice(0,3).map(e=>(
                              <div key={e.id}
                                onClick={ev=>{ev.stopPropagation();openEdit(e,ev);}}
                                title={e.title}
                                style={{fontSize:9,background:(e.color||"#58a6ff")+"22",border:"1px solid "+(e.color||"#58a6ff")+"45",borderRadius:2,padding:"1px 3px",marginBottom:1,color:e.color||"#58a6ff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.5,cursor:"pointer"}}>
                                {e.title}
                              </div>
                            ))}
                            {evs.length>3&&<div style={{fontSize:8,color:"rgba(120,160,220,0.35)"}}>+{evs.length-3}</div>}
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
              <span style={{fontSize:11,fontWeight:700,color:"rgba(120,160,220,0.6)",textTransform:"uppercase",letterSpacing:"0.08em"}}>{editId?"Edit Event":"New Event"}</span>
              {editId&&<button onClick={ev=>del(editId,ev)} style={{background:"none",border:"none",color:"rgba(248,113,113,0.55)",fontSize:11,cursor:"pointer",fontFamily:"inherit",padding:0}}>🗑 Delete</button>}
            </div>
            <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
              {/* Title */}
              <div>
                <div style={{fontSize:10,color:"rgba(120,160,220,0.5)",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em"}}>Title *</div>
                <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} style={inp} placeholder="e.g. BIMCO Annual Meeting" autoFocus/>
              </div>
              {/* Dates */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div>
                  <div style={{fontSize:10,color:"rgba(120,160,220,0.5)",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em"}}>Start *</div>
                  <DateInput value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} style={inp} placeholder="dd/mm/yyyy"/>
                </div>
                <div>
                  <div style={{fontSize:10,color:"rgba(120,160,220,0.5)",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em"}}>End</div>
                  <DateInput value={form.endDate} onChange={v=>setForm(f=>({...f,endDate:v}))} style={inp} placeholder="dd/mm/yyyy"/>
                </div>
              </div>
              {/* Notes — bigger */}
              <div>
                <div style={{fontSize:10,color:"rgba(120,160,220,0.5)",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.07em"}}>Notes</div>
                <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
                  style={{...inp,minHeight:130,resize:"vertical",lineHeight:1.65}}
                  placeholder="Details, contacts, agenda items, remarks…"/>
              </div>
              {/* Image */}
              <div>
                <div style={{fontSize:10,color:"rgba(120,160,220,0.5)",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.07em"}}>Screenshot</div>
                <input ref={imgRef} type="file" accept="image/*" onChange={handleImg} style={{display:"none"}}/>
                <button onClick={()=>imgRef.current?.click()} style={{...btn(false),padding:"5px 14px",fontSize:11}}>
                  📎 {form.image?"Replace image":"Attach screenshot"}
                </button>
                {form.image&&(
                  <div style={{position:"relative",marginTop:6}}>
                    <img src={form.image} alt="" style={{width:"100%",borderRadius:4,border:"1px solid "+BOR}}/>
                    <button onClick={()=>setForm(f=>({...f,image:null}))}
                      style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,0.72)",border:"none",borderRadius:"50%",width:18,height:18,color:"#fff",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>✕</button>
                  </div>
                )}
              </div>
              {/* Color */}
              <div>
                <div style={{fontSize:10,color:"rgba(120,160,220,0.5)",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.07em"}}>Color</div>
                <div style={{display:"flex",gap:6}}>
                  {COLORS.map(col=>(
                    <div key={col} onClick={()=>setForm(f=>({...f,color:col}))}
                      style={{width:18,height:18,borderRadius:"50%",background:col,cursor:"pointer",border:form.color===col?"2px solid #fff":"2px solid transparent",boxShadow:form.color===col?"0 0 6px "+col:"none",transition:"all 0.1s"}}/>
                  ))}
                </div>
              </div>
              {/* Buttons */}
              <div style={{display:"flex",gap:8,marginTop:2}}>
                <button onClick={save} style={{flex:1,...btn(true),padding:"7px 0",fontSize:12,fontWeight:700}}>{editId?"Save changes":"Add event"}</button>
                <button onClick={()=>{setShowForm(false);setEditId(null);}} style={{...btn(false),padding:"7px 14px",fontSize:12}}>Cancel</button>
              </div>
            </div>
          </div>
        ):(
          <button onClick={()=>openAdd(today)} style={{...btn(true),padding:"8px 0",fontSize:12,fontWeight:700,width:"100%"}}>+ New Event</button>
        )}

        {/* Upcoming */}
        <div style={{border:"1px solid "+BOR,borderRadius:8,overflow:"hidden",background:BG}}>
          <div style={{padding:"7px 12px",background:HDR,borderBottom:"1px solid "+BOR,fontSize:11,fontWeight:700,color:"rgba(120,160,220,0.6)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Upcoming</div>
          {upcoming.length===0&&<div style={{padding:20,textAlign:"center",color:"rgba(120,160,220,0.3)",fontSize:12}}>No upcoming events</div>}
          {upcoming.map((e,i)=>{
            const du=daysUntil(e.date);
            const isExp=expanded===e.id;
            return(
              <div key={e.id} style={{background:i%2===0?"rgba(8,16,32,0.96)":"rgba(14,26,52,0.85)",borderBottom:"1px solid rgba(58,130,246,0.06)"}}>
                <div style={{padding:"7px 10px",display:"flex",alignItems:"flex-start",gap:8}}>
                  <div style={{width:3,background:e.color||"#58a6ff",borderRadius:2,alignSelf:"stretch",flexShrink:0,marginTop:2}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:"rgba(200,220,255,0.85)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:"pointer"}} onClick={ev=>openEdit(e,ev)}>{e.title}</div>
                    <div style={{fontSize:10,color:"rgba(120,160,220,0.45)",marginTop:1}}>{fmtShort(e.date)}{e.endDate&&e.endDate!==e.date?" – "+fmtShort(e.endDate):""}</div>
                    {e.note&&isExp&&<div style={{fontSize:11,color:"rgba(155,185,225,0.55)",marginTop:4,lineHeight:1.55,whiteSpace:"pre-wrap"}}>{e.note}</div>}
                    {e.image&&isExp&&<img src={e.image} alt="" style={{width:"100%",borderRadius:3,marginTop:6,border:"1px solid "+BOR}}/>}
                  </div>
                  <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                    <span style={{fontSize:11,fontWeight:700,whiteSpace:"nowrap",color:du===0?"#43e97b":du<=7?"#faa356":du<=30?"#58a6ff":"rgba(120,160,220,0.4)"}}>
                      {du===0?"Today":du===1?"Tomorrow":du+"d"}
                    </span>
                    <div style={{display:"flex",gap:3}}>
                      {(e.note||e.image)&&<button onClick={()=>setExpanded(isExp?null:e.id)} style={{...btn(isExp),padding:"1px 5px",fontSize:9}}>📝</button>}
                      <button onClick={ev=>openEdit(e,ev)} style={{...btn(false),padding:"1px 5px",fontSize:9}}>✏</button>
                      <button onClick={ev=>del(e.id,ev)} style={{...btn(false),padding:"1px 5px",fontSize:9,color:"#f87171",borderColor:"rgba(248,113,113,0.25)"}}>✕</button>
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
