import React from "react";
import { C } from "../../constants";

export default function MatrixTable({
  columns = [],
  data = [],
  renderRow,
  keyField = "id"
}) {
  const wrap = {
    background: C.bg2,
    border: "1px solid " + C.bd,
    borderRadius: 8,
    overflow: "hidden"
  };

  const th = {
    padding: "6px 10px",
    background: "rgba(20,30,50,0.9)",
    color: "rgba(120,160,220,0.6)",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    borderBottom: "1px solid " + C.bd2,
    whiteSpace: "nowrap"
  };

  const td = {
    padding: "6px 10px",
    fontSize: 12,
    color: C.tx,
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    whiteSpace: "nowrap"
  };

  return (
    <div style={wrap}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ ...th, textAlign: col.align || "left" }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.map((row, i) => (
            <tr
              key={row[keyField] || i}
              style={{
                background: i % 2 ? "rgba(255,255,255,0.02)" : "transparent"
              }}
            >
              {renderRow(row, td)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
