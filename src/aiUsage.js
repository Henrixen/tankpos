// Usage tracking disabled.
// Keep exports so existing imports continue working.

export function calcCost() {
  return 0;
}

export async function logUsage() {
  return 0;
}

export function getUsageCache() {
  return { today: 0, month: 0, total: 0 };
}

export async function fetchUsageTotals() {
  return { today: 0, month: 0, total: 0 };
}
