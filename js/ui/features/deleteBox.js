// js/ui/features/deleteBox.js
import { isEditingText } from "../../editor/textEdit.js";

export function installDeleteBoxHotkey(ctx){
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Delete") return;
    if (isEditingText()) return;

    const id = ctx.state.selectedBoxId;
    if (!id) return;

    const boxes = Array.isArray(ctx.state.boxes) ? ctx.state.boxes : [];
    const idx = boxes.findIndex(b => b.id === id);
    if (idx < 0) return;

    const next = boxes.slice(0, idx).concat(boxes.slice(idx + 1));

    // чистим notesByVerb
    if (ctx.state.notesByVerb && typeof ctx.state.notesByVerb === "object"){
      for (const k of Object.keys(ctx.state.notesByVerb)){
        if (ctx.state.notesByVerb[k] && ctx.state.notesByVerb[k][id] !== undefined){
          delete ctx.state.notesByVerb[k][id];
        }
      }
    }

    ctx.setState({ boxes: next, notesByVerb: ctx.state.notesByVerb, selectedBoxId: null }, { autosave: true });
    ctx.log.info("box delete", { id });

    e.preventDefault();
  });
}
