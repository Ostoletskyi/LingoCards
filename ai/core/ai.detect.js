// ai/core/ai.detect.js
// Browser build note:
// Real disk detection is only possible in a desktop shell (Electron/Node) or via a native helper.
// We keep this module as a placeholder to match the project architecture.

export function detectLMStudio(){
  return {
    supported: false,
    found: false,
    pathsTried: [
      "C:\\\\Program Files\\\\LM Studio\\\\",
      "C:\\\\Program Files (x86)\\\\LM Studio\\\\",
      "C:\\\\Users\\\\<USER>\\\\AppData\\\\Local\\\\LM Studio\\\\"
    ],
    hint: "Disk detection is not available in the browser build."
  };
}