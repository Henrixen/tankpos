import React,{useEffect,useState} from "react";
import {supabase} from "./supabaseclient"; import {C} from "./constants";
async function sha256(t){const b=new TextEncoder().encode(String(t)),d=await crypto.subtle.digest("SHA-256",b);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
const input={background:"#081425",border:"1px solid rgba(88,166,255,.22)",borderRadius:5,color:"#dcecff",fontFamily:"inherit",fontSize:12,padding:"6px 8px",outline:"none"};
export default function UserManager(){
 const [users,setUsers]=useState([]),[form,setForm]=useState({name:"",initials:"",color:"#58a6ff",pin:"",role:"user"}),[msg,setMsg]=useState("");
 async function load(){const {data,error}=await supabase.from("app_users").select("id,name,initials,color,role,active,created_at").order("name");if(error){setMsg("Run the supplied Supabase migration first.");return}setUsers(data||[]);const m={};(data||[]).filter(x=>x.active).forEach(x=>m[String(x.initials).toUpperCase()]=x);localStorage.setItem("signal_users_cache",JSON.stringify(m))}
 useEffect(()=>{load()},[]);
 async function add(){const name=form.name.trim(),initials=form.initials.trim().toUpperCase().replace(/[^A-ZÆØÅ]/g,"").slice(0,2),pin=form.pin.replace(/\D/g,"").slice(0,4);if(!name||initials.length!==2||pin.length!==4){setMsg("Name, exactly 2 initials and a 4-digit PIN are required.");return}const {error}=await supabase.from("app_users").insert({name,initials,color:form.color,pin_hash:await sha256(pin),role:form.role,active:true});if(error){setMsg(error.message);return}setForm({name:"",initials:"",color:"#58a6ff",pin:"",role:"user"});setMsg("User added.");load()}
 async function patch(id,v){const {error}=await supabase.from("app_users").update(v).eq("id",id);if(error)setMsg(error.message);else load()}
 async function resetPin(id,p){p=String(p||"").replace(/\D/g,"").slice(0,4);if(p.length===4)patch(id,{pin_hash:await sha256(p)})}
 return <div style={{background:"#0b172a",border:"1px solid rgba(88,166,255,.18)",borderRadius:8,padding:16}}>
  <div style={{fontSize:11,fontWeight:800,color:C.blue,letterSpacing:".08em",textTransform:"uppercase"}}>Users / Login</div>
  <div style={{fontSize:11,color:C.faint,margin:"4px 0 12px"}}>Separate 4-digit PIN per colleague. Navigation visibility remains global for everybody.</div>
  <div style={{display:"grid",gridTemplateColumns:"1.6fr .55fr .55fr .7fr .8fr auto",gap:7,alignItems:"center",marginBottom:12}}>
   <input style={input} placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
   <input style={{...input,textTransform:"uppercase",textAlign:"center"}} placeholder="HH" maxLength={2} value={form.initials} onChange={e=>setForm({...form,initials:e.target.value})}/>
   <input type="color" title="Initial colour" value={form.color} onChange={e=>setForm({...form,color:e.target.value})} style={{width:"100%",height:31,background:"transparent",border:"none"}}/>
   <input style={{...input,textAlign:"center"}} inputMode="numeric" placeholder="PIN" maxLength={4} value={form.pin} onChange={e=>setForm({...form,pin:e.target.value.replace(/\D/g,"").slice(0,4)})}/>
   <select style={input} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="user">User</option><option value="guest">Guest</option><option value="admin">Admin</option></select>
   <button onClick={add} style={{...input,cursor:"pointer",color:C.green,fontWeight:800}}>+ Add</button>
  </div>
  {users.map(u=><Row key={u.id} u={u} patch={patch} resetPin={resetPin}/>)}
  {msg&&<div style={{fontSize:11,color:C.faint,marginTop:10}}>{msg}</div>}
 </div>
}
function Row({u,patch,resetPin}){const [pin,setPin]=useState("");const col=u.color||"#58a6ff";return <div style={{display:"grid",gridTemplateColumns:"34px 1.4fr .55fr .65fr .8fr 1fr",gap:8,alignItems:"center",padding:"6px 8px",background:"rgba(255,255,255,.018)",borderRadius:5,marginTop:4}}>
 <span style={{width:22,height:22,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",padding:0,fontSize:9,fontWeight:800,lineHeight:"1",letterSpacing:0,textAlign:"center",color:col,background:col+"22",border:"1px solid "+col+"88"}}>{u.initials}</span>
 <span style={{fontSize:12,color:C.tx,fontWeight:700}}>{u.name}</span><span style={{fontSize:10,color:C.faint,textTransform:"uppercase"}}>{u.role}</span>
 <input type="color" value={col} onChange={e=>patch(u.id,{color:e.target.value})} style={{width:34,height:24,background:"transparent",border:"none"}}/>
 <label style={{fontSize:10,color:u.active?C.green:C.faint}}><input type="checkbox" checked={!!u.active} onChange={e=>patch(u.id,{active:e.target.checked})}/> Active</label>
 <div style={{display:"flex",gap:4}}><input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,4))} inputMode="numeric" maxLength={4} placeholder="New PIN" style={{...input,width:70,padding:"4px 6px"}}/><button onClick={()=>{resetPin(u.id,pin);setPin("")}} style={{...input,padding:"4px 7px",cursor:"pointer"}}>Set</button></div>
 </div>}
