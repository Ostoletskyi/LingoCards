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
    let nextNotes = (ctx.state.notesByVerb && typeof ctx.state.notesByVerb === "object") ? { ...ctx.state.notesByVerb } : {};
    for (const k of Object.keys(nextNotes)){
      if (nextNotes[k] && nextNotes[k][id] !== undefined){
        const copy = { ...nextNotes[k] };
        delete copy[id];
        nextNotes[k] = copy;
      }
    }

    ctx.setState({ boxes: next, notesByVerb: nextNotes, selectedBoxId: null }, { autosave: true });
    ctx.log.info("box delete", { id });

    e.preventDefault();
  });
}
