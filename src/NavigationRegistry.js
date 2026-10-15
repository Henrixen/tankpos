
export const NAV_KEY = "signal_navigation_config";
export const NAV_CLOUD_KEY = "navigation_config";

export const NAV_ITEMS = [
  ["pos", "Positions", "#58a6ff", "🚢"],
  ["cargo2", "Cargoes", "#faa356", "🛢"],
  ["fix", "Fixing", "#c792ea", "◎"],
  ["tcv", "Time Charter", "#fb923c", "◷"],
  ["clients", "Clients", "#a8e6a3", "♟"],
  ["matrix", "Matrix", "#43e97b", "⌗"],
  ["projects", "Projects", "#4fc3f7", "◇"],
  ["tce", "TCE", "#faa356", "∑"],
  ["dash", "Dashboard", "#43e97b", "▦"],
  ["mrhandy", "MR-Handy", "#58a6ff", "≋"],
  ["notes", "Notes", "#f472b6", "✎"],
  ["reports", "Reports", "#6366f1", "▤"],
  ["map", "Freight Map", "#10b981", "⌁"],
  ["cal", "Calendar", "#4fc3f7", "◫"],
  ["settings", "Settings", "#94a3b8", "⚙"],
  ["vessels", "Fleet DB", "#38bdf8", "▣"],
  ["fleet", "Fleet", "#2dd4bf", "⚓"],
  ["newbuilds", "Newbuilds", "#fbbf24", "△"]
];

export function navDefault() {
  return {
    mode: "classic",
    collapsed: false,
    order: NAV_ITEMS.map(x => x[0]),
    hidden: [],
    groups: [
      { id: "market", label: "Market", tabs: ["pos", "cargo2", "fix", "tcv", "matrix"] },
      { id: "fleetg", label: "Fleet", tabs: ["fleet", "newbuilds", "vessels"] },
      { id: "tools", label: "Tools", tabs: ["projects", "tce", "map"] },
      { id: "reporting", label: "Reporting", tabs: ["dash", "mrhandy", "reports"] },
      { id: "workspace", label: "Workspace", tabs: ["clients", "notes", "cal", "settings"] }
    ]
  };
}

export function navNorm(x) {
  const d = navDefault();
  const valid = new Set(NAV_ITEMS.map(x => x[0]));

  const order = (Array.isArray(x?.order) ? x.order : [])
    .filter(id => valid.has(id));

  d.order.forEach(id => {
    if (!order.includes(id)) order.push(id);
  });

  const groups = (Array.isArray(x?.groups) ? x.groups : d.groups)
    .map((g, i) => ({
      id: String(g.id || "g" + i),
      label: String(g.label || "Menu"),
      tabs: (g.tabs || []).filter(id => valid.has(id))
    }));

  const used = new Set(groups.flatMap(g => g.tabs));
  const missing = order.filter(id => !used.has(id));

  if (missing.length) {
    if (!groups.length) {
      groups.push({ id: "other", label: "Other", tabs: [] });
    }
    groups[groups.length - 1].tabs.push(...missing);
  }

  return {
    mode: ["classic", "grouped", "sidebar"].includes(x?.mode)
      ? x.mode
      : "classic",
    collapsed: !!x?.collapsed,
    order,
    hidden: (x?.hidden || []).filter(id => valid.has(id)),
    groups
  };
}

export function navLoad() {
  try {
    return navNorm(
      JSON.parse(localStorage.getItem(NAV_KEY) || "null")
    );
  } catch {
    return navDefault();
  }
}
