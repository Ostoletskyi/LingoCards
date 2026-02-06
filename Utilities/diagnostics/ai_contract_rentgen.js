#!/usr/bin/env node
'use strict';

/*
  AI Contract "Rentgen" (X-ray) for LingoCard
  ------------------------------------------
  This script inspects:
    1) The AI contract keys (ai/core/ai.contract.js)
    2) The mapping from contract answers -> card boxes (ai/ai.entry.js)
    3) The template box IDs used in the etalon card template (js/verbs/01lingocard_etalon_card_template.json)
  and prints a compact report:
    - required keys
    - keys used per box
    - unused keys (likely missing in render or prompt)
    - missing template boxes (likely UI mismatch)
*/

const fs = require('fs');
const path = require('path');

function readText(p){
  return fs.readFileSync(p, 'utf8');
}
function die(msg){
  console.error(msg);
  process.exit(2);
}

function extractRequiredKeys(contractText){
  // naive but robust enough: look for patterns like:
  //   if(typeof a.inf !== 'string') missing.push('inf');
  const rx = /missing\.push\(\s*'([^']+)'\s*\)/g;
  const keys = new Set();
  let m;
  while((m = rx.exec(contractText))) keys.add(m[1]);
  return Array.from(keys);
}

function extractBoxKeyUsage(aiEntryText){
  // We parse the buildBoxesFromContractAnswers section:
  //   lines.push(''+(a.tr_1_ru||'') ... )
  // mapping is hardcoded by box id.
  // We'll approximate by scanning each "id: '...'" block and collecting "a.<key>" occurrences.
  const sectionStart = aiEntryText.indexOf('function buildBoxesFromContractAnswers');
  if(sectionStart < 0) return {};
  const section = aiEntryText.slice(sectionStart, sectionStart + 12000);

  const rxBox = /boxes\.push\(\s*\{\s*id:\s*'([^']+)'[\s\S]*?\}\s*\)\s*;/g;
  const out = {};
  let m;
  while((m = rxBox.exec(section))){
    const boxId = m[1];
    const boxText = m[0];
    const rxKey = /\ba\.([a-zA-Z0-9_]+)\b/g;
    const keys = new Set();
    let km;
    while((km = rxKey.exec(boxText))){
      keys.add(km[1]);
    }
    out[boxId] = Array.from(keys).sort();
  }
  return out;
}

function readTemplateBoxIds(templateJsonText){
  let obj;
  try{ obj = JSON.parse(templateJsonText); } catch(e){ return []; }
  const cards = obj.cards || [];
  if(!cards[0] || !Array.isArray(cards[0].boxes)) return [];
  return cards[0].boxes.map(b => b.id).filter(Boolean);
}

function uniq(arr){ return Array.from(new Set(arr)); }

function main(){
  const root = process.cwd();

  const pContract = path.join(root, 'ai', 'core', 'ai.contract.js');
  const pAiEntry = path.join(root, 'ai', 'ai.entry.js');
  const pTemplate = path.join(root, 'js', 'verbs', '01lingocard_etalon_card_template.json');

  if(!fs.existsSync(pContract)) die('Not found: ' + pContract);
  if(!fs.existsSync(pAiEntry)) die('Not found: ' + pAiEntry);
  if(!fs.existsSync(pTemplate)) die('Not found: ' + pTemplate);

  const contractText = readText(pContract);
  const aiEntryText  = readText(pAiEntry);
  const templateText = readText(pTemplate);

  const requiredKeys = extractRequiredKeys(contractText).sort();
  const boxUsage = extractBoxKeyUsage(aiEntryText);
  const templateBoxIds = readTemplateBoxIds(templateText);

  const usedKeys = uniq(Object.values(boxUsage).flat()).sort();

  const unusedKeys = requiredKeys.filter(k => !usedKeys.includes(k));
  const extraKeys  = usedKeys.filter(k => !requiredKeys.includes(k));

  // Template boxes:
  // - core boxes should exist in the etalon template
  // - some boxes are optional because ai.entry.js can create/split them dynamically
  const coreBoxes = ['inf','tr','forms','syn','examples','freqCorner'];
  const optionalBoxes = ['pref','rek'];
  const missingCore = coreBoxes.filter(id => !templateBoxIds.includes(id));
  const missingOptional = optionalBoxes.filter(id => !templateBoxIds.includes(id));

  console.log('========== LingoCard AI Contract Rentgen ==========');
  console.log('Project root: ' + root);
  console.log('');

  console.log('--- Required answer keys (contract) ---');
  console.log(requiredKeys.join(', '));
  console.log('');

  console.log('--- Box -> answer keys used (from ai.entry.js) ---');
  Object.keys(boxUsage).sort().forEach(id => {
    console.log('[' + id + '] ' + boxUsage[id].join(', '));
  });
  console.log('');

  console.log('--- Template boxes (etalon template) ---');
  console.log(templateBoxIds.join(', ') || '(none found)');
  console.log('');

  if(missingCore.length){
    console.log('!!! Missing CORE template boxes: ' + missingCore.join(', '));
  }else{
    console.log('OK: template contains all core box IDs.');
  }

  if(missingOptional.length){
    console.log('NOTE: optional template boxes not present (ai.entry.js can add/split): ' + missingOptional.join(', '));
  }else{
    console.log('OK: optional boxes are present too.');
  }

  if(unusedKeys.length){
    console.log('!!! Contract keys NOT used in buildBoxesFromContractAnswers: ' + unusedKeys.join(', '));
  }else{
    console.log('OK: all contract keys are used somewhere in buildBoxesFromContractAnswers.');
  }

  if(extraKeys.length){
    console.log('NOTE: keys used by boxes but not in contract (check for typos / legacy): ' + extraKeys.join(', '));
  }

  console.log('===================================================');
}

main();
