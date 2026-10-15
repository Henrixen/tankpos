import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from './supabaseclient';

const ROUTES=['TC2','TC14','TC6','TC23','TC7'];
const COLORS={TC2:'#58a6ff',TC14:'#f59e0b',TC17:'#c084fc',TC6:'#34d399',TC23:'#fb7185',TC7:'#22d3ee'};
const PERIODS=['SPOT','Oct 26','Nov 26','Dec 26','Jan 27','Feb 27','Mar 27','Apr 27','May 27','Jun 27','Jul 27','Aug 27','Sep 27'];
const css={panel:{background:'#0b1a30',border:'1px solid #213b5d',borderRadius:8,padding:15,minWidth:0},muted:{fontSize:11,color:'#7897bb'},input:{background:'#081528',border:'1px solid #315174',borderRadius:5,color:'#e4efff',padding:'7px 9px',fontSize:12},btn:{background:'#112d4c',border:'1px solid #35659a',borderRadius:5,color:'#a9d5ff',padding:'7px 12px',cursor:'pointer',fontSize:12},head:{color:'#76b7ff',fontSize:11,fontWeight:800,letterSpacing:'.09em',textTransform:'uppercase',marginBottom:12}};
const clean=s=>String(s??'').trim();
const num=s=>{let v=clean(s).replace(/\s/g,'').replace(/[^\d.,+\-]/g,'');if(v.includes(',')&&v.includes('.'))v=v.replace(/,/g,'');else if(v.includes(','))v=v.replace(',','.');const n=Number(v);return v&&Number.isFinite(n)?n:null;};
const iso=d=>{if(!d)return new Date().toISOString().slice(0,10);const x=new Date(d);return Number.isNaN(x.getTime())?new Date().toISOString().slice(0,10):x.toISOString().slice(0,10)};
const row=(date,route,period,metric,value,unit,source='paste',eco=null)=>({as_of_date:date,route:route.toUpperCase(),period,metric,unit,value,source,eco});
// Handles tab-delimited Excel, CSV and whitespace-aligned FFA tables. Preview is mandatory before saving.
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthLabel=(date,offset=0)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+offset);return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;};
const canonicalPeriod=(p,date)=>{const x=clean(p);if(/^Current Month$/i.test(x))return monthLabel(date);if(/^Month \+1$/i.test(x))return monthLabel(date,1);if(/^Month \+2$/i.test(x))return monthLabel(date,2);if(/^Q[1-4]\s*\d{2}$/i.test(x))return x.toUpperCase().replace(/\s+/g,' ');if(/^Cal\s*\d{4}$/i.test(x))return x.replace(/\s+/g,' ');return x;};
function parseText(text,date){
 const result=[];const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const split=l=>l.includes('|')?l.replace(/^\|/,'').replace(/\|$/,'').split('|').map(clean):l.includes('\t')?l.split('\t').map(clean):l.includes(';')?l.split(';').map(clean):l.split(/\s{2,}/).map(clean);
 let headers=null;
 for(const line of lines){
  if(/^\|?[\s:|\-]+\|?$/.test(line))continue;
  const c=split(line);if(c.length<3)continue;
  if(/^(Period|Date)$/i.test(c[0])&&c.slice(1).some(h=>/^TC\d+/i.test(h))){headers=c;continue;}
  if(headers){
   const p=canonicalPeriod(c[0],date);
   if(!/^(SPOT|YTD|MTD|BALMO|Current Quarter|[A-Za-z]{3}\s*\d{2}|Q[1-4]\s*\d{2}|Cal\s*\d{4})$/i.test(p))continue;
   for(let i=1;i<Math.min(headers.length,c.length);i++){
    const m=headers[i].match(/^(TC\d+)\s*(?:\(?TCE\)?)?$/i);if(!m)continue;
    const value=num(c[i]);if(value===null)continue;
    const tce=/TCE/i.test(headers[i]);
    // Worldscale quotes remain WS across the January annual flat-rate reset.
    result.push(row(date,m[1],p,tce?'TCE':'FFA',value,tce?'USD/DAY':'WS','matrix'));
   }
   continue;
  }
  if(/^TC\d+[A-Z0-9_+\-]*$/i.test(c[0])&&c.length>=4){
   const code=c[0].toUpperCase(),route=code.match(/^TC\d+/)[0];let period=canonicalPeriod(c[1],date);
   if(code.includes('BALMO'))period='BALMO';else if(code.includes('CURMON'))period=monthLabel(date);else if(code.includes('CURQ'))period='Current Quarter';else if(code.includes('+1'))period=monthLabel(date,1);else if(code.includes('+2'))period=monthLabel(date,2);
   const value=num(c[2]);if(value!==null)result.push(row(iso(c[4]||date),route,period,'FFA',value,(c[3]||'WS').toUpperCase(),'excel'));
  }
 }
 return result.filter((r,i,a)=>a.findIndex(x=>[x.as_of_date,x.route,x.period,x.metric,x.unit,x.eco].join('|')===[r.as_of_date,r.route,r.period,r.metric,r.unit,r.eco].join('|'))===i);
}
function SparkChart({items,route,metric,unit,forward=true,height=260}){
 const series=items.filter(r=>r.route===route&&r.metric===metric&&r.unit===unit&&r.value!=null);
 const latest=series.map(r=>r.as_of_date).sort().at(-1);
 const same=series.filter(r=>r.as_of_date===latest);
 const byPeriod=p=>same.find(r=>canonicalPeriod(r.period,latest)===p);
 const months=Array.from({length:12},(_,i)=>monthLabel(latest,i));
 const monthly=months.map(p=>byPeriod(p)).filter(Boolean);
 const balmo=byPeriod('BALMO'),quarter=byPeriod('Current Quarter')||same.find(r=>/^Q[1-4]\s*\d{2}$/i.test(r.period));
 const spot=series.filter(r=>r.period==='SPOT').sort((a,b)=>a.as_of_date.localeCompare(b.as_of_date));
 const chartRows=forward?(monthly.length?[...(balmo?[monthly[0],balmo,...monthly.slice(1)]:monthly)]:[...(byPeriod('Current Month')?[byPeriod('Current Month')]:[]),...(balmo?[balmo]:[]),...(byPeriod('Month +1')?[byPeriod('Month +1')]:[]),...(byPeriod('Month +2')?[byPeriod('Month +2')]:[]) ]):spot;
 const points=chartRows.filter(Boolean).map((r,i)=>({x:i,y:r.value,label:r.period==='BALMO'?'BALMO':canonicalPeriod(r.period,latest)}));
 if(!points.length)return <div style={{height,display:'grid',placeItems:'center',color:'#6888aa',fontSize:12}}>No {unit} observations saved for {route}</div>;
 const vals=[...points.map(x=>x.y),...(quarter?[quarter.value]:[])];let lo=Math.min(...vals),hi=Math.max(...vals);const pad=(hi-lo||Math.max(Math.abs(hi)*.08,1))*.18;lo-=pad;hi+=pad;
 const W=900,H=height,L=72,R=28,T=24,B=48;const xx=x=>L+(points.length===1?.5:x/(points.length-1))*(W-L-R),yy=y=>T+(hi-y)/(hi-lo)*(H-T-B);
 const path=points.map((r,i)=>(i?'L':'M')+xx(r.x).toFixed(1)+','+yy(r.y).toFixed(1)).join(' ');
 const color=COLORS[route]||'#58a6ff';
 return <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height,display:'block'}} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${route} ${unit} forward curve`}>
  {[0,1,2,3,4].map(i=>{const y=T+i*(H-T-B)/4;return <g key={i}><line x1={L} x2={W-R} y1={y} y2={y} stroke="#29415c" strokeDasharray="3 5"/><text x={L-12} y={y+4} fill="#91a9c5" fontSize="12" textAnchor="end">{format(hi-(hi-lo)*i/4,unit)}</text></g>})}
  {quarter&&forward&&<g><line x1={L} x2={W-R} y1={yy(quarter.value)} y2={yy(quarter.value)} stroke="#f5b86a" strokeWidth="1.6" strokeDasharray="6 5"/><text x={W-R-4} y={yy(quarter.value)-7} textAnchor="end" fill="#f5b86a" fontSize="12">Quarter {format(quarter.value,unit)}</text></g>}
  {points.length>1&&<path d={path} stroke={color} strokeWidth="2.6" fill="none" vectorEffect="non-scaling-stroke"/>}
  {points.map((p,i)=><g key={i}><circle cx={xx(p.x)} cy={yy(p.y)} r="4" fill={p.label==='BALMO'?'#f5b86a':color}><title>{`${p.label}: ${format(p.y,unit)} ${unit}`}</title></circle>{(points.length<=8||i%Math.ceil(points.length/8)===0||i===points.length-1)&&<text x={xx(p.x)} y={H-18} textAnchor="middle" fill="#a6bed8" fontSize="12">{p.label}</text>}</g>)}
 </svg>;
}
function CompareChart({items,routes,metric,unit,height=370}){
 const valid=routes.map(route=>{
  const all=items.filter(r=>r.route===route&&r.metric===metric&&r.unit===unit&&Number.isFinite(Number(r.value)));
  const latest=all.map(r=>r.as_of_date).sort().at(-1);
  const same=all.filter(r=>r.as_of_date===latest);
  const lookup=p=>same.find(r=>canonicalPeriod(r.period,latest)===p);
  const periods=latest?[monthLabel(latest),'BALMO',...Array.from({length:2},(_,i)=>monthLabel(latest,i+1))]:[];
  const points=periods.map((p,i)=>({i,p,value:lookup(p)?.value})).filter(p=>p.value!=null);
  const quarter=lookup('Current Quarter')||same.find(r=>/^Q[1-4]\s*\d{2}$/i.test(r.period));
  return {route,latest,points,quarter:quarter?.value,periods};
 });
 const active=valid.filter(s=>s.points.length);
 if(!active.length)return <div style={{height,display:'grid',placeItems:'center',color:'#7897bb'}}>No matching forward assessments saved for selected routes and unit.</div>;
 const values=active.flatMap(s=>[...s.points.map(p=>p.value),...(s.quarter!=null?[s.quarter]:[])]);
 const min=Math.min(...values),max=Math.max(...values),padding=(max-min||Math.abs(max)*.1||1)*.15;
 const low=min-padding,high=max+padding,W=1000,H=height,L=75,R=28,T=25,B=48;
 const x=i=>L+i*(W-L-R)/3,y=v=>T+(high-v)/(high-low)*(H-T-B);
 const labels=active[0].periods;
 return <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{width:'100%',height,display:'block'}} role="img" aria-label="Forward curve comparison">
  {[0,1,2,3,4].map(i=>{const yy=T+i*(H-T-B)/4;return <g key={i}><line x1={L} x2={W-R} y1={yy} y2={yy} stroke="#29415c" strokeDasharray="3 6"/><text x={L-12} y={yy+4} fill="#91a9c5" fontSize="12" textAnchor="end">{format(high-(high-low)*i/4,unit)}</text></g>})}
  {labels.map((p,i)=><text key={p} x={x(i)} y={H-14} textAnchor="middle" fill="#a6bed8" fontSize="13">{p}</text>)}
  {active.map(s=><g key={s.route}>
   {s.points.length>1&&<path d={s.points.map((p,i)=>`${i?'L':'M'}${x(p.i)},${y(p.value)}`).join(' ')} stroke={COLORS[s.route]} strokeWidth="2.6" fill="none" vectorEffect="non-scaling-stroke"/>}
   {s.points.map(p=><circle key={p.p} cx={x(p.i)} cy={y(p.value)} r="4.5" fill={COLORS[s.route]}><title>{`${s.route} ${p.p}: ${format(p.value,unit)} ${unit}`}</title></circle>)}
   {s.quarter!=null&&<line x1={L} x2={W-R} y1={y(s.quarter)} y2={y(s.quarter)} stroke={COLORS[s.route]} strokeDasharray="6 6" opacity=".6" strokeWidth="1.5"/>}
  </g>)}
 </svg>;
}
function periodIndex(p){const m=String(p).match(/^(\w{3})\s*(\d{2})$/);if(m){const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(m[1]);return (+m[2])*12+month;}return {'SPOT':0,'Current Month':1,'Month +1':2,'Month +2':3,'Current Quarter':4}[p]??999;}
const format=(n,u)=>n==null?'—':u==='USD/DAY'?'$'+Math.round(n).toLocaleString('en-US'):Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
export default function MRHandy(){
 const [rows,setRows]=useState([]),[preview,setPreview]=useState([]),[raw,setRaw]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10));
 const [route,setRoute]=useState('TC2'),[compareRoutes,setCompareRoutes]=useState(['TC2']),[metric,setMetric]=useState('FFA'),[unit,setUnit]=useState('WS'),[showParser,setShowParser]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[filter,setFilter]=useState('ALL'),[ocrBusy,setOcrBusy]=useState(false),[ocrStatus,setOcrStatus]=useState('');
 const [accessKey,setAccessKey]=useState('');
 const [connected,setConnected]=useState(false);
 const [manual,setManual]=useState({route:'TC2',period:'SPOT',metric:'FFA',unit:'WS',value:'',eco:'',date:new Date().toISOString().slice(0,10)});
 const request=async(action,payload)=>{
  if(!accessKey.trim())throw new Error('Enter the MR–HANDY access key first.');
  const {data,error}=await supabase.functions.invoke('mr-handy-rates',{body:{action,payload},headers:{'x-mr-handy-secret':accessKey.trim()}});
  if(error){let message=error.message;try{const details=await error.context?.json();message=details?.error||message;}catch{}throw new Error(message);}
  if(data?.error)throw new Error(data.error);
  return data;
 };
 const load=async()=>{try{const data=await request('list');setRows(data?.rows||[]);setConnected(true);setError('');}catch(e){setConnected(false);setError(e.message||String(e));}};
 const save=async list=>{if(!list.length)return;setSaving(true);setError('');try{const payload=list.map(({id,created_at,eco_key,...r})=>({...r,eco:r.eco||null}));await request('upsert',payload);setPreview([]);setRaw('');await load();}catch(e){setError(e.message||String(e));}finally{setSaving(false);}};
 const latestDate=rows.map(r=>r.as_of_date).sort().at(-1);
 const latest=(r,m='FFA',u='WS')=>rows.filter(x=>x.route===r&&x.metric===m&&x.unit===u&&x.period==='SPOT').sort((a,b)=>a.as_of_date.localeCompare(b.as_of_date)).at(-1);
 const available=useMemo(()=>rows.filter(r=>filter==='ALL'||r.route===filter),[rows,filter]);
 const history=useMemo(()=>[...rows].sort((a,b)=>b.as_of_date.localeCompare(a.as_of_date)||a.route.localeCompare(b.route)||periodIndex(a.period)-periodIndex(b.period)),[rows]);
 const addManual=()=>{const n=num(manual.value);if(n===null){setError('Enter a valid numeric rate.');return;}setPreview(p=>[...p,row(manual.date,manual.route,manual.period,manual.metric,n,manual.unit,'manual',manual.eco||null)]);setManual(p=>({...p,value:''}));setError('');};
 const extractImage=async(file)=>{
  if(!file)return;
  if(!file.type?.startsWith('image/')){setError('Please select an image file.');return;}
  setOcrBusy(true);setOcrStatus('Reading screenshot…');setError('');
  try{
   const {recognize}=await import('tesseract.js');
   const result=await recognize(file,'eng');
   const extracted=result?.data?.text?.trim()||'';
   if(!extracted){setError('No text detected in the image.');setOcrStatus('');return;}
   setRaw(previous=>previous?previous+'\n'+extracted:extracted);
   setOcrStatus('Image text extracted. Check the values, then click Parse & Review.');
  }catch(err){setError('Image extraction failed: '+(err?.message||String(err)));setOcrStatus('');}
  finally{setOcrBusy(false);}
 };
 const handleImagePaste=e=>{
  const file=Array.from(e.clipboardData?.items||[]).find(item=>item.type?.startsWith('image/'))?.getAsFile();
  if(file){e.preventDefault();void extractImage(file);}
 };
 const label=(s)=><div style={css.head}>{s}</div>;
 return <div style={{background:'#071325',color:'#d9e8ff',padding:'18px 20px',fontFamily:'Inter,system-ui,sans-serif',minHeight:'100vh',fontSize:12}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:18}}><div><div style={{fontSize:21,fontWeight:850,letterSpacing:'.02em'}}>MR <span style={{color:'#58a6ff'}}>–</span> HANDY <span style={{fontWeight:500,color:'#7296bd',fontSize:12,marginLeft:10}}>SPOT · FFA · TCE</span></div><div style={css.muted}>Market intelligence | {rows.length.toLocaleString()} saved observations | Latest {latestDate||'—'}</div></div><div style={{display:'flex',gap:8}}><button style={css.btn} onClick={()=>void load()}>↻ Refresh</button><button style={{...css.btn,background:'#174776',color:'#eaf4ff'}} onClick={()=>setShowParser(s=>!s)}>{showParser?'Close Import':'＋ Import / Manual Entry'}</button></div></div>
   <div style={{...css.panel,marginBottom:12,display:'flex',alignItems:'center',gap:9,flexWrap:'wrap'}}><span style={css.muted}>MR–HANDY secure database access</span><input type="password" autoComplete="off" placeholder="MR–HANDY access key" value={accessKey} onChange={e=>{setAccessKey(e.target.value);setConnected(false);}} onKeyDown={e=>{if(e.key==='Enter')void load();}} style={{...css.input,minWidth:220}}/><button style={css.btn} onClick={()=>void load()}>Connect / Load rates</button><span style={{...css.muted,color:connected?'#42d79d':'#7897bb'}}>{connected?'Connected':'Not connected'}</span></div>
  {error&&<div style={{border:'1px solid #9c4151',background:'#391e30',padding:10,borderRadius:5,marginBottom:12,color:'#ffc2cc'}}>{error}</div>}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10,marginBottom:12}}>{ROUTES.slice(0,4).map(r=>{const a=latest(r);const t=latest(r,'TCE','USD/DAY');const older=rows.filter(x=>x.route===r&&x.metric==='FFA'&&x.unit==='WS'&&x.period==='SPOT'&&x.as_of_date!==a?.as_of_date).sort((x,y)=>x.as_of_date.localeCompare(y.as_of_date)).at(-1);const delta=a&&older?a.value-older.value:null;return <div key={r} style={{...css.panel,borderTop:`2px solid ${COLORS[r]}`}}><div style={{display:'flex',justifyContent:'space-between'}}><b style={{color:COLORS[r],fontSize:13}}>{r}</b><span style={css.muted}>SPOT WS</span></div><div style={{fontSize:28,fontWeight:850,margin:'9px 0 3px'}}>{a?format(a.value,'WS'):'—'}</div><div style={{display:'flex',justifyContent:'space-between',gap:6}}><span style={{color:delta==null?'#819bb8':delta>=0?'#42d79d':'#fb7185'}}>{delta==null?'No previous day':`${delta>=0?'+':''}${delta.toFixed(2)} WS`}</span><span style={css.muted}>{t?`${format(t.value,'USD/DAY')}/d`:'TCE —'}</span></div></div>})}</div>
  {showParser&&<div style={{...css.panel,marginBottom:12,borderColor:'#35669a'}}>{label('IMPORT DAILY EMAIL / EXCEL DATA')}<div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:10}}><label>As of date <input style={{...css.input,marginLeft:7}} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><span style={css.muted}>Paste Excel cells, CSV, or a date/route matrix. Review all extracted values before saving.</span></div><textarea value={raw} onPaste={handleImagePaste} onChange={e=>setRaw(e.target.value)} placeholder={'Route\tPeriod\tValue\tUnit\tDate\nTC6BALMO\tOct 26\t392.771\tWS\t09-Oct-2026'} style={{...css.input,width:'100%',height:125,boxSizing:'border-box',fontFamily:'monospace',resize:'vertical'}}/><div style={{display:'flex',gap:8,marginTop:9,alignItems:'center',flexWrap:'wrap'}}><label style={{...css.btn,cursor:ocrBusy?'wait':'pointer'}}>＋ Image / Screenshot<input type="file" accept="image/*" disabled={ocrBusy} onChange={e=>{extractImage(e.target.files?.[0]);e.target.value='';}} style={{display:'none'}}/></label><span style={css.muted}>Or paste screenshot directly into the text box (Ctrl+V)</span></div>{ocrStatus&&<div style={{...css.muted,marginTop:7}}>{ocrStatus}</div>}<div style={{display:'flex',gap:8,marginTop:9}}><button disabled={ocrBusy} style={css.btn} onClick={()=>{const parsed=parseText(raw,date);setPreview(parsed);setError(parsed.length?'': 'No recognizable observations. Paste a Markdown table headed Period | TC2 | TC2 TCE ... or Excel rows.');}}>Parse & Review</button><span style={css.muted}>Unrecognized email layouts must be entered manually; no invented values.</span></div>
  <div style={{borderTop:'1px solid #263f5d',margin:'16px 0 12px'}}/>{label('MANUAL RATE ENTRY')}<div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>{[['route',ROUTES],['period',PERIODS],['metric',['FFA','TCE']],['unit',['WS','USD/MT','USD/DAY']],['eco',['','ECO','NON-ECO']]].map(([k,options])=><select key={k} title={k} style={css.input} value={manual[k]} onChange={e=>setManual(p=>({...p,[k]:e.target.value}))}>{options.map(o=><option key={o} value={o}>{o||'Eco status —'}</option>)}</select>)}<input style={{...css.input,width:115}} type="number" step="any" placeholder="Rate" value={manual.value} onChange={e=>setManual(p=>({...p,value:e.target.value}))}/><input style={css.input} type="date" value={manual.date} onChange={e=>setManual(p=>({...p,date:e.target.value}))}/><button style={css.btn} onClick={addManual}>Add to review</button></div>
  {preview.length>0&&<div style={{marginTop:16}}>{label(`REVIEW IMPORT · ${preview.length} OBSERVATIONS`)}<div style={{maxHeight:220,overflow:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}><thead><tr>{['Date','Route','Period','Type','Unit','Value','Source',''].map(x=><th key={x} style={{textAlign:'left',padding:7,borderBottom:'1px solid #395473'}}>{x}</th>)}</tr></thead><tbody>{preview.map((r,i)=><tr key={i}>{[r.as_of_date,r.route,r.period,r.metric,r.unit,r.value,r.source].map((v,j)=><td key={j} style={{padding:6,borderBottom:'1px solid #1c3048'}}>{v}</td>)}<td><button style={css.btn} onClick={()=>setPreview(p=>p.filter((_,j)=>j!==i))}>×</button></td></tr>)}</tbody></table></div><button disabled={saving} style={{...css.btn,background:'#14654e',borderColor:'#28977a',color:'white',marginTop:10}} onClick={()=>save(preview)}>{saving?'Saving…':`Save ${preview.length} rates to Supabase`}</button></div>}</div>}
  <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.6fr) minmax(290px,1fr)',gap:12,marginBottom:12}}>
   <div style={css.panel}>
    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:12}}>
     {label('SPOT HISTORY + FORWARD CURVE')}
     <div style={{display:'flex',gap:6,alignItems:'center',justifyContent:'flex-end',flexWrap:'wrap'}}>
      <span style={css.muted}>COMPARE ROUTES</span>
      {ROUTES.map(r=><button key={r} onClick={()=>setCompareRoutes(prev=>prev.includes(r)?(prev.length>1?prev.filter(x=>x!==r):prev):[...prev,r])} style={{...css.btn,padding:'6px 9px',borderColor:compareRoutes.includes(r)?COLORS[r]:'#274364',background:compareRoutes.includes(r)?'#17344e':'#0c2039',color:compareRoutes.includes(r)?COLORS[r]:'#91aac7'}}>{compareRoutes.includes(r)?'✓ ':''}{r}</button>)}
      <select style={css.input} value={metric} onChange={e=>{setMetric(e.target.value);setUnit(e.target.value==='TCE'?'USD/DAY':'WS')}}><option value="FFA">Spot / FFA</option><option value="TCE">TCE</option></select>
      <select style={css.input} value={unit} onChange={e=>setUnit(e.target.value)}>{(metric==='TCE'?['USD/DAY']:['WS','USD/MT']).map(x=><option key={x}>{x}</option>)}</select>
     </div>
    </div>
    <CompareChart items={rows} routes={compareRoutes} metric={metric} unit={unit} height={370}/>
    <div style={{display:'flex',gap:16,flexWrap:'wrap',marginTop:8,...css.muted}}>{compareRoutes.map(r=><span key={r} style={{color:COLORS[r]}}>━ {r}</span>)}<span style={{color:'#f5b86a'}}>┄ Current-quarter assessment</span></div>
   </div>
   <div style={css.panel}>{label('LATEST FORWARD ASSESSMENTS')}<div style={{display:'grid',gap:9}}>{ROUTES.map(r=>{const latest=rows.filter(x=>x.route===r).map(x=>x.as_of_date).sort().at(-1);if(!latest)return null;const set=rows.filter(x=>x.route===r&&x.as_of_date===latest);const get=(p,u='WS')=>set.find(x=>canonicalPeriod(x.period,latest)===p&&x.unit===u);const current=monthLabel(latest),next=monthLabel(latest,1),after=monthLabel(latest,2);const labels=[current,'BALMO',next,after];return <div key={r} style={{background:'#08182d',border:'1px solid #294463',borderRadius:7,padding:'10px 12px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:9}}><b style={{color:COLORS[r],fontSize:13}}>{r}</b><span style={css.muted}>{latest}</span></div><div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:5}}>{labels.map(p=>{const q=get(p);return <div key={p} style={{minWidth:0}}><div style={{...css.muted,whiteSpace:'nowrap',fontSize:10}}>{p}</div><div style={{fontWeight:800,fontSize:14,color:p==='BALMO'?'#f5b86a':'#e3efff'}}>{q?format(q.value,'WS'):'—'}</div></div>})}</div>{get('Current Quarter')&&<div style={{...css.muted,marginTop:8,borderTop:'1px solid #1e3857',paddingTop:6}}>Quarter assessment: <b style={{color:'#f5b86a'}}>{format(get('Current Quarter').value,'WS')} WS</b></div>}</div>})}</div></div>
  </div>
  <div style={{...css.panel,marginBottom:12}}>{label('FORWARD TERM STRUCTURE · LATEST DATE')}<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(310px,1fr))',gap:10}}>{['TC2','TC14','TC6','TC7','TC23'].map(r=><div key={r} style={{background:'#09182c',border:'1px solid #203a5a',borderRadius:6,padding:9}}><div style={{color:COLORS[r],fontWeight:800,marginBottom:3}}>{r} · WS</div><SparkChart items={rows.filter(x=>x.as_of_date===rows.filter(z=>z.route===r).map(z=>z.as_of_date).sort().at(-1))} route={r} metric="FFA" unit="WS" height={240}/></div>)}</div><div style={{...css.muted,marginTop:10}}>2027 USD/MT flat-rate contracts are shown separately in the forward table; they are never combined with WS on a single scale.</div></div>
  <div style={css.panel}>{label('MARKET DATA · SAVED OBSERVATIONS')}<div style={{display:'flex',gap:7,marginBottom:10}}><select style={css.input} value={filter} onChange={e=>setFilter(e.target.value)}>{['ALL',...ROUTES].map(x=><option key={x}>{x}</option>)}</select><span style={{...css.muted,alignSelf:'center'}}>{available.length} records · showing latest 150</span></div><div style={{overflowX:'auto',maxHeight:420,overflowY:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',whiteSpace:'nowrap',fontSize:11}}><thead style={{position:'sticky',top:0,background:'#11243e'}}><tr>{['Date','Route','Period','Metric','Unit','Rate','Eco','Source'].map(x=><th key={x} style={{padding:'9px 11px',textAlign:'left',color:'#8ab3df',borderBottom:'1px solid #36587b'}}>{x}</th>)}</tr></thead><tbody>{history.filter(x=>filter==='ALL'||x.route===filter).slice(0,150).map((x,i)=><tr key={x.id||i}>{[x.as_of_date,x.route,x.period,x.metric,x.unit,format(x.value,x.unit),x.eco||'—',x.source].map((v,j)=><td key={j} style={{padding:'8px 11px',borderBottom:'1px solid #192c43',color:j===1?COLORS[x.route]:'#c5d7ed'}}>{v}</td>)}</tr>)}</tbody></table></div></div>
 </div>;
}
