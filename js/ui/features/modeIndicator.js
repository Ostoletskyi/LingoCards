// js/ui/features/modeIndicator.js
// "Сирена" индикатор режима превью: источник (глаголы) vs созданные карточки.
// Это НЕ кнопки: только визуальный индикатор, чтобы сразу видно было, что сейчас в превью.

function setOn(el, on){
  if (!el) return;
  if (on) el.classList.add("isOn");
  else el.classList.remove("isOn");
}

export function installModeIndicator(ctxApp){
  if (ctxApp.__lcModeIndicatorInstalled) return;
  ctxApp.__lcModeIndicatorInstalled = true;

  const elSource = () => document.getElementById("lcModeSiren_source");
  const elCards  = () => document.getElementById("lcModeSiren_cards");

  // One-time class setup
  try {
    elSource()?.classList.add("isSource");
    elCards()?.classList.add("isCards");
  } catch {}

  let lastMode = null;

  function render(){
    const mode = ctxApp.state?.viewMode || "cards";
    lastMode = mode;
    setOn(elSource(), mode === "source");
    setOn(elCards(),  mode !== "source");
  }

  render();

  // Wrap setState carefully (do not clobber other wrappers).
  // We re-render when:
  // - patch contains viewMode
  // - OR the internal state.viewMode changed via direct mutation + setState without viewMode in patch
  const orig = ctxApp.setState.bind(ctxApp);
  if (!ctxApp.__lcModeSetStateWrapped){
    ctxApp.__lcModeSetStateWrapped = true;
    ctxApp.setState = (patch, opts) => {
      orig(patch, opts);
      const hasKey = !!(patch && Object.prototype.hasOwnProperty.call(patch, "viewMode"));
      const curMode = ctxApp.state?.viewMode || "cards";
      if (hasKey || curMode !== lastMode) render();
    };
  }
}
