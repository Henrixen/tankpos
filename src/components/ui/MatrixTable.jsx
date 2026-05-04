import React from "react";
import { C } from "../../constants";

export default function MatrixTable({
  columns = [],
  data = [],
  renderRow,
  keyField = "id",
  onRowClick,
  selectedKey
}) {
  const wrap = {
    background: C.bg2,
    border: "1px solid " + C.bd,
    borderRadius: 8,
    overflow: "hidden"
  };

  const th = {
    padding: "7px 10px",
    background: "rgba(20,30,50,0.92)",
    color: "rgba(120,160,220,0.58)",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    borderBottom: "1px solid rgba(58,130,246,0.14)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  };

  return (
    <div style={wrap}>
      <table
        style={{
          width: "100%",
          tableLayout: "fixed",
          borderCollapse: "collapse",
          fontSize: 12
        }}
      >
        <colgroup>
          {columns.map((col) => (
            <col
              key={col.key}
              style={{ width: col.width ? `${col.width}px` : "auto" }}
            />
          ))}
        </colgroup>

        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  ...th,
                  textAlign: col.align || "left"
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.map((row, i) => {
            const isSelected =
              selectedKey != null &&
              (row[keyField] === selectedKey || row.vessel === selectedKey);

            return (
              <tr
  key={row[keyField] || i}
  onClick={() => onRowClick && onRowClick(row)}
  style={{
    background:
      selectedKey && (row[keyField] === selectedKey || row.vessel === selectedKey)
        ? "rgba(88,166,255,0.14)"
        : i % 2
        ? "rgba(22,37,64,0.82)"
        : "rgba(7,15,28,0.96)",
    cursor: onRowClick ? "pointer" : "default"
  }}
>
                {renderRow(row, null, i)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
