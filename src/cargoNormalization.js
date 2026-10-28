// Shared local cleanup. No network requests or AI calls.
function readFreightNumber(raw,scaled){
 let s=String(raw).replace(/\s/g,'');const commas=(s.match(/,/g)||[]).length,dots=(s.match(/\./g)||[]).length;
 if(commas&&dots){const decimal=s.lastIndexOf(',')>s.lastIndexOf('.')?',':'.';s=s.split(decimal).map((p,i,a)=>i===a.length-1?p:p.replace(/[.,]/g,'')).join('.');}
 else if(commas||dots){const sep=commas?',':'.',parts=s.split(sep);if(parts.length>2&&parts.slice(1).every(p=>p.length===3))s=parts.join('');else if(parts.length===2&&parts[1].length===3&&!scaled)s=parts.join('');else if(parts.length===2)s=parts.join('.');else return NaN;}
 return Number(s);
}
function rateNumber(n){return n.toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:6}).replace('.',',');}
function canonicalCargoFreight(value){
 if(value==null||String(value).trim()==='')return '';
 let text=String(value).trim().replace(/\bUSD\s+(?:USD\s*)+/ig,'USD ').replace(/\s+/g,' ');
 // Do not invent conversions for another currency, Worldscale or daily hire.
 if(/\b(?:EUR|GBP|NOK|CNY|JPY|WS|WORLD\s*SCALE|PDPR|PD|PER\s*DAY)\b|\/\s*DAY\b/i.test(text))return text;
 const pattern=/(?:USD\s*|US\$\s*|\$\s*)?(\d(?:[\d.,\s]*\d)?)(?:\s*)([KM])?\s*(LUMP\s*SUM|LUMPSUM|L\/S|LS|PMT|P\/MT|PER\s*(?:METRIC\s*)?TON(?:NE)?|USD\/MT|\/MT)?/i;
 const m=text.match(pattern);if(!m)return text;
 if(/^\s*[-–]\s*\d/.test(text.slice(m.index+m[0].length)))return text;
 const n=readFreightNumber(m[1],!!m[2]);if(!Number.isFinite(n))return text;
 const amount=n*(m[2]?.toUpperCase()==='K'?1000:m[2]?.toUpperCase()==='M'?1000000:1);
 const explicitPmt=/PMT|P\/MT|TON|\/MT/i.test(m[3]||'');
 const lump=!explicitPmt&&(!!m[2]||/LS|LUMP|L\/S/i.test(m[3]||'')||amount>=1000);
 const number=lump?(amount>=1000000?rateNumber(amount/1000000)+'M':rateNumber(amount/1000)+'K'):rateNumber(amount);
 const prefix=text.slice(0,m.index).replace(/\bUSD\b|US\$|\$/ig,'').trim();
 const suffix=text.slice(m.index+m[0].length).trim();
 return ['USD '+number+' '+(lump?'LS':'PMT'),prefix,suffix].filter(Boolean).join(' ').replace(/\s+([?])/g,'$1');
}
const freightCache=new Map();
export function formatCargoFreight(value){const key=String(value??"");if(freightCache.has(key))return freightCache.get(key);const result=canonicalCargoFreight(value);if(freightCache.size>=3000)freightCache.delete(freightCache.keys().next().value);freightCache.set(key,result);return result;}
const vesselKey=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function normalizeCargoEntry(row,known=[]){
 const next={...row,freight:formatCargoFreight(row.freight)};
 const comment=String(row.comment??'').trim(),vessel=String(row.vessel??'').trim();
 if(comment&&vessel&&vesselKey(comment)===vesselKey(vessel))next.comment='';
 else if(comment&&!vessel){const name=known.find(n=>vesselKey(n)===vesselKey(comment));if(name){next.vessel=name;next.comment='';}}
 return next;
}
