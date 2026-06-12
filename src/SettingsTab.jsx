import React, { useState, useEffect } from "react";
import { C } from "./constants";

const INTERUKC_KEY = "signal_interukc_config";
const DEFAULT_CONFIG = {
  dwtMin: 15, dwtMax: 21,
  owners: ["Stenersen","Furetank","Carl F","Maersk","Harren","Navix","Donso","Relet"],
  reletsFrom: ["Exxon","Shell","Circle K","Essar","Total","CSS SA"],
};

// Shared section card wrapper — matches Tag Management styling
function SectionCard({title,subtitle,children}){
  return(
    <div style={{background:C.bg3,border:"1px solid "+C.bd2,borderRadius:8,padding:"14px 16px",maxWidth:680}}>
      <div style={{borderBottom:"1px solid rgba(58,130,246,0.14)",paddingBottom:10,marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:700,color:"rgba(120,160,220,0.7)",textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:4}}>{title}</div>
        {subtitle&&<div style={{fontSize:12,color:"rgba(180,200,230,0.45)"}}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

// Pill-style chip with delete, matching Tag Management row aesthetic
function Chip({label,onDelete}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:2,background:C.bg2,border:"1px solid "+C.bd2,borderRadius:6,padding:"4px 8px"}}>
      <span style={{fontSize:12,color:"rgba(160,200,255,0.85)",fontWeight:600}}>{label}</span>
      {onDelete&&<button onClick={onDelete} style={{background:"none",border:"none",color:"rgba(255,107,107,0.5)",fontSize:11,cursor:"pointer",padding:"0 2px",lineHeight:1}}>✕</button>}
    </div>
  );
}

const inp={background:"rgba(10,18,34,0.95)",border:"1px solid "+C.bd2,borderRadius:5,color:"#cde",fontFamily:"inherit",fontSize:12,padding:"5px 8px",outline:"none",width:"100%",boxSizing:"border-box"};
const sel={...inp,colorScheme:"dark"};

function InterUKCEditor(){
  const [cfg,setCfg]=useState(()=>{
    try{return JSON.parse(localStorage.getItem(INTERUKC_KEY)||"null")||DEFAULT_CONFIG;}
    catch{return DEFAULT_CONFIG;}
  });
  function save(next){setCfg(next);localStorage.setItem(INTERUKC_KEY,JSON.stringify(next));}

  return(
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* DWT range */}
      <div style={{display:"flex",gap:12,alignItems:"flex-end"}}>
        <div style={{flex:"0 0 110px"}}>
          <div style={{fontSize:11,color:C.faint,marginBottom:4}}>DWT min (k)</div>
          <input type="number" value={cfg.dwtMin} onChange={e=>save({...cfg,dwtMin:Number(e.target.value)})} style={inp}/>
        </div>
        <div style={{flex:"0 0 110px"}}>
          <div style={{fontSize:11,color:C.faint,marginBottom:4}}>DWT max (k)</div>
          <input type="number" value={cfg.dwtMax} onChange={e=>save({...cfg,dwtMax:Number(e.target.value)})} style={inp}/>
        </div>
        <button onClick={()=>{if(window.confirm("Reset Inter UKC pool to defaults? This will overwrite your current operator/relet lists.")) save(DEFAULT_CONFIG);}}
          style={{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:5,border:"1px solid rgba(255,107,107,0.3)",background:"transparent",color:"rgba(255,107,107,0.6)",cursor:"pointer",fontFamily:"inherit"}}>Reset defaults</button>
      </div>
      {/* Owners / Relets */}
      {[["owners","Operators / Owners (contains match)","operator"],["reletsFrom","Relets from (contains match)","company"]].map(([field,label,ph])=>(
        <div key={field}>
          <div style={{fontSize:11,color:C.faint,marginBottom:6}}>{label}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
            {cfg[field].map(name=>(
              <Chip key={name} label={name} onDelete={()=>{if(window.confirm(`Remove "${name}" from this list?`)) save({...cfg,[field]:cfg[field].filter(x=>x!==name)});}}/>
            ))}
          </div>
          <input placeholder={`Add ${ph}…`} style={inp}
            onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){save({...cfg,[field]:[...cfg[field],e.target.value.trim()]});e.target.value="";}}}/>
        </div>
      ))}
    </div>
  );
}

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

// Single filter-group row, styled like a Tag Management row
function GroupRow({g,editing,onStartEdit,onSaveEdit,onCancelEdit,onDelete,editLabel,setEditLabel,editAliases,setEditAliases,editCategory,setEditCategory}){
  const isEditing=editing===g.id;
  if(isEditing){
    return(
      <div style={{display:"flex",flexDirection:"column",gap:8,padding:"8px",background:C.bg2,borderRadius:6,border:"1px solid "+C.bd2}}>
        <div style={{display:"flex",gap:8}}>
          <div style={{flex:"0 0 160px"}}>
            <div style={{fontSize:11,color:C.faint,marginBottom:3}}>Label</div>
            <input value={editLabel} onChange={e=>setEditLabel(e.target.value)} style={inp} placeholder="Button label"/>
          </div>
          <div style={{flex:"0 0 160px"}}>
            <div style={{fontSize:11,color:C.faint,marginBottom:3}}>Category</div>
            <select value={editCategory} onChange={e=>setEditCategory(e.target.value)} style={sel}>
              {CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div style={{fontSize:11,color:C.faint,marginBottom:3}}>Aliases (comma-separated)</div>
          <input value={editAliases} onChange={e=>setEditAliases(e.target.value)} style={inp} placeholder="e.g. ARA, Rotterdam, Amsterdam"/>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={onSaveEdit} style={{fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:5,border:"1px solid rgba(110,231,183,0.4)",background:"rgba(110,231,183,0.12)",color:"#6ee7b7",cursor:"pointer",fontFamily:"inherit"}}>✓ Save</button>
          <button onClick={onCancelEdit} style={{fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:5,border:"1px solid "+C.bd2,background:"transparent",color:C.faint,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
        </div>
      </div>
    );
  }
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",background:C.bg2,borderRadius:6,border:"1px solid "+C.bd2}}>
      <span style={{width:120,flexShrink:0,fontSize:12,fontWeight:600,color:"rgba(210,225,245,0.85)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.label}</span>
      <div style={{width:1,height:18,background:C.bd2,flexShrink:0}}/>
      <div style={{flex:1,display:"flex",flexWrap:"wrap",gap:4}}>
        {g.aliases.map(a=>(
          <span key={a} style={{background:"rgba(88,166,255,0.10)",border:"1px solid rgba(88,166,255,0.2)",borderRadius:4,padding:"2px 7px",fontSize:11,color:"rgba(180,210,250,0.7)"}}>{a}</span>
        ))}
        {g.aliases.length===0&&<span style={{color:C.faint,fontStyle:"italic",fontSize:11}}>no aliases</span>}
      </div>
      <div style={{width:1,height:18,background:C.bd2,flexShrink:0}}/>
      <div style={{display:"flex",gap:10,flexShrink:0}}>
        <button onClick={onStartEdit} style={{background:"none",border:"none",color:"rgba(120,160,220,0.4)",fontSize:11,cursor:"pointer",padding:"0 4px"}} title="Edit">✎</button>
        <button onClick={onDelete} style={{background:"none",border:"none",color:"rgba(255,107,107,0.4)",fontSize:11,cursor:"pointer",padding:"0 4px"}} title="Delete">✕</button>
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

  function startEdit(g){setEditing(g.id);setEditLabel(g.label);setEditAliases(g.aliases.join(", "));setEditCategory(g.category||"grade");}
  function saveEdit(){
    setGroups(prev=>prev.map(g=>g.id===editing?{...g,label:editLabel.trim(),category:editCategory,aliases:editAliases.split(",").map(s=>s.trim()).filter(Boolean)}:g));
    setEditing(null);
  }
  function del(id,label){
    if(window.confirm(`Delete filter group "${label}"?`)) setGroups(prev=>prev.filter(g=>g.id!==id));
  }
  function addGroup(){
    if(!newLabel.trim())return;
    setGroups(prev=>[...prev,{id:"grp_"+Date.now(),label:newLabel.trim(),category:newCategory,aliases:newAliases.split(",").map(s=>s.trim()).filter(Boolean)}]);
    setNewLabel("");setNewAliases("");setNewCategory("grade");
  }

  const usedCats=[...new Set(groups.map(g=>g.category||"grade"))];
  const cats=CATEGORIES.filter(c=>usedCats.includes(c.id));

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16,padding:"0 0 20px",fontFamily:"Inter,sans-serif"}}>
      <SectionCard title="Inter UKC Pool" subtitle="Operators and DWT range used by the Inter UKC filter.">
        <InterUKCEditor/>
      </SectionCard>

      <SectionCard title="Cargo Filter Groups" subtitle="Each group creates a filter button in the Cargoes panel. Pick a category to control which field is matched against your aliases.">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {cats.map(cat=>(
            <div key={cat.id}>
              <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>
                {cat.label} <span style={{fontWeight:400,color:"rgba(120,160,220,0.3)",textTransform:"none"}}>— {cat.hint}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {groups.filter(g=>(g.category||"grade")===cat.id).map(g=>(
                  <GroupRow key={g.id} g={g}
                    editing={editing}
                    onStartEdit={()=>startEdit(g)}
                    onSaveEdit={saveEdit}
                    onCancelEdit={()=>setEditing(null)}
                    onDelete={()=>del(g.id,g.label)}
                    editLabel={editLabel} setEditLabel={setEditLabel}
                    editAliases={editAliases} setEditAliases={setEditAliases}
                    editCategory={editCategory} setEditCategory={setEditCategory}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Add new group */}
          <div style={{display:"flex",flexDirection:"column",gap:8,padding:"8px",background:C.bg2,borderRadius:6,border:"1px solid "+C.bd2}}>
            <div style={{fontSize:11,fontWeight:700,color:C.faint,textTransform:"uppercase",letterSpacing:"0.06em"}}>+ Add new filter group</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div style={{flex:"0 0 140px"}}>
                <div style={{fontSize:11,color:C.faint,marginBottom:3}}>Category</div>
                <select value={newCategory} onChange={e=>setNewCategory(e.target.value)} style={sel}>
                  {CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div style={{flex:"0 0 150px"}}>
                <div style={{fontSize:11,color:C.faint,marginBottom:3}}>Button label</div>
                <input value={newLabel} onChange={e=>setNewLabel(e.target.value)} style={inp} placeholder="e.g. UKC Ports"/>
              </div>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontSize:11,color:C.faint,marginBottom:3}}>Aliases (comma-separated)</div>
                <input value={newAliases} onChange={e=>setNewAliases(e.target.value)} style={inp} placeholder="e.g. ARA, Rotterdam, Amsterdam"
                  onKeyDown={e=>e.key==="Enter"&&addGroup()}/>
              </div>
              <button onClick={addGroup} style={{fontSize:12,fontWeight:600,padding:"6px 14px",borderRadius:5,border:"1px solid rgba(88,166,255,0.5)",background:"rgba(88,166,255,0.15)",color:"#9ec5ff",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>Add group</button>
            </div>
          </div>

          {/* Reset + preview */}
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",paddingTop:8,borderTop:"1px solid "+C.bd2}}>
            <button onClick={()=>{if(window.confirm("Reset all cargo filter groups to defaults? This removes any custom groups you added.")) setGroups(defaultGroups());}}
              style={{fontSize:11,fontWeight:600,padding:"4px 12px",borderRadius:5,border:"1px solid rgba(255,107,107,0.3)",background:"transparent",color:"rgba(255,107,107,0.6)",cursor:"pointer",fontFamily:"inherit"}}>Reset to defaults</button>
            <span style={{fontSize:11,color:C.faint}}>Preview:</span>
            {groups.map(g=>(
              <span key={g.id} style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:5,border:"1px solid rgba(88,166,255,0.3)",background:"rgba(88,166,255,0.1)",color:"#c8deff",fontFamily:"inherit"}}>{g.label}</span>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
