import { log } from "../utils/log.js";

export function deleteBoxById(state, id){
  if (!id) return;
  state.boxes = (state.boxes || []).filter(b => b.id !== id);
  if (state.selectedBoxId === id) state.selectedBoxId = null;
}

const LS_KEY = "lingocard_next_state_v1";
const deepClone = (x) => JSON.parse(JSON.stringify(x));

function defaultLayout(){
  return {
    card: { widthMm: 150, heightMm: 105 },
    items: {
      inf:   { type:"text", xMm: 10, yMm: 12, wMm: 130, hMm: 14, fontPt: 26, align:"left", visible:true, manual:false },
      tr:    { type:"text", xMm: 10, yMm: 26, wMm: 130, hMm: 10, fontPt: 12, align:"left", visible:true, manual:false },
      forms: { type:"text", xMm: 10, yMm: 38, wMm: 130, hMm: 10, fontPt: 14, align:"left", visible:true, manual:false },
    }
  };
}

function defaultState(){
  return {
    editing: false,
    showRulers: false,
    selectedIndex: 0,
    data: { verbs: [] },
    layout: defaultLayout(),
    canUndo: false,
    canRedo: false,
  };
}

const history = { past: [], future: [], limit: 30 };
function pushHistory(st){
  history.past.push(deepClone({ data: st.data, layout: st.layout, selectedIndex: st.selectedIndex }));
  if (history.past.length > history.limit) history.past.shift();
  history.future.length = 0;
}
function canUndo(){ return history.past.length > 0; }
function canRedo(){ return history.future.length > 0; }

let _state = null;
const _subs = new Set();
function emit(){ for (const fn of _subs) fn(_state); }

function save(){
  try{
    localStorage.setItem(LS_KEY, JSON.stringify({ data:_state.data, layout:_state.layout, selectedIndex:_state.selectedIndex }));
  } catch (e) { log.warn("legacy state save failed", { err: String(e) }); }
}
function load(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { log.warn("legacy state load failed", { err: String(e) }); return null; }
}

export function initState(){
  const raw = load();
  _state = { ...defaultState(), ...(raw || {}) };
  _state.canUndo = canUndo();
  _state.canRedo = canRedo();
  emit();
  return _state;
}

export function getState(){
  if (!_state) initState();
  return _state;
}

export function subscribe(fn){
  _subs.add(fn);
  return () => _subs.delete(fn);
}

function reduce(st, action){
  switch(action?.type){
    case "persist": save(); return st;
    case "toggleEditing": return { ...st, editing: !st.editing };
    case "toggleRulers":  return { ...st, showRulers: !st.showRulers };
    case "loadData":
      pushHistory(st);
      return { ...st, data: action.data || { verbs: [] }, selectedIndex: 0 };
    case "selectVerb":
      return { ...st, selectedIndex: Number(action.index) || 0 };
    default:
      return st;
  }
}

export function dispatch(action){
  if (!_state) initState();

  if (action?.type === "undo"){
    if (!canUndo()) return;
    history.future.push(deepClone({ data:_state.data, layout:_state.layout, selectedIndex:_state.selectedIndex }));
    const snap = history.past.pop();
    _state = { ..._state, ...snap };
    _state.canUndo = canUndo();
    _state.canRedo = canRedo();
    emit();
    return;
  }

  if (action?.type === "redo"){
    if (!canRedo()) return;
    history.past.push(deepClone({ data:_state.data, layout:_state.layout, selectedIndex:_state.selectedIndex }));
    const snap = history.future.pop();
    _state = { ..._state, ...snap };
    _state.canUndo = canUndo();
    _state.canRedo = canRedo();
    emit();
    return;
  }

  _state = reduce(_state, action);
  _state.canUndo = canUndo();
  _state.canRedo = canRedo();
  emit();
}

export const actions = {
  persist: () => ({ type:"persist" }),
  undo: () => ({ type:"undo" }),
  redo: () => ({ type:"redo" }),
  toggleEditing: () => ({ type:"toggleEditing" }),
  toggleRulers: () => ({ type:"toggleRulers" }),
  loadData: (data) => ({ type:"loadData", data }),
  selectVerb: (index) => ({ type:"selectVerb", index }),
};
