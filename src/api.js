import { supabase } from "./supabaseclient";

// ─── Anthropic API ────────────────────────────────────────────────────────────
async function apiCall(sys,msgs){
  const res = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
      "anthropic-version":"2023-06-01",
      "anthropic-dangerous-direct-browser-access":"true"
    },
    body:JSON.stringify({
      model:"claude-sonnet-4-20250514",
      max_tokens:4000,
      system:sys,
      messages:msgs
    })
  });

  const d = await res.json();
  if(!res.ok) throw new Error("API "+res.status+": "+(d?.error?.message||"?"));
  return d.content.map(b=>b.text||"").join("");
}
async function ocrImage(img){return apiCall("OCR engine. Transcribe all text faithfully row by row. Plain text only.",[{role:"user",content:[{type:"image",source:{type:"base64",media_type:img.mime,data:img.base64}},{type:"text",text:"Transcribe all text: vessel names, ports, dates, numbers, freight."}]}]);}
async function parsePos(text,img,known){
  let t=text;if(img){const o=await ocrImage(img);t=o+(text&&text!=="(img)"?"\n\n"+text:"");}
  const kv=known.length?"Known vessels: "+known.join(", "):"";
  const isEdit=/^(update|change|set)\b/i.test(t.trim());
  const sys=isEdit
    ?"Maritime vessel editor. Output ONLY a raw JSON array. No markdown, no explanation, no code fences."
    :"Maritime vessel position parser. Output ONLY a raw JSON array. No markdown, no explanation, no code fences.";
  const prompt=isEdit
    ?"Extract the field update from this instruction into a JSON array with ONE vessel object. Include vessel name and ONLY the fields being changed, set everything else to null. Fields: {vessel,operator,dwt,built,loa,beam,cbm,date,openPort,comment,spec:{iceClass,fuel}}. Never put the instruction text in comment. Output ONLY the JSON array.\n\nInstruction:\n"+t
    :"Parse vessel positions into a JSON array.\n"+kv+"\n\nEach item must have these fields (null if unknown):\n{\n  vessel: string (ship name - the vessel name comes before words like 'open'/'avail'/'dely'/'eta'/'space', e.g. 'fure viken open thames' means vessel='Fure Viken', 'fure viken space ara 15th' means vessel='Fure Viken' with openPort=ARA. Capitalise each word. NEVER leave vessel null if a name is present.),\n  operator: string (commercial operator/manager - NOT the owner, NOT 'TBN'. Extract from phrases like 'opr: X', 'managed by X', company names),\n  built: string (year e.g. '2007'),\n  dwt: string (deadweight tons),\n  cbm: string,\n  date: string (open date ALWAYS in 'DD Mon' format e.g. '05 Mar'. If only a day number given like '25th' or '25' use current month Mar. If 'ppt', 'prompt', or 'spot' use today's date "+new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short"})+". Never leave as bare number.),\n  openPort: string (port where vessel opens, e.g. 'Rotterdam', 'ARA', 'Humber'. Use EMPLOYED if fixed/on subs/in program),\n  comment: string,\n  spec: { fuel: string, iceClass: string }\n}\n\nOutput ONLY the JSON array.\n\nData:\n"+t;
  const raw=await apiCall(sys,[{role:"user",content:prompt}]);
  return xJSON(raw);
}

async function parseCargo(text,img,known){
  let t=text;if(img){const o=await ocrImage(img);t=o+(text&&text!=="(img)"?"\n\n"+text:"");}
  const kv=known.length?"Known vessels: "+known.join(", "):"";
  const sys308="Maritime cargo fixture parser. Output ONLY raw JSON array, no markdown, no explanation.";
  const mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][new Date().getMonth()];
  const prompt308="Parse cargo fixtures to JSON. "+kv+"\n\nFields: {vessel,charterer,cargo,qty,load,disch,from,to,freight,status,comment}\n\nRules:\n- qty: kt e.g. '15kt' or '7-10kt'. 12000mt->12kt.\n- from/to: laycan dates. ALWAYS expand to 'DD Mon'. If only day numbers like '13-15' use current month ("+mo+") -> from:'13 "+mo+"' to:'15 "+mo+"'. Never leave as bare numbers.\n- Ports: 'X - Y' or 'X to Y' means load=X disch=Y. The port AFTER the dash/to is the DISCHARGE port.\n- charterer: 'acct X' or 'a/c X' means charterer=X. Capitalise each word: eni->Eni, bp->BP, exxon->Exxon.\n- cargo: expand abbreviations: nap->Naphtha, go->Gasoil, hvo->HVO, lco->LCO, jet->Jet, gtl->GTL, fo->Fuel Oil.\n- status: FIXED, SUBS, or FAILED only, blank if unknown.\n- vessel: blank if TBN or not named.\n- Only include fields present in input.\n\nData:\n"+t;
  const raw=await apiCall(sys308,[{role:"user",content:prompt308}]);
  return xJSON(raw);
}

// re-export for use in other modules
export { apiCall, ocrImage, parsePos, parseCargo };
