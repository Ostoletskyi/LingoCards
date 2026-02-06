// js/version.js
// Auto-updated by fix-release.ps1 on release.
// Single source of truth for UI / backups / diagnostics.

export const APP_VERSION = Object.freeze({
  app: "LingoCard Editor",
  tag: "v1.0.7-commercial",
  build: "2026-02-04 22:33:47",
  commit: "a2c1cf9d05a04d93dfe4dc3a748ff93bde73ac77",
  note: "release: v1.0.7-commercial",
});

export function formatVersionLine(v = APP_VERSION) {
  const tag = v && v.tag ? String(v.tag) : "dev";
  const build = v && v.build ? String(v.build) : "local";
  const commit = v && v.commit ? String(v.commit) : "";
  const shortCommit = commit ? commit.slice(0, 8) : "";
  const dot = " В· ";
  return shortCommit
    ? "LingoCard " + tag + dot + shortCommit + dot + build
    : "LingoCard " + tag + dot + build;
}