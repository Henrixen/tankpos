import React, { useState, useEffect, useMemo } from "react";
import { C } from "./constants";

const STORAGE_KEY = "signal_calendar_events";

function loadEvents() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveEvents(ev) { localStorage.setItem(STORAGE_KEY, JSON.stringify(ev)); }

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  return Math.round((d - today) / 86400000);
}

function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const EVENT_COLORS = ["#58a6ff","#43e97b","#faa356","#c792ea","#f472b6","#4fc3f7","#fb7185","#a3e635"];

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export default function CalendarTab() {
  const [events, setEvents] = useState(loadEvents);
  const today = new Date(); today.setHours(0,0,0,0);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState(null); // "YYYY-MM-DD"
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ title: "", date: "", endDate: "", color: EVENT_COLORS[0], note: "", category: "" });
  const [expandedNote, setExpandedNote] = useState(null); // event id

  useEffect(() => { saveEvents(events); }, [events]);

  const th = { padding: "5px 8px", fontSize: 10, fontWeight: 700, color: "rgba(120,160,220,0.55)", textTransform: "uppercase", letterSpacing: "0.08em", background: "rgba(14,22,40,0.98)", borderBottom: "1px solid rgba(58,130,246,0.12)", textAlign: "left" };
  const btn = (active, col) => ({ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", border: "1px solid " + (active ? (col || "rgba(88,166,255,0.6)") : "rgba(120,160,220,0.25)"), background: active ? "rgba(88,166,255,0.18)" : "rgba(15,25,50,0.8)", color: active ? "#d9ecff" : "#7aa0c8" });
  const inp = { background: "rgba(10,18,34,0.95)", border: "1px solid rgba(88,166,255,0.35)", borderRadius: 4, color: "#cde", fontFamily: "inherit", fontSize: 12, padding: "5px 8px", outline: "none", width: "100%", boxSizing: "border-box" };

  // Build calendar grid
  const calDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon
    const days = [];
    // Pad with prev month days
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth, -i);
      days.push({ date: d, cur: false });
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(viewYear, viewMonth, i), cur: true });
    }
    // Pad to complete weeks
    while (days.length % 7 !== 0) {
      const d = new Date(viewYear, viewMonth + 1, days.length - lastDay.getDate() - startDow + 1);
      days.push({ date: d, cur: false });
    }
    return days;
  }, [viewYear, viewMonth]);

  // Events indexed by date string
  const eventsByDate = useMemo(() => {
    const idx = {};
    for (const e of events) {
      if (!e.date) continue;
      const start = new Date(e.date); start.setHours(0,0,0,0);
      const end = e.endDate ? new Date(e.endDate) : start; end.setHours(0,0,0,0);
      let cur = new Date(start);
      while (cur <= end) {
        const key = cur.toISOString().slice(0, 10);
        if (!idx[key]) idx[key] = [];
        idx[key].push(e);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return idx;
  }, [events]);

  // Upcoming events sorted
  const upcoming = useMemo(() => {
    const todayStr = today.toISOString().slice(0, 10);
    return [...events]
      .filter(e => e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, today]);

  function openAdd(dateStr) {
    setEditId(null);
    setForm({ title: "", date: dateStr || today.toISOString().slice(0, 10), endDate: "", color: EVENT_COLORS[0], note: "", category: "" });
    setShowForm(true);
  }

  function openEdit(e) {
    setEditId(e.id);
    setForm({ title: e.title, date: e.date, endDate: e.endDate || "", color: e.color || EVENT_COLORS[0], note: e.note || "", category: e.category || "" });
    setShowForm(true);
  }

  function saveEvent() {
    if (!form.title.trim() || !form.date) return;
    if (editId) {
      setEvents(prev => prev.map(e => e.id === editId ? { ...e, ...form } : e));
    } else {
      setEvents(prev => [...prev, { id: "ev_" + Date.now(), ...form }]);
    }
    setShowForm(false); setEditId(null);
  }

  function deleteEvent(id) {
    setEvents(prev => prev.filter(e => e.id !== id));
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const todayStr = today.toISOString().slice(0, 10);

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>

      {/* ── LEFT: Calendar ── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "6px 0" }}>
          <button onClick={prevMonth} style={{ ...btn(false), padding: "3px 10px" }}>‹</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(200,220,250,0.85)", minWidth: 160, textAlign: "center" }}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} style={{ ...btn(false), padding: "3px 10px" }}>›</button>
          <button onClick={() => { setViewMonth(today.getMonth()); setViewYear(today.getFullYear()); }} style={{ ...btn(false), marginLeft: 4 }}>Today</button>
          <span style={{ flex: 1 }} />
          <button onClick={() => openAdd(null)} style={{ ...btn(true), padding: "4px 14px", fontSize: 12 }}>+ Add Event</button>
        </div>

        {/* Grid header */}
        <div style={{ border: "1px solid rgba(58,130,246,0.18)", borderRadius: 7, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "38px repeat(7, 1fr)", background: "rgba(14,22,40,0.98)", borderBottom: "1px solid rgba(58,130,246,0.12)" }}>
            <div style={{ padding: "5px 4px", fontSize: 10, color: "rgba(120,160,220,0.4)", textAlign: "center", fontWeight: 700, textTransform: "uppercase" }}>Wk</div>
            {DAY_NAMES.map(d => (
              <div key={d} style={{ padding: "5px 4px", fontSize: 10, fontWeight: 700, color: "rgba(120,160,220,0.55)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>{d}</div>
            ))}
          </div>

          {/* Weeks */}
          {Array.from({ length: calDays.length / 7 }, (_, wi) => {
            const weekDays = calDays.slice(wi * 7, wi * 7 + 7);
            const wn = getWeekNumber(weekDays[0].date);
            return (
              <div key={wi} style={{ display: "grid", gridTemplateColumns: "38px repeat(7, 1fr)", borderTop: wi > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                {/* Week number */}
                <div style={{ padding: "6px 4px", fontSize: 10, color: "rgba(120,160,220,0.3)", textAlign: "center", background: "rgba(14,22,40,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 8 }}>
                  {wn}
                </div>
                {weekDays.map(({ date, cur }) => {
                  const ds = date.toISOString().slice(0, 10);
                  const isToday = ds === todayStr;
                  const evs = eventsByDate[ds] || [];
                  const isSelected = selectedDay === ds;
                  const isSat = date.getDay() === 6;
                  const isSun = date.getDay() === 0;
                  return (
                    <div key={ds} onClick={() => { setSelectedDay(ds === selectedDay ? null : ds); }}
                      style={{ minHeight: 72, padding: "5px 5px 4px", background: isSelected ? "rgba(88,166,255,0.10)" : isToday ? "rgba(88,166,255,0.06)" : (isSat || isSun) ? "rgba(255,255,255,0.01)" : "transparent", cursor: "pointer", borderLeft: "1px solid rgba(255,255,255,0.04)", position: "relative", transition: "background 0.1s" }}>
                      {/* Day number */}
                      <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? "#58a6ff" : cur ? (isSat || isSun ? "rgba(120,160,220,0.35)" : "rgba(180,200,230,0.65)") : "rgba(120,160,220,0.2)", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                        {isToday && <span style={{ width: 18, height: 18, background: "#58a6ff", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{date.getDate()}</span>}
                        {!isToday && date.getDate()}
                      </div>
                      {/* Events */}
                      {evs.slice(0, 3).map(e => (
                        <div key={e.id} style={{ fontSize: 10, background: (e.color || "#58a6ff") + "28", border: "1px solid " + (e.color || "#58a6ff") + "55", borderRadius: 3, padding: "1px 4px", marginBottom: 2, color: e.color || "#58a6ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.4 }}>
                          {e.title}
                        </div>
                      ))}
                      {evs.length > 3 && <div style={{ fontSize: 9, color: "rgba(120,160,220,0.4)", paddingLeft: 2 }}>+{evs.length - 3} more</div>}
                      {/* Add button on hover */}
                      {cur && isSelected && (
                        <button onClick={e => { e.stopPropagation(); openAdd(ds); }}
                          style={{ position: "absolute", top: 3, right: 3, background: "rgba(88,166,255,0.2)", border: "1px solid rgba(88,166,255,0.4)", borderRadius: 3, color: "#58a6ff", fontSize: 10, cursor: "pointer", padding: "0 4px", lineHeight: "16px" }}>+</button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Selected day events */}
        {selectedDay && (eventsByDate[selectedDay] || []).length > 0 && (
          <div style={{ marginTop: 12, border: "1px solid rgba(58,130,246,0.18)", borderRadius: 7, overflow: "hidden" }}>
            <div style={{ padding: "5px 10px", background: "rgba(14,22,40,0.98)", borderBottom: "1px solid rgba(58,130,246,0.12)", fontSize: 11, fontWeight: 700, color: "rgba(120,160,220,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {fmtDate(selectedDay)}
            </div>
            {(eventsByDate[selectedDay] || []).map(e => (
              <div key={e.id} style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "flex-start", gap: 10, background: "rgba(10,18,34,0.95)" }}>
                <div style={{ width: 3, background: e.color || "#58a6ff", borderRadius: 2, alignSelf: "stretch", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(210,225,245,0.85)" }}>{e.title}</div>
                  {e.category && <div style={{ fontSize: 10, color: "rgba(120,160,220,0.45)", marginTop: 1 }}>{e.category}</div>}
                  {e.note && <div style={{ fontSize: 11, color: "rgba(160,185,215,0.55)", marginTop: 4, lineHeight: 1.5 }}>{e.note}</div>}
                </div>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <button onClick={() => openEdit(e)} style={{ ...btn(false), padding: "2px 8px", fontSize: 10 }}>✏</button>
                  <button onClick={() => deleteEvent(e.id)} style={{ ...btn(false), padding: "2px 8px", fontSize: 10, color: "#f87171", borderColor: "rgba(248,113,113,0.3)" }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── RIGHT: Upcoming / form ── */}
      <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Event form */}
        {showForm && (
          <div style={{ border: "1px solid rgba(88,166,255,0.35)", borderRadius: 7, overflow: "hidden" }}>
            <div style={{ padding: "6px 10px", background: "rgba(14,22,40,0.98)", borderBottom: "1px solid rgba(58,130,246,0.12)", fontSize: 11, fontWeight: 700, color: "rgba(120,160,220,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {editId ? "Edit Event" : "New Event"}
            </div>
            <div style={{ padding: 12, background: "rgba(10,18,34,0.95)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: "rgba(120,160,220,0.5)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.07em" }}>Title *</div>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inp} placeholder="e.g. BIMCO Annual Meeting" autoFocus />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(120,160,220,0.5)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.07em" }}>Date *</div>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(120,160,220,0.5)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.07em" }}>End date</div>
                  <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} style={inp} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(120,160,220,0.5)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.07em" }}>Category</div>
                <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inp} placeholder="e.g. Conference, Fixture, Regulation" />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(120,160,220,0.5)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.07em" }}>Notes</div>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={{ ...inp, minHeight: 60, resize: "vertical", lineHeight: 1.5 }} placeholder="Any additional notes…" />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(120,160,220,0.5)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em" }}>Color</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {EVENT_COLORS.map(col => (
                    <div key={col} onClick={() => setForm(f => ({ ...f, color: col }))}
                      style={{ width: 18, height: 18, borderRadius: "50%", background: col, cursor: "pointer", border: form.color === col ? "2px solid #fff" : "2px solid transparent", transition: "border 0.1s" }} />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button onClick={saveEvent} style={{ ...btn(true), flex: 1, padding: "5px 0", fontSize: 12 }}>
                  {editId ? "Save changes" : "Add event"}
                </button>
                <button onClick={() => { setShowForm(false); setEditId(null); }} style={{ ...btn(false), padding: "5px 12px", fontSize: 12 }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Upcoming summary */}
        <div style={{ border: "1px solid rgba(58,130,246,0.18)", borderRadius: 7, overflow: "hidden" }}>
          <div style={{ padding: "5px 10px", background: "rgba(14,22,40,0.98)", borderBottom: "1px solid rgba(58,130,246,0.12)", fontSize: 11, fontWeight: 700, color: "rgba(120,160,220,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Upcoming events
          </div>
          {upcoming.length === 0 && (
            <div style={{ padding: "20px", textAlign: "center", color: "rgba(120,160,220,0.3)", fontSize: 12 }}>No upcoming events</div>
          )}
          {upcoming.map((e, i) => {
            const du = daysUntil(e.date);
            const isExp = expandedNote === e.id;
            return (
              <div key={e.id} style={{ background: i % 2 === 0 ? "rgba(10,18,34,0.95)" : "rgba(16,28,52,0.85)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ padding: "7px 10px", display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ width: 3, background: e.color || "#58a6ff", borderRadius: 2, alignSelf: "stretch", flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(210,225,245,0.85)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</div>
                    <div style={{ fontSize: 10, color: "rgba(140,165,205,0.5)", marginTop: 1 }}>{fmtDate(e.date)}{e.endDate && e.endDate !== e.date ? " – " + fmtDate(e.endDate) : ""}</div>
                    {e.category && <div style={{ fontSize: 10, color: "rgba(120,160,220,0.4)" }}>{e.category}</div>}
                    {e.note && isExp && <div style={{ fontSize: 11, color: "rgba(160,185,215,0.55)", marginTop: 4, lineHeight: 1.5 }}>{e.note}</div>}
                  </div>
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: du === 0 ? "#43e97b" : du <= 7 ? "#faa356" : du <= 30 ? "#58a6ff" : "rgba(120,160,220,0.45)", whiteSpace: "nowrap" }}>
                      {du === 0 ? "Today" : du === 1 ? "Tomorrow" : du + "d"}
                    </span>
                    <div style={{ display: "flex", gap: 3 }}>
                      {e.note && <button onClick={() => setExpandedNote(isExp ? null : e.id)} style={{ ...btn(isExp), padding: "1px 5px", fontSize: 9 }}>📝</button>}
                      <button onClick={() => openEdit(e)} style={{ ...btn(false), padding: "1px 5px", fontSize: 9 }}>✏</button>
                      <button onClick={() => deleteEvent(e.id)} style={{ ...btn(false), padding: "1px 5px", fontSize: 9, color: "#f87171", borderColor: "rgba(248,113,113,0.25)" }}>✕</button>
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
