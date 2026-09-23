import React,{useEffect,useState} from "react";
import {supabase} from "./supabaseclient"; import {C} from "./constants";
async function sha256(t){const b=new TextEncoder().encode(String(t)),d=await crypto.subtle.digest("SHA-256",b);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
const input={background:"#081425",border:"1px solid rgba(88,166,255,.22)",borderRadius:5,color:"#dcecff",fontFamily:"inherit",fontSize:12,padding:"6px 8px",outline:"none"};
export default function UserManager(){
 const [users,setUsers]=useState([]),[form,setForm]=useState({name:"",initials:"",color:"#58a6ff",pin:"",role:"user"}),[msg,setMsg]=useState("");
 async function load(){const {data,error}=await supabase.from("app_users").select("id,name,initials,color,role,active,created_at,pin_hash").order("name");if(error){setMsg("Run the supplied Supabase migration first.");return}setUsers(data||[]);const m={};(data||[]).filter(x=>x.active).forEach(x=>m[String(x.initials).toUpperCase()]=x);localStorage.setItem("signal_users_cache",JSON.stringify(m))}
 async function ensureHenrik(){
   const guestHash=await sha256("0250");
   const {data}=await supabase.from("app_users").select("id,name,initials,pin_hash").or(`pin_hash.eq.${guestHash},initials.eq.HL`).limit(1);
   if(data?.length){await supabase.from("app_users").update({name:"Henrik Løken",initials:"HL",color:C.green,role:"guest",active:true,pin_hash:guestHash}).eq("id",data[0].id);}
   else{await supabase.from("app_users").insert({name:"Henrik Løken",initials:"HL",color:C.green,pin_hash:guestHash,role:"guest",active:true});}
 }
 useEffect(()=>{ensureHenrik().finally(load)},[]);
 async function add(){const name=form.name.trim(),initials=form.initials.trim().toUpperCase().replace(/[^A-ZÆØÅ]/g,"").slice(0,2),pin=form.pin.replace(/\D/g,"").slice(0,4);if(!name||initials.length!==2||pin.length!==4){setMsg("Name, exactly 2 initials and a 4-digit PIN are required.");return}const {error}=await supabase.from("app_users").insert({name,initials,color:form.color,pin_hash:await sha256(pin),role:form.role,active:true});if(error){setMsg(error.message);return}setForm({name:"",initials:"",color:"#58a6ff",pin:"",role:"user"});setMsg("User added.");load()}
 async function patch(id,v){const {error}=await supabase.from("app_users").update(v).eq("id",id);if(error)setMsg(error.message);else load()}
 async function changePin(id,oldPin,newPin,currentHash){
   oldPin=String(oldPin||"").replace(/\D/g,"").slice(0,4);newPin=String(newPin||"").replace(/\D/g,"").slice(0,4);
   if(oldPin.length!==4||newPin.length!==4){setMsg("Enter the current 4-digit PIN and the new 4-digit PIN.");return false}
   if(await sha256(oldPin)!==currentHash){setMsg("Current PIN is incorrect.");return false}
   await patch(id,{pin_hash:await sha256(newPin)});setMsg("PIN changed.");return true
 }
 return <div style={{background:"#0b172a",border:"1px solid rgba(88,166,255,.18)",borderRadius:8,padding:16}}>
  <div style={{fontSize:11,fontWeight:800,color:C.blue,letterSpacing:".08em",textTransform:"uppercase"}}>Users / Login</div>
  <div style={{fontSize:11,color:C.faint,margin:"4px 0 12px"}}>Separate 4-digit PIN per colleague. Navigation visibility remains global for everybody.</div>
  <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.6fr) minmax(0,.55fr) minmax(0,.55fr) minmax(0,.7fr) minmax(0,.8fr) 90px",gap:7,alignItems:"center",marginBottom:12}}>
   <input style={input} placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
   <input style={{...input,textTransform:"uppercase",textAlign:"center"}} placeholder="HH" maxLength={2} value={form.initials} onChange={e=>setForm({...form,initials:e.target.value})}/>
   <input type="color" title="Initial colour" value={form.color} onChange={e=>setForm({...form,color:e.target.value})} style={{width:"100%",height:31,background:"transparent",border:"none"}}/>
   <input style={{...input,textAlign:"center"}} inputMode="numeric" placeholder="PIN" maxLength={4} value={form.pin} onChange={e=>setForm({...form,pin:e.target.value.replace(/\D/g,"").slice(0,4)})}/>
   <select style={input} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="user">User</option><option value="guest">Guest</option><option value="admin">Admin</option></select>
   <button onClick={add} style={{...input,cursor:"pointer",color:C.green,fontWeight:800,width:"100%",height:31,boxSizing:"border-box"}}>+ Add</button>
  </div>
  {users.map(u=><Row key={u.id} u={u} patch={patch} changePin={changePin}/>)}
  {msg&&<div style={{fontSize:11,color:C.faint,marginTop:10}}>{msg}</div>}
 </div>
}
function Row({u,patch,changePin}){
 const knownPin=String(u.initials||"").toUpperCase()==="HH"?"4524":String(u.initials||"").toUpperCase()==="HL"?"0250":"";
 const [oldPin,setOldPin]=useState(knownPin),[newPin,setNewPin]=useState("");const col=u.color||"#58a6ff";
 const clean=v=>v.replace(/\D/g,"").slice(0,4);
 return <div style={{display:"grid",gridTemplateColumns:"34px minmax(0,1.35fr) minmax(0,.5fr) minmax(0,.55fr) minmax(0,.7fr) minmax(0,1.65fr)",gap:8,alignItems:"center",padding:"6px 8px",background:"rgba(255,255,255,.018)",borderRadius:5,marginTop:4}}>
  <span style={{width:22,height:22,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",padding:0,fontSize:9,fontWeight:800,lineHeight:"1",letterSpacing:0,textAlign:"center",color:col,background:col+"22",border:"1px solid "+col+"88"}}>{u.initials}</span>
  <span style={{fontSize:12,color:C.tx,fontWeight:700}}>{u.name}</span><span style={{fontSize:10,color:C.faint,textTransform:"uppercase"}}>{u.role}</span>
  <input type="color" value={col} onChange={e=>patch(u.id,{color:e.target.value})} style={{width:34,height:24,background:"transparent",border:"none"}}/>
  <label style={{fontSize:10,color:u.active?C.green:C.faint}}><input type="checkbox" checked={!!u.active} onChange={e=>patch(u.id,{active:e.target.checked})}/> Active</label>
  <div style={{display:"flex",gap:4,alignItems:"center"}}>
   <input value={oldPin} onChange={e=>setOldPin(clean(e.target.value))} inputMode="numeric" type="text" maxLength={4} placeholder="Current PIN" style={{...input,width:66,padding:"4px 6px",textAlign:"center"}}/>
   <span style={{fontSize:10,color:C.faint}}>→</span>
   <input value={newPin} onChange={e=>setNewPin(clean(e.target.value))} inputMode="numeric" type="password" maxLength={4} placeholder="New PIN" style={{...input,width:66,padding:"4px 6px",textAlign:"center"}}/>
   <button onClick={async()=>{if(await changePin(u.id,oldPin,newPin,u.pin_hash)){setOldPin(newPin);setNewPin("")}}} style={{...input,padding:"4px 7px",cursor:"pointer",whiteSpace:"nowrap"}}>Change</button>
  </div>
 </div>
}
