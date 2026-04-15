import React, { useState, useRef } from "react";
import { C } from "./constants";

export default function EC({
  value,
  color,
  placeholder,
  onSave,
  bold,
  onTab,
  onShiftTab,
  onEnter,
  onUp,
  onDown,
  ...rest
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [hover, setHover] = useState(false);
  const ref = useRef(null);

  function start(e) {
    e?.stopPropagation?.();
    setDraft(value || "");
    setEditing(true);
    setTimeout(() => {
      if (ref.current) {
        ref.current.focus();
        ref.current.select?.();
      }
    }, 15);
  }

  function commit() {
    setEditing(false);
    const t = (draft || "").trim();
    if (t !== (value || "")) onSave?.(t);
  }

  function handleKey(e) {
    e.stopPropagation();

    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      if (onEnter) setTimeout(onEnter, 20);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      commit();
      if (e.shiftKey) {
        if (onShiftTab) setTimeout(onShiftTab, 20);
      } else {
        if (onTab) setTimeout(onTab, 20);
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      commit();
      if (onUp) setTimeout(onUp, 20);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      commit();
      if (onDown) setTimeout(onDown, 20);
      return;
    }
  }

  if (editing) {
    return (
      <td
        onClick={e => e.stopPropagation()}
        style={{
          padding: "6px 10px",
          background: "transparent",
          border: "none",
          verticalAlign: "middle"
        }}
      >
        <input
          ref={ref}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          placeholder={placeholder || ""}
          style={{
            background: C.bg3,
            border: "1px solid " + C.bd,
            borderRadius: 4,
            color: C.tx,
            fontFamily: "inherit",
            fontSize: 12,
            padding: "5px 8px",
            width: "100%",
            outline: "none",
            boxSizing: "border-box",
            textTransform: "uppercase",
            lineHeight: "16px"
          }}
        />
      </td>
    );
  }

  return (
    <td
      onClick={start}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={value || (placeholder || "Click to edit")}
      style={{
        padding: "6px 10px",
        cursor: "text",
        background: hover ? "rgba(255,255,255,0.03)" : "transparent",
        border: "none",
        verticalAlign: "middle",
        transition: "background .1s",
        whiteSpace: "nowrap",
        overflow: "hidden",
        maxWidth: 0
      }}
      {...rest}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 2, overflow: "hidden" }}>
        <span
          style={{
            color: value ? (color || C.tx) : C.faint,
            fontWeight: bold ? 700 : 400,
            fontSize: 12,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
            minWidth: 0,
            textTransform: "uppercase",
            lineHeight: "16px"
          }}
        >
          {value || ""}
        </span>
        <span style={{ color: C.faint, fontSize: 12, opacity: hover ? 1 : 0 }}>✎</span>
      </div>
    </td>
  );
}
