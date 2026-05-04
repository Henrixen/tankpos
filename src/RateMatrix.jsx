import React, { useState, useEffect, useRef } from "react";
import { C, TCE_DEFAULTS } from "./constants";
import { loadRates, saveRates } from "./supabaseHelpers";
import { calcTCE, calcEuEts } from "./TCECalculator";

function getBunkerState(){
  if(!window._bunkerState)window._bunkerState={val:TCE_DEFAULTS.bunker,listeners:[]};
  return window._bunkerState;
}
function RateMatrixBunkerInput(){
  const bs=getBunkerState();
  const [val,setVal]=useState(bs.val);
  useEffect(()=>{
    const bs=getBunkerState();
    const cb=v=>{setVal(v);};
    bs.listeners.push(cb);
    // Load saved bunker on mount
    loadRates().then(d=>{if(d?.__matrixBunker){bs.val=d.__matrixBunker;bs.listeners.forEach(c=>c(d.__matrixBunker));}});
    return()=>{bs.listeners=bs.listeners.filter(x=>x!==cb);};
  },[]);
  return(
    <input
      key={val}
      defaultValue={val}
      onBlur={e=>{const n=parseFloat(e.target.value.replace(/[^0-9.]/g,""));if(!isNaN(n)&&n>0){const bs=getBunkerState();bs.val=n;bs.listeners.forEach(cb=>cb(n));}else{e.target.value=val;}}}
      onKeyDown={e=>{if(e.key==="Enter"){e.target.blur();}if(e.key==="Escape"){e.target.value=val;e.target.blur();}}}
      style={{width:60,background:C.bg3,border:"1px solid "+C.amber,borderRadius:4,color:C.amber,fontFamily:"inherit",fontWeight:700,fontSize:12,padding:"2px 6px",outline:"none",textAlign:"right"}}
      title="Bunker price used for TCE auto-calculation"/>
  );
}
// Europe routes: single rate + TCE, no qty
const EU_ROUTES=[
  // ballastNm = nm from typical position (ARA base) to load port
  // loadPDA / dischPDA in USD
  {id:"mng-ara",from:"Mongstad",to:"ARA",ballastNm:532,ladenNm:532,loadPDA:25000,dischPDA:28000},
  {id:"ara-tha",from:"ARA",to:"Thames",ballastNm:450,ladenNm:256,loadPDA:28000,dischPDA:25400},
  {id:"ara-dub",from:"ARA",to:"Dublin",ballastNm:450,ladenNm:500,loadPDA:28000,dischPDA:16200},
  {id:"tee-ara",from:"Tees",to:"ARA",ballastNm:450,ladenNm:256,loadPDA:35560,dischPDA:28000},
  {id:"bis-ara",from:"Biscay",to:"ARA",ballastNm:650,ladenNm:650,loadPDA:21600,dischPDA:28000},
  {id:"ara-wme",from:"ARA",to:"WMed",ballastNm:450,ladenNm:2049,loadPDA:28000,dischPDA:27000},
  {id:"med-ara",from:"Med",to:"ARA",ballastNm:600,ladenNm:2049,loadPDA:27000,dischPDA:28000},
];
// Asia + TA: rate per size
const RATE_ROUTES=[
  {region:"Asia",label:"Asia → Europe",routes:[
    {id:"nch-ara",from:"N.China",to:"ARA"},
    {id:"str-ara",from:"Straits",to:"ARA"},
  ]},
  {region:"TA",label:"Transatlantic",routes:[
    {id:"ara-usg",from:"ARA",to:"USG"},
    {id:"usg-ara",from:"USG",to:"ARA"},
  ]},
];
const RATE_SIZES=["5kt","10kt","18kt"];
const REGION_COLORS={Europe:"#58a6ff",Asia:"#bc8cff",TA:"#e3b341"};

function defaultRateMatrix(){
  const m={};
  // EU routes: rate + tce
  for(const rt of EU_ROUTES){m[rt.id+"-rate"]={rate:"",comment:""};m[rt.id+"-tce"]={rate:"",comment:""};}
  // Asia+TA: by size
  for(const rg of RATE_ROUTES)for(const rt of rg.routes)for(const sz of RATE_SIZES){
    m[rt.id+"-"+sz]={rate:"",comment:""};
  }
  return m;
}

// RCell: fully uncontrolled input — no parent re-render on keystroke, no cursor jump
function RCell({ck,col,matrixRef,onSave,onComment,rev:extRev=0}){
  const inputRef=useRef(null);
  const c=col||REGION_COLORS.Europe;
  useEffect(()=>{
    const el=inputRef.current;
    if(!el||document.activeElement===el)return;
    const raw=matrixRef.current[ck]?.rate||"";
    const num=parseFloat(raw.replace(/[^0-9.\-]/g,""));
    el.value=raw&&!isNaN(num)?num.toLocaleString("nb-NO"):raw;
    el.style.background=raw?c+"33":"transparent";
    el.style.color=raw?"#fff":C.faint;
    el.style.fontWeight=raw?"700":"400";
  },[extRev,ck]);
  const vRaw=matrixRef.current[ck]?.rate||"";
  const vNum=parseFloat(vRaw.replace(/[^0-9.\-]/g,""));
  const v=vRaw&&!isNaN(vNum)?vNum.toLocaleString("nb-NO"):vRaw;
  return(
    <input ref={inputRef} data-ck={ck}
      defaultValue={v}
      onFocus={e=>{e.target.style.outline="1px solid rgba(88,166,255,.5)";e.target.style.background="rgba(88,166,255,.07)";const raw=matrixRef.current[ck]?.rate||"";e.target.value=raw;e.target.select();}}
      onBlur={e=>{e.target.style.outline="none";const raw=e.target.value.trim();const num=parseFloat(raw.replace(/[^0-9.\-]/g,""));const display=raw&&!isNaN(num)?num.toLocaleString("nb-NO"):raw;e.target.value=display;e.target.style.background=raw?c+"33":"transparent";e.target.style.color=raw?"#fff":C.faint;e.target.style.fontWeight=raw?"700":"400";onSave(ck,raw);}}
      onKeyDown={e=>{
        if(e.key==="Tab"||e.key==="Enter"){
          e.preventDefault();
          e.target.blur();
          // Find all matrix inputs in order
          const allInputs=[...document.querySelectorAll("input[data-ck]")];
          const idx=allInputs.indexOf(e.target);
          let next=null;
          if(e.key==="Tab"&&e.shiftKey){next=allInputs[idx-1];}
          else{next=allInputs[idx+1];}
          if(next){setTimeout(()=>{next.focus();next.select();},30);}
        }
        if(e.key==="Escape"){e.target.blur();}
      }}
      onContextMenu={e=>{e.preventDefault();onComment(ck);}}
      title={matrixRef.current[ck]?.comment?"💬 "+matrixRef.current[ck].comment:"Right-click for comment"}
      style={{width:"100%",background:v?c+"33":"transparent",
        border:"none",outline:"none",
        color:v?"#fff":C.faint,fontWeight:v?700:400,
        fontFamily:"inherit",fontSize:12,
        padding:"3px 3px",textAlign:"center",boxSizing:"border-box",minWidth:0}}/>
  );
}
function RateMatrix({onBunkerChange}){
  const [rev,forceUpdate]=useState(0);
  const matrixRef=useRef(defaultRateMatrix());
  const loadedRef=useRef(false);

  useEffect(()=>{
    loadRates().then(d=>{
      if(d){
        matrixRef.current={...defaultRateMatrix(),...d};
        if(d.__euRoutes)setEuRoutes(d.__euRoutes);
        if(d.__rateRoutes)setRateRoutes(d.__rateRoutes);
        if(d.__matrixBunker){setMatrixBunker(d.__matrixBunker);const bs=getBunkerState();bs.val=d.__matrixBunker;bs.listeners.forEach(cb=>cb(d.__matrixBunker));}
      }
      loadedRef.current=true;
      forceUpdate(n=>n+1);
    });
  },[]);
  const [editComment,setEditComment]=useState(null);
  // Editable route labels
  const [euRoutes,setEuRoutes]=useState(()=>EU_ROUTES.map(r=>({...r})));
  const [rateRoutes,setRateRoutes]=useState(()=>RATE_ROUTES.map(rg=>({...rg,routes:rg.routes.map(r=>({...r}))})));
  const [editingRoute,setEditingRoute]=useState(null); // {section,rgIdx,rtIdx,field}
  const [matrixBunker,setMatrixBunker]=useState(window._bunkerState?.val||TCE_DEFAULTS.bunker);

  // Sync with header bunker input
  useEffect(()=>{
    const cb=v=>{setMatrixBunker(v);};
    if(window._bunkerState)window._bunkerState.listeners.push(cb);
    return()=>{if(window._bunkerState)window._bunkerState.listeners=window._bunkerState.listeners.filter(x=>x!==cb);};
  },[]);

  const tceDefaultsRef=useRef(TCE_DEFAULTS);
 
  function saveMatrixBunker(val){
    matrixRef.current.__matrixBunker=val;
    if(window._bunkerState){window._bunkerState.val=val;window._bunkerState.listeners.forEach(cb=>cb(val));}
    if(loadedRef.current)saveRates(matrixRef.current);
  }

  // Re-calc all EU route TCEs when bunker price changes
  useEffect(()=>{
    if(!loadedRef.current)return;
    euRoutes.forEach(rt=>{
      const rateKey=rt.id+"-rate";
      const tceKey=rt.id+"-tce";
      const rateVal=matrixRef.current[rateKey]?.rate;
      if(!rateVal||!rt.ladenNm)return;
      const freight=parseFloat(String(rateVal).replace(/[^0-9.]/g,""));
      if(!freight)return;
      const d={...tceDefaultsRef.current,bunker:matrixBunker};
      const ets=calcEuEts(rt.ballastNm||0,rt.ladenNm,d.consBallast,d.consLaden,d.consLoad,d.consDisch,d.consIdle,d.daysLoad,d.noticeLoad,d.daysDisch,d.noticeDisch,d.daysWaiting,d.speed,true);
      const r=calcTCE({freight,ballastNm:rt.ballastNm,ladenNm:rt.ladenNm,repoNm:0,otherRevenue:0,otherExpenses:0,euEts:ets,loadPortCosts:[{cost:rt.loadPDA!=null?rt.loadPDA:25000}],dischPortCosts:[{cost:rt.dischPDA!=null?rt.dischPDA:25000}],...d});
      if(r&&r.tce!=null){
        const etsFmt=ets>0?" (incl. ETS $"+ets.toLocaleString("nb-NO")+")":"";
        matrixRef.current={...matrixRef.current,[tceKey]:{...(matrixRef.current[tceKey]||{}),rate:String(r.tce),comment:"Auto-calc: freight $"+freight.toLocaleString()+etsFmt}};
        setTimeout(()=>{
          document.querySelectorAll("input[data-ck='"+tceKey+"']").forEach(el=>{el.value=r.tce.toLocaleString("nb-NO");el.style.background=REGION_COLORS.Europe+"33";el.style.color="#fff";el.style.fontWeight="700";el.title="Auto-calc TCE"+etsFmt;});
        },30);
      }
    });
    if(loadedRef.current)saveRates(matrixRef.current);
  },[matrixBunker]);

  function saveRoutes(euR,rateR){
    matrixRef.current.__euRoutes=euR;
    matrixRef.current.__rateRoutes=rateR;
    if(loadedRef.current)saveRates(matrixRef.current);
  }
  function updateEuRoute(i,field,val){
    const next=euRoutes.map((r,idx)=>idx===i?{...r,[field]:val}:r);
    setEuRoutes(next);saveRoutes(next,rateRoutes);
  }
  function updateRgRoute(rgIdx,rtIdx,field,val){
    const next=rateRoutes.map((rg,ri)=>ri!==rgIdx?rg:{...rg,routes:rg.routes.map((r,rti)=>rti!==rtIdx?r:{...r,[field]:val})});
    setRateRoutes(next);saveRoutes(euRoutes,next);
  }

  function RouteLabel({section,rgIdx,rtIdx,from,to}){
    const key=section+"-"+rgIdx+"-"+rtIdx;
    const isEdit=editingRoute===key;
    if(isEdit){
      return(
        <span style={{display:"inline-flex",gap:2,alignItems:"center"}}>
          <input autoFocus defaultValue={from}
            onBlur={e=>{section==="eu"?updateEuRoute(rtIdx,"from",e.target.value):updateRgRoute(rgIdx,rtIdx,"from",e.target.value);setEditingRoute(null);}}
            onKeyDown={e=>{if(e.key==="Tab"||e.key==="Enter"){e.preventDefault();const v=e.target.value;section==="eu"?updateEuRoute(rtIdx,"from",v):updateRgRoute(rgIdx,rtIdx,"from",v);e.target.blur();}if(e.key==="Escape")setEditingRoute(null);}}
            style={{width:52,background:C.bg3,border:"1px solid "+C.blue,borderRadius:3,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"0 3px",outline:"none"}}/>
          <span style={{color:C.faint,fontSize:12}}>→</span>
          <input defaultValue={to}
            onBlur={e=>{section==="eu"?updateEuRoute(rtIdx,"to",e.target.value):updateRgRoute(rgIdx,rtIdx,"to",e.target.value);setEditingRoute(null);}}
            onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape"){section==="eu"?updateEuRoute(rtIdx,"to",e.target.value):updateRgRoute(rgIdx,rtIdx,"to",e.target.value);setEditingRoute(null);}}}
            style={{width:52,background:C.bg3,border:"1px solid "+C.blue,borderRadius:3,color:C.tx,fontFamily:"inherit",fontSize:12,padding:"0 3px",outline:"none"}}/>
        </span>
      );
    }
    return(
      <span onClick={()=>setEditingRoute(key)} style={{cursor:"pointer"}} title="Click to edit route">
        <span style={{fontWeight:600,fontSize:12,color:C.dim}}>{from}</span>
        <span style={{color:C.faint,fontSize:12}}> → </span>
        <span style={{fontWeight:600,fontSize:12,color:C.dim}}>{to}</span>
        <span style={{color:C.faint,fontSize:8,marginLeft:3,opacity:0.5}}>✎</span>
      </span>
    );
  }

  function onSave(key,val){
    const prev=matrixRef.current[key]||{};
    matrixRef.current={...matrixRef.current,[key]:{...prev,rate:val}};
    // Auto-calc TCE for EU routes when rate is entered
    if(key.endsWith("-rate")){
      const rtId=key.slice(0,-5);
      const rt=euRoutes.find(r=>r.id===rtId);
      if(rt&&rt.ladenNm!=null&&val){
        const freight=parseFloat(val.replace(/[^0-9.]/g,""));
        const d={...tceDefaultsRef.current,bunker:matrixBunker};
        const ets=calcEuEts(rt.ballastNm||0,rt.ladenNm,d.consBallast,d.consLaden,d.consLoad,d.consDisch,d.consIdle,d.daysLoad,d.noticeLoad,d.daysDisch,d.noticeDisch,d.daysWaiting,d.speed,true);
        const r=calcTCE({freight,ballastNm:rt.ballastNm,ladenNm:rt.ladenNm,repoNm:0,
          otherRevenue:0,otherExpenses:0,euEts:ets,
          loadPortCosts:[{cost:rt.loadPDA!=null?rt.loadPDA:(d.loadPortCost||25000)}],
          dischPortCosts:[{cost:rt.dischPDA!=null?rt.dischPDA:(d.dischPortCost||25000)}],...d});
        if(r&&r.tce!=null){
          const tceKey=rtId+"-tce";
          const etsFmt=ets>0?" (incl. ETS $"+ets.toLocaleString("nb-NO")+")":"";
          matrixRef.current={...matrixRef.current,[tceKey]:{...(matrixRef.current[tceKey]||{}),rate:String(r.tce),comment:"Auto-calc: freight $"+freight.toLocaleString()+etsFmt}};
          setTimeout(()=>{
            const inputs=document.querySelectorAll("input[data-ck='"+tceKey+"']");
            inputs.forEach(el=>{el.value=r.tce.toLocaleString("nb-NO");el.style.background=REGION_COLORS.Europe+"33";el.style.color="#fff";el.style.fontWeight="700";el.title="Auto-calc TCE"+etsFmt;});
          },30);
        }
      }
    }
    if(loadedRef.current){saveRates(matrixRef.current);forceUpdate(n=>n+1);}
  }
  function onComment(key){setEditComment(key);}
  function updComment(key,val){
    const prev=matrixRef.current[key]||{};
    matrixRef.current={...matrixRef.current,[key]:{...prev,comment:val}};
    if(loadedRef.current)saveRates(matrixRef.current);
  }

  const thS={padding:"5px 8px",fontSize:11,fontWeight:700,color:"rgba(120,160,220,0.55)",background:"rgba(20,30,50,0.92)",textAlign:"center",whiteSpace:"nowrap",borderBottom:"1px solid rgba(58,130,246,0.14)",textTransform:"uppercase",letterSpacing:"0.07em"};
  const tdR={fontSize:12,padding:"1px 2px",borderBottom:"1px solid rgba(255,255,255,0.035)",verticalAlign:"middle"};

  // RCell is defined outside this component (see above)

  return(
    <div style={{display:"flex",flexDirection:"column",gap:9}}>
      {editComment&&(
        <div style={{display:"flex",gap:4,alignItems:"center",background:C.bg3,border:"1px solid "+C.blue,borderRadius:4,padding:"3px 6px"}}>
          <span style={{fontSize:12,color:C.faint}}>Comment for {editComment}:</span>
          <input defaultValue={matrixRef.current[editComment]?.comment||""}
            autoFocus
            onBlur={e=>{updComment(editComment,e.target.value.trim());setEditComment(null);}}
            onKeyDown={e=>{if(e.key==="Enter"){updComment(editComment,e.target.value.trim());setEditComment(null);}if(e.key==="Escape")setEditComment(null);}}
            style={{flex:1,background:"transparent",border:"none",color:C.tx,fontFamily:"inherit",fontSize:12,padding:"0 2px",outline:"none"}}/>
        </div>
      )}

      {/* Intra Europe: Rate + TCE columns */}
      <div>
        <div style={{fontSize:11,fontWeight:700,color:REGION_COLORS.Europe,textTransform:"uppercase",letterSpacing:"0.08em",padding:"4px 8px",background:"rgba(20,30,50,0.92)",borderBottom:"1px solid rgba(58,130,246,0.14)",borderLeft:"3px solid "+REGION_COLORS.Europe}}>
          Intra Europe
        </div>
        <table style={{borderCollapse:"collapse",width:"100%"}}>
          <thead><tr>
            <th style={{...thS,textAlign:"left",width:"25%"}}>Route</th>
            <th style={{...thS,width:"15%"}}>Rate ($ lsum)</th>
            <th style={{...thS,width:"15%",color:C.green}}>TCE $/day</th>
            <th style={{...thS,width:"40%"}}>Comment</th>
          </tr></thead>
          <tbody>
            {euRoutes.map((rt,i)=>(
              <tr key={rt.id||i} style={{background:i%2===0?"rgba(7,15,28,0.96)":"rgba(22,37,64,0.82)"}}>
                <td style={{...tdR,color:C.dim,paddingLeft:4}}>
                  <RouteLabel section="eu" rgIdx={0} rtIdx={i} from={rt.from} to={rt.to}/>
                </td>
                <td style={{...tdR,padding:0}}><RCell matrixRef={matrixRef} onSave={onSave} onComment={onComment} ck={rt.id+"-rate"} col={REGION_COLORS.Europe} rev={rev}/></td>
                <td style={{...tdR,padding:0}}><RCell matrixRef={matrixRef} onSave={onSave} onComment={onComment} ck={rt.id+"-tce"} col={C.green} rev={rev}/></td>
                <td style={{...tdR,padding:0}}><RCell matrixRef={matrixRef} onSave={onSave} onComment={onComment} ck={rt.id+"-comment"} col={C.faint} rev={rev}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Asia + TA: by size */}
      {rateRoutes.map((rg,rgIdx)=>(
        <div key={rg.region}>
          <div style={{fontSize:11,fontWeight:700,color:REGION_COLORS[rg.region],textTransform:"uppercase",letterSpacing:"0.08em",padding:"4px 8px",background:"rgba(20,30,50,0.92)",borderBottom:"1px solid rgba(58,130,246,0.14)",borderLeft:"3px solid "+REGION_COLORS[rg.region]}}>
            {rg.label}
          </div>
          <table style={{borderCollapse:"collapse",width:"100%"}}>
            <thead><tr>
              <th style={{...thS,textAlign:"left",width:"25%"}}>Route</th>
              {RATE_SIZES.map(sz=>(<th key={sz} style={{...thS,width:"11.67%"}}>{sz}</th>))}
              <th style={{...thS,width:"40%"}}>Comment</th>
            </tr></thead>
            <tbody>
              {rg.routes.map((rt,rtIdx)=>(
                <tr key={rt.id||rtIdx} style={{background:rtIdx%2===0?"rgba(7,15,28,0.96)":"rgba(22,37,64,0.82)"}}>
                  <td style={{...tdR,color:C.dim,paddingLeft:4}}>
                    <RouteLabel section="rg" rgIdx={rgIdx} rtIdx={rtIdx} from={rt.from} to={rt.to}/>
                  </td>
                  {RATE_SIZES.map(sz=>(
                    <td key={sz} style={{...tdR,padding:0}}>
                      <RCell matrixRef={matrixRef} onSave={onSave} onComment={onComment} ck={rt.id+"-"+sz} col={REGION_COLORS[rg.region]} rev={rev}/>
                    </td>
                  ))}
                  <td style={{...tdR,padding:0}}><RCell matrixRef={matrixRef} onSave={onSave} onComment={onComment} ck={rt.id+"-comment"} col={C.faint} rev={rev}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ─── Intel Vault ──────────────────────────────────────────────────────────────

export { RateMatrix, RateMatrixBunkerInput, getBunkerState, defaultRateMatrix };
export default RateMatrix;
