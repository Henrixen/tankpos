import { supabase } from "./supabaseclient";

export async function saveVesselMetadata(vesselName, imoNo, notes, tags, customFlags) {
  try {
    const { data, error } = await supabase
      .from("vessel_metadata")
      .upsert(
        {
          vessel_name: vesselName,
          imo_no: imoNo || null,
          notes: notes || null,
          tags: tags || [],
          custom_flags: customFlags || {},
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "vessel_name,imo_no",
        }
      )
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error("Error saving vessel metadata:", err);
    return { success: false, error: err };
  }
}

export async function getVesselMetadata(vesselName, imoNo) {
  try {
    let query = supabase.from("vessel_metadata").select("*");

    if (imoNo) {
      query = query.eq("imo_no", imoNo);
    } else if (vesselName) {
      query = query.eq("vessel_name", vesselName.toUpperCase());
    } else {
      return { success: false, error: "No vessel name or IMO provided" };
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error("Error getting vessel metadata:", err);
    return { success: false, error: err };
  }
}

export async function getVesselDetails(vesselName, imoNo) {
  try {
    let query = supabase.from("vessels_db").select("*");

    if (imoNo) {
      query = query.eq("imo_no", imoNo);
    } else if (vesselName) {
      query = query.ilike("vessel_name", vesselName);
    } else {
      return { success: false, error: "No vessel name or IMO provided" };
    }

    const { data, error } = await query.maybeSingle();

    if (error && error.code !== "PGRST116") throw error;
    return { success: true, data };
  } catch (err) {
    console.error("Error getting vessel details:", err);
    return { success: false, error: err };
  }
}

export async function getCustomTags() {
  try {
    const { data, error } = await supabase
      .from("vessel_tags")
      .select("*")
      .order("tag_name");

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err) {
    console.error("Error getting custom tags:", err);
    return { success: false, error: err, data: [] };
  }
}

export async function addCustomTag(tagName, tagColor, tagCategory = "general") {
  try {
    const { data, error } = await supabase
      .from("vessel_tags")
      .insert([{ tag_name: tagName, tag_color: tagColor, tag_category: tagCategory }])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error("Error adding custom tag:", err);
    return { success: false, error: err };
  }
}

export async function deleteCustomTag(tagId) {
  try {
    const { error } = await supabase.from("vessel_tags").delete().eq("id", tagId);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error("Error deleting custom tag:", err);
    return { success: false, error: err };
  }
}
