// Browser-local request history. No Supabase reads, polling or AI requests.
// Counts only instrumented requests from this browser; not an organisation billing total.
const KEY="tankpos_ai_requests_v2",EVENT="tankpos:ai-usage-updated";
const memory=[];let storageFailed=false;
function read(){if(storageFailed)return memory;try{const rows=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(rows)?rows:[];}catch{return memory;}}
export function getUsageEntries(){return read().slice().reverse();}
export function subscribeUsage(fn){if(typeof window==="undefined")return ()=>{};window.addEventListener(EVENT,fn);window.addEventListener("storage",fn);return()=>{window.removeEventListener(EVENT,fn);window.removeEventListener("storage",fn);};}
export function calcCost(modelOrInput,usageOrOutput,maybeModel){
 const model=typeof modelOrInput==="string"?modelOrInput:maybeModel;
 const usage=typeof modelOrInput==="number"?{input_tokens:modelOrInput,output_tokens:usageOrOutput}:usageOrOutput;
 // Published standard global Claude API rates, checked 27 October 2026.
 // Unknown models/tiers stay unpriced rather than showing a made-up zero.
 if(!/^claude-sonnet-4(?:-6|-20250514)/.test(String(model||""))||!usage)return null;
 const n=v=>Math.max(0,Number(v)||0),creation=n(usage.cache_creation_input_tokens),hour=n(usage.cache_creation?.ephemeral_1h_input_tokens),five=usage.cache_creation?.ephemeral_5m_input_tokens==null?Math.max(0,creation-hour):n(usage.cache_creation.ephemeral_5m_input_tokens);
 return (n(usage.input_tokens)*3+n(usage.output_tokens)*15+n(usage.cache_read_input_tokens)*.3+five*3.75+hour*6)/1e6;
}
export async function logUsage(record){
 if(!record||typeof record!=="object")return null;
 const row={id:record.id||globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random(),timestamp:new Date().toISOString(),...record};
 const rows=read();if(rows.some(r=>r.id===row.id))return row.cost_usd??null;
 rows.push(row);const keep=rows.slice(-3000);memory.splice(0,memory.length,...keep);
 try{localStorage.setItem(KEY,JSON.stringify(keep));storageFailed=false;}catch{storageFailed=true;}
 if(typeof window!=="undefined")window.dispatchEvent(new Event(EVENT));
 return row.cost_usd??null;
}
export function getUsageCache(){
 const rows=read(),today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),month=today.slice(0,7);let totals={today:0,month:0,total:0,input_tokens:0,output_tokens:0,requests:rows.length,unpriced:0,usage_missing:0,source:"this browser only",storage_failed:storageFailed};
 for(const row of rows){totals.input_tokens+=Number(row.input_tokens)||0;totals.output_tokens+=Number(row.output_tokens)||0;if(!row.usage_available)totals.usage_missing++;if(row.cost_usd==null){totals.unpriced++;continue;}const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(row.timestamp));totals.total+=row.cost_usd;if(day===today)totals.today+=row.cost_usd;if(day.slice(0,7)===month)totals.month+=row.cost_usd;}
 return {...totals,incomplete:totals.unpriced>0||totals.usage_missing>0};
}
export async function fetchUsageTotals(){return getUsageCache();}
export function downloadUsageCSV(){
 const fields=["timestamp","user","action","endpoint","model","requested_model","input_tokens","output_tokens","cache_read_input_tokens","cache_creation_input_tokens","cost_usd","usage_available","status","request_id","duration_ms","input_chars","image","error"];
 const escape=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
 const csv=[fields.join(","),...getUsageEntries().map(r=>fields.map(k=>escape(r[k])).join(","))].join("\r\n");
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="parsing-usage-"+new Date().toISOString().slice(0,10)+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
