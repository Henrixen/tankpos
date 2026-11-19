// Shared editable maritime region configuration. Coordinates are [longitude, latitude].
export const SEA_REGION_KEY="signal_maritime_regions_v1";
export const DEFAULT_POSITION_SEA_AREAS=[
 {id:"NWE",label:"North Sea",coords:[[1.2,60.8],[4.7,61.4],[7.1,59.7],[7.5,57.7],[8.4,56.2],[7.8,54.5],[6.3,53.5],[4.4,52.5],[2.3,52.1],[1.0,53.1],[0.5,55.4],[1.2,58.1],[1.2,60.8]],center:[4.4,56.3]},
 {id:"UKC",label:"British Isles",coords:[[-15.8,55.4],[-12.0,58.8],[-8.5,59.9],[-5.6,58.8],[-4.6,56.0],[-3.2,54.0],[-1.0,52.1],[0.8,50.4],[-2.0,49.5],[-7.4,49.4],[-12.5,50.5],[-15.8,55.4]],center:[-9.2,54.1]},
 {id:"SKAW",label:"Skaw",coords:[[7.5,58.2],[8.2,57.3],[9.7,57.0],[11.2,57.3],[12.2,58.2],[11.0,59.0],[9.0,59.1],[7.5,58.2]],center:[9.7,58.0]},
 {id:"BALTIC",label:"Baltic Sea",coords:[[10.8,55.3],[12.3,54.7],[15.3,54.6],[18.2,54.5],[20.2,55.1],[22.5,56.3],[24.6,57.7],[24.6,59.3],[22.1,60.2],[19.0,59.4],[17.0,58.7],[15.0,57.4],[12.5,56.5],[10.8,55.3]],center:[18.7,57.1]},
 {id:"BISCAY",label:"Biscay",coords:[[-10.7,48.2],[-7.2,48.8],[-3.0,48.1],[-1.0,46.5],[-1.2,44.3],[-2.3,43.3],[-6.0,43.4],[-9.8,44.0],[-10.7,48.2]],center:[-5.6,46.0]},
 {id:"WMED",label:"West Med",coords:[[-5.7,36.0],[-2.2,35.5],[2.4,36.0],[6.5,37.1],[9.4,38.1],[10.9,40.5],[9.5,42.1],[6.0,43.3],[3.0,42.5],[-0.8,40.6],[-4.5,37.3],[-5.7,36.0]],center:[3.6,39.3]},
 {id:"EMED",label:"East Med",coords:[[17.4,35.0],[20.8,34.0],[24.2,33.8],[28.1,34.0],[32.8,33.5],[35.5,34.5],[35.3,36.6],[32.3,36.4],[29.0,37.1],[26.4,37.3],[23.6,36.5],[20.0,37.1],[17.4,35.0]],center:[27.1,35.1]},
 {id:"BLACKSEA",label:"Black Sea",coords:[[28.5,42.0],[31.5,41.3],[35.4,41.5],[39.1,41.8],[41.0,43.0],[39.6,44.5],[36.6,45.7],[32.5,45.8],[29.3,44.4],[28.5,42.0]],center:[35.0,43.6]}
];
export const DEFAULT_PORT_ALIASES={
 NWE:["ARA","ROTTERDAM","AMSTERDAM","ANTWERP","THAMES","TEES","HAMBURG","LE HAVRE","DUNKIRK","NWE"],
 UKC:["UKC","WCUK","ECUK","LIVERPOOL","MILFORD HAVEN","IMMINGHAM","GRANGEMOUTH","TEES","THAMES"],
 SKAW:["SKAW","SKAGEN","FREDERICIA","AARHUS","FREDERIKSHAVN","GOTHENBURG","OSLO"],
 BALTIC:["BALTIC","GDANSK","GDYNIA","RIGA","TALLINN","KLAIPEDA","STOCKHOLM","HELSINKI","VENTSPILS"],
 BISCAY:["BISCAY","BILBAO","GIJON","SANTANDER","BORDEAUX","LA PALLICE","NANTES","FERROL"],
 WMED:["WEST MED","WMED","MARSEILLE","FOS","LAVERA","GENOA","BARCELONA","VALENCIA","ALGECIRAS"],
 EMED:["EAST MED","EMED","PIRAEUS","ISTANBUL","IZMIT","MERSIN","ALEXANDRIA","HAIFA","RIJEKA"],
 BLACKSEA:["BLACK SEA","BLACKSEA","CONSTANTA","NOVOROSSIYSK","ODESSA","VARNA","BURGAS","TUAPSE"]
};
export const defaultMaritimeRegions=()=>DEFAULT_POSITION_SEA_AREAS.map(z=>({...z,coords:z.coords.map(p=>[...p]),aliases:[...(DEFAULT_PORT_ALIASES[z.id]||[])],color:"#58a6ff"}));
export function normalizeMaritimeRegions(raw){
 if(!Array.isArray(raw))return defaultMaritimeRegions();
 return raw.filter(z=>z&&typeof z.id==="string"&&z.id.length<80&&typeof z.label==="string")
 .map(z=>{
  let coords=(Array.isArray(z.coords)?z.coords:[]).filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=-180&&p[0]<=180&&p[1]>=-90&&p[1]<=90).map(p=>[...p]);
  if(coords.length>=3&&(coords[0][0]!==coords.at(-1)[0]||coords[0][1]!==coords.at(-1)[1]))coords.push([...coords[0]]);
  return {...z,coords,center:Array.isArray(z.center)?z.center:coords[0]||[0,0],aliases:Array.isArray(z.aliases)?z.aliases.map(String):[],color:/^#[0-9a-fA-F]{6}$/.test(z.color)?z.color:"#58a6ff"};
 }).filter(z=>z.coords.length>=4);
}
export function readMaritimeRegions(){try{return normalizeMaritimeRegions(JSON.parse(localStorage.getItem(SEA_REGION_KEY)||"null"));}catch{return defaultMaritimeRegions();}}
export function maritimePortMatches(v,region){
 const port=String(v?.openPort||"").toUpperCase().trim();
 if(!port||port==="EMPLOYED")return false;
 return (region?.aliases||[]).some(alias=>{const a=String(alias).toUpperCase().trim();return a.length>1&&port.includes(a);});
}




