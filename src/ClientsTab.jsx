import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";
import { v4 as uuidv4 } from 'uuid';

// SQL update needed in Supabase:
// ALTER TABLE client_directory ADD COLUMN IF NOT EXISTS client_type text[] DEFAULT '{}';
// ALTER TABLE client_directory ADD COLUMN IF NOT EXISTS email text DEFAULT '';
// UPDATE client_directory SET lead_broker = 'Henriksen' WHERE lead_broker = 'Haakon';
// UPDATE client_directory SET lead_broker = 'Henriksen & Løken' WHERE lead_broker = 'Both';

const BROKERS = ["", "Henriksen", "Løken", "Henriksen & Løken", "Løken & Henriksen"];
const CLIENT_TYPES = ["Charterer", "Owner"];
const ROW_EVEN = "rgba(7,15,28,0.96)";
const ROW_ODD  = "rgba(22,37,64,0.82)";
const TH_BASE = {
  fontSize:10, fontWeight:700, color:"rgba(120,160,220,0.45)", textTransform:"uppercase",
  letterSpacing:"0.08em", padding:"7px 10px", borderBottom:"1px solid rgba(58,130,246,0.14)",
  whiteSpace:"nowrap", userSelect:"none", background:"rgba(8,18,38,0.9)",
  position:"sticky", top:0, zIndex:2, textAlign:"left",
};
const TD = { padding:0, borderBottom:"1px solid rgba(22,37,64,0.7)", verticalAlign:"middle" };
const INP = {
  width:"100%", background:"transparent", border:"none", outline:"none",
  color:"rgba(220,235,255,0.92)", fontFamily:"Inter,sans-serif",
  fontSize:12, padding:"6px 10px", boxSizing:"border-box",
};
const BTN = {
  fontSize:11, padding:"3px 9px", borderRadius:4, cursor:"pointer",
  fontFamily:"inherit", border:"1px solid rgba(58,130,246,0.25)",
  background:"rgba(58,130,246,0.1)", color:"#79c0ff",
};

function parseDate(raw) {
  if(!raw) return "";
  const s = String(raw).trim();
  if(/\d{1,2}\s[A-Za-z]{3}\s\d{4}/.test(s)) return s;
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
    <div style={{display:"flex",gap:2,padding:"0 8px",alignItems:"center"}}>
      {[1,2,3,4,5].map(s=>(
        <span key={s} onClick={()=>onChange(value===s?0:s)}
          style={{cursor:"pointer",fontSize:13,color:s<=value?"#f59e0b":"rgba(120,160,200,0.18)",lineHeight:1}}>★</span>
      ))}
    </div>
  );
}

// BrokerCell — pill style matching TypeCell
const BROKER_COLS={"Henriksen":"#f59e0b","Løken":"#c792ea","Henriksen & Løken":"#58a6ff","Løken & Henriksen":"#34d399"};
function BrokerCell({value, onChange}){
  const [editing,setEditing]=useState(false);
  const selected=value||"";
  const col=BROKER_COLS[selected]||null;
  return(
    <td style={{...TD,padding:"0 6px"}} onClick={e=>e.stopPropagation()}>
      <div style={{position:"relative"}}>
        <div onClick={()=>setEditing(v=>!v)}
          style={{display:"flex",alignItems:"center",padding:"4px 4px",cursor:"pointer",minHeight:32}}>
          {selected
            ?<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:10,whiteSpace:"nowrap",
                background:(col||"#888")+"22",border:"1px solid "+(col||"#888")+"55",color:col||"rgba(160,200,255,0.8)"}}>
                {selected}
              </span>
            :<span style={{fontSize:10,color:"rgba(100,140,180,0.3)"}}>—</span>
          }
        </div>
        {editing&&(
          <>
            <div style={{position:"fixed",inset:0,zIndex:9990}} onClick={e=>{e.stopPropagation();setEditing(false);}}/>
            <div style={{position:"absolute",left:0,top:"100%",zIndex:9999,background:"#0a1628",
              border:"1px solid rgba(88,166,255,0.3)",borderRadius:6,padding:"6px",
              boxShadow:"0 6px 20px rgba(0,0,0,0.7)",display:"flex",flexDirection:"column",gap:3,minWidth:170}}>
              {BROKERS.filter(b=>b).map(b=>{
                const bc=BROKER_COLS[b]||"#888";
                const active=selected===b;
                return(
                  <button key={b} onClick={e=>{e.stopPropagation();onChange(b);setEditing(false);}}
                    style={{display:"flex",alignItems:"center",gap:7,fontSize:11,padding:"5px 10px",
                      background:active?bc+"22":"transparent",
                      border:"1px solid "+(active?bc+"55":"rgba(88,166,255,0.1)"),
                      color:active?bc:"rgba(160,200,255,0.6)",
                      borderRadius:5,cursor:"pointer",fontFamily:"inherit",textAlign:"left",whiteSpace:"nowrap"}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:active?bc:"transparent",
                      border:"2px solid "+(active?bc:"rgba(88,166,255,0.3)"),display:"inline-block",flexShrink:0}}/>
                    {b}
                  </button>
                );
              })}
              {selected&&<button onClick={e=>{e.stopPropagation();onChange("");setEditing(false);}}
                style={{fontSize:10,padding:"3px 10px",borderRadius:4,border:"1px solid rgba(255,107,107,0.3)",
                  background:"transparent",color:"rgba(255,107,107,0.5)",cursor:"pointer",fontFamily:"inherit"}}>✕ Clear</button>}
            </div>
          </>
        )}
      </div>
    </td>
  );
}

// Type pill buttons — show only active, themed
function TypeCell({value, onChange}){
  const types = Array.isArray(value) ? value : (value ? [value] : []);
  const [editing,setEditing]=useState(false);
  function toggle(t){
    const next = types.includes(t) ? types.filter(x=>x!==t) : [...types,t];
    onChange(next);
  }
  const TYPE_COLS={"Charterer":"#58a6ff","Owner":"#a8e6a3"};
  return(
    <td style={{...TD,padding:"0 6px"}} onClick={e=>{e.stopPropagation();setEditing(v=>!v);}}>
      <div style={{position:"relative"}}>
        <div style={{display:"flex",gap:3,padding:"4px 4px",flexWrap:"wrap",cursor:"pointer",minHeight:32,alignItems:"center"}}>
          {types.length===0
            ?<span style={{fontSize:10,color:"rgba(100,140,180,0.3)"}}>—</span>
            :types.map(t=>(
              <span key={t} style={{fontSize:10,fontWeight:600,padding:"1px 7px",borderRadius:10,
                background:(TYPE_COLS[t]||"#888")+"22",
                border:"1px solid "+(TYPE_COLS[t]||"#888")+"55",
                color:TYPE_COLS[t]||"rgba(160,200,255,0.8)"}}>
                {t}
              </span>
            ))
          }
        </div>
        {editing&&(
          <>
            <div style={{position:"fixed",inset:0,zIndex:9990}} onClick={e=>{e.stopPropagation();setEditing(false);}}/>
            <div style={{position:"absolute",left:0,top:"100%",zIndex:9999,background:"#0a1628",
              border:"1px solid rgba(88,166,255,0.3)",borderRadius:6,padding:"6px",
              boxShadow:"0 6px 20px rgba(0,0,0,0.7)",display:"flex",flexDirection:"column",gap:3,minWidth:120}}>
              {CLIENT_TYPES.map(t=>{
                const active=types.includes(t);
                const col=TYPE_COLS[t]||"#888";
                return(
                  <button key={t} onClick={e=>{e.stopPropagation();toggle(t);}}
                    style={{display:"flex",alignItems:"center",gap:7,fontSize:11,padding:"5px 10px",
                      background:active?col+"22":"transparent",
                      border:"1px solid "+(active?col+"55":"rgba(88,166,255,0.1)"),
                      color:active?col:"rgba(160,200,255,0.6)",
                      borderRadius:5,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                    <span style={{width:12,height:12,borderRadius:3,border:"2px solid "+(active?col:"rgba(88,166,255,0.3)"),
                      background:active?col:"transparent",display:"inline-block",flexShrink:0}}/>
                    {t}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </td>
  );
}

function InlineCell({value,onChange,placeholder="",isDate=false,isCompany=false}){
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(value||"");
  const ref=useRef(null);
  useEffect(()=>setVal(value||""),[value]);
  function save(){
    setEditing(false);
    const v=isDate?parseDate(val):val;
    if(v!==(value||"")) onChange(v);
  }
  const displayStyle=isCompany
    ?{...INP,color:val?"rgba(230,240,255,1)":"rgba(100,140,180,0.3)",fontWeight:700,cursor:"text",minHeight:32,lineHeight:"20px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}
    :{...INP,color:val?"rgba(220,235,255,0.92)":"rgba(100,140,180,0.3)",cursor:"text",minHeight:32,lineHeight:"20px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"};
  return(
    <td style={TD} onClick={()=>{setEditing(true);setTimeout(()=>ref.current?.focus(),10);}}>
      {editing
        ?<input ref={ref} value={val} onChange={e=>setVal(e.target.value)} placeholder={placeholder}
            onBlur={save} onKeyDown={e=>{if(e.key==="Enter")save();if(e.key==="Escape"){setVal(value||"");setEditing(false);}}}
            autoFocus style={{...INP,fontWeight:isCompany?700:400}}/>
        :<div style={displayStyle}>{val||placeholder}</div>
      }
    </td>
  );
}

// Comment cell — collapsed 1 line, click ▼ to expand full row editor
function CommentImageCell({rowId, comment, images, onUpdateComment, onUpdateImages, expanded, onToggle}){
  const [commentVal,setCommentVal]=useState(comment||"");
  const [lightbox,setLightbox]=useState(null);
  const [delConfirm,setDelConfirm]=useState(null);
  const inputRef=useRef(null);
  useEffect(()=>setCommentVal(comment||""),[comment]);

  function saveComment(){ if(commentVal!==(comment||"")) onUpdateComment(commentVal); }

  function handlePaste(e){
    const img=Array.from(e.clipboardData?.items||[]).find(i=>i.type.startsWith("image/"));
    if(!img) return;
    e.preventDefault();
    const reader=new FileReader();
    reader.onload=ev=>onUpdateImages([...images, ev.target.result]);
    reader.readAsDataURL(img.getAsFile());
  }

  const hasContent=comment||images.length>0;

  return(
    <>
      {/* Always-visible collapsed cell */}
      <td style={{...TD,padding:0}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",minHeight:32,height:"100%"}}>
          <div style={{flex:1,padding:"6px 10px",fontSize:11,
            color:hasContent?"rgba(180,210,255,0.75)":"rgba(100,140,180,0.3)",
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:"default"}}>
            {comment||"—"}
          </div>
          {images.length>0&&(
            <div style={{display:"flex",gap:2,padding:"0 4px",flexShrink:0}}>
              {images.slice(0,2).map((src,i)=>(
                <img key={i} src={src} style={{width:20,height:20,objectFit:"cover",borderRadius:3,border:"1px solid rgba(88,166,255,0.2)"}}/>
              ))}
              {images.length>2&&<span style={{fontSize:9,color:"rgba(120,160,200,0.5)"}}>+{images.length-2}</span>}
            </div>
          )}
          <button onClick={e=>{e.stopPropagation();onToggle();}}
            style={{background:"none",border:"none",color:"rgba(88,166,255,0.35)",cursor:"pointer",
              padding:"0 8px",fontSize:10,lineHeight:"32px",flexShrink:0,alignSelf:"stretch"}}>
            {expanded?"▲":"▼"}
          </button>
        </div>
      </td>
    </>
  );
}

// Expanded detail row for comment+images — rendered as a separate <tr> in the table
function CommentExpandedRow({colSpan, comment, images, onUpdateComment, onUpdateImages}){
  const [commentVal,setCommentVal]=useState(comment||"");
  const [lightbox,setLightbox]=useState(null);
  const [delConfirm,setDelConfirm]=useState(null);
  const inputRef=useRef(null);
  useEffect(()=>setCommentVal(comment||""),[comment]);

  function saveComment(){ if(commentVal!==(comment||"")) onUpdateComment(commentVal); }

  function handlePaste(e){
    const img=Array.from(e.clipboardData?.items||[]).find(i=>i.type.startsWith("image/"));
    if(!img) return;
    e.preventDefault();
    const reader=new FileReader();
    reader.onload=ev=>onUpdateImages([...images, ev.target.result]);
    reader.readAsDataURL(img.getAsFile());
  }

  return(
    <>
      <tr style={{background:"rgba(10,20,45,0.95)"}}>
        <td colSpan={colSpan} style={{padding:"10px 16px",borderBottom:"1px solid rgba(58,130,246,0.12)"}}>
          <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
            <div style={{flex:1,minWidth:0}}>
              <textarea ref={inputRef} value={commentVal}
                onChange={e=>setCommentVal(e.target.value)}
                onBlur={saveComment} onPaste={handlePaste}
                placeholder="Add comment… (Ctrl+V to paste image)"
                style={{width:"100%",background:"rgba(8,16,32,0.7)",border:"1px solid rgba(88,166,255,0.2)",
                  borderRadius:5,color:"rgba(200,220,255,0.9)",fontFamily:"Inter,sans-serif",fontSize:12,
                  padding:"8px 10px",resize:"none",outline:"none",height:60,boxSizing:"border-box",
                  lineHeight:1.5}}/>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",flexShrink:0,alignItems:"center"}}>
              {images.map((src,i)=>(
                <div key={i} style={{position:"relative"}}>
                  <img src={src} onClick={()=>setLightbox(src)}
                    style={{width:52,height:52,objectFit:"cover",borderRadius:5,cursor:"zoom-in",
                      border:"1px solid rgba(88,166,255,0.2)"}}/>
                  <button onClick={e=>{e.stopPropagation();setDelConfirm(i);}}
                    style={{position:"absolute",top:-5,right:-5,width:15,height:15,borderRadius:"50%",
                      background:"rgba(255,107,107,0.7)",border:"none",color:"white",fontSize:8,
                      cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>✕</button>
                </div>
              ))}
              <label style={{width:44,height:44,border:"1px dashed rgba(88,166,255,0.2)",borderRadius:5,
                display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",
                color:"rgba(88,166,255,0.3)",fontSize:18,flexShrink:0}}>
                +<input type="file" accept="image/*" style={{display:"none"}}
                  onChange={e=>{if(e.target.files?.[0]){const r=new FileReader();r.onload=ev=>onUpdateImages([...images,ev.target.result]);r.readAsDataURL(e.target.files[0]);e.target.value="";}}}/>
              </label>
            </div>
          </div>
          {delConfirm!==null&&(
            <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8,fontSize:12}}>
              <span style={{color:"rgba(255,180,180,0.8)"}}>Delete this image?</span>
              <button onClick={()=>{onUpdateImages(images.filter((_,idx)=>idx!==delConfirm));setDelConfirm(null);}}
                style={{fontSize:11,padding:"2px 10px",borderRadius:4,border:"1px solid rgba(255,107,107,0.4)",
                  background:"rgba(255,107,107,0.1)",color:"#f87171",cursor:"pointer",fontFamily:"inherit"}}>Delete</button>
              <button onClick={()=>setDelConfirm(null)}
                style={{fontSize:11,padding:"2px 10px",borderRadius:4,border:"1px solid rgba(58,130,246,0.2)",
                  background:"rgba(58,130,246,0.08)",color:"#79c0ff",cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
            </div>
          )}
        </td>
      </tr>
      {lightbox&&(
        <tr><td colSpan={colSpan} style={{padding:0,border:"none"}}>
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center"}}
            onClick={()=>setLightbox(null)}>
            <img src={lightbox} style={{maxWidth:"90vw",maxHeight:"90vh",borderRadius:8,boxShadow:"0 8px 40px rgba(0,0,0,0.8)"}}/>
          </div>
        </td></tr>
      )}
    </>
  );
}

const SORT_OPTS=[["company","Company"],["lead_broker","Lead"],["rating","Rating"],["last_contact","Last Contact"],["client_type","Type"]];

export default function ClientsTab(){
  const [clients,setClients]=useState([]);
  const [images,setImages]=useState({}); // {id: [base64...]}
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [typeFilter,setTypeFilter]=useState(""); // "" | "Charterer" | "Owner"
  const [brokerFilter,setBrokerFilter]=useState("");
  const [sortK,setSortK]=useState("company");
  const [sortD,setSortD]=useState(1);
  const [pendingDel,setPendingDel]=useState(null);
  const [expandedRow,setExpandedRow]=useState(null);
  const saveTimer=useRef({});

  useEffect(()=>{
    supabase.from("client_directory").select("*").order("company")
      .then(({data,error})=>{
        if(!error){
          setClients(data||[]);
          // Load images from localStorage
          const imgs={};
          (data||[]).forEach(c=>{
            const stored=localStorage.getItem("client_imgs_"+c.id);
            if(stored) try{imgs[c.id]=JSON.parse(stored);}catch{}
          });
          setImages(imgs);
        }
        setLoading(false);
      });
  },[]);

  function saveImages(id,imgs){
    setImages(prev=>({...prev,[id]:imgs}));
    try{localStorage.setItem("client_imgs_"+id,JSON.stringify(imgs));}catch{}
  }

  const onUpdate=useCallback((id,field,value)=>{
    setClients(prev=>prev.map(c=>c.id===id?{...c,[field]:value}:c));
    clearTimeout(saveTimer.current[id+"_"+field]);
    saveTimer.current[id+"_"+field]=setTimeout(async()=>{
      await supabase.from("client_directory").update({[field]:value,updated_at:new Date().toISOString()}).eq("id",id);
    },600);
  },[]);

  const onAdd=useCallback(async()=>{
    const row={id:uuidv4(),type:"charterer",client_type:["Charterer"],company:"",pic:"",lead_broker:"",email:"",comment:"",rating:0,last_contact:null};
    const{error}=await supabase.from("client_directory").insert(row);
    if(!error) setClients(prev=>[...prev,row]);
  },[]);

  async function confirmDelete(){
    await supabase.from("client_directory").delete().eq("id",pendingDel);
    setClients(prev=>prev.filter(c=>c.id!==pendingDel));
    setPendingDel(null);
  }

  // Filter + sort
  const visible=clients
    .filter(c=>{
      if(typeFilter){
        const types=Array.isArray(c.client_type)?c.client_type:(c.client_type?[c.client_type]:[]);
        if(!types.includes(typeFilter)) return false;
      }
      if(brokerFilter&&c.lead_broker!==brokerFilter) return false;
      if(search){
        const q=search.toLowerCase();
        return [c.company,c.pic,c.lead_broker,c.comment,c.email].some(f=>(f||"").toLowerCase().includes(q));
      }
      return true;
    })
    .sort((a,b)=>{
      let av=a[sortK]||"",bv=b[sortK]||"";
      if(sortK==="rating"){av=a.rating||0;bv=b.rating||0;return sortD*(av-bv);}
      if(sortK==="client_type"){av=(Array.isArray(a.client_type)?a.client_type:[]).join(",");bv=(Array.isArray(b.client_type)?b.client_type:[]).join(",");}
      return sortD*String(av).localeCompare(String(bv));
    });

  const henriksen=clients.filter(c=>c.lead_broker==="Henriksen"||c.lead_broker==="Henriksen & Løken");
  const loken=clients.filter(c=>c.lead_broker==="Løken"||c.lead_broker==="Henriksen & Løken");
  const charterers=clients.filter(c=>{const t=Array.isArray(c.client_type)?c.client_type:(c.client_type?[c.client_type]:[]);return t.includes("Charterer");});
  const owners=clients.filter(c=>{const t=Array.isArray(c.client_type)?c.client_type:(c.client_type?[c.client_type]:[]);return t.includes("Owner");});

  const fBtnSt=(active)=>({
    fontSize:11,fontWeight:600,padding:"4px 12px",borderRadius:5,cursor:"pointer",fontFamily:"inherit",
    border:"1px solid "+(active?"rgba(88,166,255,0.6)":"rgba(58,130,246,0.2)"),
    background:active?"rgba(88,166,255,0.2)":"rgba(58,130,246,0.06)",
    color:active?"#d9ecff":"rgba(120,160,220,0.55)",
  });

  return(
    <div style={{padding:"14px 20px",maxWidth:1700,margin:"0 auto",fontFamily:"Inter,sans-serif"}}>
      {pendingDel&&(
        <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:"#0a1628",border:"1px solid rgba(255,107,107,0.4)",borderRadius:8,padding:"12px 20px",zIndex:9999,display:"flex",alignItems:"center",gap:12,boxShadow:"0 4px 24px rgba(0,0,0,0.5)",fontSize:12}}>
          <span style={{color:"rgba(200,220,255,0.8)"}}>Delete this client?</span>
          <button onClick={confirmDelete} style={{...BTN,borderColor:"rgba(255,107,107,0.4)",color:"#f87171"}}>Delete</button>
          <button onClick={()=>setPendingDel(null)} style={BTN}>Cancel</button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        {/* Search */}
        <div style={{position:"relative",width:220}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search clients…"
            style={{width:"100%",background:"rgba(12,23,43,0.9)",border:"1px solid rgba(58,130,246,0.2)",borderRadius:6,
              color:"rgba(200,220,255,0.8)",fontSize:12,padding:"6px 10px 6px 28px",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
          <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",fontSize:11,color:"rgba(88,130,200,0.4)"}}>🔍</span>
          {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"rgba(120,160,220,0.4)",cursor:"pointer",fontSize:10}}>✕</button>}
        </div>

        {/* Sort */}
        <select value={sortK} onChange={e=>setSortK(e.target.value)}
          style={{fontSize:11,background:"rgba(12,23,43,0.9)",border:"1px solid rgba(58,130,246,0.2)",borderRadius:5,color:"rgba(160,200,255,0.8)",padding:"5px 8px",fontFamily:"inherit",colorScheme:"dark",cursor:"pointer"}}>
          {SORT_OPTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        <button onClick={()=>setSortD(d=>d*-1)} style={{...BTN,minWidth:28,padding:"3px 8px"}}>{sortD>0?"▲":"▼"}</button>

        <div style={{width:1,height:24,background:"rgba(58,130,246,0.15)"}}/>

        {/* Type filter */}
        <span style={{fontSize:10,color:"rgba(120,160,200,0.4)",textTransform:"uppercase",letterSpacing:"0.07em"}}>Type</span>
        {["","Charterer","Owner"].map(v=>(
          <button key={v||"all"} onClick={()=>setTypeFilter(prev=>prev===v?"":v)} style={fBtnSt(typeFilter===v)}>{v||"All"}</button>
        ))}

        <div style={{width:1,height:24,background:"rgba(58,130,246,0.15)"}}/>

        {/* Broker filter */}
        <span style={{fontSize:10,color:"rgba(120,160,200,0.4)",textTransform:"uppercase",letterSpacing:"0.07em"}}>Lead</span>
        {["","Henriksen","Løken","Henriksen & Løken"].map(v=>(
          <button key={v||"all"} onClick={()=>setBrokerFilter(prev=>prev===v?"":v)} style={fBtnSt(brokerFilter===v)}>{v||"All"}</button>
        ))}

        <div style={{flex:1}}/>

        {/* Stats */}
        {[
          {label:"Total",val:clients.length,col:"rgba(120,180,255,0.7)"},
          {label:"Charterers",val:charterers.length,col:"#79c0ff",f:"Charterer"},
          {label:"Owners",val:owners.length,col:"#a8e6a3",f:"Owner"},
          {label:"Henriksen",val:henriksen.length,col:"#f59e0b",bf:"Henriksen"},
          {label:"Løken",val:loken.length,col:"#c792ea",bf:"Løken"},
        ].map(s=>(
          <div key={s.label} onClick={()=>{if(s.f)setTypeFilter(p=>p===s.f?"":s.f);if(s.bf)setBrokerFilter(p=>p===s.bf?"":s.bf);}}
            style={{background:"rgba(12,23,43,0.9)",border:"1px solid rgba(58,130,246,0.14)",borderRadius:6,
              padding:"4px 12px",textAlign:"center",cursor:s.f||s.bf?"pointer":"default",flexShrink:0}}>
            <div style={{fontSize:17,fontWeight:700,color:s.col,lineHeight:1}}>{s.val}</div>
            <div style={{fontSize:9,color:"rgba(120,160,200,0.4)",textTransform:"uppercase",letterSpacing:"0.07em",marginTop:2}}>{s.label}</div>
          </div>
        ))}

        <button onClick={onAdd} style={{...BTN,fontWeight:700,fontSize:12,padding:"5px 14px"}}>+ Add Client</button>
      </div>

      {/* Table */}
      {loading
        ?<div style={{padding:40,textAlign:"center",color:"rgba(120,160,200,0.4)",fontSize:13}}>Loading…</div>
        :<div style={{background:"rgba(12,23,43,0.9)",border:"1px solid rgba(58,130,246,0.14)",borderRadius:8,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
              <thead>
                <tr>
                  {[["COMPANY",145],["TYPE",100],["PIC",145],["LEAD BROKER",155],["RATING",86],["LAST CONTACT",98],["EMAIL",155],["COMMENT",null],["",30]].map(([h,w])=>(
                    <th key={h} style={{...TH_BASE,width:w||undefined,minWidth:w||100}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((c,i)=>{
                  const imgs=images[c.id]||[];
                  return(
                    <React.Fragment key={c.id}>
                      <tr style={{background:i%2===0?ROW_EVEN:ROW_ODD}}>
                        <td style={{...TD,minWidth:130,maxWidth:145,overflow:"hidden"}}>
                          <InlineCell value={c.company} placeholder="Company name" onChange={v=>onUpdate(c.id,"company",v)} isCompany/>
                        </td>
                        <TypeCell value={c.client_type} onChange={v=>onUpdate(c.id,"client_type",v)}/>
                        <InlineCell value={c.pic} placeholder="Contact name(s)" onChange={v=>onUpdate(c.id,"pic",v)}/>
                        <BrokerCell value={c.lead_broker} onChange={v=>onUpdate(c.id,"lead_broker",v)}/>
                        <td style={TD}><StarRating value={c.rating||0} onChange={v=>onUpdate(c.id,"rating",v)}/></td>
                        <InlineCell value={c.last_contact||""} placeholder="dd/mm/yy" isDate onChange={v=>onUpdate(c.id,"last_contact",v||null)}/>
                        <InlineCell value={c.email||""} placeholder="email@…" onChange={v=>onUpdate(c.id,"email",v)}/>
                        <CommentImageCell
                          rowId={c.id}
                          comment={c.comment}
                          images={imgs}
                          expanded={expandedRow===c.id}
                          onToggle={()=>setExpandedRow(p=>p===c.id?null:c.id)}
                          onUpdateComment={v=>onUpdate(c.id,"comment",v)}
                          onUpdateImages={ri=>saveImages(c.id,ri)}/>
                        <td style={{...TD,textAlign:"center",padding:"0 4px"}}>
                          <button onClick={()=>setPendingDel(c.id)}
                            style={{background:"none",border:"none",color:"rgba(255,107,107,0.3)",fontSize:13,cursor:"pointer",padding:"4px",lineHeight:1}}>✕</button>
                        </td>
                      </tr>
                      {expandedRow===c.id&&(
                        <CommentExpandedRow
                          colSpan={9}
                          comment={c.comment}
                          images={imgs}
                          onUpdateComment={v=>onUpdate(c.id,"comment",v)}
                          onUpdateImages={ri=>saveImages(c.id,ri)}/>
                      )}
                    </React.Fragment>
                  );
                })}
                {visible.length===0&&(
                  <tr><td colSpan={9} style={{padding:"28px",textAlign:"center",color:"rgba(120,160,200,0.3)",fontSize:12}}>
                    No clients match — click "+ Add Client" to get started
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{padding:"6px 12px",borderTop:"1px solid rgba(58,130,246,0.1)",fontSize:10,color:"rgba(100,140,180,0.4)",textAlign:"right"}}>
            {visible.length} of {clients.length} clients
          </div>
        </div>
      }
    </div>
  );
}
