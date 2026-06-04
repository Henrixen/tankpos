import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";
import { v4 as uuidv4 } from 'uuid';

const BROKERS = ["", "Haakon", "Løken", "Both"];
const ROW_EVEN = "rgba(7,15,28,0.96)";
const ROW_ODD  = "rgba(22,37,64,0.82)";
const TH = {
  fontSize:10, fontWeight:700, color:"rgba(120,160,220,0.45)", textTransform:"uppercase",
  letterSpacing:"0.08em", padding:"7px 10px", borderBottom:"1px solid rgba(58,130,246,0.14)",
  whiteSpace:"nowrap", userSelect:"none", background:"rgba(8,18,38,0.85)", position:"sticky", top:0, zIndex:2,
};
const TD = { padding:0, borderBottom:"1px solid rgba(22,37,64,0.7)", verticalAlign:"middle" };
const INP = {
  width:"100%", background:"transparent", border:"none", outline:"none",
  color:"rgba(200,220,255,0.82)", fontFamily:"Inter,sans-serif",
  fontSize:12, padding:"6px 10px", boxSizing:"border-box",
};
const BTN = {
  fontSize:11, padding:"3px 10px", borderRadius:4, cursor:"pointer",
  fontFamily:"inherit", border:"1px solid rgba(58,130,246,0.25)",
  background:"rgba(58,130,246,0.1)", color:"#79c0ff",
};

// Parse "15/2" or "15/2/26" → "15 Feb 2026"
function parseDate(raw) {
  if(!raw) return null;
  const s = String(raw).trim();
  // Already looks like "15 Feb 2026"
  if(/\d{1,2}\s[A-Za-z]{3}\s\d{4}/.test(s)) return s;
  // dd/mm or dd/mm/yy or dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?$/);
  if(!m) return s;
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const day=parseInt(m[1]), mon=parseInt(m[2])-1;
  let yr=m[3]?parseInt(m[3]):new Date().getFullYear();
  if(yr<100) yr+=2000;
  if(mon<0||mon>11) return s;
  return `${day} ${months[mon]} ${yr}`;
}

function StarRating({value,onChange}){
  return(
    <div style={{display:"flex",gap:2,padding:"6px 8px"}}>
      {[1,2,3,4,5].map(s=>(
        <span key={s} onClick={()=>onChange(value===s?0:s)}
          style={{cursor:"pointer",fontSize:13,color:s<=value?"#f59e0b":"rgba(120,160,200,0.2)",lineHeight:1}}>★</span>
      ))}
    </div>
  );
}

function CommentCell({value, onChange}){
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(value||"");
  const [images,setImages]=useState(()=>{
    try{ return JSON.parse(localStorage.getItem("client_img_"+value?.slice(0,20))||"[]"); }catch{return [];}
  });
  const [lightbox,setLightbox]=useState(null);
  const ref=useRef(null);
  useEffect(()=>setVal(value||""),[value]);

  function save(){ setEditing(false); if(val!==(value||"")) onChange(val); }

  function handlePaste(e){
    const items=Array.from(e.clipboardData?.items||[]);
    const img=items.find(i=>i.type.startsWith("image/"));
    if(!img) return;
    e.preventDefault();
    const reader=new FileReader();
    reader.onload=ev=>{
      const newImgs=[...images, ev.target.result];
      setImages(newImgs);
      // store images keyed by cargo id would be better but for now use first 20 chars of comment
    };
    reader.readAsDataURL(img.getAsFile());
  }

  return(
    <td style={TD}>
      {editing?(
        <div style={{position:"relative"}}>
          <textarea ref={ref} value={val} onChange={e=>setVal(e.target.value)}
            onBlur={save} onPaste={handlePaste} autoFocus rows={3}
            style={{...INP,resize:"vertical",minHeight:56}}/>
          {images.length>0&&(
            <div style={{display:"flex",gap:4,padding:"2px 10px 6px",flexWrap:"wrap"}}>
              {images.map((src,i)=>(
                <img key={i} src={src} onClick={()=>setLightbox(src)}
                  style={{width:40,height:40,objectFit:"cover",borderRadius:4,cursor:"zoom-in",border:"1px solid rgba(88,166,255,0.2)"}}/>
              ))}
            </div>
          )}
        </div>
      ):(
        <div style={{...INP,cursor:"text",minHeight:32,color:val?"rgba(200,220,255,0.82)":"rgba(100,140,180,0.3)",whiteSpace:"pre-wrap"}}
          onClick={()=>setEditing(true)}>
          {val||"Add note…"}
          {images.length>0&&(
            <div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap"}}>
              {images.map((src,i)=>(
                <img key={i} src={src} onClick={e=>{e.stopPropagation();setLightbox(src);}}
                  style={{width:36,height:36,objectFit:"cover",borderRadius:4,cursor:"zoom-in",border:"1px solid rgba(88,166,255,0.2)"}}/>
              ))}
            </div>
          )}
        </div>
      )}
      {lightbox&&(
        <>
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center"}}
            onClick={()=>setLightbox(null)}>
            <img src={lightbox} style={{maxWidth:"90vw",maxHeight:"90vh",borderRadius:8,boxShadow:"0 8px 40px rgba(0,0,0,0.8)"}}/>
          </div>
        </>
      )}
    </td>
  );
}

function InlineCell({value,onChange,placeholder="",type="text",select=null}){
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(value||"");
  const ref=useRef(null);
  useEffect(()=>setVal(value||""),[value]);
  function save(){ setEditing(false); const v=type==="date"?parseDate(val):val; if(v!==(value||"")) onChange(v||""); }

  if(select){
    return(
      <td style={TD}>
        <select value={val} onChange={e=>{setVal(e.target.value);onChange(e.target.value);}}
          style={{...INP,colorScheme:"dark",cursor:"pointer",color:"rgba(160,200,255,0.8)"}}>
          {select.map(o=><option key={o} value={o} style={{background:"#0a1628",color:"rgba(200,220,255,0.9)"}}>{o||"—"}</option>)}
        </select>
      </td>
    );
  }
  return(
    <td style={TD} onClick={()=>{setEditing(true);setTimeout(()=>ref.current?.focus(),10);}}>
      {editing?(
        <input ref={ref} value={val} onChange={e=>setVal(e.target.value)}
          placeholder={placeholder}
          onBlur={save}
          onKeyDown={e=>{if(e.key==="Enter")save();if(e.key==="Escape"){setVal(value||"");setEditing(false);}}}
          autoFocus style={INP}/>
      ):(
        <div style={{...INP,color:val?"rgba(200,220,255,0.82)":"rgba(100,140,180,0.3)",cursor:"text",minHeight:32}}>
          {val||placeholder}
        </div>
      )}
    </td>
  );
}

function ClientTable({type,clients,onUpdate,onAdd,onDelete,search,brokerFilter}){
  const label=type==="charterer"?"Charterers":"Owners";
  const rows=clients
    .filter(c=>c.type===type)
    .filter(c=>!brokerFilter||c.lead_broker===brokerFilter||c.lead_broker==="Both")
    .filter(c=>!search||[c.company,c.pic,c.lead_broker,c.comment].some(f=>(f||"").toLowerCase().includes(search.toLowerCase())))
    .sort((a,b)=>(a.company||"").localeCompare(b.company||""));

  return(
    <div style={{background:"rgba(12,23,43,0.9)",border:"1px solid rgba(58,130,246,0.14)",borderRadius:8,overflow:"hidden",marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 14px",background:"rgba(8,18,38,0.9)",borderBottom:"1px solid rgba(58,130,246,0.14)"}}>
        <div style={{fontSize:13,fontWeight:700,color:"#79c0ff",letterSpacing:"0.04em"}}>{label}</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:11,color:"rgba(120,160,220,0.4)"}}>{rows.length} {label.toLowerCase()}</span>
          <button onClick={()=>onAdd(type)} style={BTN}>+ Add {type==="charterer"?"Charterer":"Owner"}</button>
        </div>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:750}}>
          <thead>
            <tr>
              {[["Company",160],["PIC",150],["Lead Broker",110],["Rating",90],["Last Contact",110],["Comment / Notes",null],["",36]].map(([h,w])=>(
                <th key={h} style={{...TH,width:w||undefined}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c,i)=>(
              <tr key={c.id} style={{background:i%2===0?ROW_EVEN:ROW_ODD}}>
                <InlineCell value={c.company} placeholder="Company name" onChange={v=>onUpdate(c.id,"company",v)}/>
                <InlineCell value={c.pic} placeholder="Contact name(s)" onChange={v=>onUpdate(c.id,"pic",v)}/>
                <InlineCell value={c.lead_broker} select={BROKERS} onChange={v=>onUpdate(c.id,"lead_broker",v)}/>
                <td style={TD}><StarRating value={c.rating||0} onChange={v=>onUpdate(c.id,"rating",v)}/></td>
                <InlineCell value={c.last_contact||""} placeholder="dd/mm/yy" type="date" onChange={v=>onUpdate(c.id,"last_contact",v||null)}/>
                <CommentCell value={c.comment} onChange={v=>onUpdate(c.id,"comment",v)}/>
                <td style={{...TD,textAlign:"center",padding:"0 6px"}}>
                  <button onClick={()=>onDelete(c.id)}
                    style={{background:"none",border:"none",color:"rgba(255,107,107,0.3)",fontSize:13,cursor:"pointer",padding:"4px",lineHeight:1}}>✕</button>
                </td>
              </tr>
            ))}
            {rows.length===0&&(
              <tr><td colSpan={7} style={{padding:"24px",textAlign:"center",color:"rgba(120,160,200,0.3)",fontSize:12}}>
                No {label.toLowerCase()} {brokerFilter?`with ${brokerFilter} as lead`:""} — click "+ Add" to get started
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ClientsTab(){
  const [clients,setClients]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [brokerFilter,setBrokerFilter]=useState("");
  const [pendingDel,setPendingDel]=useState(null);
  const saveTimer=useRef({});

  useEffect(()=>{
    supabase.from("client_directory").select("*").order("company")
      .then(({data,error})=>{
        if(!error) setClients(data||[]);
        setLoading(false);
      });
  },[]);

  const onUpdate=useCallback((id,field,value)=>{
    setClients(prev=>prev.map(c=>c.id===id?{...c,[field]:value}:c));
    clearTimeout(saveTimer.current[id]);
    saveTimer.current[id]=setTimeout(async()=>{
      await supabase.from("client_directory").update({[field]:value,updated_at:new Date().toISOString()}).eq("id",id);
    },600);
  },[]);

  const onAdd=useCallback(async(type)=>{
    const row={id:uuidv4(),type,company:"",pic:"",lead_broker:"",comment:"",rating:0,last_contact:null};
    const{error}=await supabase.from("client_directory").insert(row);
    if(!error) setClients(prev=>[...prev,row]);
  },[]);

  async function confirmDelete(){
    await supabase.from("client_directory").delete().eq("id",pendingDel);
    setClients(prev=>prev.filter(c=>c.id!==pendingDel));
    setPendingDel(null);
  }

  const charterers=clients.filter(c=>c.type==="charterer");
  const owners=clients.filter(c=>c.type==="owner");
  const haakon=clients.filter(c=>c.lead_broker==="Haakon"||c.lead_broker==="Both");
  const loken=clients.filter(c=>c.lead_broker==="Løken"||c.lead_broker==="Both");

  const brokerBtnSt=(v)=>({
    fontSize:11,fontWeight:600,padding:"4px 12px",borderRadius:5,cursor:"pointer",fontFamily:"inherit",
    border:"1px solid "+(brokerFilter===v?"rgba(88,166,255,0.6)":"rgba(58,130,246,0.2)"),
    background:brokerFilter===v?"rgba(88,166,255,0.2)":"rgba(58,130,246,0.06)",
    color:brokerFilter===v?"#d9ecff":"rgba(120,160,220,0.55)",
  });

  return(
    <div style={{padding:"16px 20px",maxWidth:1600,margin:"0 auto",fontFamily:"Inter,sans-serif"}}>
      {/* Delete confirm */}
      {pendingDel&&(
        <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:C.bg2,border:"1px solid rgba(255,107,107,0.4)",borderRadius:8,padding:"12px 20px",zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",fontSize:12}}>
          <span style={{color:"rgba(200,220,255,0.8)"}}>Delete this client?</span>
          <button onClick={confirmDelete} style={{...BTN,borderColor:"rgba(255,107,107,0.4)",color:"#f87171"}}>Delete</button>
          <button onClick={()=>setPendingDel(null)} style={BTN}>Cancel</button>
        </div>
      )}

      {/* Top bar */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        {/* Search */}
        <div style={{flex:1,minWidth:180,position:"relative"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search clients…"
            style={{width:"100%",background:"rgba(12,23,43,0.9)",border:"1px solid rgba(58,130,246,0.2)",borderRadius:6,color:"rgba(200,220,255,0.8)",fontSize:12,padding:"6px 12px 6px 30px",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
          <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"rgba(88,130,200,0.4)"}}>🔍</span>
          {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"rgba(120,160,220,0.4)",cursor:"pointer",fontSize:11}}>✕</button>}
        </div>

        {/* Broker filter buttons */}
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          <span style={{fontSize:10,color:"rgba(120,160,200,0.4)",textTransform:"uppercase",letterSpacing:"0.07em",marginRight:4}}>Lead</span>
          {["","Haakon","Løken","Both"].map(v=>(
            <button key={v||"all"} onClick={()=>setBrokerFilter(prev=>prev===v?"":v)} style={brokerBtnSt(v)}>
              {v||"All"}
            </button>
          ))}
        </div>

        {/* Stats */}
        {[
          {label:"Charterers",val:charterers.length,col:"#79c0ff"},
          {label:"Owners",val:owners.length,col:"#a8e6a3"},
          {label:"Haakon",val:haakon.length,col:"#f59e0b"},
          {label:"Løken",val:loken.length,col:"#c792ea"},
        ].map(s=>(
          <div key={s.label} style={{background:"rgba(12,23,43,0.9)",border:"1px solid rgba(58,130,246,0.14)",borderRadius:6,padding:"5px 14px",textAlign:"center",cursor:"pointer"}}
            onClick={()=>setBrokerFilter(s.label==="Charterers"||s.label==="Owners"?"":prev=>prev===s.label?"":s.label)}>
            <div style={{fontSize:18,fontWeight:700,color:s.col,lineHeight:1}}>{s.val}</div>
            <div style={{fontSize:9,color:"rgba(120,160,200,0.45)",textTransform:"uppercase",letterSpacing:"0.08em",marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>

      {loading
        ?<div style={{padding:40,textAlign:"center",color:"rgba(120,160,200,0.4)",fontSize:13}}>Loading…</div>
        :<>
          <ClientTable type="charterer" clients={clients} onUpdate={onUpdate} onAdd={onAdd} onDelete={setPendingDel} search={search} brokerFilter={brokerFilter}/>
          <ClientTable type="owner"     clients={clients} onUpdate={onUpdate} onAdd={onAdd} onDelete={setPendingDel} search={search} brokerFilter={brokerFilter}/>
        </>
      }
    </div>
  );
}
