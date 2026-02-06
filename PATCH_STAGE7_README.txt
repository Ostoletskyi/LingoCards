Stage 7 (final): LM Studio JSON extraction & prompt hardening

What it fixes:
- Some local models (e.g. gpt-oss-20b) may put the actual answer into `message.reasoning` and leave `message.content` empty.
  The AI panel now reads BOTH: content first, then reasoning as fallback.
- max_tokens increased to reduce truncation risk.
- prompt text clarified: JSON must be returned as the main response (content), without extra commentary.

Install:
- Unzip into the project root (merge/overwrite).
- Files changed:
  - ai/ai.entry.js
