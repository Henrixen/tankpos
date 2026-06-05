// aiUsage.js — shared token tracking for AI Ask and Parse
// Stores usage in Supabase (cross-device) + localStorage (instant reads)
// Pricing as of mid-2025 (Claude Sonnet 4):
//   Input:  $3.00 per 1M tokens
//   Output: $15.00 per 1M tokens

import { supabase } from "./supabaseclient";

const INPUT_COST_PER_M  = 3.00;   // $ per million input tokens
const OUTPUT_COST_PER_M = 15.00;  // $ per million output tokens
const LS_KEY = "signal_ai_usage";

// SQL to run in Supabase:
// CREATE TABLE IF NOT EXISTS ai_usage_log (
//   id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   ts           timestamptz DEFAULT now(),
//   type         text,   -- 'ask' | 'parse'
//   input_tokens  int,
//   output_tokens int,
//   cost_usd      numeric(10,6),
//   note          text
// );
// ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
// DROP POLICY IF EXISTS "allow all" ON ai_usage_log;
// CREATE POLICY "allow all" ON ai_usage_log FOR ALL USING (true) WITH CHECK (true);
// GRANT ALL ON ai_usage_log TO anon, authenticated;

export function calcCost(inputTokens, outputTokens) {
  return (inputTokens / 1_000_000) * INPUT_COST_PER_M
       + (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;
}

export async function logUsage({ type, inputTokens, outputTokens, note = "" }) {
  const cost = calcCost(inputTokens, outputTokens);

  // 1. Write to Supabase (async, best-effort)
  supabase.from("ai_usage_log").insert({
    type,
    input_tokens:  inputTokens,
    output_tokens: outputTokens,
    cost_usd:      cost,
    note,
  }).then(({ error }) => { if (error) console.warn("ai_usage_log:", error.message); });

  // 2. Update localStorage for instant dashboard reads
  try {
    const existing = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    if (!existing.daily)   existing.daily = {};
    if (!existing.monthly) existing.monthly = {};
    existing.daily[today]    = (existing.daily[today]    || 0) + cost;
    existing.monthly[month]  = (existing.monthly[month]  || 0) + cost;
    existing.total           = (existing.total           || 0) + cost;
    existing.lastUpdated     = new Date().toISOString();
    localStorage.setItem(LS_KEY, JSON.stringify(existing));
  } catch {}

  return cost;
}

// Read cached totals from localStorage (fast, for display)
export function getUsageCache() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    return {
      today:   d.daily?.[today]   || 0,
      month:   d.monthly?.[month] || 0,
      total:   d.total            || 0,
    };
  } catch { return { today: 0, month: 0, total: 0 }; }
}

// Fetch accurate totals from Supabase (slower, for full accuracy)
export async function fetchUsageTotals() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";

  const [{ data: todayData }, { data: monthData }, { data: totalData }] = await Promise.all([
    supabase.from("ai_usage_log").select("cost_usd").gte("ts", today + "T00:00:00"),
    supabase.from("ai_usage_log").select("cost_usd").gte("ts", monthStart + "T00:00:00"),
    supabase.from("ai_usage_log").select("cost_usd"),
  ]);

  const sum = rows => (rows || []).reduce((a, r) => a + (parseFloat(r.cost_usd) || 0), 0);
  return {
    today: sum(todayData),
    month: sum(monthData),
    total: sum(totalData),
  };
}
