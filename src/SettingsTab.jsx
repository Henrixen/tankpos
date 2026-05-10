import React, { useState, useEffect } from "react";
import { C } from "./constants";

const STORAGE_KEY = "signal_cargo_filter_groups";

const CATEGORIES = [
  { id:"grade",     label:"Grade",      field:"cargo",     hint:"Matches the cargo grade field" },
  { id:"load",      label:"Load Port",  field:"load",      hint:"Matches the load port field" },
  { id:"disch",     label:"Disch Port", field:"disch",     hint:"Matches the discharge port field" },
  { id:"charterer", label:"Charterer",  field:"charterer", hint:"Matches the charterer field" },
  { id:"laycan",    label:"Laycan",     field:"from",      hint:"Matches the laycan from field" },
  { id:"tag",       label:"Tag",        field:"tag",       hint:"Matches the tag field" },
];

function loadGroups() {
  try { const raw=localStorage.getItem(STORAGE_KEY); return raw?JSON.parse(raw):defaultGroups(); }
  catch { return defaultGroups(); }
}
function defaultGroups() {
  return [
    {id:"naphtha",  label:"Naphtha",  category:"grade", aliases:["Naphtha","NAPHTHA"]},
    {id:"gasoline", label:"Gasoline", category:"grade", aliases:["Gasoline","GASOLINE","Petrol"]},
    {id:"cpp",      label:"CPP",      category:"grade", aliases:["CPP","DPP","Jet","Kero","Kerosene","Gasoil","ULSD","HVO"]},
    {id:"benz",     label:"Benz",     category:"grade", aliases:["Benzene","BTX","Xylene","Toluene","Styrene","MX","PX"]},
    {id:"veg",      label:"Veg/Bio",  category:"grade", aliases:["UCO","FAME","Palm","Soya","Canola","HVO/SAF","HVO","SAF"]},
    {id:"hfo",      label:"HFO/Fuel", category:"grade", aliases:["HFO","HSFO","LSFO","MGO","Fuel Oil","Bunker"]},
  ];
}
function saveGroups(groups) { localStorage.setItem(STORAGE_KEY, JSON.stringify(groups)); }

function CustomTagsEditor(){
  const PRESETS=["AG","CPP","DPP","ex Asia","Med","Parcel","TA","UKC","WAF"];
  const [custom,setCustom]=useState(()=>{try{return JSON.parse(localStorage.getItem("signal_custom_tags")||"[]");}catch{return[];}});
  const [editTag,setEditTag]=useState(null); // tag string being edited
  const [editVal,setEditVal]=useState("");
  const [newVal,setNewVal]=useState("");
  const allTags=[...new Set([...PRESETS,...custom])].sort();

  function saveCustom(list){setCustom(list);localStorage.setItem("signal_custom_tags",JSON.stringify(list));}
  function del(t){
    if(PRESETS.includes(t)){
      // "delete" a preset = add to hidden list so it won't appear in getTagList
      const hidden=JSON.parse(localStorage.getItem("signal_hidden_tags")||"[]");
      localStorage.setItem("signal_hidden_tags",JSON.stringify([...new Set([...hidden,t])]));
    }
    saveCustom(custom.filter(x=>x!==t));
  }
  function startEdit(t){setEditTag(t);setEditVal(t);}
  function commitEdit(oldT,newT){
    if(!newT.trim()||newT===oldT){setEditTag(null);return;}
    if(PRESETS.includes(oldT)){
      // rename preset = hide it and add custom
      const hidden=JSON.parse(localStorage.getItem("signal_hidden_tags")||"[]");
      localStorage.setItem("signal_hidden_tags",JSON.stringify([...new Set([...hidden,oldT])]));
      saveCustom([...custom.filter(x=>x!==newT.trim()),newT.trim()]);
    } else {
      saveCustom(custom.map(x=>x===oldT?newT.trim():x));
    }
    setEditTag(null);
  }
  function add(){if(!newVal.trim())return;saveCustom([...new Set([...custom,newVal.trim()])]);setNewVal("");}

  const inp2={background:"rgba(10,18,34,0.95)",border:"1px solid rgba(88,166,255,0.4)",borderRadius:3,color:"#cde",fontFamily:"inherit",fontSize:11,padding:"2px 6px",outline:"none"};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
        {allTags.map(t=>(
          <div key={t} style={{display:"flex",alignItems:"center",gap:1,background:"rgba(88,166,255,0.1)",border:"1px solid rgba(88,166,255,0.25)",borderRadius:4,padding:"2px 4px"}}>
            {editTag===t?(
              <input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)}
                onBlur={()=>commitEdit(t,editVal)}
                onKeyDown={e=>{if(e.key==="Enter")commitEdit(t,editVal);if(e.key==="Escape")setEditTag(null);}}
                style={{...inp2,width:80}}/>
            ):(
              <span style={{fontSize:11,color:"rgba(160,200,255,0.85)",padding:"0 2px"}}>{t}</span>
            )}
            <button onClick={()=>startEdit(t)} style={{background:"none",border:"none",color:"rgba(120,160,220,0.35)",fontSize:10,cursor:"pointer",padding:"0 2px",lineHeight:1}} title="Rename">✎</button>
            <button onClick={()=>del(t)} style={{background:"none",border:"none",color:"rgba(255,107,107,0.4)",fontSize:10,cursor:"pointer",padding:"0 2px",lineHeight:1}} title="Delete">✕</button>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:5,alignItems:"center"}}>
        <input value={newVal} onChange={e=>setNewVal(e.target.value)} placeholder="New tag…"
          onKeyDown={e=>e.key==="Enter"&&add()}
          style={{...inp2,width:120}}/>
        <button onClick={add} style={{fontSize:11,padding:"2px 10px",borderRadius:3,border:"1px solid rgba(88,166,255,0.4)",background:"rgba(88,166,255,0.15)",color:"#79c0ff",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Add</button>
        <span style={{fontSize:10,color:"rgba(120,160,220,0.3)",marginLeft:4}}>All tags are editable and deletable</span>
      </div>
    </div>
  );
}

export default function SettingsTab() {
  const [groups, setGroups] = useState(loadGroups);
  useEffect(()=>{ saveGroups(groups); },[groups]);
  const [editing, setEditing] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editAliases, setEditAliases] = useState("");
  const [editCategory, setEditCategory] = useState("grade");
  const [newLabel, setNewLabel] = useState("");
  const [newAliases, setNewAliases] = useState("");
  const [newCategory, setNewCategory] = useState("grade");
  const [showAdd, setShowAdd] = useState(false);

  const th={padding:"6px 12px",fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.55)",textTransform:"uppercase",letterSpacing:"0.08em",background:"rgba(14,22,40,0.98)",borderBottom:"1px solid rgba(58,130,246,0.12)",textAlign:"left",whiteSpace:"nowrap"};
  const td={padding:"7px 12px",fontSize:12,borderBottom:"1px solid rgba(255,255,255,0.04)",verticalAlign:"middle"};
  const inp={background:"rgba(10,18,34,0.95)",border:"1px solid rgba(88,166,255,0.4)",borderRadius:4,color:"#cde",fontFamily:"inherit",fontSize:12,padding:"5px 8px",outline:"none",width:"100%",boxSizing:"border-box"};
  const sel={background:"rgba(10,18,34,0.95)",border:"1px solid rgba(88,166,255,0.4)",borderRadius:4,color:"#cde",fontFamily:"inherit",fontSize:12,padding:"5px 8px",outline:"none",colorScheme:"dark"};
  const btn=(active)=>({fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:4,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(active?"rgba(88,166,255,0.6)":"rgba(120,160,220,0.25)"),background:active?"rgba(88,166,255,0.18)":"rgba(15,25,50,0.8)",color:active?"#d9ecff":"#7aa0c8"});

  function startEdit(g){setEditing(g.id);setEditLabel(g.label);setEditAliases(g.aliases.join(", "));setEditCategory(g.category||"grade");}
  function saveEdit(){
    setGroups(prev=>prev.map(g=>g.id===editing?{...g,label:editLabel.trim(),category:editCategory,aliases:editAliases.split(",").map(s=>s.trim()).filter(Boolean)}:g));
    setEditing(null);
  }
  function del(id){setGroups(prev=>prev.filter(g=>g.id!==id));}
  function addGroup(){
    if(!newLabel.trim())return;
    setGroups(prev=>[...prev,{id:"grp_"+Date.now(),label:newLabel.trim(),category:newCategory,aliases:newAliases.split(",").map(s=>s.trim()).filter(Boolean)}]);
    setNewLabel("");setNewAliases("");setNewCategory("grade");setShowAdd(false);
  }

  // Group by category
  const usedCats=[...new Set(groups.map(g=>g.category||"grade"))];
  const cats=CATEGORIES.filter(c=>usedCats.includes(c.id));

  return(
    <div style={{display:"flex",flexDirection:"column",gap:24,maxWidth:1000}}>
      <div style={{borderBottom:"1px solid rgba(58,130,246,0.14)",paddingBottom:10}}>
        <div style={{fontSize:12,fontWeight:700,color:"rgba(120,160,220,0.7)",textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:4}}>Cargo Filter Groups</div>
        <div style={{fontSize:12,color:"rgba(180,200,230,0.45)"}}>Each group creates a filter button in the Cargoes panel. Pick a category to control which field is matched against your aliases.</div>
      </div>

      {cats.map(cat=>(
        <div key={cat.id}>
          <div style={{fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>
            {cat.label} <span style={{fontWeight:400,color:"rgba(120,160,220,0.3)",textTransform:"none"}}>— {cat.hint}</span>
          </div>
          <div style={{border:"1px solid rgba(58,130,246,0.18)",borderRadius:7,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr>
                <th style={{...th,width:120}}>Label</th>
                <th style={th}>Aliases</th>
                <th style={{...th,width:140}}>Actions</th>
              </tr></thead>
              <tbody>
                {groups.filter(g=>(g.category||"grade")===cat.id).map((g,i)=>(
                  <tr key={g.id} style={{background:i%2===0?"rgba(10,18,34,0.95)":"rgba(16,28,52,0.85)"}}>
                    {editing===g.id?(
                      <>
                        <td style={td} colSpan={2}>
                          <div style={{display:"flex",flexDirection:"column",gap:6}}>
                            <div style={{display:"flex",gap:6}}>
                              <div style={{flex:"0 0 150px"}}>
                                <div style={{fontSize:10,color:"rgba(120,160,220,0.5)",marginBottom:3}}>Label</div>
                                <input value={editLabel} onChange={e=>setEditLabel(e.target.value)} style={inp} placeholder="Button label"/>
                              </div>
                              <div style={{flex:"0 0 150px"}}>
                                <div style={{fontSize:10,color:"rgba(120,160,220,0.5)",marginBottom:3}}>Category</div>
                                <select value={editCategory} onChange={e=>setEditCategory(e.target.value)} style={sel}>
                                  {CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                              </div>
                            </div>
                            <div>
                              <div style={{fontSize:10,color:"rgba(120,160,220,0.5)",marginBottom:3}}>Aliases (comma-separated)</div>
                              <input value={editAliases} onChange={e=>setEditAliases(e.target.value)} style={inp} placeholder="e.g. ARA, Rotterdam, Amsterdam"/>
                            </div>
                          </div>
                        </td>
                        <td style={td}><div style={{display:"flex",gap:5}}>
                          <button onClick={saveEdit} style={{...btn(true),color:"#6ee7b7"}}>✓ Save</button>
                          <button onClick={()=>setEditing(null)} style={btn(false)}>Cancel</button>
                        </div></td>
                      </>
                    ):(
                      <>
                        <td style={{...td,fontWeight:600,color:"rgba(210,225,245,0.85)"}}>{g.label}</td>
                        <td style={td}>
                          <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                            {g.aliases.map(a=>(
                              <span key={a} style={{background:"rgba(88,166,255,0.10)",border:"1px solid rgba(88,166,255,0.2)",borderRadius:3,padding:"1px 6px",fontSize:11,color:"rgba(180,210,250,0.7)"}}>{a}</span>
                            ))}
                            {g.aliases.length===0&&<span style={{color:"rgba(120,160,220,0.3)",fontStyle:"italic"}}>no aliases</span>}
                          </div>
                        </td>
                        <td style={td}><div style={{display:"flex",gap:5}}>
                          <button onClick={()=>startEdit(g)} style={btn(false)}>✏ Edit</button>
                          <button onClick={()=>del(g.id)} style={{...btn(false),color:"#f87171",borderColor:"rgba(248,113,113,0.35)"}}>✕ Delete</button>
                        </div></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Add new group form */}
      <div style={{border:"1px solid rgba(58,130,246,0.18)",borderRadius:7,padding:16,background:"rgba(8,16,32,0.6)"}}>
        <div style={{fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>+ Add new filter group</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div style={{flex:"0 0 140px"}}>
            <div style={{fontSize:10,color:"rgba(120,160,220,0.5)",marginBottom:3}}>Category</div>
            <select value={newCategory} onChange={e=>setNewCategory(e.target.value)} style={sel}>
              {CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div style={{flex:"0 0 150px"}}>
            <div style={{fontSize:10,color:"rgba(120,160,220,0.5)",marginBottom:3}}>Button label</div>
            <input value={newLabel} onChange={e=>setNewLabel(e.target.value)} style={inp} placeholder="e.g. UKC Ports"/>
          </div>
          <div style={{flex:1,minWidth:220}}>
            <div style={{fontSize:10,color:"rgba(120,160,220,0.5)",marginBottom:3}}>Aliases (comma-separated)</div>
            <input value={newAliases} onChange={e=>setNewAliases(e.target.value)} style={inp} placeholder="e.g. ARA, Rotterdam, Amsterdam"
              onKeyDown={e=>e.key==="Enter"&&addGroup()}/>
          </div>
          <button onClick={addGroup} style={{...btn(true),padding:"6px 14px",fontSize:12,whiteSpace:"nowrap"}}>Add group</button>
        </div>
      </div>

      {/* Custom Tags section */}
      <div>
        <div style={{fontSize:10,fontWeight:700,color:"rgba(120,160,220,0.5)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>
          Tags <span style={{fontWeight:400,color:"rgba(120,160,220,0.3)",textTransform:"none"}}>— used in the Tag column, Tag filter, and Tag on parse</span>
        </div>
        <div style={{border:"1px solid rgba(58,130,246,0.18)",borderRadius:7,padding:"12px 16px",background:"rgba(10,18,34,0.6)"}}>
          <CustomTagsEditor/>
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",borderTop:"1px solid rgba(58,130,246,0.12)",paddingTop:16}}>
        <button onClick={()=>setGroups(defaultGroups())} style={{...btn(false),padding:"5px 14px",fontSize:12,color:"rgba(248,113,113,0.7)",borderColor:"rgba(248,113,113,0.3)"}}>Reset to defaults</button>
        <span style={{fontSize:10,color:"rgba(120,160,220,0.4)"}}>Preview:</span>
        {groups.map(g=>(
          <span key={g.id} style={{fontSize:11,fontWeight:600,padding:"2px 10px",borderRadius:4,border:"1px solid rgba(88,166,255,0.3)",background:"rgba(88,166,255,0.1)",color:"#c8deff",fontFamily:"inherit"}}>{g.label}</span>
        ))}
      </div>
    </div>
  );
}
