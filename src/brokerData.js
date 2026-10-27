  const REGION_RENAME={
    "East Coast South America":"EC SAM",
    "Europe (Mediterranean)":"Med",
    "South-East-Asia Far-East":"SEA-FEA",
    "West Africa":"WAF",
    "West Coast US":"WC US",
    "West Coast South America":"WC SAM",
    "North West Europe":"NWE",
    "Med-Black Sea":"Med",
    "Arabian Gulf":"Suez-AG-India",
    "AG":"Suez-AG-India",
    "AG-India-Red Sea":"Suez-AG-India",
    "Red Sea":"Suez-India",
    "India":"Suez-India",
    "West Pacific":"Pacific",
    "Southern Ocean":"Pacific",
  };
  const SEGMENT_RENAME={
    "1. Small (<10)":"Sub 10k",
    "2. Cityclass (10-15)":"City",
    "3. Intermediate (14-19)":"Inter",
    "4. J19 (19-22)":"J19",
    "5. Flexi (22-30)":"Flexi",
    "6. Handy (30-40)":"Handy",
    "7. MR (>40)":"MR",
  };

export function mapBrokerPosition(r){
  const mn=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    const rawDate=String(r.open_date||"");
    let fmtDate=rawDate;
    if(rawDate&&!/^\d{1,2}\s[A-Za-z]/.test(rawDate)){
      const d=new Date(rawDate);
      if(!isNaN(d))fmtDate=d.getDate()+" "+mn[d.getMonth()];
    }
    return{
      _brokerSourceUpdatedAt:r.updated_at||null,
      _brokerSource:r,
      id:          String(r.id||""),
      vessel:      String(r.vessel_name||"").toUpperCase(),
      imoNo:       r.imo_no!=null?String(r.imo_no):null,
      operator:    r.operator||"",
      openPort:    r.port_name||"",
      date:        fmtDate,
      dwt:         r.dwt||null,
      built:       r.build_year||null,
      loa:         r.overall_length||null,
      beam:        r.beam||null,
      cbm:         r.cbm||null,
      coating:     r.coating_type_2||r.coating||r.coated||"",
      tag:         r.tag||"",
      comment:     r.details||"",
      notes:       r.notes||"",
      last3:       r.last_3_cargoes||"",
      dirtyClean:  r.dirty_clean||"",
      iceClass:    r.ice_class||"",
      segment:     SEGMENT_RENAME[r.segment]||r.segment||"",
      superRegion: REGION_RENAME[r.super_region]||r.super_region||"",
      updatedAt:   r.updated_at||"",
      fileDate:    r.file_date||null,
      source:      r.source||"external",
      spec: {
        iceClass: r.ice_class||null,
        lastCargo: r.last_3_cargoes||null,
        segment: r.segment||null,
        coated: r.coating_type_2||r.coating||r.coated||null,
      }
    };

}

export function applyBrokerOverride(v,o){
 if(!o)return {...v,_brokerOverrides:{}};
        const merged = {...v, spec:{...(v.spec||{})}};
        if (o.operator != null) merged.operator = o.operator;
        if (o.note != null) merged.notes = o.note;
        if (o.coating != null) merged.coating = o.coating;
        if (o.loa != null) merged.loa = o.loa;
        if (o.beam != null) merged.beam = o.beam;
        if (o.cbm != null) merged.cbm = o.cbm;
        if (o.dwt != null) merged.dwt = o.dwt;
        if (o.built != null) merged.built = o.built;
        if (o.tag != null || o.tags != null) merged.tag = o.tag ?? o.tags;
        if (o.open_date != null) {
          const dt = new Date(o.open_date + "T12:00:00");
          merged.date = Number.isNaN(dt.getTime()) ? o.open_date : `${dt.getDate()} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dt.getMonth()]}`;
        }
        if (o.open_port != null) merged.openPort = o.open_port;
        if (o.comment != null) merged.comment = o.comment;
        if (o.fuel != null) merged.spec.fuel = o.fuel;
        if (o.ice_class != null) merged.spec.iceClass = o.ice_class;
        if (o.last_cargo != null) merged.spec.lastCargo = o.last_cargo;
        if(o.updated_at&&Date.parse(o.updated_at)>Date.parse(v.updatedAt||'1970-01-01'))merged.updatedAt=o.updated_at;
        merged._brokerOverrides={...o};
        return merged;
}
