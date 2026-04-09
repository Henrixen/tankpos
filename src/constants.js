// ─── Colours ──────────────────────────────────────────────────────────────────
export const C = {
  bg:    "#070f1c",
  bg2:   "#0c1729",
  bg3:   "#111f35",
  bg4:   "#162540",
  bd:    "rgba(58,130,246,0.18)",
  bd2:   "rgba(58,130,246,0.10)",
  tx:    "#e8f2ff",
  dim:   "rgba(160,200,255,0.65)",
  faint: "rgba(110,155,215,0.45)",
  blue:   "#58a6ff",
  green:  "#3fb950",
  amber:  "#f5a623",
  purple: "#a78bfa",
  red:    "#ff6b6b",
  orange: "#fb923c",
};

export const OP_COLORS = ["#4fc3f7","#43e97b","#ffd166","#c084fc","#ff6b6b","#38bdf8","#34d399","#fb923c","#e879f9","#a3e635"];

export const isMobile = () => window.innerWidth < 900 || /iPad|iPhone|Android|Mobile/i.test(navigator.userAgent);

// ─── Ports ────────────────────────────────────────────────────────────────────
export const PORTS = {
  thames:[51.45,0.70],southampton:[50.90,-1.40],humber:[53.73,-0.25],
  teesport:[54.61,-1.16],tees:[54.61,-1.16],immingham:[53.63,-0.22],
  "milford haven":[51.71,-5.03],forth:[56.03,-3.40],grangemouth:[56.01,-3.70],
  belfast:[54.60,-5.91],cork:[51.85,-8.30],dublin:[53.35,-6.23],
  rotterdam:[51.95,4.13],ara:[51.95,4.13],amsterdam:[52.37,4.90],
  antwerp:[51.22,4.40],ghent:[51.10,3.72],flushing:[51.45,3.60],zeebrugge:[51.33,3.20],
  "le havre":[49.49,0.11],rouen:[49.44,1.10],dunkirk:[51.03,2.37],
  bordeaux:[44.84,-0.57],bdx:[44.84,-0.57],nantes:[47.22,-1.55],
  "la pallice":[46.16,-1.15],bayonne:[43.49,-1.48],brest:[48.39,-4.49],
  hamburg:[53.55,9.99],brunsbuttel:[53.89,9.13],wilhelmshaven:[53.52,8.11],
  bremerhaven:[53.55,8.58],flensburg:[54.79,9.44],kiel:[54.32,10.14],
  gothenburg:[57.70,11.97],goteborg:[57.70,11.97],oslo:[59.90,10.74],
  stavanger:[58.97,5.73],mongstad:[60.82,5.03],sture:[60.85,5.11],
  kalundborg:[55.68,11.09],fredericia:[55.56,9.75],copenhagen:[55.68,12.56],
  malmo:[55.60,13.00],helsingborg:[56.05,12.70],karlshamn:[56.17,14.86],
  nynashamn:[58.90,17.95],stockholm:[59.33,18.06],porvoo:[60.28,25.66],
  naantali:[60.47,22.02],helsinki:[60.17,24.93],kotka:[60.47,26.95],
  riga:[56.95,24.11],tallinn:[59.44,24.75],ventspils:[57.40,21.54],
  klaipeda:[55.71,21.13],gdansk:[54.36,18.65],gdynia:[54.52,18.53],
  bilbao:[43.36,-3.04],santander:[43.46,-3.80],
  nap:[40.83,14.27],naples:[40.83,14.27],
};

// ─── Region classification ────────────────────────────────────────────────────
export const REGION_MAP = {
  WCUK:   ["belfast","cork","dublin","milford haven","liverpool","clyde","mersey","glasgow","avonmouth","bristol","swansea","barrow","stanlow","clydebank","fawley","plymouth","wcuk"],
  ECUK:   ["thames","humber","immingham","teesport","tees","teesside","tyne","sunderland","middlesbrough","grangemouth","forth","leith","dundee","medway","wilton","braefoot bay","bb","bbay","ecuk"],
  CANAL:  ["rotterdam","ara","amsterdam","antwerp","ghent","flushing","le havre","dunkirk","rouen","hamburg","brunsbuttel","wilhelmshaven","bremerhaven","bremen","zeebrugge","brest","calais","dieppe"],
  BISCAY: ["bordeaux","bdx","nantes","la pallice","bayonne","bilbao","santander","le verdon","donges","montoir","gijon","ferrol","brest"],
  BALTIC: ["gdansk","gdynia","klaipeda","ventspils","riga","tallinn","helsinki","naantali","porvoo","kotka","stockholm","nynashamn","karlshamn","lulea","oulu","baltic","baltiysk","stettin","szczecin"],
  SKAW:   ["gothenburg","goteborg","oslo","stavanger","mongstad","sture","kalundborg","fredericia","copenhagen","malmo","helsingborg","flensburg","kiel","aarhus","esbjerg","aalborg","sarroch"],
  MED:    ["gibraltar","algeciras","ceuta","barcelona","tarragona","valencia","cartagena","alicante","almeria","malaga","huelva","cadiz","sines","leixoes","setubal","lisbon","marseille","fos","lavera","port jerome","genoa","savona","livorno","la spezia","trieste","venice","ravenna","porto marghera","naples","napoli","augusta","milazzo","messina","sicily","palermo","catania","cagliari","porto torres","civitavecchia","brindisi","taranto","bari","ancona","split","rijeka","piraeus","athens","thessaloniki","kavala","alexandroupolis","constanta","odessa","novorossiysk","tuapse","batumi","trabzon","samsun","izmit","aliaga","izmir","canakkale","istanbul","marmara","bandirma","mudanya","derince","gebze","derince","aliaga","c-med","cmed","med","n spain","spain med","adriatic","wmed","w med","span med","e med","e.med","levant","malta","tunis","tunisia","la goulette","bizerte","sfax","porto empedocle"],
};

export const REGION_COLORS = {Europe:"#58a6ff",Asia:"#bc8cff",TA:"#e3b341"};

// ─── TCE defaults ─────────────────────────────────────────────────────────────
export const TCE_DEFAULTS = {
  qty:15000, consBallast:13, consLaden:15, consLoad:3, consDisch:8, consIdle:2,
  daysLoad:1, noticeLoad:0.25, daysDisch:1, noticeDisch:0.25, daysWaiting:0,
  bunker:1100, commission:7.5, speed:12.5, canalCost:0,
};

export const TCE_STORE_KEY = "tankpos-tce-defaults-v1";

// ─── Rate Matrix routes ───────────────────────────────────────────────────────
export const EU_ROUTES = [
  {id:"mng-ara",from:"Mongstad",to:"ARA",ballastNm:532,ladenNm:532,loadPDA:25000,dischPDA:28000},
  {id:"ara-tha",from:"ARA",to:"Thames",ballastNm:450,ladenNm:256,loadPDA:28000,dischPDA:25400},
  {id:"ara-dub",from:"ARA",to:"Dublin",ballastNm:450,ladenNm:500,loadPDA:28000,dischPDA:16200},
  {id:"tee-ara",from:"Tees",to:"ARA",ballastNm:450,ladenNm:256,loadPDA:35560,dischPDA:28000},
  {id:"bis-ara",from:"Biscay",to:"ARA",ballastNm:650,ladenNm:650,loadPDA:21600,dischPDA:28000},
  {id:"ara-wme",from:"ARA",to:"WMed",ballastNm:450,ladenNm:2049,loadPDA:28000,dischPDA:27000},
  {id:"med-ara",from:"Med",to:"ARA",ballastNm:600,ladenNm:2049,loadPDA:27000,dischPDA:28000},
];

export const RATE_ROUTES = [
  {region:"Asia",label:"Asia → Europe",routes:[
    {id:"nch-ara",from:"N.China",to:"ARA"},
    {id:"str-ara",from:"Straits",to:"ARA"},
  ]},
  {region:"TA",label:"Transatlantic",routes:[
    {id:"ara-usg",from:"ARA",to:"USG"},
    {id:"usg-ara",from:"USG",to:"ARA"},
  ]},
];

export const RATE_SIZES = ["5kt","10kt","18kt"];

// ─── WS Tracker routes ────────────────────────────────────────────────────────
export const WS_ROUTES = [
  {id:"TC2",  name:"TC2",  desc:"ARA→USAC 37kt",   unit:"WS"},
  {id:"TC6",  name:"TC6",  desc:"Cross-Med 30kt",   unit:"WS"},
  {id:"TC14", name:"TC14", desc:"US Gulf→UKC 38kt", unit:"WS"},
  {id:"TC23", name:"TC23", desc:"UKC→USAC 30kt",    unit:"WS"},
];

export const FFA_PERIODS = ["Feb/26","Mar/26","Apr/26","Q1/26","Q2/26","AVE/25"];

// ─── Fixing tab ───────────────────────────────────────────────────────────────
export const SEGMENTS = ["Sub 10k","City","Inter","J19","Flexi","Handy","MR"];

// ─── Storage keys ─────────────────────────────────────────────────────────────
export const SK  = "tankpos-v5";
export const CK  = "tankpos-cargo-v2";
export const HK  = "tankpos-history-v1";
export const RATE_KEY = "rates";
export const WS_STORE = "ws-data";
