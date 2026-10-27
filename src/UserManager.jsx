import React,{useEffect,useState} from "react";
import {C} from "./constants";
import {brokerRpc,getBrokerSession,refreshBrokerIdentity,flushPreferences} from "./BrokerWorkspace";
const input={width:"100%",minWidth:0,boxSizing:"border-box",background:"#081425",border:"1px solid #29425e",borderRadius:5,color:"#dcecff",fontFamily:"inherit",fontSize:12,padding:"7px 8px"};
export default function UserManager(){
 const [users,setUsers]=useState([]),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);
 async function request(action="list",user=null,patch={}){const token=getBrokerSession()?.token;if(!token)throw Error("Log in with your administrator PIN first.");return brokerRpc("broker_admin_users",{p_token:token,p_action:action,p_user_id:user?.id==null?null:String(user.id),p_patch:patch});}
 function accept(rows){setUsers(rows);try{const cache={};rows.filter(u=>u.active).forEach(u=>{const {pin,...publicUser}=u;cache[String(u.initials).toUpperCase()]=publicUser;});localStorage.setItem("signal_users_cache",JSON.stringify(cache));}catch{}window.dispatchEvent(new CustomEvent("broker-users-updated"));}
 useEffect(()=>{let active=true;request().then(rows=>{if(active)accept(rows)}).catch(e=>{if(active)setMsg("Could not load users. Run settings_user_slots.sql first. "+e.message)});return()=>{active=false};},[]);
 async function action(kind,user,patch){if(busy)return false;setBusy(true);setMsg("");try{await flushPreferences();const rows=await request(kind,user,patch);accept(rows);if(kind==="reset"){try{for(const key of Object.keys(localStorage)){if(key.startsWith("broker:"+user.id+":")||key.startsWith("broker:workspace:"+user.id+":")||key==="signal_saved_pin_"+user.id)localStorage.removeItem(key);}}catch{}}const current=rows.find(u=>String(u.id)===String(getBrokerSession()?.user.id));if(current)refreshBrokerIdentity(current);setMsg(kind==="reset"?`User ${user.user_slot} reset. The empty slot is ready to reuse.`:kind==="add_slot"?"New empty user slot added.":`User ${user.user_slot} saved. Personal settings retained.`);return true;}catch(e){setMsg(e.message);return false;}finally{setBusy(false);}}
 return <div style={{minWidth:0,color:C.tx}}>
  <div style={{fontSize:12,color:C.faint,lineHeight:1.6,marginBottom:12}}>Each numbered slot keeps the same identity when you change its name, initials or PIN. Reset clears its personal preferences and sessions and leaves an empty slot. Shared cargoes, positions and edit history are retained.</div>
  <div style={{fontSize:11,color:C.faint,marginBottom:12}}>One PIN field: replace its value and Save. Existing PINs appear after that user next logs in; until then you may enter a replacement. PINs are shown only to administrators.</div>
  <div style={{display:"flex",flexDirection:"column",gap:12}}>{users.map(user=><UserRow key={user.id} user={user} busy={busy} onSave={patch=>action("save",user,patch)} onReset={()=>{if(window.confirm(`Reset User ${user.user_slot} (${user.name||"empty slot"})? This clears their login, tab access and personal settings. Shared business records stay intact.`))action("reset",user);}}/>)}</div>
  <button disabled={busy} onClick={()=>action("add_slot")} style={{...input,width:"auto",marginTop:14,cursor:"pointer",color:"#86efac"}}>+ Add user slot</button>
  {msg&&<div role="status" style={{fontSize:12,marginTop:12,color:"#a6c7ed",whiteSpace:"pre-wrap"}}>{msg}</div>}
 </div>;
}
function UserRow({user,busy,onSave,onReset}){
 const [draft,setDraft]=useState(user),[dirty,setDirty]=useState(false),[note,setNote]=useState("");
 useEffect(()=>{setDraft({...user,pin:user.pin||""});setDirty(false);},[user]);
 function change(key,value){setDraft(p=>({...p,[key]:value}));setDirty(true);setNote("");}
 const current=String(getBrokerSession()?.user.id)===String(user.id);
 async function save(){if(!draft.name.trim()||!/^[A-ZÆØÅ]{2}$/.test(draft.initials.toUpperCase())||!/^#[a-f0-9]{6}$/i.test(draft.color||"")){setNote("Enter name, two initials and a colour.");return;}if(draft.pin&&!/^\d{4}$/.test(draft.pin)){setNote("Enter a four-digit PIN.");return;}await onSave({name:draft.name,initials:draft.initials.toUpperCase(),color:draft.color,role:draft.role,active:draft.active,pin:draft.pin||null});}
 return <div style={{border:"1px solid #29425e",background:"#0b172a",borderRadius:7,padding:12,minWidth:0}}>
  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}><b style={{color:"#8fc4ff"}}>User {user.user_slot}</b><span style={{color:C.faint,fontSize:11}}>{user.name||"Empty slot"}{current?" · signed in":""}</span></div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(125px,1fr))",gap:10,alignItems:"end"}}>
   <label style={{fontSize:11}}>Name<input aria-label={`User ${user.user_slot} name`} style={input} value={draft.name||""} onChange={e=>change("name",e.target.value)}/></label>
   <label style={{fontSize:11}}>Initials<input aria-label={`User ${user.user_slot} initials`} style={input} maxLength={2} value={draft.initials||""} onChange={e=>change("initials",e.target.value.toUpperCase())}/></label>
   <label style={{fontSize:11}}>Colour<div style={{display:"flex",gap:5,alignItems:"center"}}><input aria-label={`User ${user.user_slot} colour`} type="color" style={{...input,height:33}} value={draft.color||"#58a6ff"} onChange={e=>change("color",e.target.value)}/>{!draft.color&&<button style={{...input,width:"auto"}} onClick={()=>change("color","#58a6ff")}>Set</button>}</div></label>
   <label style={{fontSize:11}}>PIN<input aria-label={`User ${user.user_slot} PIN`} autoComplete="off" style={input} inputMode="numeric" maxLength={4} placeholder={user.name?"Enter / replace PIN":"PIN"} value={draft.pin||""} onChange={e=>change("pin",e.target.value.replace(/\D/g,"").slice(0,4))}/></label>
   <label style={{fontSize:11}}>Role<select style={input} value={draft.role||"user"} onChange={e=>change("role",e.target.value)}><option value="user">User</option><option value="admin">Admin</option></select></label>
   <label style={{fontSize:12,padding:8}}><input type="checkbox" checked={!!draft.active} onChange={e=>change("active",e.target.checked)}/> Active</label>
  </div>
  <div style={{display:"flex",gap:8,alignItems:"center",marginTop:10,flexWrap:"wrap"}}><button disabled={busy||!dirty} onClick={save} style={{...input,width:"auto",color:"#86efac",cursor:"pointer"}}>Save</button><button disabled={busy||current} onClick={onReset} style={{...input,width:"auto",color:"#ff9a9a",cursor:"pointer"}}>Reset slot</button>{note&&<span role="alert" style={{fontSize:12,color:"#ffbd7a"}}>{note}</span>}</div>
 </div>;
}
