import os
import pandas as pd
from supabase import create_client

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_KEY"]
supabase = create_client(url, key)

df = pd.read_csv("data/Barton.csv", on_bad_lines='skip', encoding='utf-8-sig')

def get_coating(row):
    if pd.notna(row.get("MarineLine")) and str(row.get("MarineLine")).strip() != "":
        return "MarineLine"
    if pd.notna(row.get("Interline")) and str(row.get("Interline")).strip() != "":
        return "Interline"
    if pd.notna(row.get("Zinc")) and str(row.get("Zinc")).strip() != "":
        return "Zinc"
    if pd.notna(row.get("Epoxy")) and str(row.get("Epoxy")).strip() != "":
        return "Epoxy"
    return None

records = []
for _, row in df.iterrows():
    vessel = str(row.get("Ship Name", "")).strip()
    if not vessel:
        continue
    records.append({
        "vessel": vessel,
        "dwt": str(row.get("DWT", "") or "").strip() or None,
        "coating": get_coating(row),
        "built": str(row.get("Built", "") or "").strip() or None,
        "flag": str(row.get("Flag", "") or "").strip() or None,
        "imo": str(row.get("IMO No", "") or "").strip() or None,
        "operator": str(row.get("Operator", "") or "").strip() or None,
        "owner": str(row.get("Owner/Manager", "") or "").strip() or None,
        "loa": str(row.get("LOA", "") or "").strip() or None,
        "beam": str(row.get("Beam", "") or "").strip() or None,
        "draft": str(row.get("Draft", "") or "").strip() or None,
        "tanks": str(row.get("Tanks", "") or "").strip() or None,
        "pumps": str(row.get("Pumps", "") or "").strip() or None,
        "segs": str(row.get("Segs", "") or "").strip() or None,
        "cbm": str(row.get("CBM", "") or "").strip() or None,
        "country_of_build": str(row.get("Country of Build", "") or "").strip() or None,
        "yard": str(row.get("Yard", "") or "").strip() or None,
        "ice_class": str(row.get("Ice Class", "") or "").strip() or None,
        "fuel": str(row.get("Fuel Data", "") or "").strip() or None,
        "comments": str(row.get("Comments", "") or "").strip() or None,
    })

supabase.table("vessels_db").upsert(records, on_conflict="vessel").execute()
print(f"Upserted {len(records)} vessels")
