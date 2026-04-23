/**
 * @file provider-metadata.js
 * @description Provider metadata, environment variable names, and OpenCode model ID mapping.
 *              Extracted from bin/free-coding-models.js to allow shared access by setup wizard,
 *              Settings overlay, and OpenCode integration helpers.
 *
 * @details
 *   This module owns three separate concerns that all relate to "knowing about providers":
 *
 *   1. `PROVIDER_METADATA` — human-readable display info (label, colour, signup URL, rate limits)
 *      used in the setup wizard (`promptApiKey`) and the Settings overlay.
 *
 *   2. `ENV_VAR_NAMES` — maps providerKey → the environment variable name that carries the API key.
 *      Used when spawning OpenCode child processes so that keys stored only in
 *      ~/.free-coding-models.json are also visible to the child via `{env:VAR}` references.
 *
 *   3. `OPENCODE_MODEL_MAP` — sparse mapping of source model IDs to OpenCode built-in model IDs
 *      (only entries where the IDs differ need to be listed).  Groq's API aliases short names
 *      to full names but OpenCode does exact ID matching against its built-in model list.
 *
 *   Platform booleans (`isWindows`, `isMac`, `isLinux`) are also exported here so that
 *   OpenCode Desktop launch logic and auto-update can share them without re-reading `process.platform`.
 *
 * @exports
 *   PROVIDER_METADATA, ENV_VAR_NAMES, OPENCODE_MODEL_MAP,
 *   isWindows, isMac, isLinux
 *
 * @see bin/free-coding-models.js  — consumes all exports from this module
 * @see src/config.js              — resolveApiKeys / getApiKey use ENV_VAR_NAMES indirectly
 */

import chalk from 'chalk'

// 📖 Platform detection — used by Desktop launcher and auto-update to pick the right open/start command.
export const isWindows = process.platform === 'win32'
export const isMac     = process.platform === 'darwin'
export const isLinux   = process.platform === 'linux'

// 📖 ENV_VAR_NAMES: maps providerKey → shell env var name for passing resolved keys to child processes.
// 📖 When a key is stored only in ~/.nvidia-nim-forever.json (not in the shell env), we inject it
// 📖 into the child's env so OpenCode's {env:VAR} references still resolve.
export const ENV_VAR_NAMES = {
  nvidia: 'NVIDIA_API_KEY',
}

// 📖 OPENCODE_MODEL_MAP: sparse table of model IDs that differ between sources.js and OpenCode's
// 📖 built-in model registry. Only add entries where they DIFFER — unmapped models pass through as-is.
export const OPENCODE_MODEL_MAP = {
  nvidia: {
    // NVIDIA models pass through as-is
  }
}

// 📖 PROVIDER_METADATA: display info for NVIDIA, the only provider.
// 📖 `color` is a chalk function for visual distinction in the TUI.
// 📖 `signupUrl` / `signupHint` guide users through first-time key generation.
// 📖 `rateLimits` gives a quick reminder of the free-tier quota.
export const PROVIDER_METADATA = {
  nvidia: {
    label: 'NVIDIA NIM',
    color: chalk.rgb(178, 235, 190),
    signupUrl: 'https://build.nvidia.com',
    signupHint: 'Profile → API Keys → Generate',
    rateLimits: 'Free tier: 40 requests/min (no credit card needed)',
  },
}
