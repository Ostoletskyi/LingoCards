# LingoCards Architecture Review

Date: 2026-02-06
Reviewer: Automated agent
Scope: Core runtime, UI composition, state model, and diagnostics.

## Executive summary
The project is modular and readable, but several architectural risks remain:
- The application relies on a single mutable runtime context and shared state, which increases coupling and makes side effects harder to reason about.
- UI features rely on global diagnostics hooks on `window`, which introduces implicit dependencies and can leak debug behavior into production.
- The state model mixes persisted data, UI preferences, and transient UI selections in the same object, complicating schema evolution and testing.
- App initialization concentrates many responsibilities in a single module, making it difficult to test or replace parts independently.

## Automated checks run
- `bash Utilities/diagnostics/smoke_test.sh` (mode: full)
  - Result: **FAILED**
  - Key issues:
    - FILEMAP compare reports one missing entry ("# FILEMAP" marker) and one extra file (`LICENSE`).
    - i18n audit warns about untranslated EN strings for undo/redo tooltips.

## Findings & risks

### 1) Single mutable runtime context & state coupling (Medium)
`initApp` builds a shared `ctx` object with a mutable `state` and exposes `setState` that mutates state via `Object.assign`, while multiple features share the same context object. This tight coupling makes state changes harder to track, increases the chance of unintended side effects, and complicates testing or introducing alternative state stores. Recommendation: introduce a formal state store (or reducer) with explicit mutations and subscriptions, and reduce direct shared mutable access.

Evidence:
- `initApp` creates shared `state` and exposes `ctx.setState` which mutates the same object.【F:js/app/app_parts/initApp.js†L32-L146】
- UI core explicitly enforces sharing the same `ctx` object across features to avoid broken wiring, indicating strong runtime coupling.【F:js/ui/uiCore.js†L48-L114】

### 2) Global diagnostics hooks on `window` (Low/Medium)
The UI bootstrapper writes diagnostic and smoke-test data into `window.LC_DIAG`, and expects consumers to read from this global. This creates hidden dependencies on global state, increases the risk of collisions in embedded contexts, and blurs the boundary between debug and production. Recommendation: gate diagnostics behind a debug flag and expose via module exports rather than globals.

Evidence:
- `uiCore` initializes and mutates `window.LC_DIAG` and related helpers as a global registry.【F:js/ui/uiCore.js†L82-L175】

### 3) Mixed concerns in persisted state schema (Medium)
The persisted state includes domain data (`data`, `cards`), UI preferences (`verbsSortMode`, `searchQuery`, `newCardTemplateMode`), and transient UI selections (`selectedIds`, `marqueeRect`) in a single shape. Even though some transient values are reset, the mix complicates migrations and increases the risk of accidental persistence or corruption. Recommendation: separate domain state, UI preferences, and transient UI state into discrete subtrees or storage layers.

Evidence:
- The state schema in `state.js` includes domain data and UI preferences in the same persisted structure.【F:js/app/app_parts/state.js†L9-L97】
- Transient selections live in the same top-level state structure in defaults.【F:js/app/app_parts/state.js†L99-L150】

### 4) Initialization with multiple responsibilities (Low/Medium)
`initApp` handles state restoration, migration, i18n setup, DOM mount lookup, shell construction, ResizeObserver wiring, and the creation of the runtime context. This concentration makes it harder to test and extend. Recommendation: split initialization into smaller modules (state bootstrap, UI mount, feature install, runtime wiring) and add clear interfaces.

Evidence:
- `initApp` performs state restore, migrations, i18n, mount resolution, and UI shell building in one module.【F:js/app/app_parts/initApp.js†L18-L120】

### 5) Silent error handling via empty catch blocks (Low)
Multiple `try { ... } catch {}` blocks swallow errors silently (e.g., `localStorage` access, autosave). This can hide real issues (e.g., storage quota failures) and complicate debugging. Recommendation: log warnings in catch blocks, at least in debug builds.

Evidence:
- `initApp` silently ignores errors when reading localStorage and saving autosave/migrations.【F:js/app/app_parts/initApp.js†L29-L58】

## Recommendations
1) Introduce a dedicated state management layer with explicit mutations and subscription-driven renders.
2) Isolate diagnostics behind a debug flag, and replace global window hooks with module-scoped exports.
3) Split state into domain, UI preference, and transient subtrees to make migrations safer and testing simpler.
4) Modularize `initApp` into separate bootstrappers to reduce responsibility concentration.
5) Replace empty catch blocks with `log.warn(...)` to preserve observability.

## Notes for follow-up
- Re-run FILEMAP generation (or update `FILEMAP.md`) to eliminate smoke-test false negatives.
- Decide whether the `LICENSE` should be added to FILEMAP or excluded from the filemap check.

