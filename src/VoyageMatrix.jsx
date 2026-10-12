import React, { useState, useMemo, useEffect } from "react";
import { C } from "./constants";
import { toTCase, calcVoyage, calcEuEts } from "./utils";

const SpecTag = ({col,children}) => <span style={{fontSize:11,fontWeight:600,padding:"2px 6px",borderRadius:3,background:col+"18",border:"1px solid "+col+"44",color:col}}>{children}</span>;

/** Independent Voyage Matrix. Receives existing in-memory vessel and cargo data. */
export default function VoyageMatrix({ vessels = [], cargoes = [] }) {
  const [mxSearch,setMxSearch] = useState("");
  const [mxPage,setMxPage] = useState(1);
  const [mxPageSize,setMxPageSize] = useState(25);
  const mxFilteredVessels = useMemo(()=>{
    const q=mxSearch.trim().toLowerCase();
    return q?vessels.filter(v=>v.vessel?.toLowerCase().includes(q)||v.operator?.toLowerCase().includes(q)):vessels;
  },[vessels,mxSearch]);
  const mxTotalPages=Math.max(1,Math.ceil(mxFilteredVessels.length/mxPageSize));
  const mxCurrentPage=Math.min(mxPage,mxTotalPages);
  const mxPageVessels=useMemo(()=>mxFilteredVessels.slice((mxCurrentPage-1)*mxPageSize,mxCurrentPage*mxPageSize),[mxFilteredVessels,mxCurrentPage,mxPageSize]);
  const mxLatestCargoByVessel=useMemo(()=>{
    const lookup=new Map();
    for(const c of cargoes){
      const key=c.vessel?.trim().toLowerCase();
      if(!key)continue;
      const prev=lookup.get(key);
      if(!prev||(c.updated||"")>(prev.updated||""))lookup.set(key,c);
    }
    return lookup;
  },[cargoes]);
  // Voyage distance and ETA calculations run only for vessels on the current page.
  const mxPreparedRows=useMemo(()=>mxPageVessels.map(v=>{
    const cargo=mxLatestCargoByVessel.get(v.vessel?.trim().toLowerCase());
    return {v,cargo,calc:cargo?calcVoyage(v,cargo):null};
  }),[mxPageVessels,mxLatestCargoByVessel]);
  useEffect(()=>{if(mxPage>mxTotalPages)setMxPage(mxTotalPages);},[mxPage,mxTotalPages]);
  return (
          <div style={{border:"1px solid "+C.bd2,borderRadius:7,overflow:"hidden"}}>
            <div style={{background:C.bg2,padding:"6px 14px",borderBottom:"1px solid "+C.bd2,display:"flex",gap:16,fontSize:13,color:C.dim,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontWeight:700,color:C.tx}}>🔗 Voyage Matrix</span>
              <span>12.5 kts · 1d load · 18h disch</span>
              <input value={mxSearch||""} onChange={e=>{setMxSearch(e.target.value);setMxPage(1);}} placeholder="🔍 Search vessel…"
                style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:4,color:C.tx,fontFamily:"inherit",fontSize:13,padding:"2px 8px",outline:"none",width:160,marginLeft:"auto"}}/>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",padding:"8px 14px",borderBottom:"1px solid "+C.bd2,fontSize:12,color:C.dim}}>
              <span>{mxFilteredVessels.length===0?"0 vessels":`${(mxCurrentPage-1)*mxPageSize+1}–${Math.min(mxCurrentPage*mxPageSize,mxFilteredVessels.length)} of ${mxFilteredVessels.length} vessels`}</span>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <span>Rows</span>
                <select value={mxPageSize} onChange={e=>{setMxPageSize(Number(e.target.value));setMxPage(1);}} style={{background:C.bg3,color:C.tx,border:"1px solid "+C.bd,borderRadius:4,padding:"3px 5px"}}>
                  <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option>
                </select>
                <button disabled={mxCurrentPage<=1} onClick={()=>setMxPage(1)} style={{opacity:mxCurrentPage<=1?.35:1}}>«</button>
                <button disabled={mxCurrentPage<=1} onClick={()=>setMxPage(p=>Math.max(1,p-1))} style={{opacity:mxCurrentPage<=1?.35:1}}>‹</button>
                <span>Page {mxCurrentPage} / {mxTotalPages}</span>
                <button disabled={mxCurrentPage>=mxTotalPages} onClick={()=>setMxPage(p=>Math.min(mxTotalPages,p+1))} style={{opacity:mxCurrentPage>=mxTotalPages?.35:1}}>›</button>
                <button disabled={mxCurrentPage>=mxTotalPages} onClick={()=>setMxPage(mxTotalPages)} style={{opacity:mxCurrentPage>=mxTotalPages?.35:1}}>»</button>
              </div>
            </div>
            {vessels.length===0
              ?<div style={{padding:"40px",textAlign:"center",color:C.faint}}><div style={{fontSize:28,marginBottom:8}}>🔗</div>Add vessels and cargoes</div>
              :mxPreparedRows.map(({v,cargo,calc},i)=>{
                const bg=i%2===0?C.bg:C.bg2;
                const sc=cargo?(cargo.status==="FIXED"?C.green:cargo.status==="SUBS"?C.purple:cargo.status==="FAILED"?C.red:C.amber):C.faint;
                return(
                  <div key={v.vessel} style={{background:bg,borderBottom:"1px solid "+C.bd2,padding:"9px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <div style={{minWidth:150,marginRight:4}}>
                        <div style={{fontWeight:700,fontSize:13,color:C.blue}}>{toTCase(v.vessel)}</div>
                        <div style={{fontSize:13,color:C.dim}}>{v.operator||""}</div>
                      </div>
                      <div style={{background:C.bg3,border:"1px solid "+C.bd,borderRadius:5,padding:"3px 9px",textAlign:"center"}}>
                        <div style={{fontSize:11,color:C.faint,textTransform:"uppercase"}}>Now open</div>
                        <div style={{fontSize:13,fontWeight:700,color:v.openPort==="EMPLOYED"?C.purple:C.amber}}>{v.openPort||"?"}</div>
                        {v.date&&<div style={{fontSize:13,color:C.blue}}>{v.date}</div>}
                      </div>
                      {cargo&&<>
                        <div style={{textAlign:"center",padding:"0 3px"}}>
                          {calc?.ballastNm&&<div style={{fontSize:13,color:C.faint}}>{calc.ballastNm}nm</div>}
                          <div style={{fontSize:15,color:C.faint}}>──▶</div>
                          {calc?.ballastDays&&<div style={{fontSize:13,color:C.faint}}>{calc.ballastDays}d</div>}
                        </div>
                        <div style={{background:C.bg3,border:"1px solid "+sc+"55",borderRadius:5,padding:"3px 9px",textAlign:"center"}}>
                          <div style={{fontSize:11,color:C.faint,textTransform:"uppercase"}}>Load</div>
                          <div style={{fontSize:13,fontWeight:700}}>{cargo.load||"?"}</div>
                          <div style={{fontSize:13,color:C.blue}}>{calc?.loadDate||cargo.from||"—"}</div>
                        </div>
                        <div style={{textAlign:"center",padding:"0 3px"}}>
                          {calc?.ladenNm&&<div style={{fontSize:13,color:C.faint}}>{calc.ladenNm}nm</div>}
                          <div style={{fontSize:15,color:sc}}>──▶</div>
                          {cargo.cargo&&<div style={{fontSize:13,color:C.purple}}>{cargo.cargo}</div>}
                        </div>
                        <div style={{background:C.bg3,border:"1px solid "+(calc?.openDate?C.green:C.bd)+"88",borderRadius:5,padding:"3px 9px",textAlign:"center"}}>
                          <div style={{fontSize:11,color:C.faint,textTransform:"uppercase"}}>Next open</div>
                          <div style={{fontSize:13,fontWeight:700,color:calc?.openDate?C.green:C.dim}}>{cargo.disch||"?"}</div>
                          {calc?.openDate?(<div style={{fontSize:13,color:C.green}}>~{calc.openDate}</div>):(<div style={{fontSize:13,color:C.faint}}>—</div>)}
                        </div>
                        <div style={{marginLeft:6,display:"flex",flexDirection:"column",gap:2}}>
                          <span style={{fontSize:13,fontWeight:700,color:sc,background:sc+"18",border:"1px solid "+sc+"44",borderRadius:3,padding:"1px 7px"}}>{cargo.status}</span>
                          {cargo.freight&&<span style={{fontSize:13,color:C.purple,fontWeight:700}}>{cargo.freight}</span>}
                          {(()=>{
                            const b=calc?.ballastNm||0;const l=calc?.ladenNm||0;
                            if(!l)return null;
                            const ets=calcEuEts(b,l,13,15,3,8,2,1,0.25,1,0.25,0,12.5,false);
                            return ets>0?<span style={{fontSize:12,color:"#fd79a8",fontWeight:600,background:"rgba(253,121,168,0.08)",border:"1px solid rgba(253,121,168,0.25)",borderRadius:3,padding:"1px 5px",whiteSpace:"nowrap"}} title="Indicative EU ETS cost (50% scope, deep-sea)">ETS ~${ets.toLocaleString()}</span>:null;
                          })()}
                        </div>
                      </>}
                      {!cargo&&<div style={{marginLeft:8,fontSize:13,color:C.faint,fontStyle:"italic"}}>No fixture - vessel open</div>}
                    </div>
                    {v.spec?.fuel||v.spec?.iceClass?(<div style={{display:"flex",gap:3,marginTop:4}}>{v.spec?.fuel&&<SpecTag col={v.spec.fuel==="LNG"?C.green:C.purple}>{v.spec.fuel}</SpecTag>}{v.spec?.iceClass&&<SpecTag col={C.blue}>{v.spec.iceClass}</SpecTag>}</div>):null}
                  </div>
                );
              })
            }
          </div>
  );
}
