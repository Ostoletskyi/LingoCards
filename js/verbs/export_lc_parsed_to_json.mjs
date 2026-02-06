import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";

/**
 * Export LingoCard "fat cards" data from Excel sheet LC_Parsed to JSON dictionary.
 * Expected headers (row 1):
 *  freq_raw, freq_score, infinitive,
 *  translations (lines), forms (3 lines), examples (lines),
 *  synonyms (lines), prefixes (lines), service (line),
 *  block_start_row, block_end_row
 */

function die(msg, code = 1) {
  console.error("[LC][FAIL]", msg);
  process.exit(code);
}

function getArg(name, def = null) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return def;
}

function normSpaces(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function splitLines(s) {
  const t = String(s ?? "");
  // Excel can contain \r\n or \n; sometimes cells have multiple lines
  return t
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function takeMax(arr, n) {
  return arr.length > n ? arr.slice(0, n) : arr;
}

function padTo(arr, n, fill = "") {
  const out = [...arr];
  while (out.length < n) out.push(fill);
  return out;
}

function parseForms3Lines(cellText, serviceLine = "") {
  const lines = splitLines(cellText);
  const praes3 = normSpaces(lines[0] ?? "");
  const praet = normSpaces(lines[1] ?? "");
  const perfektFull = normSpaces(lines[2] ?? "");

  let auxiliary = "";
  let part2 = "";

  if (perfektFull) {
    // "hat begonnen" or "ist gegangen"
    const m = perfektFull.match(/^(\S+)\s+(.+)$/);
    if (m) {
      auxiliary = m[1].trim(); // "hat" / "ist"
      part2 = m[2].trim();     // "begonnen" / "gegangen"
    } else {
      part2 = perfektFull;
    }
  }

  return {
    praesens_3: praes3,
    praeteritum: praet,
    partizip_2: part2,
    auxiliary: auxiliary,
    service: serviceLine ? normSpaces(serviceLine) : "",
    perfekt_full: perfektFull
  };
}

function findNextNonEmpty(lines, startIdx) {
  for (let i = startIdx; i < lines.length; i++) {
    const t = normSpaces(lines[i]);
    if (t) return { value: t, idx: i };
  }
  return { value: "", idx: -1 };
}

function parseExamples(cellText) {
  const lines = splitLines(cellText);

  const out = {
    praesens: { de: "", ru: "" },
    modal: { modalVerb: "", de: "", ru: "" },
    praeteritum: { de: "", ru: "" },
    perfekt: { de: "", ru: "" }
  };

  // We scan line-by-line for markers, RU is usually the next non-empty line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Präsens:
    if (/^Präsens\s*:/i.test(line)) {
      const de = normSpaces(line.replace(/^Präsens\s*:\s*/i, ""));
      const nxt = findNextNonEmpty(lines, i + 1);
      out.praesens.de = de;
      out.praesens.ru = nxt.value || "";
      continue;
    }

    // Modal (müssen):
    // e.g. "Modal (müssen): Wir müssen jetzt beginnen."
    const mm = line.match(/^Modal\s*\(([^)]+)\)\s*:\s*(.+)$/i);
    if (mm) {
      out.modal.modalVerb = normSpaces(mm[1]);
      out.modal.de = normSpaces(mm[2]);
      const nxt = findNextNonEmpty(lines, i + 1);
      out.modal.ru = nxt.value || "";
      continue;
    }

    // Präteritum:
    if (/^Präteritum\s*:/i.test(line)) {
      const de = normSpaces(line.replace(/^Präteritum\s*:\s*/i, ""));
      const nxt = findNextNonEmpty(lines, i + 1);
      out.praeteritum.de = de;
      out.praeteritum.ru = nxt.value || "";
      continue;
    }

    // Perfekt:
    if (/^Perfekt\s*:/i.test(line)) {
      const de = normSpaces(line.replace(/^Perfekt\s*:\s*/i, ""));
      const nxt = findNextNonEmpty(lines, i + 1);
      out.perfekt.de = de;
      out.perfekt.ru = nxt.value || "";
      continue;
    }
  }

  return out;
}

function parseSynonyms(cellText) {
  const lines = splitLines(cellText);
  const out = [];

  for (const ln of lines) {
    // expected: "anfangen — начинать"
    const parts = ln.split("—").map((x) => x.trim());
    if (parts.length >= 2) {
      out.push({ word: normSpaces(parts[0]), translation: normSpaces(parts.slice(1).join("—")) });
    } else {
      // allow "word - translation" too
      const p2 = ln.split("-").map((x) => x.trim());
      if (p2.length >= 2) out.push({ word: normSpaces(p2[0]), translation: normSpaces(p2.slice(1).join("-")) });
    }
  }

  return takeMax(out, 3);
}

function parsePrefixes(cellText) {
  const lines = splitLines(cellText).map((x) => x.toLowerCase());
  let separableRaw = "";
  let inseparableRaw = "";
  let notes = "";

  for (const ln of lines) {
    if (ln.includes("отделяемые")) {
      separableRaw = ln.split(":").slice(1).join(":").trim();
    } else if (ln.includes("неотделяемые")) {
      inseparableRaw = ln.split(":").slice(1).join(":").trim();
    } else {
      // extra lines go to notes
      notes += (notes ? "\n" : "") + ln;
    }
  }

  function splitPrefixList(s) {
    const t = normSpaces(s)
      .replace(/[—–]/g, "")      // remove dashes meaning "none"
      .replace(/\./g, "")
      .trim();
    if (!t) return [];
    // split by comma or spaces
    const parts = t.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    // keep only things like "an-" "auf-" or "zurück" (you may store words too)
    return parts
      .map((p) => p.replace(/,+$/, ""))
      .filter((p) => p && p !== "-" && p !== "—");
  }

  return {
    separable: splitPrefixList(separableRaw),
    inseparable: splitPrefixList(inseparableRaw),
    notes: notes ? normSpaces(notes) : ""
  };
}

function scoreFromRaw(freqRaw, freqScore) {
  const n = Number(freqScore);
  if (!Number.isNaN(n) && n > 0) return n;

  // fallback: parse "TOP = 5" / "HIGH" / "MID" / "LOW"
  const t = String(freqRaw ?? "").toUpperCase();
  const m = t.match(/=\s*(\d+)/);
  if (m) return Number(m[1]) || 0;

  if (t.includes("TOP")) return 5;
  if (t.includes("HIGH")) return 4;
  if (t.includes("MID")) return 3;
  if (t.includes("LOW")) return 2;
  return 0;
}

function makeId(inf) {
  // Keep German chars, just normalize spaces
  return normSpaces(inf).toLowerCase();
}

function loadWorkbook(xlsxPath) {
  if (!fs.existsSync(xlsxPath)) die(`Excel file not found: ${xlsxPath}`);
  return XLSX.readFile(xlsxPath, { cellDates: false });
}

function sheetToObjects(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) die(`Sheet not found: ${sheetName}`);

  // defval: "" => empty cells become empty strings
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  return rows;
}

function main() {
  const xlsxPath = getArg("--xlsx", null) ?? getArg("-x", null);
  const sheet = getArg("--sheet", "LC_Parsed");
  const outPath = getArg("--out", "verbs_from_lc_parsed.json");

  if (!xlsxPath) {
    console.log("Usage:");
    console.log('  node tools/export_lc_parsed_to_json.mjs --xlsx "CURRENT.xlsx" --sheet LC_Parsed --out verbs.json');
    process.exit(0);
  }

  const wb = loadWorkbook(xlsxPath);
  const rows = sheetToObjects(wb, sheet);

  const verbs = [];
  const seen = new Map(); // id -> count

  for (const r of rows) {
    const infinitive = normSpaces(r["infinitive"]);
    if (!infinitive) continue;

    const id = makeId(infinitive);
    seen.set(id, (seen.get(id) ?? 0) + 1);

    const freq = scoreFromRaw(r["freq_raw"], r["freq_score"]);

    const translationsLines = splitLines(r["translations (lines)"]);
    const translations = padTo(takeMax(translationsLines, 4), 4, "");

    const serviceLine = normSpaces(r["service (line)"]);

    const forms = parseForms3Lines(r["forms (3 lines)"], serviceLine);
    const examples = parseExamples(r["examples (lines)"]);
    const synonyms = parseSynonyms(r["synonyms (lines)"]);
    const prefixes = parsePrefixes(r["prefixes (lines)"]);

    const blockStart = Number(r["block_start_row"] || 0);
    const blockEnd = Number(r["block_end_row"] || 0);

    // Quality flags
    const missing = [];
    if (!freq) missing.push("frequency");
    if (!translations.some((x) => normSpaces(x))) missing.push("translations");
    if (!forms.praesens_3 || !forms.praeteritum || !forms.partizip_2) missing.push("forms");
    // examples/synonyms/prefixes are optional but desired:
    if (!examples.praesens.de) missing.push("examples.praesens");
    if (!examples.modal.de) missing.push("examples.modal");
    if (!examples.praeteritum.de) missing.push("examples.praeteritum");
    if (!examples.perfekt.de) missing.push("examples.perfekt");
    if (!synonyms.length) missing.push("synonyms");
    if (!prefixes.separable.length && !prefixes.inseparable.length) missing.push("prefixes");

    verbs.push({
      id,
      frequency: freq,
      infinitive,
      translations,
      forms,
      examples,
      synonyms,
      prefixes,
      raw: {
        freq_raw: normSpaces(r["freq_raw"]),
        blockStartRow: blockStart || null,
        blockEndRow: blockEnd || null
      },
      quality: {
        hasAllRequired: missing.filter((x) => ["frequency", "translations", "forms"].includes(x)).length === 0,
        missing
      }
    });
  }

  // Sort by frequency desc, then infinitive asc (nice for humans)
  verbs.sort((a, b) => (b.frequency - a.frequency) || a.infinitive.localeCompare(b.infinitive, "de"));

  // Duplicate stats
  const dup = [...seen.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);

  const out = {
    schema: "lingocard-verbs-v2.2",
    meta: {
      language: "de",
      translationLanguage: "ru",
      createdAt: new Date().toISOString(),
      source: {
        workbook: path.basename(xlsxPath),
        sheet
      },
      stats: {
        totalRows: rows.length,
        verbsExported: verbs.length,
        uniqueIds: seen.size,
        duplicateVerbKinds: dup.length,
        duplicateExtraEntries: dup.reduce((s, [, c]) => s + (c - 1), 0)
      },
      duplicates: dup.slice(0, 50).map(([id, count]) => ({ id, count })) // top 50, чтобы не раздувать файл
    },
    verbs
  };

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`[LC][OK] Exported: ${verbs.length} verbs -> ${outPath}`);
  console.log(`[LC] Duplicates: kinds=${out.meta.stats.duplicateVerbKinds}, extra=${out.meta.stats.duplicateExtraEntries}`);
}

main();
