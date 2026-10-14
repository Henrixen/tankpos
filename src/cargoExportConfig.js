export const CARGO_EXPORT_KEY = "cargo_copy_format_v1";

export const CARGO_EXPORT_DEFAULT =
  " | {charterer} | {qty} | {cargo} | {load} | {disch} | {from} | {to} | {freight} | {comment} |";

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

export function formatCargoExportRow(row, format) {
  return String(format).replace(
    /\{([a-z_]+)\}/gi,
    (token, key) =>
      CARGO_EXPORT_FIELDS.includes(key.toLowerCase())
        ? String(row?.[key.toLowerCase()] ?? "")
        : token
  );
}
