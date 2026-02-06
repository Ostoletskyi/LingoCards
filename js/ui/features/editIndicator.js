// js/ui/features/editIndicator.js
// Вместо fixed-индикатора снизу справа — подсветка существующих UI-кнопок.
// Ничего не рисуем в body. Только отражаем state.editing в UI.

function setGlow(el, on){
  if (!el) return;
  // мягкое "горит/не горит"
  el.style.boxShadow = on ? "0 0 0 2px rgba(34,197,94,0.55), 0 10px 30px rgba(34,197,94,0.12)" : "";
  el.style.borderColor = on ? "rgba(34,197,94,0.65)" : "";
  el.style.opacity = on ? "1" : "0.88";
}

function findEditButton(){
  // 1) если у тебя есть конкретный id — лучше всего:
  // return document.getElementById("lcBtnEdit");

  // 2) fallback: ищем кнопку с текстом "Редактировать" в topbar
  const top = document.getElementById("lcTopActions") || document.getElementById("topBar");
  if (!top) return null;

  const btns = top.querySelectorAll("button");
  for (const b of btns){
    const t = (b.textContent || "").trim().toLowerCase();
    if (t === "редактировать" || t.includes("редактир")) return b;
  }
  return null;
}

function findDockEditIcon(){
  // если позже добавишь иконку в dock — дай ей id="lcDockEditBtn"
  return document.getElementById("lcDockEditBtn");
}

export function installEditIndicator(ctxApp){
  if (ctxApp.__lcEditIndicatorInstalled) return;
  ctxApp.__lcEditIndicatorInstalled = true;

  const editBtn = () => findEditButton();
  const dockBtn = () => findDockEditIcon();

  function render(){
    const on = !!ctxApp.state?.editing;
    setGlow(editBtn(), on);
    setGlow(dockBtn(), on);
  }

  // первичный рендер
  render();

  // аккуратно цепляемся к setState (без бесконечных дублей)
  const orig = ctxApp.setState.bind(ctxApp);
  if (!ctxApp.__lcSetStateWrapped){
    ctxApp.__lcSetStateWrapped = true;
    ctxApp.setState = (patch, opts) => {
      orig(patch, opts);
      if (patch && Object.prototype.hasOwnProperty.call(patch, "editing")) {
        render();
      }
    };
  }
}
