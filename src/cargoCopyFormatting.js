import {formatCargoExportRow} from './cargoExportConfig';

export const SMART_CARGO_TEXT = '{charterer|CNR} {status_phrase} {qty} {cargo} {load_phrase} {disch_phrase} {rate_phrase} {laycan}';
export const SMART_TEXT_FIELDS = ['status_phrase','load_phrase','disch_phrase','rate_phrase','laycan'];
const clean = v => String(v ?? '').trim();
export function compactLaycan(row){
  const a=clean(row.from), b=clean(row.to);
  const short=v=>v.replace(/^0(?=\d)/,'');
  if(!a||!b||a===b)return short(a||b);
  const x=a.match(/^(\d{1,2})\s+([a-z]{3})$/i), y=b.match(/^(\d{1,2})\s+([a-z]{3})$/i);
  if(x&&y&&x[2].toLowerCase()===y[2].toLowerCase())return `${+x[1]}-${+y[1]} ${y[2]}`;
  return `${short(a)} - ${short(b)}`;
}
export function formatCargoList(row,template){
  // Split only outside placeholders, preserving explicit fallback syntax.
  return String(template).split('\n').map(line=> (line.match(/(?:\{[^}]*\}|[^|{])+|\{/g)||[]).map(part=>formatCargoExportRow(row,part.trim()).trim()).filter(Boolean).join(' | ')).join('\n');
}
export function formatCargoText(row,template){
  const status=clean(row.status).toUpperCase(), vessel=clean(row.vessel), rate=clean(row.freight);
  const quoted=!status||status==='QUOTE'||status==='QUOTED';
  const label=quoted?'quoted':status==='SUBS'||status==='ON SUBS'?'on subs':status.toLowerCase();
  const fields={status_phrase:[label,...(!quoted&&vessel?[vessel,'for']:[])].join(' '),load_phrase:clean(row.load)?'from '+clean(row.load):'',disch_phrase:clean(row.disch)?'to '+clean(row.disch):'',rate_phrase:rate&&!/^RNR$/i.test(rate)?'@ '+rate:'',laycan:compactLaycan(row)};
  // Upgrade the previous stock sentence, but preserve other custom templates.
  if(/^\{charterer(?:\|CNR)?\}\s+fixed\s+\{vessel(?:\|TBN)?\}\s+for\s+\{qty\}\s+\{cargo\}\s+from\s+\{load\}\s+to\s+\{disch\}\s+@\s+\{freight(?:\|RNR)?\}\s+for\s+\{from\}\s*-\s*\{to\}$/i.test(String(template).trim()))template=SMART_CARGO_TEXT;
  return String(template).split('\n').map(line=>formatCargoExportRow(row,line.replace(/\{([a-z_]+)\}/gi,(token,key)=>Object.hasOwn(fields,key)?fields[key]:token)).replace(/[ \t]+/g,' ').trim()).join('\n');
}
const esc=v=>clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cargoEmailTable(rows){
 const headers=['Charterer','Vessel','Qty / Grade','Load','Disch','Laycan','Rate','Comment'];
 const data=rows.map(r=>[r.charterer,r.vessel,[r.qty,r.cargo].map(clean).filter(Boolean).join(' '),r.load,r.disch,compactLaycan(r),r.freight,r.comment]);
 const html='<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px"><thead><tr>'+headers.map(h=>`<th bgcolor="#173454" style="background-color:#173454;color:#ffffff;border:1px solid #b8c8d8;padding:7px 10px;text-align:left"><span style="color:#ffffff"><font color="#ffffff">${esc(h)}</font></span></th>`).join('')+'</tr></thead><tbody>'+data.map((r,i)=>'<tr>'+r.map(v=>`<td style="color:#000000;background-color:${i%2?'#f0f5fa':'#ffffff'};border:1px solid #cbd5e1;padding:6px 10px;white-space:nowrap">${esc(v)}</td>`).join('')+'</tr>').join('')+'</tbody></table>';
 return {html,text:[headers,...data].map(r=>r.map(v=>clean(v).replace(/[\t\r\n]+/g,' ')).join('\t')).join('\n')};
}




