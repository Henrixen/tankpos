import React, { useState, useRef } from "react";
import { C } from "./constants";

const CELL_HEIGHT = 34;

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
          height: CELL_HEIGHT,
          minHeight: CELL_HEIGHT,
          maxHeight: CELL_HEIGHT,
          padding: "0 8px",
          verticalAlign: "middle",
          background: "transparent",
          border: "none",
          boxSizing: "border-box"
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
            display: "block",
            width: "100%",
            height: 28,
            margin: 0,
            padding: "0 8px",
            background: C.bg3,
            border: "1px solid " + C.bd,
            borderRadius: 4,
            color: C.tx,
            fontFamily: "inherit",
            fontSize: 12,
            lineHeight: "28px",
            outline: "none",
            boxSizing: "border-box",
            textTransform: "uppercase"
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
        height: CELL_HEIGHT,
        minHeight: CELL_HEIGHT,
        maxHeight: CELL_HEIGHT,
        padding: "0 8px",
        cursor: "text",
        background: hover ? "rgba(255,255,255,0.03)" : "transparent",
        border: "none",
        verticalAlign: "middle",
        transition: "background .1s",
        whiteSpace: "nowrap",
        overflow: "hidden",
        maxWidth: 0,
        boxSizing: "border-box"
      }}
      {...rest}
    >
      <div
        style={{
          height: 28,
          display: "flex",
          alignItems: "center",
          gap: 2,
          overflow: "hidden"
        }}
      >
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
            lineHeight: "28px"
          }}
        import React, { useState, useRef } from "react";
import { C } from "./constants";

const CELL_HEIGHT = 34;
const INNER_HEIGHT = 28;
const H_PAD = 8;

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
      ref.current?.focus();
      ref.current?.select?.();
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
      if (e.shiftKey) setTimeout(() => onShiftTab?.(), 20);
      else setTimeout(() => onTab?.(), 20);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      commit();
      setTimeout(() => onUp?.(), 20);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      commit();
      setTimeout(() => onDown?.(), 20);
      return;
    }
  }

  return (
    <td
      onClick={!editing ? start : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={value || placeholder || "Click to edit"}
      style={{
        height: CELL_HEIGHT,
        minHeight: CELL_HEIGHT,
        maxHeight: CELL_HEIGHT,
        padding: `0 ${H_PAD}px`,
        verticalAlign: "middle",
        background: hover && !editing ? "rgba(255,255,255,0.03)" : "transparent",
        cursor: editing ? "default" : "text",
        whiteSpace: "nowrap",
        overflow: "hidden",
        maxWidth: 0,
        boxSizing: "border-box"
      }}
      {...rest}
    >
      <div
        style={{
          height: INNER_HEIGHT,
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          width: "100%",
          position: "relative"
        }}
      >
        {editing ? (
          <input
            ref={ref}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKey}
            placeholder={placeholder || ""}
            style={{
              width: "100%",
              height: "100%",
              margin: 0,
              padding: "0 6px",
              background: C.bg3,
              border: "1px solid " + C.bd,
              borderRadius: 4,
              color: C.tx,
              fontFamily: "inherit",
              fontSize: 12,
              lineHeight: `${INNER_HEIGHT - 2}px`,
              outline: "none",
              boxSizing: "border-box",
              textTransform: "uppercase"
            }}
          />
        ) : (
          <>
            <span
              style={{
                color: value ? (color || C.tx) : C.faint,
                fontWeight: bold ? 700 : 400,
                fontSize: 12,
                lineHeight: `${INNER_HEIGHT}px`,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "block",
                minWidth: 0,
                flex: 1,
                textTransform: "uppercase",
                padding: "0 6px"
              }}
            >
              {value || ""}
            </span>

            <span
              style={{
                color: C.faint,
                fontSize: 12,
                opacity: hover ? 1 : 0,
                flex: "0 0 auto",
                marginLeft: 2
              }}
            >
              ✎
            </span>
          </>
        )}
      </div>
    </td>
  );
}
