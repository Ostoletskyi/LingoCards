(function(){
  'use strict';

  // normalizeVerbEntry.js
  // Purpose:
  // - Accept different verb dataset shapes on import.
  // - Output the canonical dataset shape used by LingoCard "verbs" flow:
  //     { verbs: [ { answers: { ...contract keys... } } ] }
  //
  // Supported inputs:
  //  A) { verbs: [ { answers:{...} }, ... ] }   (already canonical)
  //  B) { verbs: [ { inf:'...', tr_1_ru:'...', ... }, ... ] } (flat keys)
  //  C) [ { answers:{...} }, ... ] or [ { inf:'...', ... }, ... ] (array root)
  //
  // Non-goals (for stage 2/3):
  //  - Full conversion from the old "rich verb" model (inf + translations arrays etc.)
  //    into contract keys. That belongs to a dedicated migration step.
  //
  // This module is used both in browser and in node-ish smoke checks, so keep it dependency-free.

  function isObj(x){ return x && typeof x === 'object' && !Array.isArray(x); }

  function clone(o){
    try { return JSON.parse(JSON.stringify(o)); } catch(e){ return o; }
  }

  // Heuristic: if it already looks like the contract, keep it.
  function looksLikeContractAnswers(a){
    if(!isObj(a)) return false;
    return typeof a.inf === 'string' || typeof a.tr_1_ru === 'string' || typeof a.forms_p3 === 'string';
  }

  // If entry is {answers:{...}} keep answers; if flat, wrap; else best-effort.
  function normalizeEntry(entry){
    if(!isObj(entry)) return null;

    // Canonical
    if(isObj(entry.answers) && looksLikeContractAnswers(entry.answers)){
      return { answers: clone(entry.answers) };
    }

    // Flat keys -> wrap
    // Detect by presence of a few signature keys.
    var hasSig = (typeof entry.inf === 'string') ||
                 (typeof entry.tr_1_ru === 'string') ||
                 (typeof entry.forms_p3 === 'string') ||
                 (typeof entry.pref_type === 'string');

    if(hasSig){
      var e = clone(entry);
      delete e.answers; // just in case
      return { answers: e };
    }

    // Unknown: keep as-is but wrap into answers to not crash the UI.
    return { answers: clone(entry) };
  }

  function normalizeVerbDataset(input){
    var root = input;

    // Allow JSON string
    if(typeof root === 'string'){
      try { root = JSON.parse(root); } catch(e){ root = null; }
    }

    var verbsArr = null;

    if(Array.isArray(root)){
      verbsArr = root;
    }else if(isObj(root) && Array.isArray(root.verbs)){
      verbsArr = root.verbs;
    }else{
      verbsArr = [];
    }

    var out = [];
    for(var i=0;i<verbsArr.length;i++){
      var n = normalizeEntry(verbsArr[i]);
      if(n) out.push(n);
    }

    return { verbs: out };
  }

  // Export
  if(typeof module !== 'undefined' && module.exports){
    module.exports = { normalizeVerbDataset: normalizeVerbDataset, normalizeEntry: normalizeEntry };
  }else{
    window.normalizeVerbDataset = normalizeVerbDataset;
  }
})();
