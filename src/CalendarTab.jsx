import React, { useState, useEffect } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";

function CalendarTab() {
  const [events, setEvents] = useState([]);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: "",
    start_date: "",
    end_date: "",
    notes: ""
  });
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .order("start_date", { ascending: true });
      
      if (error) throw error;
      setEvents(data || []);
    } catch (err) {
      console.error("Error loading events:", err);
    }
  };

  const parseFlexibleDate = (input) => {
    if (!input) return "";
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    
    // If just a number (e.g., "12"), assume current month
    if (/^\d{1,2}$/.test(input)) {
      const day = parseInt(input);
      return `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    
    // If format like "12/6" (day/month)
    if (/^\d{1,2}\/\d{1,2}$/.test(input)) {
      const [day, month] = input.split('/');
      return `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      return input;
    }
    
    return input;
  };

  const handleDateInput = (field, value) => {
    const parsed = parseFlexibleDate(value);
    setNewEvent(prev => ({ ...prev, [field]: parsed }));
  };

  const addEvent = async () => {
    if (!newEvent.title || !newEvent.start_date) return;

    try {
      const { error } = await supabase.from("calendar_events").insert([{
        title: newEvent.title,
        start_date: newEvent.start_date,
        end_date: newEvent.end_date || newEvent.start_date,
        notes: newEvent.notes || null
      }]);

      if (error) throw error;

      setNewEvent({ title: "", start_date: "", end_date: "", notes: "" });
      setShowAddEvent(false);
      loadEvents();
    } catch (err) {
      console.error("Error adding event:", err);
      alert("Error adding event");
    }
  };

  const deleteEvent = async (id) => {
    if (!confirm("Delete this event?")) return;
    try {
      const { error } = await supabase.from("calendar_events").delete().eq("id", id);
      if (error) throw error;
      loadEvents();
    } catch (err) {
      console.error("Error deleting event:", err);
    }
  };

  const getDaysUntil = (dateStr) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(dateStr);
    eventDate.setHours(0, 0, 0, 0);
    const diff = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const formatDateRange = (start, end) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    if (start === end) {
      return startDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
    
    return `${startDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })} - ${endDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  };

  const upcomingEvents = events.filter(e => getDaysUntil(e.start_date) >= 0);

  // Group upcoming events by month
  const eventsByMonth = upcomingEvents.reduce((acc, event) => {
    const monthYear = new Date(event.start_date).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    if (!acc[monthYear]) acc[monthYear] = [];
    acc[monthYear].push(event);
    return acc;
  }, {});

  // Generate calendar grid
  const generateCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days = [];
    
    // Empty cells before first day
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} style={{ padding: 8 }} />);
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = events.filter(e => {
        const startDate = new Date(e.start_date);
        const endDate = new Date(e.end_date);
        const checkDate = new Date(dateStr);
        return checkDate >= startDate && checkDate <= endDate;
      });

      const isToday = dateStr === new Date().toISOString().split('T')[0];

      days.push(
        <div
          key={day}
          style={{
            padding: "4px 6px",
            minHeight: 60,
            background: isToday ? "rgba(88,166,255,0.1)" : "transparent",
            border: isToday ? "1px solid " + C.blue : "1px solid " + C.bd,
            borderRadius: 4,
            position: "relative"
          }}
        >
          <div style={{ fontSize: 11, color: isToday ? C.blue : C.dim, fontWeight: isToday ? 700 : 400, marginBottom: 4 }}>{day}</div>
          {dayEvents.map(evt => (
            <div
              key={evt.id}
              style={{
                background: C.blue + "33",
                borderLeft: `3px solid ${C.blue}`,
                borderRadius: 3,
                padding: "2px 4px",
                fontSize: 9,
                color: C.tx,
                marginBottom: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {evt.title}
              {evt.notes && <span style={{ marginLeft: 4, opacity: 0.6 }}>💬</span>}
            </div>
          ))}
        </div>
      );
    }

    return days;
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12, background: C.bg, padding: 12 }}>
      {/* Header */}
      <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={prevMonth} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 14, padding: "4px 10px", cursor: "pointer" }}>←</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>
            {currentMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </span>
          <button onClick={nextMonth} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 14, padding: "4px 10px", cursor: "pointer" }}>→</button>
        </div>
        <button onClick={() => setShowAddEvent(true)} style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 700, padding: "8px 16px", cursor: "pointer", boxShadow: "0 2px 8px rgba(102,126,234,0.3)" }}>
          + Add Event
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {/* Calendar Grid */}
        <div style={{ flex: 1, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12, overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
              <div key={day} style={{ fontSize: 11, fontWeight: 700, color: C.dim, textAlign: "center", padding: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {day}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {generateCalendar()}
          </div>
        </div>

        {/* Upcoming Events */}
        <div style={{ width: 300, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12, overflowY: "auto" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 12 }}>📅 Upcoming Events</div>
          {Object.keys(eventsByMonth).length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: C.faint, fontSize: 12 }}>No upcoming events</div>
          ) : (
            Object.entries(eventsByMonth).map(([monthYear, monthEvents]) => (
              <div key={monthYear} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {monthYear}
                </div>
                {monthEvents.map(event => {
                  const daysUntil = getDaysUntil(event.start_date);
                  return (
                    <div key={event.id} style={{ background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, padding: "10px 12px", marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 4 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 2 }}>
                            {event.title}
                            {event.notes && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.6 }}>💬</span>}
                          </div>
                          <div style={{ fontSize: 10, color: C.dim }}>{formatDateRange(event.start_date, event.end_date)}</div>
                        </div>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>{daysUntil}d</div>
                          <button onClick={() => deleteEvent(event.id)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 13, opacity: 0.7, padding: 2 }}>✕</button>
                        </div>
                      </div>
                      {event.notes && (
                        <div style={{ fontSize: 11, color: C.faint, fontStyle: "italic", marginTop: 4, paddingTop: 6, borderTop: "1px solid " + C.bd }}>
                          {event.notes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Event Modal */}
      {showAddEvent && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9998 }} onClick={() => setShowAddEvent(false)} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 9999, background: C.bg2, border: "1px solid " + C.bd, borderRadius: 12, width: 480, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.blue, marginBottom: 16 }}>Add Event</div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 11, color: C.dim, marginBottom: 4, fontWeight: 600 }}>Event Title</label>
              <input
                type="text"
                value={newEvent.title}
                onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                placeholder="Genve"
                autoFocus
                style={{ width: "100%", background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 13, padding: "8px 12px", outline: "none" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, color: C.dim, marginBottom: 4, fontWeight: 600 }}>Start Date</label>
                <input
                  type="text"
                  value={newEvent.start_date}
                  onChange={e => handleDateInput("start_date", e.target.value)}
                  placeholder="12 or 12/6 or 2026-06-12"
                  style={{ width: "100%", background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 13, padding: "8px 12px", outline: "none" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, color: C.dim, marginBottom: 4, fontWeight: 600 }}>End Date (optional)</label>
                <input
                  type="text"
                  value={newEvent.end_date}
                  onChange={e => handleDateInput("end_date", e.target.value)}
                  placeholder="12 or 12/6 or 2026-06-12"
                  style={{ width: "100%", background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 13, padding: "8px 12px", outline: "none" }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: C.dim, marginBottom: 4, fontWeight: 600 }}>Notes (optional)</label>
              <textarea
                value={newEvent.notes}
                onChange={e => setNewEvent({ ...newEvent, notes: e.target.value })}
                placeholder="Additional details..."
                style={{ width: "100%", minHeight: 60, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 6, color: C.tx, fontSize: 12, padding: "8px 12px", outline: "none", resize: "vertical", fontFamily: "inherit" }}
              />
            </div>

            <div style={{ fontSize: 10, color: C.faint, marginBottom: 12, fontStyle: "italic" }}>
              💡 Tip: Type "12" for 12th of current month, or "12/6" for June 12th
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowAddEvent(false)} style={{ background: "transparent", border: "1px solid " + C.bd, borderRadius: 6, color: C.dim, fontSize: 12, fontWeight: 600, padding: "8px 16px", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={addEvent} disabled={!newEvent.title || !newEvent.start_date} style={{ background: newEvent.title && newEvent.start_date ? "linear-gradient(135deg, #3fb950 0%, #2ecc71 100%)" : C.bg3, border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 700, padding: "8px 16px", cursor: newEvent.title && newEvent.start_date ? "pointer" : "not-allowed", opacity: newEvent.title && newEvent.start_date ? 1 : 0.5 }}>
                Add Event
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default CalendarTab;
