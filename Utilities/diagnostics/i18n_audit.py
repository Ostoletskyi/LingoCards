#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LingoCard i18n audit.

Goal: keep UI texts sane across RU/DE/EN.

What it checks:
1) All UI-referenced i18n keys exist in ru.js (source of truth).
2) All ru.js keys exist in de.js and en.js (no silent fallbacks).
3) No empty translations.
4) Flags *likely* untranslated strings: de==ru or en==ru for keys actually used by UI.

Exit codes:
 0 = OK
 1 = issues found
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Dict, Set, Tuple


ROOT = Path(__file__).resolve().parents[2]  # project root
I18N_DIR = ROOT / "js" / "i18n"
AI_I18N_FILE = ROOT / "ai" / "ai.i18n.js"


def die(msg: str, code: int = 1) -> None:
    print(msg)
    raise SystemExit(code)


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


def js_object_export_to_dict(js_text: str) -> Dict[str, str]:
    """Parse `export default { ... }` where keys/values are JSON-ish."""

    # remove JS comments // and /* */ (best-effort)
    s = re.sub(r"/\*.*?\*/", "", js_text, flags=re.S)
    s = re.sub(r"(^|\s)//.*$", "", s, flags=re.M)

    m = re.search(r"export\s+default\s+(\{.*\})\s*;?\s*$", s, flags=re.S)
    if not m:
        die("i18n_audit: cannot find `export default { ... }` block")
    obj = m.group(1)

    # normalize to JSON:
    # - remove trailing commas before } or ]
    obj = re.sub(r",\s*(\}|\])", r"\1", obj)

    # keys/values are already double-quoted in our repo.
    import json

    try:
        data = json.loads(obj)
    except Exception as e:
        die(f"i18n_audit: failed to parse i18n dict as JSON ({e})")

    # enforce strings
    out: Dict[str, str] = {}
    for k, v in data.items():
        if v is None:
            out[str(k)] = ""
        else:
            out[str(k)] = str(v)
    return out


def load_lang_dict(lang: str) -> Dict[str, str]:
    p = I18N_DIR / f"{lang}.js"
    if not p.exists():
        die(f"i18n_audit: missing {p}")
    return js_object_export_to_dict(read_text(p))


UI_KEY_PATTERNS: Tuple[re.Pattern, ...] = (
    # i18n.t('key')
    re.compile(r"\bi18n\.t\(\s*['\"]([^'\"]+)['\"]"),
    # bindText(el,'key') / bindTip(el,'key')
    re.compile(r"\bbindText\(\s*[^,]+,\s*['\"]([^'\"]+)['\"]"),
    re.compile(r"\bbindTip\(\s*[^,]+,\s*['\"]([^'\"]+)['\"]"),
    # data attributes in html
    re.compile(r"data-i18n-key=\"([^\"]+)\""),
    re.compile(r"data-tip-key=\"([^\"]+)\""),
)


def collect_used_keys() -> Set[str]:
    keys: Set[str] = set()
    for base in (ROOT / "js", ROOT):
        # scan js + html only
        for p in base.rglob("*"):
            if not p.is_file():
                continue
            if p.suffix.lower() not in (".js", ".html"):
                continue
            # skip vendor/thirdparty if any
            if any(part.lower() in ("node_modules", ".git") for part in p.parts):
                continue
            txt = read_text(p)
            for rx in UI_KEY_PATTERNS:
                for m in rx.finditer(txt):
                    keys.add(m.group(1))
    return keys


def _extract_braced_block(text: str, start_at: int) -> Tuple[str, int]:
    """Extract a balanced {...} block starting at the first '{' at/after start_at."""
    i = text.find("{", start_at)
    if i < 0:
        return "", -1
    depth = 0
    j = i
    in_str = False
    str_ch = ""
    esc = False
    while j < len(text):
        ch = text[j]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == str_ch:
                in_str = False
            j += 1
            continue
        if ch in ("'", '"'):
            in_str = True
            str_ch = ch
            j += 1
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[i:j+1], j+1
        j += 1
    return "", -1


def _parse_ai_i18n(ai_path: Path) -> Dict[str, Dict[str, str]]:
    """Parse ai/ai.i18n.js into {lang: {key: value}} (best-effort).

    We don't need full JS execution; we just need key sets & empties.
    """
    if not ai_path.exists():
        return {}
    txt = read_text(ai_path)
    # Find "var AI_I18N = {" then locate ru/de/en blocks.
    m = re.search(r"AI_I18N\s*=\s*{", txt)
    if not m:
        return {}

    out: Dict[str, Dict[str, str]] = {}
    for lang in ("ru", "de", "en"):
        m2 = re.search(r"\b" + re.escape(lang) + r"\s*:\s*{", txt)
        if not m2:
            continue
        block, _ = _extract_braced_block(txt, m2.end()-1)
        if not block:
            continue
        # Extract key: "value" pairs inside the block.
        # This file uses JS object literals (mostly bare keys, sometimes quoted).
        pairs: Dict[str, str] = {}
        # quoted keys
        for km in re.finditer(r"\"([^\"]+)\"\s*:\s*\"([^\"]*)\"", block):
            pairs[km.group(1)] = km.group(2)
        # bare keys
        for km in re.finditer(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\"([^\"]*)\"", block):
            pairs.setdefault(km.group(1), km.group(2))
        out[lang] = pairs
    return out


def is_likely_untranslated(ru: str, other: str) -> bool:
    if not ru or not other:
        return False
    if ru == other:
        # exclude "technical" values: pure punctuation or very short codes
        if len(ru.strip()) <= 2:
            return False
        return True
    return False


def main() -> int:
    ru = load_lang_dict("ru")
    de = load_lang_dict("de")
    en = load_lang_dict("en")

    ru_keys = set(ru.keys())
    de_keys = set(de.keys())
    en_keys = set(en.keys())

    used = collect_used_keys()
    used = {k for k in used if k.startswith("ui.") or k.startswith("box.") or k.startswith("ai.")}

    problems = 0

    # 1) keys referenced by UI must exist in RU dict
    missing_in_ru = sorted(k for k in used if k not in ru_keys)
    if missing_in_ru:
        problems += 1
        print("[FAIL] Missing keys in ru.js (referenced by UI):")
        for k in missing_in_ru[:80]:
            print(f"  - {k}")
        if len(missing_in_ru) > 80:
            print(f"  ... +{len(missing_in_ru)-80} more")
        print()

    # 2) RU keys must exist in other languages
    miss_de = sorted(k for k in ru_keys if k not in de_keys)
    miss_en = sorted(k for k in ru_keys if k not in en_keys)
    if miss_de:
        problems += 1
        print(f"[FAIL] de.js is missing {len(miss_de)} keys (compared to ru.js)")
        for k in miss_de[:80]:
            print(f"  - {k}")
        if len(miss_de) > 80:
            print(f"  ... +{len(miss_de)-80} more")
        print()
    if miss_en:
        problems += 1
        print(f"[FAIL] en.js is missing {len(miss_en)} keys (compared to ru.js)")
        for k in miss_en[:80]:
            print(f"  - {k}")
        if len(miss_en) > 80:
            print(f"  ... +{len(miss_en)-80} more")
        print()

    # 3) no empty strings
    def empty_keys(d: Dict[str, str]) -> Set[str]:
        return {k for k, v in d.items() if v is None or str(v).strip() == ""}

    empt_ru = sorted(empty_keys(ru))
    empt_de = sorted(empty_keys(de))
    empt_en = sorted(empty_keys(en))
    if empt_ru:
        problems += 1
        print(f"[FAIL] ru.js has {len(empt_ru)} empty translations")
        for k in empt_ru[:80]:
            print(f"  - {k}")
        print()
    if empt_de:
        problems += 1
        print(f"[FAIL] de.js has {len(empt_de)} empty translations")
        for k in empt_de[:80]:
            print(f"  - {k}")
        print()
    if empt_en:
        problems += 1
        print(f"[FAIL] en.js has {len(empt_en)} empty translations")
        for k in empt_en[:80]:
            print(f"  - {k}")
        print()

    # 4) likely untranslated (ONLY for used keys, to avoid noise)
    # Some strings are intentionally identical across languages (e.g., short status labels,
    # technical abbreviations, or German-only grammar examples). Those should not fail CI.
    allow_same = {
        "ui.search.placeholder",
        "ui.status.pdfAll",
        "ui.status.pdfOne",
    }
    untranslated_de = sorted(
        k for k in used
        if k not in allow_same and k in ru and k in de and is_likely_untranslated(ru[k], de[k])
    )
    untranslated_en = sorted(
        k for k in used
        if k not in allow_same and k in ru and k in en and is_likely_untranslated(ru[k], en[k])
    )

    if untranslated_de:
        print(f"[WARN] Likely untranslated in de (de == ru) for {len(untranslated_de)} used keys:")
        for k in untranslated_de[:80]:
            print(f"  - {k}: {ru[k]}")
        if len(untranslated_de) > 80:
            print(f"  ... +{len(untranslated_de)-80} more")
        print()
    if untranslated_en:
        print(f"[WARN] Likely untranslated in en (en == ru) for {len(untranslated_en)} used keys:")
        for k in untranslated_en[:80]:
            print(f"  - {k}: {ru[k]}")
        if len(untranslated_en) > 80:
            print(f"  ... +{len(untranslated_en)-80} more")
        print()

    # 5) AI panel mini-i18n (ai/ai.i18n.js)
    ai = _parse_ai_i18n(AI_I18N_FILE)
    if ai:
        ai_ru = ai.get("ru", {})
        ai_de = ai.get("de", {})
        ai_en = ai.get("en", {})

        def miss(src: Dict[str, str], other: Dict[str, str]) -> List[str]:
            return sorted(k for k in src.keys() if k not in other)

        miss_ai_de = miss(ai_ru, ai_de)
        miss_ai_en = miss(ai_ru, ai_en)
        if miss_ai_de:
            problems += 1
            print(f"[FAIL] AI i18n: de is missing {len(miss_ai_de)} keys (compared to ru)")
            for k in miss_ai_de[:80]:
                print(f"  - {k}")
            if len(miss_ai_de) > 80:
                print(f"  ... +{len(miss_ai_de)-80} more")
            print()
        if miss_ai_en:
            problems += 1
            print(f"[FAIL] AI i18n: en is missing {len(miss_ai_en)} keys (compared to ru)")
            for k in miss_ai_en[:80]:
                print(f"  - {k}")
            if len(miss_ai_en) > 80:
                print(f"  ... +{len(miss_ai_en)-80} more")
            print()

        # empty strings
        empt_ai_ru = sorted(k for k, v in ai_ru.items() if str(v).strip() == "")
        empt_ai_de = sorted(k for k, v in ai_de.items() if str(v).strip() == "")
        empt_ai_en = sorted(k for k, v in ai_en.items() if str(v).strip() == "")
        if empt_ai_ru or empt_ai_de or empt_ai_en:
            problems += 1
            print("[FAIL] AI i18n: empty translations found")
            for k in (empt_ai_ru[:20]):
                print(f"  - ru: {k}")
            for k in (empt_ai_de[:20]):
                print(f"  - de: {k}")
            for k in (empt_ai_en[:20]):
                print(f"  - en: {k}")
            print()

    # Summary
    print("== i18n audit summary ==")
    print(f"  ru keys: {len(ru_keys)}")
    print(f"  de keys: {len(de_keys)}")
    print(f"  en keys: {len(en_keys)}")
    print(f"  ui-referenced keys scanned: {len(used)}")
    if ai:
        print(f"  ai i18n keys (ru/de/en): {len(ai.get('ru',{}))}/{len(ai.get('de',{}))}/{len(ai.get('en',{}))}")

    if problems:
        print("[RESULT] Issues found. Fix before release.")
        return 1
    print("[RESULT] OK")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit as e:
        raise
