function hasText(x){ return typeof x === "string" && x.trim().length > 0; }
function hasArr(x){ return Array.isArray(x) && x.length > 0; }
function hasObj(x){ return x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length > 0; }

export function buildBoxesFromVerbSample(v){
  // Геометрия под 150×105мм
  const boxes = [];

  // top row
  boxes.push({ id:"freq", xMm:6,  yMm:6,  wMm:26, hMm:10, bind:"freq", type:"frequencyDots", fontPt:12 });
  boxes.push({ id:"inf",  xMm:34, yMm:6,  wMm:82, hMm:12, bind:"inf", fontPt:26 });
  boxes.push({ id:"forms",xMm:118,yMm:6,  wMm:26, hMm:22, bind:"formsLine", fontPt:13 });

  // meanings line
  boxes.push({ id:"meanings", xMm:34, yMm:18, wMm:110, hMm:10, bind:"meaningsLine", fontPt:12 });

  let y = 30;

  // rektion
  if (hasArr(v?.rektion)){
    // Keep stable id for Rektion block
    boxes.push({ id:"rek", xMm:6, yMm:y, wMm:138, hMm:12, bind:"rektionBlock", fontPt:10 });
    y += 14;
  }

  // examples (главный блок)
  if (hasObj(v?.examples)){
    boxes.push({ id:"examples", xMm:6, yMm:y, wMm:138, hMm:34, bind:"examplesBlock", fontPt:11 });
    y += 36;
  }

  // rektion usage (если есть) — компактно
  if (hasObj(v?.rektion_usage)){
    boxes.push({ id:"rektion_usage", xMm:6, yMm:y, wMm:138, hMm:10, bind:"rektionUsageBlock", fontPt:9 });
    y += 12;
  }

  // synonyms (низ)
  if (hasObj(v?.synonyms)){
    boxes.push({ id:"synonyms", xMm:6, yMm:92, wMm:138, hMm:9, bind:"synonymsLine", fontPt:9 });
  }

  // страховка
  for (const b of boxes){
    if (!Number.isFinite(b.wMm)) b.wMm = 60;
    if (!Number.isFinite(b.hMm)) b.hMm = 10;
    if (!Number.isFinite(b.fontPt)) b.fontPt = 12;
  }

  return boxes;
}
