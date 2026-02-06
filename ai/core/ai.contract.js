// ai/core/ai.contract.js
// Contract for LingoCard AI generation (questionnaire -> strict answers)

export function getAiContractV1(){
  // NOTE: We keep the function name for backward compatibility,
  // but the contract itself is now the strict ID-based MVP ("answers" only).
  return {
    version: 'LC_AI_CONTRACT_V2',
    lang: 'de/ru',
    // Fixed IDs – MUST NOT be renamed.
    ids: {
      inf: 'inf',

      tr_1_ru: 'tr_1_ru', tr_1_ctx: 'tr_1_ctx',
      tr_2_ru: 'tr_2_ru', tr_2_ctx: 'tr_2_ctx',
      tr_3_ru: 'tr_3_ru', tr_3_ctx: 'tr_3_ctx',
      tr_4_ru: 'tr_4_ru', tr_4_ctx: 'tr_4_ctx',

      forms_p3: 'forms_p3',
      forms_prat: 'forms_prat',
      forms_aux: 'forms_aux', // MUST be "hat" or "ist"
      forms_p2: 'forms_p2',

      pref_type: 'pref_type', // sep | insep | none
	      pref_text: 'pref_text',  // e.g. "an-" (or "")

	      // Synonyms (3 pairs: German synonym + short RU meaning)
	      syn_1_de: 'syn_1_de', syn_1_ru: 'syn_1_ru',
	      syn_2_de: 'syn_2_de', syn_2_ru: 'syn_2_ru',
	      syn_3_de: 'syn_3_de', syn_3_ru: 'syn_3_ru',

	      // Examples (5 B2-level sentences): German + Russian + short tag
	      ex_1_de: 'ex_1_de', ex_1_ru: 'ex_1_ru', ex_1_tag: 'ex_1_tag',
	      ex_2_de: 'ex_2_de', ex_2_ru: 'ex_2_ru', ex_2_tag: 'ex_2_tag',
	      ex_3_de: 'ex_3_de', ex_3_ru: 'ex_3_ru', ex_3_tag: 'ex_3_tag',
	      ex_4_de: 'ex_4_de', ex_4_ru: 'ex_4_ru', ex_4_tag: 'ex_4_tag',
	      ex_5_de: 'ex_5_de', ex_5_ru: 'ex_5_ru', ex_5_tag: 'ex_5_tag',

	      // Recommended collocations (optional, but supported by the template)
	      rek_1_de: 'rek_1_de', rek_1_ru: 'rek_1_ru',
	      rek_2_de: 'rek_2_de', rek_2_ru: 'rek_2_ru',
	      rek_3_de: 'rek_3_de', rek_3_ru: 'rek_3_ru',
	      rek_4_de: 'rek_4_de', rek_4_ru: 'rek_4_ru',
	      rek_5_de: 'rek_5_de', rek_5_ru: 'rek_5_ru',

	      // Frequency (1..5) for the dot-meter (optional)
	      freq: 'freq'
    },
    // Required minimum for Apply.
    required: [
	      'inf',
	      'tr_1_ru','tr_2_ru','tr_3_ru','tr_4_ru',
	      'forms_p3','forms_prat','forms_aux','forms_p2',
	      'pref_type',
	      'syn_1_de',
	      'ex_1_de','ex_2_de','ex_3_de','ex_4_de','ex_5_de'
    ],
    prefixTypes: ['sep','insep','none']
  };
}

export function buildAiSystemPromptV1(){
  // IMPORTANT: This is a hard "answers-by-ID" contract.
  // The model must not output wrappers like <|channel|>final, markdown, or extra keys.
  return [
    'You are a strict data generator for the LingoCard app.',
    '',
    'OUTPUT RULES:',
    '- Output ONLY valid JSON. No extra text, no tags, no markdown, no reasoning.',
    '- First non-space char must be "{" and last char must be "}".',
    '- Only one top-level key: "answers".',
    '- "answers" must contain ONLY the keys listed in the KEYLIST below.',
    '- Do not add any other keys. Do not rename keys.',
    '- Unknown values must be empty string "".',
    '',
    'KEYLIST (MUST output all of them):',
    'inf,',
    'tr_1_ru, tr_1_ctx, tr_2_ru, tr_2_ctx, tr_3_ru, tr_3_ctx, tr_4_ru, tr_4_ctx,',
    'forms_p3, forms_prat, forms_aux, forms_p2,',
	    'pref_type, pref_text,',
	    'syn_1_de, syn_1_ru, syn_2_de, syn_2_ru, syn_3_de, syn_3_ru,',
	    'ex_1_de, ex_1_ru, ex_1_tag, ex_2_de, ex_2_ru, ex_2_tag, ex_3_de, ex_3_ru, ex_3_tag, ex_4_de, ex_4_ru, ex_4_tag, ex_5_de, ex_5_ru, ex_5_tag,',
	    'rek_1_de, rek_1_ru, rek_2_de, rek_2_ru, rek_3_de, rek_3_ru, rek_4_de, rek_4_ru, rek_5_de, rek_5_ru,',
	    'freq',
    '',
	    'CONTENT RULES (IMPORTANT):',
	    '- Provide 4 distinct Russian translations (tr_1_ru..tr_4_ru). Contexts (tr_*_ctx) are short DE mini-contexts like "(Aussehen/Optik)" or "(Eindruck)".',
	    '- Provide 3 German synonyms (syn_*_de) with short RU meaning (syn_*_ru). No duplicates.',
	    '- Provide 5 B2-level example sentences (ex_*_de) that clearly use the infinitive verb (in a correct conjugated form).',
	    '  - Each example MUST be a full German sentence, realistic and useful for work/everyday situations.',
	    '  - ex_*_ru is a natural RU translation of that sentence.',
	    '  - ex_*_tag is a short label like "Präsens", "Präteritum", "Perfekt", "Konj II", "Passiv" (pick fitting forms).',
	    '- Provide 5 useful collocations/phrases (rek_*_de) with RU translation (rek_*_ru).',
	    '- freq is optional; if known set "1".."5", else "".',
	    '',
    'FORM RULES (CRITICAL):',
    '- forms_p3 = Präsens 3sg (er/sie/es).',
    '- forms_prat = Präteritum 3sg (er/sie/es).',
    '- forms_aux = exactly "hat" or "ist".',
    '- forms_p2 = Partizip II.',
    '- If pref_type = "sep":',
    '  - forms_p3 and forms_prat MUST contain a separated prefix particle (e.g., "ruft an", "rief an").',
    '  - forms_p2 MUST keep the prefix (e.g., "angerufen"). Never drop it.',
    '- If pref_type = "insep": typically no "ge" in forms_p2 (follow correct German).',
    '- If no prefix: pref_type="none" and pref_text="".',
    '',
    'LINGUISTIC RULES (STRICT):',
    '- "ge-" is NOT a verb prefix. It is commonly a Partizip II marker. Do NOT classify "ge-" as a prefix.',
    '- Prefix classes:',
    '  - sep (trennbar): ab-, an-, auf-, aus-, bei-, ein-, fest-, her-, hin-, los-, mit-, nach-, vor-, weg-, weiter-, zu-, zurück-, zusammen-, ...',
    '  - insep (untrennbar): be-, emp-, ent-, er-, ge-, miss-, ver-, zer- (NOTE: "ge-" as prefix exists only in few verbs; do NOT infer it from Partizip II).',
    '  - ambi (both): durch-, über-, um-, unter-, wider-, wieder- (meaning/stress dependent). For this app: if unsure, pick "ambi" and explain in pref_text briefly.',
    '- forms_aux selection:',
    '  - Use "ist" for movement/change-of-state verbs (gehen, kommen, fahren, laufen, fallen, sterben, werden, bleiben, passieren, ...).',
    '  - Use "hat" for transitive actions and most others (arbeiten, lernen, machen, ...).',
    '  - When a verb can take both, pick the most typical for the given infinitive and leave a hint in pref_text only if needed.',
    '',
    'SELF-CHECK (INTERNAL, DO NOT OUTPUT):',
    'Do two internal verification cycles and correct mistakes before output.'
  ].join('\n');
}

export function buildAiUserPromptV1(inf, contract){
  // Keep the user prompt short and deterministic.
  // The system prompt already defines the contract and KEYLIST.
  var _c = contract || getAiContractV1();
  return [
    'infinitive: ' + String(inf||'').trim(),
    'Return JSON now.'
  ].join('\n');
}

export function sanitizeModelTextToJson(text){
  var s = String(text || '').trim();
  // Strip common LM Studio / OSS wrappers like: <|channel|>final ... <|message|>
  // We do it before brace extraction.
  s = s.replace(/<\|[^>]*\|>/g, ' ').trim();
  // remove code fences if any
  s = s.replace(/^```[a-zA-Z]*\s*/,'').replace(/```\s*$/,'');
  // try to extract first JSON object
  var i = s.indexOf('{');
  var j = s.lastIndexOf('}');
  if (i >= 0 && j > i) s = s.slice(i, j+1);
  return s.trim();
}

function _parseMaybeStringifiedJson(s){
  // 1) direct parse
  try{
    var v = JSON.parse(s);
    // Some models return a JSON *string* that contains JSON.
    if (typeof v === 'string'){
      var inner = v.trim();
      try{ return JSON.parse(inner); }catch(_e){ return v; }
    }
    return v;
  }catch(e){ /* continue */ }

  // 2) handle cases where we accidentally sliced a quoted JSON string (e.g. {\"a\":1})
  //    by unescaping common sequences.
  if (s.indexOf('\\"') >= 0 || s.indexOf('\\n') >= 0 || s.indexOf('\\t') >= 0){
    var unescaped = s
      .replace(/\\r/g, '\r')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    try{
      var v2 = JSON.parse(unescaped);
      if (typeof v2 === 'string'){
        var inner2 = v2.trim();
        try{ return JSON.parse(inner2); }catch(_e2){ return v2; }
      }
      return v2;
    }catch(e2){ /* continue */ }
  }

  // 3) last resort: if it looks like a JSON string missing outer quotes, add them.
  //    Example: {\"answers\":{...}} -> "{\"answers\":{...}}"
  if (s.startsWith('{\\"') || s.includes('\\"answers\\"')){
    try{
      var wrapped = '"' + s.replace(/\\/g, '\\\\').replace(/\"/g, '\\"') + '"';
      var v3 = JSON.parse(wrapped);
      if (typeof v3 === 'string'){
        var inner3 = v3.trim();
        try{ return JSON.parse(inner3); }catch(_e3){ return v3; }
      }
      return v3;
    }catch(e3){ /* ignore */ }
  }

  return null;
}

export function parseContractAnswerJson(raw){
  var s = sanitizeModelTextToJson(raw);
  return _parseMaybeStringifiedJson(s);
}

export function validateContractAnswers(payload, contract){
  var c = contract || getAiContractV1();
  var out = { ok:false, errors:[], warnings:[], answers:null };

  // Contract V2: top-level MUST contain only {"answers":{...}}
  if (!payload || !payload.answers || typeof payload.answers !== 'object'){
    out.errors.push('Ответ не соответствует контракту: ожидается {"answers":{...}}');
    return out;
  }
  // If model added version/meta keys – treat as non-fatal warning, but we still validate answers.
  try{
    Object.keys(payload).forEach(function(k){
      if (k !== 'answers') out.warnings.push('Лишний ключ верхнего уровня: '+k+' (будет проигнорирован)');
    });
  }catch(_){ }

  var a = payload.answers;

  // Reject extra keys inside answers (hard error) – this keeps parsing deterministic.
  var allowed = {};
  Object.keys(c.ids).forEach(function(k){ allowed[c.ids[k]] = true; });
  Object.keys(a).forEach(function(k){
    if (!allowed[k]) out.errors.push('Лишний ключ в answers: '+k);
  });

  // ensure string values
  Object.keys(c.ids).forEach(function(k){
    var id = c.ids[k];
    if (a[id] == null) a[id] = '';
    if (typeof a[id] !== 'string') a[id] = String(a[id]);
    a[id] = a[id].trim();
  });

  // required (base)
  c.required.forEach(function(id){
    if (!a[id] || !String(a[id]).trim()) out.errors.push('Пустое поле: '+id);
  });

  // translations: at least one tr_*_ru must exist (we don't force it to be exactly tr_1_ru)
  var hasTr = false;
  for (var k=1;k<=4;k++){
    if (String(a['tr_'+k+'_ru']||'').trim()){ hasTr = true; break; }
  }
  if (!hasTr) out.errors.push('Нужен минимум 1 перевод: tr_1_ru..tr_4_ru');
  else if (!String(a.tr_1_ru||'').trim()){
    // soft: we can still accept if model filled tr_2..tr_4
    out.warnings.push('tr_1_ru пустой, но есть другие переводы (это ок, но лучше заполнить tr_1_ru)');
    // remove hard error if it was added by base required list
    out.errors = out.errors.filter(function(e){ return e !== 'Пустое поле: tr_1_ru'; });
  }

  // forms_aux strict (V2)
  var aux = (a.forms_aux||'').trim();
  if (aux && aux !== 'hat' && aux !== 'ist') out.errors.push('forms_aux должно быть ровно "hat" или "ist"');

  // prefix type sanity
  var pt = (a.pref_type||'').trim();
  if (pt && c.prefixTypes && c.prefixTypes.indexOf(pt) === -1){
    out.errors.push('pref_type должно быть: '+c.prefixTypes.join('|')+'; сейчас: '+pt);
  }
  if (pt === 'none' && String(a.pref_text||'').trim()){
    out.warnings.push('pref_type="none", но pref_text не пустой (будет проигнорирован в рендере)');
  }

  out.ok = out.errors.length === 0;
  out.answers = a;
  return out;
}

export function buildRepairPromptV1(inf, contract, lastRaw, validation){
  // Backward compatible signature:
  //  - new: (inf, contract, lastRaw, validation)
  //  - legacy callers: (inf, errorsArray, lastRaw)
  var c = getAiContractV1();
  var legacy = Array.isArray(contract);
  var _contract = legacy ? c : (contract || c);
  var _lastRaw = legacy ? (lastRaw||'') : (lastRaw||'');
  var _validation = legacy ? { errors: contract, warnings: [] } : (validation||{});

  var errs = (_validation && _validation.errors ? _validation.errors : []).slice(0, 20);
  var warns = (_validation && _validation.warnings ? _validation.warnings : []).slice(0, 20);
  var snippet = String(_lastRaw || '').slice(0, 1200);
  return [
    'REPAIR REQUEST',
    'infinitive: '+inf,
    '',
    'Your previous output was invalid. Fix it now.',
    'IMPORTANT:',
    '- Output ONLY JSON with ONE top-level key: "answers".',
    '- Do NOT add any other keys.',
    '- "answers" MUST contain ALL keys from KEYLIST (no more, no less).',
    '- Fix ONLY the fields that are wrong. Keep other fields unchanged.',
    '',
    'ERRORS TO FIX:',
    (errs.length?('- '+errs.join('\n- ')):'- (none)'),
    '',
    'WARNINGS:',
    (warns.length?('- '+warns.join('\n- ')):'- (none)'),
    '',
    'PREVIOUS OUTPUT (snippet):',
    snippet
  ].join('\n');
}
