const MAX_BUF = 200;
const buf = [];
const errs = [];

function nowIso(){
  const d = new Date();
  return d.toISOString();
}

function push(level, msg, meta){
  const rec = { ts: nowIso(), level, msg: String(msg ?? ""), meta: meta ?? null };
  buf.push(rec);
  while (buf.length > MAX_BUF) buf.shift();
  return rec;
}

function consoleOut(level, rec){
  const tag = `[LC ${rec.level.toUpperCase()}] ${rec.ts}`;
  if (level === "error") console.error(tag, rec.msg, rec.meta ?? "");
  else if (level === "warn") console.warn(tag, rec.msg, rec.meta ?? "");
  else console.log(tag, rec.msg, rec.meta ?? "");
}

export const log = {
  info(msg, meta){
    const rec = push("info", msg, meta);
    consoleOut("info", rec);
    return rec;
  },
  warn(msg, meta){
    const rec = push("warn", msg, meta);
    consoleOut("warn", rec);
    return rec;
  },
  error(msg, meta){
    const rec = push("error", msg, meta);
    consoleOut("error", rec);
    errs.push(rec);
    while (errs.length > 50) errs.shift();
    return rec;
  },
  getBuffer(){ return buf.slice(); },
  getErrors(){ return errs.slice(); },
};
