import React, { useState, useRef } from "react";
import { C } from "./constants";

export default function EC({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const ref = useRef(null);

  function start() {
    setDraft(value || "");
    setEditing(true);
    setTimeout(() => ref.current?.focus(), 50);
  }

  function commit() {
    setEditing(false);
    if (draft !== value) onSave?.(draft);
  }

  function onKey(e) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <td style={{ padding: "6px 10px" }}>
        <input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          style={{
            background: C.bg3,
            border: "1px solid " + C.bd,
            borderRadius: 4,
            color: C.tx,
            fontSize: 12,
            padding: "4px 6px",
            width: "100%",
            outline: "none"
          }}
        />
      </td>
    );
  }

  return (
    <td
      onClick={start}
      style={{
        padding: "6px 10px",
        background: "transparent",
        border: "none",
        cursor: "text"
      }}
    >
      {value}
    </td>
  );
}
