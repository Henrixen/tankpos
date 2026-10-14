import React,{useEffect,useState} from "react";
import {supabase} from "./supabaseclient"; import {C} from "./constants";
async function sha256(t){const b=new TextEncoder().encode(String(t)),d=await crypto.subtle.digest("SHA-256",b);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
const input={background:"#081425",border:"1px solid rgba(88,166,255,.22)",borderRadius:5,color:"#dcecff",fontFamily:"inherit",fontSize:12,padding:"6px 8px",outline:"none"};
export default function UserManager(){
 const [users,setUsers]=useState([]),[form,setForm]=useState({name:"",initials:"",color:"#58a6ff",pin:"",role:"user"}),[msg,setMsg]=useState("");
 async function load(){const {data,error}=await supabase.from("app_users").select("id,name,initials,color,role,active,created_at,pin_hash").order("name");if(error){setMsg("Run the supplied Supabase migration first.");return}setUsers(data||[]);const m={};(data||[]).filter(x=>x.active).forEach(x=>m[String(x.initials).toUpperCase()]=x);localStorage.setItem("signal_users_cache",JSON.stringify(m))}
 async function normalizeRoles(){
   await supabase.from("app_users").update({role:"user"}).eq("role","guest");
 }
 useEffect(()=>{normalizeRoles().finally(load)},[]);
 async function add(){const name=form.name.trim(),initials=form.initials.trim().toUpperCase().replace(/[^A-ZÆØÅ]/g,"").slice(0,2),pin=form.pin.replace(/\D/g,"").slice(0,4);if(!name||initials.length!==2||pin.length!==4){setMsg("Name, exactly 2 initials and a 4-digit PIN are required.");return}const {error}=await supabase.from("app_users").insert({name,initials,color:form.color,pin_hash:await sha256(pin),role:form.role,active:true});if(error){setMsg(error.message);return}setForm({name:"",initials:"",color:"#58a6ff",pin:"",role:"user"});setMsg("User added.");load()}
 async function deleteUser(u){
   const current=String(localStorage.getItem("signal_user")||"").toUpperCase();
   if(current===String(u.initials||"").toUpperCase()){setMsg("You cannot delete the account currently signed in.");return}
   if(u.role==="admin"&&users.filter(x=>x.role==="admin"&&x.active).length<=1){setMsg("You cannot delete the last active administrator.");return}
   if(!window.confirm(`Permanently delete ${u.name} (${u.initials})? This removes their login access. Existing cargoes and positions are not deleted.`))return;
   const {error}=await supabase.from("app_users").delete().eq("id",u.id);
   if(error){setMsg("Could not delete user: "+error.message);return}
   setMsg(`${u.name} deleted.`);await load();
 }
 async function patch(id,v){const {error}=await supabase.from("app_users").update(v).eq("id",id);if(error)setMsg(error.message);else load()}
 async function changePin(id,oldPin,newPin,currentHash){
   oldPin=String(oldPin||"").replace(/\D/g,"").slice(0,4);newPin=String(newPin||"").replace(/\D/g,"").slice(0,4);
   if(oldPin.length!==4||newPin.length!==4){setMsg("Enter the current 4-digit PIN and the new 4-digit PIN.");return false}
   if(await sha256(oldPin)!==currentHash){setMsg("Current PIN is incorrect.");return false}
   const {error}=await supabase.from("app_users").update({pin_hash:await sha256(newPin)}).eq("id",id);
   if(error){setMsg(error.message);return false}
   await load();setMsg("PIN changed.");return true
 }
 return <div style={{background:"#0b172a",border:"1px solid rgba(88,166,255,.18)",borderRadius:8,padding:16}}>
  <div style={{fontSize:11,fontWeight:800,color:C.blue,letterSpacing:".08em",textTransform:"uppercase"}}>Users / Login</div>
  <div style={{fontSize:11,color:C.faint,margin:"4px 0 12px"}}>Separate 4-digit PIN per colleague. Admin has full access; each User can have individual tab access.</div>
  <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.6fr) minmax(0,.55fr) minmax(0,.55fr) minmax(0,.7fr) minmax(0,.8fr) 90px",gap:7,alignItems:"center",marginBottom:12}}>
   <input style={input} placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
   <input style={{...input,textTransform:"uppercase",textAlign:"center"}} placeholder="HH" maxLength={2} value={form.initials} onChange={e=>setForm({...form,initials:e.target.value})}/>
   <input type="color" title="Initial colour" value={form.color} onChange={e=>setForm({...form,color:e.target.value})} style={{width:"100%",height:31,background:"transparent",border:"none"}}/>
   <input style={{...input,textAlign:"center"}} inputMode="numeric" placeholder="PIN" maxLength={4} value={form.pin} onChange={e=>setForm({...form,pin:e.target.value.replace(/\D/g,"").slice(0,4)})}/>
   <select style={input} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="user">User</option><option value="admin">Admin</option></select>
   <button onClick={add} style={{...input,cursor:"pointer",color:C.green,fontWeight:800,width:"100%",height:31,boxSizing:"border-box"}}>+ Add</button>
  </div>
  {[...users].sort((a,b)=>(a.role==="admin"?0:1)-(b.role==="admin"?0:1)||a.name.localeCompare(b.name)).map((u,i,arr)=><div key={u.id} style={i>0&&arr[i-1].role==="admin"&&u.role!=="admin"?{borderTop:"1px solid rgba(88,166,255,.22)",paddingTop:9,marginTop:9}:{}}><Row u={u} patch={patch} changePin={changePin} deleteUser={deleteUser}/></div>)}
  {msg&&<div style={{fontSize:11,color:C.faint,marginTop:10}}>{msg}</div>}
 </div>
}
function Row({u,patch,changePin,deleteUser}){
 const pinKey=`signal_saved_pin_${u.id}`;
 const [oldPin,setOldPin]=useState(()=>{try{return localStorage.getItem(pinKey)||""}catch{return ""}}),[newPin,setNewPin]=useState("");
 const [remember,setRemember]=useState(()=>{try{return !!localStorage.getItem(pinKey)}catch{return false}});
 const [pinNote,setPinNote]=useState("");const col=u.color||"#58a6ff";
 async function toggleRemember(checked){
   if(!checked){try{localStorage.removeItem(pinKey)}catch{}setRemember(false);setPinNote("");return}
   if(oldPin.length!==4 || await sha256(oldPin)!==u.pin_hash){setPinNote("Enter the correct current PIN before saving it.");return}
   if(!window.confirm("Save this PIN as readable text on this device? Anyone with access to this browser profile may be able to view it."))return;
   try{localStorage.setItem(pinKey,oldPin);setRemember(true);setPinNote("Saved on this device")}catch{setPinNote("Could not save PIN")}
 }
 const clean=v=>v.replace(/\D/g,"").slice(0,4);
 return <div style={{display:"grid",gridTemplateColumns:"34px minmax(0,1.35fr) minmax(0,.5fr) minmax(0,.55fr) minmax(0,.7fr) minmax(0,1.65fr) 28px",gap:8,alignItems:"center",padding:"6px 8px",background:"rgba(255,255,255,.018)",borderRadius:5,marginTop:4}}>
  <span style={{width:22,height:22,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",padding:0,fontSize:9,fontWeight:800,lineHeight:"1",letterSpacing:0,textAlign:"center",color:col,background:col+"22",border:"1px solid "+col+"88"}}>{u.initials}</span>
  <span style={{fontSize:12,color:C.tx,fontWeight:700}}>{u.name}</span><select style={{...input,padding:"4px 6px",fontSize:10,textTransform:"uppercase"}} value={u.role==="admin"?"admin":"user"} onChange={e=>patch(u.id,{role:e.target.value})}><option value="user">User</option><option value="admin">Admin</option></select>
  <input type="color" value={col} onChange={e=>patch(u.id,{color:e.target.value})} style={{width:34,height:24,background:"transparent",border:"none"}}/>
  <label style={{fontSize:10,color:u.active?C.green:C.faint}}><input type="checkbox" checked={!!u.active} onChange={e=>patch(u.id,{active:e.target.checked})}/> Active</label>
  <div style={{display:"flex",gap:4,alignItems:"center"}}>
   <input value={oldPin} onChange={e=>{const v=clean(e.target.value);setOldPin(v);if(remember){try{localStorage.removeItem(pinKey)}catch{}setRemember(false)}}} inputMode="numeric" type="text" maxLength={4} placeholder="Current PIN" title={u.pin_hash?"PIN configured. Enter the current PIN to change it.":"No PIN configured"} style={{...input,width:66,padding:"4px 6px",textAlign:"center"}}/>
   <span style={{fontSize:10,color:C.faint}}>→</span>
   <input value={newPin} onChange={e=>setNewPin(clean(e.target.value))} inputMode="numeric" type="text" maxLength={4} placeholder="New PIN" style={{...input,width:66,padding:"4px 6px",textAlign:"center"}}/>
   <button onClick={async()=>{if(await changePin(u.id,oldPin,newPin,u.pin_hash)){if(remember){try{localStorage.setItem(pinKey,newPin)}catch{}}setOldPin(remember?newPin:"");setNewPin("")}}} style={{...input,padding:"4px 7px",cursor:"pointer",whiteSpace:"nowrap"}}>Change</button>
   <label title="Optional: saves the PIN in readable form in this browser's local storage" style={{fontSize:9,color:C.faint,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:3}}><input type="checkbox" checked={remember} onChange={e=>toggleRemember(e.target.checked)}/> Remember</label>
   {pinNote&&<span style={{fontSize:9,color:C.faint}}>{pinNote}</span>}
  </div>
 <button title={`Delete ${u.name}`} aria-label={`Delete ${u.name}`} onClick={()=>deleteUser(u)} style={{background:"rgba(255,75,85,.09)",border:"1px solid rgba(255,75,85,.4)",color:"#ff6677",borderRadius:4,height:25,cursor:"pointer",fontWeight:800}}>×</button>
 </div>
}
