/**
 * @file src/tool-metadata.js
 * @description Shared metadata for supported launch targets and mode ordering.
 *
 * @details
 *   📖 The TUI now supports more than the historical OpenCode/OpenClaw trio.
 *   Centralizing mode metadata keeps the header badge, help screen, key handler,
 *   and CLI parsing aligned instead of hard-coding tool names in multiple files.
 *
 *   📖 The metadata here is intentionally small:
 *   - display label for the active tool badge
 *   - optional emoji for compact UI hints
 *   - flag name used in CLI help
 *
 *   📖 External tool integrations are still implemented elsewhere. This file only
 *   answers "what modes exist?" and "how should they be presented to the user?".
 *
 * @functions
 *   → `getToolMeta` — return display metadata for one mode
 *   → `getToolModeOrder` — stable mode cycle order for the `Z` hotkey
 *
 * @exports TOOL_METADATA, TOOL_MODE_ORDER, COMPAT_COLUMN_SLOTS, getToolMeta, getToolModeOrder
 */
// 📖 Each tool has a unique `color` RGB tuple used for the "Compatible with" column
// 📖 and for coloring the tool name in the Z cycle header badge.
// 📖 `emoji` is the unique icon shown everywhere (header badge, compat column, palette, overlays).
// 📖 OpenCode CLI, Desktop, and Web are the only supported tools for free-coding-models.
export const TOOL_METADATA = {
  opencode: { label: 'OpenCode CLI', emoji: '📦', flag: '--opencode', color: [110, 214, 255] },
  'opencode-desktop': { label: 'OpenCode Desktop', emoji: '📦', flag: '--opencode-desktop', color: [149, 205, 255] },
  'opencode-web': { label: 'OpenCode Web', emoji: '📦', flag: '--opencode-web', color: [180, 220, 255] },
  openclaw: { label: 'OpenClaw', emoji: '🦞', flag: '--openclaw', color: [255, 107, 107] },
  goose: { label: 'Goose', emoji: '🪿', flag: '--goose', color: [155, 255, 155] },
  amp: { label: 'Amp', emoji: '⚡', flag: '--amp', color: [255, 224, 102] },
  aider: { label: 'Aider', emoji: '🧗', flag: '--aider', color: [102, 255, 204] },
  crush: { label: 'Crush', emoji: '💥', flag: '--crush', color: [255, 153, 204] },
  qwen: { label: 'Qwen', emoji: '🤖', flag: '--qwen', color: [204, 153, 255] },
  kilo: { label: 'Kilo', emoji: '⚖️', flag: '--kilo', color: [204, 204, 204] },
  openhands: { label: 'OpenHands', emoji: '👐', flag: '--openhands', color: [255, 187, 153] },
  hermes: { label: 'Hermes', emoji: '🏛️', flag: '--hermes', color: [187, 153, 255] },
  continue: { label: 'Continue', emoji: '⏭️', flag: '--continue', color: [153, 255, 187] },
  cline: { label: 'Cline', emoji: '⌨️', flag: '--cline', color: [153, 187, 255] },
  pi: { label: 'Pi', emoji: 'π', flag: '--pi', color: [255, 153, 153] },
}

// 📖 Deduplicated emoji order for the "Compatible with" column.
// 📖 OpenCode CLI + Desktop + Web are merged into a single 📦 slot since they share compatibility.
// 📖 Each slot maps to one or more toolKeys for compatibility checking.
export const COMPAT_COLUMN_SLOTS = [
  { emoji: '📦', toolKeys: ['opencode', 'opencode-desktop', 'opencode-web'], color: [110, 214, 255] },
  { emoji: '🦞', toolKeys: ['openclaw'], color: [255, 107, 107] },
  { emoji: '🪿', toolKeys: ['goose'], color: [155, 255, 155] },
  { emoji: '⚡', toolKeys: ['amp'], color: [255, 224, 102] },
  { emoji: '🧗', toolKeys: ['aider'], color: [102, 255, 204] },
  { emoji: '💥', toolKeys: ['crush'], color: [255, 153, 204] },
  { emoji: '🤖', toolKeys: ['qwen'], color: [204, 153, 255] },
  { emoji: '⚖️', toolKeys: ['kilo'], color: [204, 204, 204] },
  { emoji: '👐', toolKeys: ['openhands'], color: [255, 187, 153] },
  { emoji: '🏛️', toolKeys: ['hermes'], color: [187, 153, 255] },
  { emoji: '⏭️', toolKeys: ['continue'], color: [153, 255, 187] },
  { emoji: '⌨️', toolKeys: ['cline'], color: [153, 187, 255] },
  { emoji: 'π', toolKeys: ['pi'], color: [255, 153, 153] },
]

export const TOOL_MODE_ORDER = [
  'opencode',
  'opencode-desktop',
  'opencode-web',
  'openclaw',
  'goose',
  'amp',
  'aider',
  'crush',
  'qwen',
  'kilo',
  'openhands',
  'hermes',
  'continue',
  'cline',
  'pi',
]

export function getToolMeta(mode) {
  return TOOL_METADATA[mode] || { label: mode, emoji: '•', flag: null }
}

export function getToolModeOrder() {
  return [...TOOL_MODE_ORDER]
}

// 📖 All OpenCode tools are compatible with all models.
const ALL_OPENCODE_TOOLS = ['opencode', 'opencode-desktop', 'opencode-web']

/**
 * 📖 Returns the list of tool keys a model is compatible with.
 * All NVIDIA models are compatible with all supported tools.
 * @param {string} providerKey — the source key from sources.js (always 'nvidia')
 * @returns {string[]} — array of compatible tool keys
 */
export function getCompatibleTools(providerKey) {
  return [...TOOL_MODE_ORDER]
}

/**
 * 📖 Checks whether a model from the given provider can run on the specified tool mode.
 * @param {string} providerKey — source key
 * @param {string} toolMode — active tool mode
 * @returns {boolean}
 */
export function isModelCompatibleWithTool(providerKey, toolMode) {
  return getCompatibleTools(providerKey).includes(toolMode)
}

/**
 * 📖 Finds compatible models with a similar SWE score to the selected one.
 * 📖 Used by the incompatibility fallback overlay to suggest alternatives.
 * @param {string} selectedSwe — SWE score string like '72.0%' or '-'
 * @param {string} toolMode — current active tool mode
 * @param {Array} allResults — the state.results array (each has .providerKey, .modelId, .label, .tier, .sweScore)
 * @param {number} [maxResults=3] — max suggestions to return
 * @returns {{ modelId: string, label: string, tier: string, sweScore: string, providerKey: string, sweDelta: number }[]}
 */
export function findSimilarCompatibleModels(selectedSwe, toolMode, allResults, maxResults = 3) {
  const targetSwe = parseFloat(selectedSwe) || 0
  return allResults
    .filter(r => !r.hidden && isModelCompatibleWithTool(r.providerKey, toolMode))
    .map(r => ({
      modelId: r.modelId,
      label: r.label,
      tier: r.tier,
      sweScore: r.sweScore || '-',
      providerKey: r.providerKey,
      sweDelta: Math.abs((parseFloat(r.sweScore) || 0) - targetSwe),
    }))
    .sort((a, b) => a.sweDelta - b.sweDelta)
    .slice(0, maxResults)
}
