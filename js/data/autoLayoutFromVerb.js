// js/data/autoLayoutFromVerb.js
// Auto layout from verb JSON
// Profiles (project contract):
//  - mini    : Infinitiv + Formen (3 формы + управляющий глагол)
//  - compact : Infinitiv + Formen + Synonyme
//  - full    : все принципиально существующие блоки карточки

function mkBox(id, xMm, yMm, wMm, hMm, fontPt, label, bind, extra = {}) {
  // labelKey is optional and used by i18n-aware renderer.
  // Keep legacy `label` for backward compatibility.
  return { id, xMm, yMm, wMm, hMm, fontPt, label, bind, labelKey: extra.labelKey, labelParams: extra.labelParams, text: "", ...extra };
}

function asStr(x){ return (x === null || x === undefined) ? "" : String(x); }
function hasAnyValue(v){
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") return Object.keys(v).length > 0;
  return !!asStr(v).trim();
}

function layoutStack(rows, startY = 12){
  const x = 10, w = 130;
  let y = startY;
  const out = [];
  for (const r of rows){
    const extra = r.extra || {};
    if (r.labelKey && !extra.labelKey) extra.labelKey = r.labelKey;
    if (r.labelParams && !extra.labelParams) extra.labelParams = r.labelParams;
    out.push(mkBox(r.id, x, y, w, r.h, r.font, r.label, r.bind, extra));
    y += r.h + 3;
  }
  return out;
}

function hasFreq(verb){
  const v = Number(verb?.freq ?? verb?.frequency ?? 0);
  return Number.isFinite(v) && v > 0;
}

function freqCornerBox(){
  // маленькая частотность сверху слева (для всех профилей)
  return mkBox("freqCorner", 6, 6, 26, 8, 10, "Freq", "freq", { type: "frequencyDots" });
}

export function buildBoxesFromVerbSample(verb, profile = "full") {
  const p = String(profile || "full").toLowerCase();

  // FULL-TEMPLATE: canonical full card skeleton, even when the verb JSON is empty.
  // Used for creating brand-new "blank" cards in the right draft list.
  if (p === "full-template" || p === "fulltemplate") {
    // IMPORTANT:
    // Template geometry must be stable, predictable and visually "finished".
    // The old project "Full4" layout had a strong composition:
    //   - Inf/Tr/Forms/Examples occupy the main body
    //   - Syn block sits at top-right
    //   - Rek block sits at bottom-right
    // This produces better-looking cards even when some blocks render empty.

    const boxes = [
      // freq dots (always present in template mode)
      mkBox("freqCorner", 2, 2, 20, 8, 10, "Freq", "freq", { type: "frequencyDots", textMode: "bind", geomMode:"manual", geomPinned:true, align:"left", visible:true }),

      // main headline
      mkBox("inf", 2, 9.54, 58.69, 11.91, 28, "", "inf", { labelKey:"box.inf", textMode:"bind", geomMode:"manual", geomPinned:true, align:"left", visible:true }),

      // top-right synonyms (short)
      mkBox("syn", 62.45, 2, 80.61, 14.13, 10, "Synonyme", "synonymsPairsBlock", { labelKey:"box.syn", textMode:"bind", geomMode:"manual", geomPinned:true, align:"left", visible:true }),

      // translations
      mkBox("tr", 2, 21.29, 144.68, 13.08, 10, "Übersetzungen", "translationsLine", { labelKey:"box.tr", textMode:"bind", geomMode:"manual", geomPinned:true, align:"left", visible:true }),

      // forms line
      mkBox("forms", 2.20, 35.12, 143.91, 9.23, 15, "Formen", "formsLine", { labelKey:"box.forms", textMode:"bind", geomMode:"manual", geomPinned:true, align:"left", visible:true }),

      // examples (big body)
      mkBox("examples", 2.20, 45.50, 141.84, 53.66, 8, "", "examplesBlock", { labelKey:"box.examples", textMode:"bind", geomMode:"manual", geomPinned:true, align:"left", visible:true }),

      // rektion block (bottom-right) — optional content, but strong composition anchor
      // IMPORTANT: keep the box id as "rek" (legacy). A lot of UI and saved cards refer to it.
      // Bind uses verbBind resolver: rektionBlock pulls rek_1..rek_5 from verbs_rich.fixed.json.
      mkBox("rek", 83.68, 50.05, 64.32, 46.28, 6, "", "rektionBlock", { labelKey:"box.rektion", textMode:"bind", geomMode:"manual", geomPinned:true, align:"left", visible:true }),

      // prefixes — keep inside the card by default
      mkBox("pref", 10, 97, 38.40, 8, 11, "Präfixe / Partikel", "prefixesBlock", { labelKey:"box.prefix", textMode:"bind", geomMode:"manual", geomPinned:true, align:"left", visible:true }),
    ];

    return boxes;
  }

  // MINI: Infinitiv + Formen (+ частотность)
  if (p === "mini") {
    const rows = [
      { id:"inf",   h:18, font:30, label:"Infinitiv", labelKey:"box.inf",   bind:"inf" },
      { id:"forms", h:16, font:18, label:"Formen",    labelKey:"box.forms", bind:"formsLine" },
    ];
    const boxes = layoutStack(rows, 12);
    if (hasFreq(verb)) boxes.unshift(freqCornerBox());
    return boxes;
  }

  // COMPACT: Infinitiv + Formen + Synonyme (+ частотность)
  if (p === "compact") {
    const rows = [
      { id:"inf",   h:16, font:28, label:"Infinitiv", labelKey:"box.inf",   bind:"inf" },
      { id:"forms", h:12, font:16, label:"Formen",    labelKey:"box.forms", bind:"formsLine" },
      // syn block is part of the contract for compact profile;
      // if the verb has no synonyms, it will render empty, but the layout stays stable.
      { id:"syn",   h:20, font:12, label:"Synonyme",  labelKey:"box.syn",   bind:"synonymsPairsBlock" },
    ];

    const boxes = layoutStack(rows, 12);
    if (hasFreq(verb)) boxes.unshift(freqCornerBox());
    return boxes;
  }

  // FULL (под твой JSON):
  // Infinitiv
  // Übersetzungen
  // Formen
  // Synonyme (с переводом)
  // Beispiele (все)
  // Präfixe/Partikel (каждый с meaning + examples)
  // FULL: all canonical blocks (stable skeleton)
  const rows = [
    { id:"inf",     h:16, font:28, label:"Infinitiv",           labelKey:"box.inf",     bind:"inf" },
    { id:"tr",      h:12, font:13, label:"Übersetzungen",       labelKey:"box.trs",     bind:"translationsLine" },
    { id:"forms",   h:12, font:16, label:"Formen",              labelKey:"box.forms",   bind:"formsLine" },
    { id:"syn",     h:16, font:12, label:"Synonyme",            labelKey:"box.syn",     bind:"synonymsPairsBlock" },
    { id:"examples",h:28, font:12, label:"Beispiele",           labelKey:"box.examples",bind:"examplesBlock" },
    { id:"pref",    h:16, font:12, label:"Präfixe / Partikel",  labelKey:"box.prefix",  bind:"prefixInfo" },
    // Rektion/valency (управление): берём rek_1..rek_5 из rich-json, если есть
    { id:"rek",     h:14, font:11, label:"Rektion",             labelKey:"box.rektion", bind:"rektionBlock" },
  ];

  const boxes = layoutStack(rows, 12);
  if (hasFreq(verb)) boxes.unshift(freqCornerBox());
  return boxes;
}
