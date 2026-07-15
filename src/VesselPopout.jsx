import React, { useState, useEffect, useRef } from "react";
import { C } from "./constants";
import { saveVesselMetadata, getVesselMetadata, getVesselDetails, getCustomTags } from "./vesselMetadataHelpers";

function VesselPopout({ vessel, onClose, onUpdate }) {
  const [vesselDetails, setVesselDetails] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const notesRef = useRef(null);
  const popoutRef = useRef(null);

  useEffect(() => {
    loadData();
  }, [vessel]);

  const loadData = async () => {
    setLoading(true);
    
    // Load vessel details from vessels_db
    const detailsResult = await getVesselDetails(vessel.vessel, vessel.imo_no);
    if (detailsResult.success && detailsResult.data) {
      setVesselDetails(detailsResult.data);
    }

    // Load metadata (notes/tags)
    const metadataResult = await getVesselMetadata(vessel.vessel, vessel.imo_no);
    if (metadataResult.success && metadataResult.data) {
      setMetadata(metadataResult.data);
      setNotes(metadataResult.data.notes || "");
      setTags(metadataResult.data.tags || []);
    } else {
      setNotes(vessel.notes || "");
      setTags(vessel.tags || []);
    }

    // Load available tags
    const tagsResult = await getCustomTags();
    if (tagsResult.success) {
      setAvailableTags(tagsResult.data);
    }

    setLoading(false);
  };

  const saveNotes = async () => {
    const result = await saveVesselMetadata(
      vessel.vessel,
      vessel.imo_no,
      notes,
      tags,
      metadata?.custom_flags || {}
    );

    if (result.success && onUpdate) {
      onUpdate({ ...vessel, notes, tags });
    }
  };

  const toggleTag = async (tagName) => {
    const newTags = tags.includes(tagName)
      ? tags.filter(t => t !== tagName)
      : [...tags, tagName];

    setTags(newTags);

    const result = await saveVesselMetadata(
      vessel.vessel,
      vessel.imo_no,
      notes,
      newTags,
      metadata?.custom_flags || {}
    );

    if (result.success && onUpdate) {
      onUpdate({ ...vessel, notes, tags: newTags });
    }
  };

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoutRef.current && !popoutRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const getTagColor = (tagName) => {
    const tag = availableTags.find(t => t.tag_name === tagName);
    return tag?.tag_color || "#58a6ff";
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9998 }} />

      {/* Right-docked panel */}
      <div
        ref={popoutRef}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          zIndex: 9999,
          background: C.bg2,
          borderLeft: "1px solid " + C.bd,
          width: 420,
          maxWidth: "90vw",
          overflowY: "auto",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid " + C.bd, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.blue }}>{vessel.vessel}</div>
            {vessel.imo_no && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>IMO: {vessel.imo_no}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.dim, fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1 }}>
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: C.dim }}>Loading...</div>
          ) : (
            <>
              {/* Vessel Details */}
              {vesselDetails && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                    Vessel Details
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", background: C.bg3, border: "1px solid " + C.bd, borderRadius: 8, padding: 12 }}>
                    {[
                      ["DWT", vesselDetails.dwt],
                      ["Built", vesselDetails.built],
                      ["Flag", vesselDetails.flag],
                      ["Coating", vesselDetails.coating],
                      ["CBM", vesselDetails.cbm],
                      ["LOA", vesselDetails.loa],
                      ["Beam", vesselDetails.beam],
                      ["Ice Class", vesselDetails.ice_class],
                      ["Fuel", vesselDetails.fuel_type],
                    ]
                      .filter(([, val]) => val)
                      .map(([label, value]) => (
                        <div key={label}>
                          <div style={{ fontSize: 9, color: C.faint, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                          <div style={{ fontSize: 13, color: C.tx, fontWeight: 600 }}>{value}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Tags
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {tags.length > 0 ? (
                    tags.map(tag => (
                      <div
                        key={tag}
                        style={{
                          background: getTagColor(tag) + "22",
                          border: "1px solid " + getTagColor(tag),
                          borderRadius: 4,
                          padding: "4px 8px",
                          fontSize: 11,
                          fontWeight: 600,
                          color: getTagColor(tag),
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {tag}
                        <button
                          onClick={() => toggleTag(tag)}
                          style={{ background: "none", border: "none", color: getTagColor(tag), cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1, opacity: 0.7 }}
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 11, color: C.faint, fontStyle: "italic" }}>No tags added</div>
                  )}
                </div>
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setShowTagPicker(!showTagPicker)}
                    style={{
                      background: "linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%)",
                      border: "1px solid " + C.bd,
                      borderRadius: 6,
                      color: C.blue,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "6px 12px",
                      cursor: "pointer",
                    }}
                  >
                    + Add Tag
                  </button>

                  {showTagPicker && (
                    <>
                      <div style={{ position: "fixed", inset: 0, zIndex: 10000 }} onClick={() => setShowTagPicker(false)} />
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          marginTop: 4,
                          zIndex: 10001,
                          background: C.bg,
                          border: "1px solid " + C.bd,
                          borderRadius: 6,
                          padding: 8,
                          minWidth: 200,
                          boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                        }}
                      >
                        {availableTags.length > 0 ? (
                          availableTags.map(tag => (
                            <button
                              key={tag.id}
                              onClick={() => {
                                toggleTag(tag.tag_name);
                                setShowTagPicker(false);
                              }}
                              style={{
                                width: "100%",
                                background: tags.includes(tag.tag_name) ? tag.tag_color + "22" : "transparent",
                                border: "1px solid " + (tags.includes(tag.tag_name) ? tag.tag_color : "transparent"),
                                borderRadius: 4,
                                color: tag.tag_color,
                                fontSize: 11,
                                fontWeight: tags.includes(tag.tag_name) ? 700 : 400,
                                padding: "6px 10px",
                                cursor: "pointer",
                                textAlign: "left",
                                marginBottom: 4,
                              }}
                            >
                              {tags.includes(tag.tag_name) ? "✓ " : ""}
                              {tag.tag_name}
                            </button>
                          ))
                        ) : (
                          <div style={{ fontSize: 11, color: C.faint, padding: 8 }}>No tags available</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Notes
                </div>
                <textarea
                  ref={notesRef}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  onBlur={saveNotes}
                  placeholder="Add notes about this vessel..."
                  style={{
                    width: "100%",
                    minHeight: 120,
                    background: C.bg3,
                    border: "1px solid " + C.bd,
                    borderRadius: 6,
                    color: C.tx,
                    fontSize: 12,
                    padding: 10,
                    outline: "none",
                    resize: "vertical",
                    fontFamily: "inherit",
                    lineHeight: 1.6,
                  }}
                />
                <div style={{ fontSize: 10, color: C.faint, marginTop: 6 }}>
                  Notes are saved automatically and will persist when positions update
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid " + C.bd, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              padding: "8px 16px",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(102,126,234,0.3)",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}

export default VesselPopout;
