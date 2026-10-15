
export const CARGO_EXPORT_KEY = "cargo_copy_format_v1";

export const CARGO_EXPORT_DEFAULT =
  " | {charterer} | {qty} | {cargo} | {load} | {disch} | {from} | {to} | {freight} | {comment} |";

export const CARGO_EXPORT_SECOND_KEY = "cargo_copy_format_second_v1";

export const CARGO_EXPORT_SECOND_DEFAULT =
  "{charterer} | {vessel} | {qty} {cargo} | {load} to {disch} | {from} - {to} | {freight}";

export function readCargoExportSecondFormat() {
  try {
    return localStorage.getItem(CARGO_EXPORT_SECOND_KEY) ?? CARGO_EXPORT_SECOND_DEFAULT;
  } catch {
    return CARGO_EXPORT_SECOND_DEFAULT;
  }
}

export const CARGO_EXPORT_FIELDS = [
  "status", "ex_region", "to_region", "p_and_c",
  "intelligence", "vessel", "charterer", "qty",
  "cargo", "load", "disch", "from", "to",
  "freight", "comment", "tag", "source",
  "entered_by", "updated"
];

export function readCargoExportFormat() {
  try {
    return localStorage.getItem(CARGO_EXPORT_KEY) ?? CARGO_EXPORT_DEFAULT;
  } catch {
    return CARGO_EXPORT_DEFAULT;
  }
}

export function formatCargoExportRow(row, format) {
  return String(format).replace(
    /\{([a-z_]+)\}/gi,
    (token, key) =>
      CARGO_EXPORT_FIELDS.includes(key.toLowerCase())
        ? String(row?.[key.toLowerCase()] ?? "")
        : token
  );
}

// WhatsApp uses *bold*, _italic_, ~strike~,
// and `inline code` markers.

export const CARGO_WA_KEY = "cargo_whatsapp_format_v1";

export const CARGO_WA_DEFAULT =
  "*{charterer|CNR}* | {qty|TBN} {cargo|TBC}\n" +
  "{load|TBN} → {disch|TBN}\n" +
  "LC: {from|TBN} – {to|TBN}\n" +
  "Freight: {freight|RNR}";

export function readCargoWhatsAppFormat() {
  try {
    return localStorage.getItem(CARGO_WA_KEY) ?? CARGO_WA_DEFAULT;
  } catch {
    return CARGO_WA_DEFAULT;
  }
}

export function formatCargoWhatsAppRow(row) {
  return readCargoWhatsAppFormat().replace(
    /\{([a-z_]+)(?:\|([^}]*))?\}/gi,
    (token, key, fallback) => {
      const field = key.toLowerCase();

      if (!CARGO_EXPORT_FIELDS.includes(field)) return token;

      const value = row?.[field];

      return value == null || String(value).trim() === ""
        ? (fallback ?? "")
        : String(value);
    }
  );
}

// Positions WhatsApp template, independent of Cargoes.

export const POSITION_WA_KEY = "positions_whatsapp_format_v1";

export const POSITION_WA_DEFAULT =
  "*{vessel|TBN}* — {operator|TBN}\n" +
  "{openPort|TBN} | {date|TBN}\n" +
  "{dwt} DWT | {coating}";

export const POSITION_WA_FIELDS = [
  "vessel", "operator", "owner", "openPort",
  "date", "dwt", "built", "coating", "loa",
  "beam", "cbm", "comment", "tag",
  "updatedAt", "imo_no"
];

export function readPositionWhatsAppFormat() {
  try {
    return localStorage.getItem(POSITION_WA_KEY) ?? POSITION_WA_DEFAULT;
  } catch {
    return POSITION_WA_DEFAULT;
  }
}

export function formatPositionWhatsAppRow(
  row,
  format = readPositionWhatsAppFormat()
) {
  return String(format).replace(
    /\{([a-z_][a-z_0-9]*)(?:\|([^}]*))?\}/gi,
    (token, key, fallback) => {
      const field = POSITION_WA_FIELDS.find(
        x => x.toLowerCase() === key.toLowerCase()
      );

      if (!field) return token;

      const value = row?.[field];

      return value == null || String(value).trim() === ""
        ? (fallback ?? "")
        : String(value);
    }
  );
}

// Compact WhatsApp tables:
// fixed-width cells inside a monospace code block.

function waTitleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b[a-z]/g, letter => letter.toUpperCase());
}

function waCell(value, width) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  const chars = Array.from(text);

  return (
    chars.length > width
      ? chars.slice(0, width - 1).join("") + "…"
      : text
  ).padEnd(width, " ");
}

function waTable(columns, rows) {
  const line = columns
    .map(c => "-".repeat(c.width))
    .join(" ");

  const header = columns
    .map(c => waCell(c.title, c.width))
    .join(" ");

  const body = rows.map(row =>
    columns.map(c => waCell(c.value(row), c.width)).join(" ")
  );

  return "```\n" + [header, line, ...body].join("\n") + "\n```";
}

function waDate(v) {
  if (!v) return "TBN";

  const text = String(v).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (iso) {
    const d = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3])
    );

    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short"
    });
  }

  return text;
}

function waQty(row) {
  const v = row?.qty ?? row?.quantity ?? row?.volume;

  if (v == null || String(v).trim() === "") return "TBN";

  return String(v);
}

export function formatCargoWhatsAppTable(rows) {
  return waTable([
    {
      title: "Charterer",
      width: 14,
      value: r => waTitleCase(r.charterer || "CNR")
    },
    {
      title: "Vessel",
      width: 18,
      value: r => waTitleCase(r.vessel || r.vessel_name || "TBN")
    },
    {
      title: "Qty / Grade",
      width: 21,
      value: r => `${waQty(r)} ${r.cargo || r.grade || "TBC"}`
    },
    {
      title: "Load / Disch",
      width: 25,
      value: r => `${r.load || "TBN"} / ${r.disch || "TBN"}`
    },
    {
      title: "Laycan",
      width: 13,
      value: r => `${waDate(r.from)}-${waDate(r.to)}`
    },
    {
      title: "Rate",
      width: 13,
      value: r => r.freight || r.rate || "RNR"
    }
  ], rows);
}

export function formatPositionsWhatsAppTable(rows) {
  return waTable([
    {
      title: "Vessel",
      width: 22,
      value: r => r.vessel || r.vessel_name || "TBN"
    },
    {
      title: "DWT",
      width: 8,
      value: r => {
        const n = Number(
          String(r.dwt ?? "").replace(/[^0-9.]/g, "")
        );

        return Number.isFinite(n) && n > 0
          ? n.toLocaleString("en-US")
          : "TBN";
      }
    },
    {
      title: "Port",
      width: 18,
      value: r =>
        r.openPort || r.open_port || r.port || "TBN"
    },
    {
      title: "Date",
      width: 9,
      value: r =>
        waDate(r.date || r.openDate || r.open_date)
    }
  ], rows);
}
