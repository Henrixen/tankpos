import React, { useMemo, useState } from "react";
import { C } from "./constants";

// Deliberately closed list: the browser will only save one of these values.
// Keep this list aligned with the CHECK constraint added to public.cargoes.
export const CARGO2_REGIONS = [
  "NWE","UKC","BALTIC","MED","BLACK SEA","USG","USEC","USAC","CARIBS",
  "WAF","EC SAM","WC SAM","SUEZ-AG-INDIA","RED SEA","INDIA","SEA-FEA","PACIFIC"
];
const PC_OPTIONS=["1","2","3"];
const INTEL_OPTIONS=["QUOTE","FIXTURE"];

const inputStyle={
  width:"100%",boxSizing:"border-box",background:"rgba(7,15,28,.72)",
  border:"1px solid rgba(88,166,255,.16)",borderRadius:4,color:"#d9e8ff",
  font:"inherit",fontSize:11,padding:"5px 6px",outline:"none"
};
const th={position:"sticky",top:0,zIndex:2,background:C.bg3,color:"rgba(145,180,225,.72)",fontSize:10,
  fontWeight:800,textTransform:"uppercase",letterSpacing:".06em",padding:"7px 6px",textAlign:"left",
  borderBottom:"1px solid "+C.bd2,whiteSpace:"nowrap"};
const td={padding:"3px 4px",borderBottom:"1px solid rgba(58,130,246,.08)",verticalAlign:"middle"};

function SelectCell({value,options,onChange,placeholder="—"}){
  return <select value={value||""} onChange={e=>onChange(e.target.value)} style={{...inputStyle,colorScheme:"dark"}}>
    <option value="">{placeholder}</option>
    {options.map(x=><option key={x} value={x}>{x}</option>)}
  </select>;
}

export default function QuotesFixtures({cargoes=[],onUpdateC,onAddC,onDelC}){
  const [search,setSearch]=useState("");
  const [intel,setIntel]=useState("ALL");
  const [region,setRegion]=useState("ALL");
  const [saving,setSaving]=useState(()=>new Set());
  const [status,setStatus]=useState("");

  async function update(row,field,value){
    if(!row?.id||!onUpdateC)return;
    const k=row.id+":"+field;
    setSaving(s=>new Set([...s,k]));
    try{
      await onUpdateC(row.id,field,value);
      setStatus("Saved");
    }catch(e){
      console.error("Quotes&Fixtures update failed",field,e);
      setStatus("Save failed");
    }finally{
      setSaving(s=>{const n=new Set(s);n.delete(k);return n;});
      setTimeout(()=>setStatus(""),1200);
    }
  }

  const rows=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return [...cargoes].filter(r=>{
      if(intel!=="ALL"&&String(r.intelligence||"").toUpperCase()!==intel)return false;
      if(region!=="ALL"&&r.ex_region!==region&&r.to_region!==region)return false;
      if(!q)return true;
      return [r.charterer,r.vessel,r.cargo,r.qty,r.load,r.disch,r.from,r.to,r.freight,r.comment,r.ex_region,r.to_region,r.pc,r.intelligence,r.source]
        .some(v=>String(v??"").toLowerCase().includes(q));
    }).sort((a,b)=>String(b.updated||b.updated_at||"").localeCompare(String(a.updated||a.updated_at||"")));
  },[cargoes,search,intel,region]);

  const textCell=(r,field,placeholder="")=><input defaultValue={r[field]||""} placeholder={placeholder}
    onBlur={e=>{const v=e.target.value.trim();if(v!==String(r[field]||""))update(r,field,v);}}
    onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}} style={inputStyle}/>;

  return <div style={{display:"flex",flexDirection:"column",gap:9,minHeight:0,height:"calc(100vh - 86px)"}}>
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",background:C.bg3,border:"1px solid "+C.bd2,borderRadius:7,padding:"8px 10px"}}>
      <div style={{fontSize:13,fontWeight:900,color:"#d9e8ff",marginRight:4}}>Quotes&Fixtures</div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search cargoes…" style={{...inputStyle,width:220}}/>
      <select value={intel} onChange={e=>setIntel(e.target.value)} style={{...inputStyle,width:112,colorScheme:"dark"}}>
        <option value="ALL">All intel</option><option value="QUOTE">Quote</option><option value="FIXTURE">Fixture</option>
      </select>
      <select value={region} onChange={e=>setRegion(e.target.value)} style={{...inputStyle,width:145,colorScheme:"dark"}}>
        <option value="ALL">All regions</option>{CARGO2_REGIONS.map(x=><option key={x}>{x}</option>)}
      </select>
      <span style={{fontSize:10,color:C.faint}}>{rows.length} cargoes</span>
      <span style={{fontSize:10,color:status==="Save failed"?"#ff8b8b":"#6ee7b7",marginLeft:"auto"}}>{status}</span>
      {onAddC&&<button onClick={()=>onAddC()} style={{border:"1px solid rgba(88,166,255,.45)",background:"rgba(88,166,255,.12)",color:"#9ec5ff",borderRadius:5,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Cargo</button>}
    </div>

    <div style={{flex:1,minHeight:0,overflow:"auto",border:"1px solid "+C.bd2,borderRadius:7,background:C.bg2}}>
      <table style={{borderCollapse:"separate",borderSpacing:0,width:"100%",minWidth:1770,tableLayout:"fixed",fontSize:11}}>
        <colgroup>
          {[80,120,125,80,110,115,115,82,82,105,118,118,58,105,150,190,28].map((w,i)=><col key={i} style={{width:w}}/>)}
        </colgroup>
        <thead><tr>
          {["Status","Charterer","Cargo","Qty","Load","Disch","Vessel","From","To","Freight","Ex Region","To Region","P&C","Intelligence","Source","Comment",""].map(h=><th key={h} style={th}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map((r,i)=><tr key={r.id||i} style={{background:i%2?"rgba(18,34,57,.96)":"rgba(11,25,45,.96)"}}>
          <td style={td}>{textCell(r,"status")}</td>
          <td style={td}>{textCell(r,"charterer")}</td>
          <td style={td}>{textCell(r,"cargo")}</td>
          <td style={td}>{textCell(r,"qty")}</td>
          <td style={td}>{textCell(r,"load")}</td>
          <td style={td}>{textCell(r,"disch")}</td>
          <td style={td}>{textCell(r,"vessel")}</td>
          <td style={td}>{textCell(r,"from")}</td>
          <td style={td}>{textCell(r,"to")}</td>
          <td style={td}>{textCell(r,"freight")}</td>
          <td style={td}><SelectCell value={r.ex_region} options={CARGO2_REGIONS} onChange={v=>update(r,"ex_region",v)}/></td>
          <td style={td}><SelectCell value={r.to_region} options={CARGO2_REGIONS} onChange={v=>update(r,"to_region",v)}/></td>
          <td style={td}><SelectCell value={r.pc} options={PC_OPTIONS} onChange={v=>update(r,"pc",v?Number(v):null)}/></td>
          <td style={td}><SelectCell value={String(r.intelligence||"").toUpperCase()} options={INTEL_OPTIONS} onChange={v=>update(r,"intelligence",v?({QUOTE:"Quote",FIXTURE:"Fixture"}[v]):"")}/></td>
          <td style={td}>{textCell(r,"source","Source")}</td>
          <td style={td}>{textCell(r,"comment")}</td>
          <td style={{...td,textAlign:"center"}}>{saving.has(r.id+":ex_region")||saving.has(r.id+":to_region")||saving.has(r.id+":pc")||saving.has(r.id+":intelligence")||saving.has(r.id+":source")?<span style={{color:C.faint}}>·</span>:onDelC?<button title="Delete" onClick={()=>window.confirm("Delete this cargo?")&&onDelC(r.id)} style={{border:0,background:"transparent",color:"rgba(255,107,107,.45)",cursor:"pointer"}}>×</button>:null}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
