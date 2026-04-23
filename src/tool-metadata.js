/**
 * @file src/tool-metadata.js
 * @description Tool metadata for nvidia-nim-forever (NVIDIA NIM + OpenCode only)
 */

// 📖 OpenCode tools only
export const TOOL_METADATA = {
  opencode: { label: 'OpenCode CLI', emoji: '📦', flag: '--opencode', color: [110, 214, 255] },
  'opencode-desktop': { label: 'OpenCode Desktop', emoji: '📦', flag: '--opencode-desktop', color: [149, 205, 255] },
  'opencode-web': { label: 'OpenCode Web', emoji: '📦', flag: '--opencode-web', color: [180, 220, 255] },
}

// 📖 Compatible column slots
export const COMPAT_COLUMN_SLOTS = [
  { emoji: '📦', toolKeys: ['opencode', 'opencode-desktop', 'opencode-web'], color: [110, 214, 255] },
]

// 📖 Mode cycle order for Z key
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

// 📖 All OpenCode tools are compatible with NVIDIA models
export function getCompatibleTools(providerKey) {
  return [...TOOL_MODE_ORDER]
}

export function isModelCompatibleWithTool(providerKey, toolMode) {
  return getCompatibleTools(providerKey).includes(toolMode)
}

/**
 * 📖 Find similar compatible models for fallback suggestions.
 * All NVIDIA models are compatible with all OpenCode tools.
 */
export function findSimilarCompatibleModels(modelId, results, maxResults = 3) {
  if (!results || results.length === 0) return []
  return results
    .filter((r) => r.modelId !== modelId && r.providerKey === 'nvidia')
    .slice(0, maxResults)
}
