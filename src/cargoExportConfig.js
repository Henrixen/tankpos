
import { fmtFreight } from "./utils";

// ============================================================
// CARGOES — COPY LIST / COPY TEXT
// ============================================================

export const CARGO_EXPORT_KEY = "cargo_copy_format_v1";

export const CARGO_EXPORT_DEFAULT =
  "{charterer|CNR} | {vessel|TBN} | {qty} {cargo} | {load} to {disch} | {from} - {to} | {freight|RNR}";

export const CARGO_EXPORT_SECOND_KEY =
  "cargo_copy_format_second_v1";

export const CARGO_EXPORT_SECOND_DEFAULT =
  "{charterer|CNR} | {vessel|TBN} | {qty} {cargo} | {load} to {disch} | {from} - {to} | {freight|RNR}";

export const CARGO_EXPORT_FIELDS = [
  "status",
  "ex_region",
  "to_region",
  "p_and_c",
  "intelligence",
  "vessel",
  "charterer",
  "qty",
  "cargo",
  "load",
  "disch",
  "from",
  "to",
  "freight",
  "comment",
  "tag",
  "source",
  "entered_by",
  "updated"
];

export function readCargoExportFormat() {
  try {
    return (
      localStorage.getItem(CARGO_EXPORT_KEY) ??
      CARGO_EXPORT_DEFAULT
    );
  } catch {
    return CARGO_EXPORT_DEFAULT;
  }
}

export function readCargoExportSecondFormat() {
  try {
    return (
      localStorage.getItem(CARGO_EXPORT_SECOND_KEY) ??
      CARGO_EXPORT_SECOND_DEFAULT
    );
  } catch {
    return CARGO_EXPORT_SECOND_DEFAULT;
  }
}

// ============================================================
// COMMON FORMATTING
// ============================================================

function cargoExportNameCase(value) {
  const abbreviations = new Set([
    "CSS",
    "SA",
    "BASF",
    "BP",
    "AG",
    "ARA",
    "NWE",
    "UKC",
    "USG",
    "WAF",
    "SAF"
  ]);

  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, c => c.toUpperCase())
    .replace(/\b[A-Za-z]+\b/g, word =>
      abbreviations.has(word.toUpperCase())
        ? word.toUpperCase()
        : word
    );
}

function cargoExportFreight(value) {
  const raw = String(value ?? "").trim();

  if (!raw) return "";

  const normalized = raw
    .toUpperCase()
    .replace(/\bUSD\b/g, "")
    .replace(/\$/g, "")
    .replace(/\bL\s*\/\s*S\b/g, "")
    .replace(/\bLS\b/g, "")
    .replace(/\s+/g, "")
    .trim();

  // Preserve non-lumpsum values such as RNR or WS 200.
  if (!/^[\d.,]+K?$/.test(normalized)) {
    return fmtFreight(raw) || raw;
  }

  const hasK = normalized.endsWith("K");
  let numberText = normalized.replace(/K$/, "");

  if (hasK) {
    numberText = numberText.replace(",", ".");
  } else {
    // Interpret 390,000 and 390.000 as 390000.
    if (/^\d{1,3}([.,]\d{3})+$/.test(numberText)) {
      numberText = numberText.replace(/[.,]/g, "");
    } else {
      numberText = numberText.replace(",", ".");
    }
  }

  const amount = Number(numberText);

  if (!Number.isFinite(amount)) {
    return fmtFreight(raw) || raw;
  }

  const thousands = hasK ? amount : amount / 1000;

  const display = Number(thousands.toFixed(3))
    .toString()
    .replace(".", ",");

  return `USD ${display}K LS`;
}

function cargoExportValue(row, field) {
  const aliases = {
    vessel: ["vessel", "vessel_name"],
    qty: ["qty", "quantity", "volume"],
    cargo: ["cargo", "grade"],
    freight: ["freight", "rate"]
  };

  const keys = aliases[field] || [field];

  let raw = "";

  for (const key of keys) {
    const value = row?.[key];

    if (
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
    ) {
      raw = value;
      break;
    }
  }

  const value = String(raw ?? "").trim();

  if (!value) return "";

  if (field === "freight") {
    return cargoExportFreight(value);
  }

  if (
    field === "charterer" ||
    field === "vessel" ||
    field === "load" ||
    field === "disch"
  ) {
    return cargoExportNameCase(value);
  }

  return value;
}

// ============================================================
// CARGOES — CONFIGURABLE EXPORT FORMAT
// ============================================================

export function formatCargoExportRow(row, format) {
  return String(format ?? "")
    .replace(/\\n/g, "\n")
    .replace(
      /\{([a-z_][a-z_0-9]*)(?:\|([^}]*))?\}/gi,
      (token, key, fallback) => {
        const field = CARGO_EXPORT_FIELDS.find(
          f => f.toLowerCase() === key.toLowerCase()
        );

        if (!field) return token;

        const value = cargoExportValue(row, field);

        return value || fallback || "";
      }
    );
}

// ============================================================
// CARGOES — WHATSAPP TEMPLATE
// ============================================================

export const CARGO_WA_KEY =
  "cargo_whatsapp_format_v1";

export const CARGO_WA_DEFAULT =
  "*{charterer|CNR}* | {qty|TBN} {cargo|TBC}\n" +
  "{load|TBN} → {disch|TBN}\n" +
  "LC: {from|TBN} – {to|TBN}\n" +
  "Freight: {freight|RNR}";

export function readCargoWhatsAppFormat() {
  try {
    return (
      localStorage.getItem(CARGO_WA_KEY) ??
      CARGO_WA_DEFAULT
    );
  } catch {
    return CARGO_WA_DEFAULT;
  }
}

export function formatCargoWhatsAppRow(row) {
  return readCargoWhatsAppFormat().replace(
    /\{([a-z_]+)(?:\|([^}]*))?\}/gi,
    (token, key, fallback) => {
      const field = CARGO_EXPORT_FIELDS.find(
        f => f.toLowerCase() === key.toLowerCase()
      );

      if (!field) return token;

      const value = cargoExportValue(row, field);

      return value || fallback || "";
    }
  );
}

// ============================================================
// POSITIONS — WHATSAPP TEMPLATE
// ============================================================

export const POSITION_WA_KEY =
  "positions_whatsapp_format_v1";

export const POSITION_WA_DEFAULT =
  "*{vessel|TBN}* — {operator|TBN}\n" +
  "{openPort|TBN} | {date|TBN}\n" +
  "{dwt} DWT | {coating}";

export const POSITION_WA_FIELDS = [
  "vessel",
  "operator",
  "owner",
  "openPort",
  "date",
  "dwt",
  "built",
  "coating",
  "loa",
  "beam",
  "cbm",
  "comment",
  "tag",
  "updatedAt",
  "imo_no"
];

export function readPositionWhatsAppFormat() {
  try {
    return (
      localStorage.getItem(POSITION_WA_KEY) ??
      POSITION_WA_DEFAULT
    );
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

      return value == null ||
        String(value).trim() === ""
        ? (fallback ?? "")
        : String(value);
    }
  );
}

// ============================================================
// WHATSAPP — COMPACT TABLE HELPERS
// ============================================================

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
    columns
      .map(c => waCell(c.value(row), c.width))
      .join(" ")
  );

  return (
    "```\n" +
    [header, line, ...body].join("\n") +
    "\n```"
  );
}

function waDate(value) {
  if (!value) return "TBN";

  const text = String(value).trim();

  const iso = text.match(
    /^(\d{4})-(\d{2})-(\d{2})/
  );

  if (iso) {
    const date = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3])
    );

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short"
    });
  }

  return text;
}

function waQty(row) {
  const value =
    row?.qty ??
    row?.quantity ??
    row?.volume;

  if (
    value == null ||
    String(value).trim() === ""
  ) {
    return "TBN";
  }

  return String(value);
}

// ============================================================
// CARGOES — WHATSAPP TABLE
// ============================================================

export function formatCargoWhatsAppTable(rows) {
  return waTable([
    {
      title: "Charterer",
      width: 14,
      value: r =>
        cargoExportValue(r, "charterer") || "CNR"
    },
    {
      title: "Vessel",
      width: 18,
      value: r =>
        cargoExportValue(r, "vessel") || "TBN"
    },
    {
      title: "Qty / Grade",
      width: 21,
      value: r =>
        `${waQty(r)} ${cargoExportValue(r, "cargo") || "TBC"}`
    },
    {
      title: "Load / Disch",
      width: 25,
      value: r =>
        `${cargoExportValue(r, "load") || "TBN"} / ${cargoExportValue(r, "disch") || "TBN"}`
    },
    {
      title: "Laycan",
      width: 13,
      value: r =>
        `${waDate(r.from)}-${waDate(r.to)}`
    },
    {
      title: "Rate",
      width: 13,
      value: r =>
        cargoExportValue(r, "freight") || "RNR"
    }
  ], rows);
}

// ============================================================
// POSITIONS — WHATSAPP TABLE
// ============================================================

export function formatPositionsWhatsAppTable(rows) {
  return waTable([
    {
      title: "Vessel",
      width: 22,
      value: r =>
        r.vessel ||
        r.vessel_name ||
        "TBN"
    },
    {
      title: "DWT",
      width: 8,
      value: r => {
        const n = Number(
          String(r.dwt ?? "")
            .replace(/[^0-9.]/g, "")
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
        r.openPort ||
        r.open_port ||
        r.port ||
        "TBN"
    },
    {
      title: "Date",
      width: 9,
      value: r =>
        waDate(
          r.date ||
          r.openDate ||
          r.open_date
        )
    }
  ], rows);
}
