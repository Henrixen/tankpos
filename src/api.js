import {logUsage,calcCost} from "./aiUsage";

function xJSON(raw){if(!raw)throw new Error("Empty");const cl=raw.trim().replace(/^```[\w]*/,"").replace(/```/g,"").trim();try{return JSON.parse(cl);}catch(_){}const s=cl.indexOf("["),e=cl.lastIndexOf("]");if(s>=0&&e>s){try{return JSON.parse(cl.slice(s,e+1));}catch(_){}}throw new Error("Parse failed: "+raw.slice(0,60));}

// ─── Anthropic API ────────────────────────────────────────────────────────────
const inFlight=new Map(),parseCache=new Map();
function parserMessages(prompt,img){return [{role:"user",content:img?[{type:"image",source:{type:"base64",media_type:img.mime,data:img.base64}},{type:"text",text:prompt}]:prompt}];}
function relevantVessels(text,known=[]){
 const normalized=String(text||"").toLowerCase().replace(/[^a-z0-9]+/g," ");
 const words=new Set(normalized.split(" ").filter(w=>w.length>=3));
 return [...new Set(known)].filter(name=>{const n=String(name).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();return n.length>=3&&(normalized.includes(n)||n.split(" ").filter(w=>w.length>=3).some(w=>words.has(w)));}).slice(0,30);
}
async function apiCall(sys,msgs,options={}){
 const payload={model:"claude-sonnet-4-6",max_tokens:4000,system:sys,messages:msgs};
 const actor=(()=>{try{return localStorage.getItem("signal_user")||"Unidentified";}catch{return "Unidentified";}})();
 const serialized=JSON.stringify(payload);
 const digest=globalThis.crypto?.subtle?Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(actor+serialized)))).map(x=>x.toString(16).padStart(2,"0")).join(""):actor+serialized;
 const cacheable=!!options.cache;
 const cached=cacheable?parseCache.get(digest):null;
 if(cached&&Date.now()-cached.at<5*60*1000)return cached.text;
 if(inFlight.has(digest))return inFlight.get(digest);
 const task=(async()=>{
  const started=Date.now(),id=globalThis.crypto?.randomUUID?.()||String(started)+Math.random();
  const inputChars=String(sys||"").length+msgs.reduce((sum,m)=>sum+(typeof m.content==="string"?m.content.length:(m.content||[]).filter(x=>x.type==="text").reduce((n,x)=>n+String(x.text||"").length,0)),0);
  const hasImage=msgs.some(m=>Array.isArray(m.content)&&m.content.some(x=>x.type==="image"));
  let res,d,logged=false;
  try{
   res=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json","X-Client-Request-Id":id,"X-AI-Action":options.action||"ai-request"},body:serialized});
   d=await res.json().catch(()=>null);
   const available=!!d?.usage&&typeof d.usage.input_tokens==="number"&&typeof d.usage.output_tokens==="number";
   const record={id,user:actor,action:options.action||"ai-request",endpoint:"/api/claude",model:d?.model||null,requested_model:payload.model,input_tokens:d?.usage?.input_tokens??null,output_tokens:d?.usage?.output_tokens??null,cache_read_input_tokens:d?.usage?.cache_read_input_tokens??null,cache_creation_input_tokens:d?.usage?.cache_creation_input_tokens??null,usage_available:available,cost_usd:available?calcCost(d.model,d.usage):null,status:res.status,request_id:res.headers?.get?.("request-id")||d?.id||id,duration_ms:Date.now()-started,input_chars:inputChars,image:hasImage,error:res.ok?null:d?.error?.message||d?.error||"Request failed"};
   await logUsage(record);logged=true;
   if(!res.ok)throw new Error("API "+res.status+": "+(d?.error?.message||d?.error||"Request failed"));
   if(d?.stop_reason==="max_tokens")throw new Error("Claude reached the output limit. Use a smaller batch; no automatic retry was sent.");
   if(!Array.isArray(d?.content))throw new Error("The server returned no Claude response. Check /api/claude.");
   const text=d.content.map(b=>b.text||"").join("");
   if(options.expectJSON)xJSON(text);
   if(cacheable){parseCache.set(digest,{at:Date.now(),text});if(parseCache.size>30)parseCache.delete(parseCache.keys().next().value);}
   return text;
  }catch(error){
   if(!logged)await logUsage({id,user:actor,action:options.action||"ai-request",endpoint:"/api/claude",requested_model:payload.model,model:null,input_tokens:null,output_tokens:null,usage_available:false,cost_usd:null,status:res?.status||"network error",request_id:id,duration_ms:Date.now()-started,input_chars:inputChars,image:hasImage,error:error.message});
   throw error;
  }
 })();
 inFlight.set(digest,task);
 try{return await task;}finally{inFlight.delete(digest);}
}

async function ocrImage(img){return apiCall("OCR engine. Transcribe all text faithfully row by row. Plain text only.",[{role:"user",content:[{type:"image",source:{type:"base64",media_type:img.mime,data:img.base64}},{type:"text",text:"Transcribe all text: vessel names, ports, dates, numbers, freight."}]}],{action:"image-ocr",cache:true});}
async function parsePos(text,img,known=[]){
  const t=String(text==="(img)"?"":text||"");
  const candidates=relevantVessels(t,known);
  const kv=candidates.length?"Relevant vessel names: "+candidates.join(", "):"";
  const isEdit=/^(update|change|set)\b/i.test(t.trim());
  const sys=isEdit
    ?"Maritime vessel editor. Output ONLY a raw JSON array. No markdown, no explanation, no code fences."
    :"Maritime vessel position parser. Output ONLY a raw JSON array. No markdown, no explanation, no code fences.";
  const prompt=isEdit
    ?"Extract the field update from this instruction into a JSON array with ONE vessel object. Include vessel name and ONLY the fields being changed, set everything else to null. Fields: {vessel,operator,dwt,built,loa,beam,cbm,date,openPort,comment,spec:{iceClass,fuel}}. Never put the instruction text in comment. Output ONLY the JSON array.\n\nInstruction:\n"+t
    :"Parse vessel positions into a JSON array.\n"+kv+"\n\nEach item must have these fields (null if unknown):\n{\n  vessel: string (ship name - the vessel name comes before words like 'open'/'avail'/'dely'/'eta'/'space', e.g. 'fure viken open thames' means vessel='Fure Viken', 'fure viken space ara 15th' means vessel='Fure Viken' with openPort=ARA. Capitalise each word. NEVER leave vessel null if a name is present.),\n  operator: string (commercial operator/manager - NOT the owner, NOT 'TBN'. Extract from phrases like 'opr: X', 'managed by X', company names),\n  built: string (year e.g. '2007'),\n  dwt: string (deadweight tons),\n  cbm: string,\n  date: string (open date ALWAYS in 'DD Mon' format e.g. '05 Mar'. If only a day number is given like '25th' or '25', infer month logically: if that day is still ahead in the current list month, use current month; if that day has already passed in the current list month, use NEXT month. Examples: list dated 31 Mar and text says 8th -> '08 Apr'; list dated 20 Mar and text says 8th -> '08 Apr'; list dated 05 Mar and text says 8th -> '08 Mar'. If 'ppt', 'prompt', or 'spot' use today's date "+new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short"})+". Never leave as bare number.),\n  openPort: string (port where vessel opens, e.g. 'Rotterdam', 'ARA', 'Humber'. Use EMPLOYED if fixed/on subs/in program),\n  comment: string,\n  spec: { fuel: string, iceClass: string }\n}\n\nOutput ONLY the JSON array.\n\nData:\n"+t;
  const raw=await apiCall(sys,parserMessages(prompt,img),{action:img?"positions-image":"positions-text",cache:true,expectJSON:true});
  return xJSON(raw);
}

async function parseCargo(text,img,known=[]){
  const t=String(text==="(img)"?"":text||"");
  const candidates=relevantVessels(t,known);
  const kv=candidates.length?"Relevant vessel names: "+candidates.join(", "):"";
  const sys308="Maritime cargo fixture parser. Output ONLY raw JSON array, no markdown, no explanation.";
  const mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][new Date().getMonth()];
  const prompt308="Parse cargo fixtures to JSON. "+kv+"\n\nFields: {vessel,charterer,cargo,qty,load,disch,from,to,freight,status,comment}\n\nRules:\n- qty: kt e.g. '15kt' or '7-10kt'. 12000mt->12kt.\n- from/to: laycan dates. ALWAYS expand to 'DD Mon'. If only day numbers like '13-15' use current month ("+mo+") -> from:'13 "+mo+"' to:'15 "+mo+"'. Never leave as bare numbers.\n- Ports: 'X - Y' or 'X to Y' means load=X disch=Y. The port AFTER the dash/to is the DISCHARGE port.\n- charterer: 'acct X' or 'a/c X' means charterer=X. Capitalise each word: eni->Eni, bp->BP, exxon->Exxon.\n- cargo: expand abbreviations: nap->Naphtha, go->Gasoil, hvo->HVO, lco->LCO, jet->Jet, gtl->GTL, fo->Fuel Oil.\n- status: FIXED, SUBS, or FAILED only, blank if unknown.\n- vessel: blank if TBN or not named.\n- Only include fields present in input.\n\nData:\n"+t;
  const raw=await apiCall(sys308,parserMessages(prompt308,img),{action:img?"cargoes-image":"cargoes-text",cache:true,expectJSON:true});
  return xJSON(raw);
}

// re-export for use in other modules
export { apiCall, ocrImage, parsePos, parseCargo, relevantVessels };
