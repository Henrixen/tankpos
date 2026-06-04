import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabaseclient";
import { C } from "./constants";
import { v4 as uuidv4 } from 'uuid';

// SQL update needed in Supabase:
// ALTER TABLE client_directory ADD COLUMN IF NOT EXISTS client_type text[] DEFAULT '{}';
// ALTER TABLE client_directory ADD COLUMN IF NOT EXISTS email text DEFAULT '';
// UPDATE client_directory SET lead_broker = 'Henriksen' WHERE lead_broker = 'Haakon';
// UPDATE client_directory SET lead_broker = 'Henriksen & Løken' WHERE lead_broker = 'Both';

const BROKERS = ["", "Henriksen", "Løken", "Henriksen & Løken"];
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

// Multi-select checkbox for lead broker
function BrokerCell({value, onChange}){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  const selected=value||"";
  return(
    <td style={TD} onClick={e=>e.stopPropagation()}>
      <div style={{position:"relative"}}>
        <button onClick={()=>setOpen(v=>!v)}
          style={{...INP,cursor:"pointer",textAlign:"left",padding:"6px 10px",color:selected?"rgba(160,200,255,0.85)":"rgba(100,140,180,0.35)"}}>
          {selected||"—"}
        </button>
        {open&&(
          <>
            <div style={{position:"fixed",inset:0,zIndex:9990}} onClick={()=>setOpen(false)}/>
            <div style={{position:"absolute",left:0,top:"100%",zIndex:9999,background:"#0a1628",border:"1px solid rgba(88,166,255,0.3)",borderRadius:6,padding:"4px",minWidth:180,boxShadow:"0 6px 20px rgba(0,0,0,0.7)"}}>
              {BROKERS.filter(b=>b).map(b=>(
                <button key={b} onClick={()=>{onChange(b);setOpen(false);}}
                  style={{display:"block",width:"100%",textAlign:"left",fontSize:11,padding:"5px 10px",background:selected===b?"rgba(88,166,255,0.15)":"transparent",
                    border:"none",color:selected===b?"#79c0ff":"rgba(160,200,255,0.7)",cursor:"pointer",fontFamily:"inherit",borderRadius:3}}>
                  {b}
                </button>
              ))}
              {selected&&<button onClick={()=>{onChange("");setOpen(false);}}
                style={{display:"block",width:"100%",textAlign:"left",fontSize:10,padding:"4px 10px",background:"transparent",border:"none",color:"rgba(255,107,107,0.5)",cursor:"pointer",fontFamily:"inherit",borderRadius:3}}>
                ✕ Clear
              </button>}
            </div>
          </>
        )}
      </div>
    </td>
  );
}

// Checkbox multi-select for client type
function TypeCell({value, onChange}){
  const types = Array.isArray(value) ? value : (value ? [value] : []);
  function toggle(t){
    const next = types.includes(t) ? types.filter(x=>x!==t) : [...types,t];
    onChange(next);
  }
  return(
    <td style={{...TD,padding:"0 8px"}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        {CLIENT_TYPES.map(t=>(
          <label key={t} style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",fontSize:11}}>
            <input type="checkbox" checked={types.includes(t)} onChange={()=>toggle(t)}
              style={{width:12,height:12,accentColor:"#58a6ff",cursor:"pointer"}}/>
            <span style={{color:types.includes(t)?"rgba(160,200,255,0.8)":"rgba(100,140,180,0.4)"}}>{t}</span>
          </label>
        ))}
      </div>
    </td>
  );
}

function InlineCell({value,onChange,placeholder="",isDate=false}){
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(value||"");
  const ref=useRef(null);
  useEffect(()=>setVal(value||""),[value]);
  function save(){
    setEditing(false);
    const v=isDate?parseDate(val):val;
    if(v!==(value||"")) onChange(v);
  }
  return(
    <td style={TD} onClick={()=>{setEditing(true);setTimeout(()=>ref.current?.focus(),10);}}>
      {editing
        ?<input ref={ref} value={val} onChange={e=>setVal(e.target.value)} placeholder={placeholder}
            onBlur={save} onKeyDown={e=>{if(e.key==="Enter")save();if(e.key==="Escape"){setVal(value||"");setEditing(false);}}}
            autoFocus style={INP}/>
        :<div style={{...INP,color:val?"rgba(220,235,255,0.92)":"rgba(100,140,180,0.3)",cursor:"text",minHeight:32,lineHeight:"20px"}}>
          {val||placeholder}
        </div>
      }
    </td>
  );
}

// Comment + images in one line, expands on click
function CommentImageCell({rowId, comment, images, onUpdateComment, onUpdateImages}){
  const [expanded,setExpanded]=useState(false);
  const [editingComment,setEditingComment]=useState(false);
  const [commentVal,setCommentVal]=useState(comment||"");
  const [lightbox,setLightbox]=useState(null);
  const [delConfirm,setDelConfirm]=useState(null);
  const inputRef=useRef(null);
  useEffect(()=>setCommentVal(comment||""),[comment]);

  function saveComment(){ setEditingComment(false); if(commentVal!==(comment||"")) onUpdateComment(commentVal); }

  function handlePaste(e){
    const img=Array.from(e.clipboardData?.items||[]).find(i=>i.type.startsWith("image/"));
    if(!img) return;
    e.preventDefault();
    const reader=new FileReader();
    reader.onload=ev=>onUpdateImages([...images, ev.target.result]);
    reader.readAsDataURL(img.getAsFile());
  }

  function deleteImage(i){
    setDelConfirm(i);
  }
  function confirmDeleteImage(i){
    onUpdateImages(images.filter((_,idx)=>idx!==i));
    setDelConfirm(null);
  }

  const hasContent = comment || images.length>0;

  return(
    <>
      {/* Collapsed: single line */}
      <td style={{...TD,cursor:"pointer",maxWidth:280}} onClick={()=>setExpanded(v=>!v)}>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",minHeight:32}}>
          <span style={{fontSize:11,color:hasContent?"rgba(180,210,255,0.7)":"rgba(100,140,180,0.3)",
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1,maxWidth:200}}>
            {comment||(images.length>0?"":"")||"Add comment…"}
          </span>
          {images.length>0&&(
            <div style={{display:"flex",gap:2,flexShrink:0}}>
              {images.slice(0,3).map((src,i)=>(
                <img key={i} src={src} style={{width:22,height:22,objectFit:"cover",borderRadius:3,border:"1px solid rgba(88,166,255,0.2)"}}/>
              ))}
              {images.length>3&&<span style={{fontSize:9,color:"rgba(120,160,200,0.5)",paddingLeft:2}}>+{images.length-3}</span>}
            </div>
          )}
          <span style={{fontSize:9,color:"rgba(88,166,255,0.3)",flexShrink:0}}>{expanded?"▲":"▼"}</span>
        </div>
      </td>
      {/* Expanded row — spans full width */}
      {expanded&&(
        <tr style={{background:"rgba(14,28,58,0.85)"}}>
          <td colSpan={99} style={{padding:"10px 14px",borderBottom:"1px solid rgba(58,130,246,0.15)"}}>
            <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
              {/* Comment text area */}
              <div style={{flex:1}} onClick={e=>{e.stopPropagation();setEditingComment(true);setTimeout(()=>inputRef.current?.focus(),10);}}>
                {editingComment
                  ?<textarea ref={inputRef} value={commentVal} onChange={e=>setCommentVal(e.target.value)}
                      onBlur={saveComment} onPaste={handlePaste}
                      style={{width:"100%",background:"rgba(8,16,32,0.8)",border:"1px solid rgba(88,166,255,0.25)",
                        borderRadius:5,color:"rgba(200,220,255,0.9)",fontFamily:"inherit",fontSize:12,
                        padding:"7px 10px",resize:"none",outline:"none",height:70,boxSizing:"border-box"}}/>
                  :<div style={{background:"rgba(8,16,32,0.4)",borderRadius:5,border:"1px solid rgba(58,130,246,0.12)",
                      padding:"7px 10px",fontSize:12,color:commentVal?"rgba(200,220,255,0.85)":"rgba(100,140,180,0.3)",
                      cursor:"text",minHeight:50,whiteSpace:"pre-wrap"}}>
                    {commentVal||"Click to add comment… (Ctrl+V to paste image)"}
                  </div>
                }
              </div>
              {/* Images */}
              {images.length>0&&(
                <div style={{display:"flex",gap:6,flexWrap:"wrap",flexShrink:0,maxWidth:200}}>
                  {images.map((src,i)=>(
                    <div key={i} style={{position:"relative"}}>
                      <img src={src} onClick={()=>setLightbox(src)}
                        style={{width:52,height:52,objectFit:"cover",borderRadius:5,cursor:"zoom-in",
                          border:"1px solid rgba(88,166,255,0.2)"}}/>
                      {delConfirm===i
                        ?<div style={{position:"absolute",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.8)",borderRadius:5,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}>
                          <span style={{fontSize:8,color:"white"}}>Delete?</span>
                          <div style={{display:"flex",gap:3}}>
                            <button onClick={e=>{e.stopPropagation();confirmDeleteImage(i);}} style={{fontSize:9,padding:"1px 5px",borderRadius:3,border:"none",background:"rgba(255,107,107,0.7)",color:"white",cursor:"pointer"}}>Yes</button>
                            <button onClick={e=>{e.stopPropagation();setDelConfirm(null);}} style={{fontSize:9,padding:"1px 5px",borderRadius:3,border:"none",background:"rgba(88,130,200,0.5)",color:"white",cursor:"pointer"}}>No</button>
                          </div>
                        </div>
                        :<button onClick={e=>{e.stopPropagation();deleteImage(i);}}
                          style={{position:"absolute",top:-5,right:-5,width:16,height:16,borderRadius:"50%",
                            background:"rgba(255,107,107,0.7)",border:"none",color:"white",fontSize:9,
                            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>✕</button>
                      }
                    </div>
                  ))}
                  <label style={{width:52,height:52,border:"1px dashed rgba(88,166,255,0.25)",borderRadius:5,
                    display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",
                    color:"rgba(88,166,255,0.3)",fontSize:20}}>
                    +<input type="file" accept="image/*" style={{display:"none"}}
                      onChange={e=>{if(e.target.files?.[0]){const r=new FileReader();r.onload=ev=>onUpdateImages([...images,ev.target.result]);r.readAsDataURL(e.target.files[0]);e.target.value="";}}}/>
                  </label>
                </div>
              )}
              {images.length===0&&(
                <label style={{width:52,height:52,border:"1px dashed rgba(88,166,255,0.2)",borderRadius:5,flexShrink:0,
                  display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",
                  color:"rgba(88,166,255,0.25)",fontSize:20,title:"Add image"}}>
                  🖼<input type="file" accept="image/*" style={{display:"none"}}
                    onChange={e=>{if(e.target.files?.[0]){const r=new FileReader();r.onload=ev=>onUpdateImages([ev.target.result]);r.readAsDataURL(e.target.files[0]);e.target.value="";}}}/>
                </label>
              )}
            </div>
          </td>
        </tr>
      )}
      {lightbox&&(
        <tr><td colSpan={0} style={{padding:0,border:"none"}}>
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
                  <th style={{...TH_BASE,width:160}}>Company</th>
                  <th style={{...TH_BASE,width:110}}>Type</th>
                  <th style={{...TH_BASE,width:150}}>PIC</th>
                  <th style={{...TH_BASE,width:160}}>Lead Broker</th>
                  <th style={{...TH_BASE,width:90}}>Rating</th>
                  <th style={{...TH_BASE,width:100}}>Last Contact</th>
                  <th style={{...TH_BASE,width:170}}>Email</th>
                  <th style={{...TH_BASE}}>Comment</th>
                  <th style={{...TH_BASE,width:32}}></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c,i)=>{
                  const imgs=images[c.id]||[];
                  return(
                    <React.Fragment key={c.id}>
                      <tr style={{background:i%2===0?ROW_EVEN:ROW_ODD}}>
                        {/* Company — white bold */}
                        <td style={TD}>
                          <InlineCell value={c.company} placeholder="Company name" onChange={v=>onUpdate(c.id,"company",v)}/>
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
                          onUpdateComment={v=>onUpdate(c.id,"comment",v)}
                          onUpdateImages={imgs=>saveImages(c.id,imgs)}/>
                        <td style={{...TD,textAlign:"center",padding:"0 4px"}}>
                          <button onClick={()=>setPendingDel(c.id)}
                            style={{background:"none",border:"none",color:"rgba(255,107,107,0.3)",fontSize:13,cursor:"pointer",padding:"4px",lineHeight:1}}>✕</button>
                        </td>
                      </tr>
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
