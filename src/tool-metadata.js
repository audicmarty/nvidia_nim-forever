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
// 📖 OpenCode CLI, Desktop, and Web are the only supported tools for nvidia-nim-forever.
export const TOOL_METADATA = {
  opencode: { label: 'OpenCode CLI', emoji: '📦', flag: '--opencode', color: [110, 214, 255] },
  'opencode-desktop': { label: 'OpenCode Desktop', emoji: '📦', flag: '--opencode-desktop', color: [149, 205, 255] },
  'opencode-web': { label: 'OpenCode Web', emoji: '📦', flag: '--opencode-web', color: [180, 220, 255] },
}

// 📖 Deduplicated emoji order for the "Compatible with" column.
// 📖 OpenCode CLI + Desktop + Web are merged into a single 📦 slot since they share compatibility.
// 📖 Each slot maps to one or more toolKeys for compatibility checking.
export const COMPAT_COLUMN_SLOTS = [
  { emoji: '📦', toolKeys: ['opencode', 'opencode-desktop', 'opencode-web'], color: [110, 214, 255] },
]

export const TOOL_MODE_ORDER = [
  'opencode',
  'opencode-desktop',
  'opencode-web',
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
 * All models are compatible with all OpenCode tools.
 * @param {string} providerKey — the source key from sources.js (always 'nvidia')
 * @returns {string[]} — array of compatible tool keys
 */
export function getCompatibleTools(providerKey) {
  return ALL_OPENCODE_TOOLS
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
