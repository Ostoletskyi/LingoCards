// js/utils/search.js
// Single-responsibility helper: wildcard matching for the UI search.

function escapeRegex(s){
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile user query into a RegExp.
 * Rules:
 *  - Case-insensitive.
 *  - "*" matches any substring.
 *  - If query contains "*":
 *      - no leading "*" => anchor to start
 *      - no trailing "*" => anchor to end
 *    (so `abc*` = startsWith, `*abc` = endsWith, `*abc*` = contains)
 *  - If query has no "*": substring match.
 */
export function compileWildcardQuery(raw){
  const q = String(raw || "").trim();
  if (!q) return null;

  const hasStar = q.includes("*");
  if (!hasStar){
    // simple substring match
    return new RegExp(escapeRegex(q), "i");
  }

  const body = escapeRegex(q).replace(/\\\*/g, ".*");
  const prefix = q.startsWith("*") ? "" : "^";
  const suffix = q.endsWith("*") ? "" : "$";
  return new RegExp(prefix + body + suffix, "i");
}

export function matchesQuery(text, re){
  if (!re) return false;
  const s = String(text || "");
  return re.test(s);
}
