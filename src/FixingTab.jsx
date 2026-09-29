import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabaseclient";
import { C, SEGMENTS } from "./constants";
import { classifyRegion, daysBetween, stripHtml } from "./utils";
import { loadFixingJobs, saveFixingJob, deleteFixingJob, loadClients, saveClient, deleteClient } from "./supabaseHelpers";
import { isMobile } from "./constants";

const JOB_STATUS = ["OPEN","WORKING","SUBS","FIXED","FAILED","WDWF"];
const JOB_STATUS_COL = {OPEN:C.blue,WORKING:C.amber,SUBS:C.purple,FIXED:C.green,FAILED:C.red,WDWF:"rgba(148,163,184,0.85)"};
const TRADES = ["UKC","Med","EU Feast","AG","TA West","Ex US","Asia"];
const EDIT_FIELDS = ["cargo_details","notes","indications","subs_fixed"];

// Manually curated client logos — key = lowercase client name, value = image URL
const CLIENT_LOGOS = {
  "aramco": "https://companieslogo.com/img/orig/2222.SR-99009d53.png?t=1720244490",
  "basf": "https://logos-world.net/wp-content/uploads/2022/06/BASF-Logo.png",
  "circle k": "https://upload.wikimedia.org/wikipedia/commons/1/16/Circle_k_logo_detail.png",
  "css sa": "https://logos-world.net/wp-content/uploads/2023/05/TotalEnergies-Logo.png",
  "equinor": "https://1000logos.net/wp-content/uploads/2024/12/Equinor-Emblem.png",
  "exxon": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Exxon_logo_2016.svg/1280px-Exxon_logo_2016.svg.png",
  "trafigura": "https://logos-world.net/wp-content/uploads/2025/01/Trafigura-Logo.jpg",
};

function focusJobField(jobId, field){
  const el = document.querySelector(`[data-job-field="${jobId}-${field}"]`);
  if (el) { el.focus(); if (el.select) el.select(); }
}
function cycleJobField(jobId, currentField, backwards=false){
  const idx = EDIT_FIELDS.indexOf(currentField);
  if (idx === -1) return;
  const nextIdx = backwards ? (idx-1+EDIT_FIELDS.length)%EDIT_FIELDS.length : (idx+1)%EDIT_FIELDS.length;
  focusJobField(jobId, EDIT_FIELDS[nextIdx]);
}

// RichEditor — height is tracked in state (displayHeight) so React renders stay in sync.
// onToggleExpand(expanded, savedH, expandedH) lets the parent sync siblings.
// One-line tappable header that expands to full content below it — local
// copy matching the one in DesktopApp.jsx (kept separate deliberately, since
// this file is lazy-loaded independently and importing across the two would
// risk a circular dependency).
function MobileCollapse({ title, color="#58a6ff", defaultOpen=false, children }){
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div style={{ background:C.bg2, border:"1px solid "+C.bd, borderRadius:7, overflow:"hidden" }}>
      <button onClick={()=>React.startTransition(()=>setOpen(o=>!o))}
        style={{ width:"100%", display:"flex", alignItems:"center", gap:8, justifyContent:"space-between",
          padding:"10px 12px", background:"transparent", border:"none", cursor:"pointer", fontFamily:"inherit",
          minHeight:44, boxSizing:"border-box" }}>
        <span style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:color, flexShrink:0 }}/>
          <span style={{ fontSize:12, fontWeight:700, color, textTransform:"uppercase", letterSpacing:"0.05em" }}>{title}</span>
        </span>
        <span style={{ fontSize:10, color:C.faint, transform:open?"rotate(90deg)":"none", transition:"transform 0.15s" }}>▸</span>
      </button>
      {open && <div style={{ padding:"0 10px 10px" }}>{children}</div>}
    </div>
  );
}

function RichEditor({ jobId, field, title, titleRight, value, onChange, onResizeSave, height=120, placeholder="", color=C.tx, onToggleExpand=null, alwaysExpanded=false, expandState=null, fillHeight=false }){
  const editorRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [lightboxSrc, setLightboxSrc] = React.useState(null);
  // displayHeight drives the wrapper height via React state — never fight the render cycle
  const [displayHeight, setDisplayHeight] = React.useState(height);
  const savedHeightRef = React.useRef(height);
  const progResizing = React.useRef(false);

  // Click-to-enlarge for pasted images — event delegation on the editor
  // container so it works for every image regardless of when it was pasted.
  function handleEditorClick(e){
    if (e.target && e.target.tagName === "IMG"){
      e.preventDefault();
      e.stopPropagation();
      setLightboxSrc(e.target.getAttribute("src"));
    }
  }

  // Keep saved height in sync when height prop changes (e.g. from drag-save) while collapsed
  React.useEffect(()=>{
    if (!isExpanded && !alwaysExpanded) {
      savedHeightRef.current = height;
      setDisplayHeight(height);
    }
  }, [height]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(()=>{
    const el = editorRef.current;
    if (!el || document.activeElement === el) return;
    const next = value || "";
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [value]);

  // alwaysExpanded: auto-size to content, no collapse
  React.useEffect(()=>{
    if (!alwaysExpanded) return;
    const el = editorRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    wrap.style.resize = "none";
    const newH = Math.max(height, el.scrollHeight + 60);
    setDisplayHeight(newH);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function calcExpandedH(){
    const el = editorRef.current;
    if (!el) return 200;
    // Temporarily remove minHeight to get true content scrollHeight
    const prev = el.style.minHeight;
    el.style.minHeight = "0";
    const h = Math.max(120, el.scrollHeight + 60);
    el.style.minHeight = prev;
    return h;
  }

  function toggleExpand(){
    if (alwaysExpanded) return;
    if (!isExpanded) {
      // expanding
      savedHeightRef.current = displayHeight;
      const newH = calcExpandedH();
      setDisplayHeight(newH);
      setIsExpanded(true);
      // Re-measure after paint in case content wasn't fully laid out
      setTimeout(()=>{
        const remeasured = calcExpandedH();
