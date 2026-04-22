/**
 * @file router-daemon.js
 * @description Smart Model Router daemon for local OpenAI-compatible failover routing.
 *
 * @details
 *   📖 The router daemon is the persistent part of FCM: coding tools point at
 *   `http://localhost:19280/v1`, send `model: "fcm"`, and this server forwards
 *   the request to the healthiest configured provider/model in the active set.
 *
 *   📖 It deliberately uses only Node built-ins and the existing provider catalog
 *   so the npm package keeps its tiny dependency surface. The daemon stores only
 *   metadata (latency, status, token counts); request and response bodies are
 *   never written to logs or telemetry.
 *
 * @functions
 *   → runRouterDaemon() — Start the foreground daemon HTTP server
 *   → startRouterDaemonBackground() — Spawn the daemon detached from the TUI
 *   → stopRouterDaemon() — Send SIGTERM to the recorded daemon process
 *   → getRouterDaemonStatus() — Discover and read `/health` from a running daemon
 *   → buildDefaultRouterSet() — Create the first priority-ordered model set
 *   → formatOpenAiError() — Build OpenAI-compatible error response payloads
 *
 * @exports runRouterDaemon, startRouterDaemonBackground, stopRouterDaemon
 * @exports getRouterDaemonStatus, buildDefaultRouterSet, formatOpenAiError
 *
 * @see ./config.js — router config is persisted under `router`
 * @see ../sources.js — provider URLs and model IDs are resolved from the catalog
 */

import { createServer } from 'node:http'
import { fork } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sources } from '../sources.js'
import {
  CONFIG_PATH,
  DEFAULT_ROUTER_SETTINGS,
  getApiKey,
  loadConfig,
  normalizeRouterConfig,
  saveConfig,
} from './config.js'
import { resolveCloudflareUrl } from './ping.js'
import { sendUsageTelemetry } from './telemetry.js'

export const ROUTER_DEFAULT_PORT = 19280
export const ROUTER_MAX_PORT = 19289
export const ROUTER_PID_PATH = join(homedir(), '.free-coding-models-daemon.pid')
export const ROUTER_PORT_PATH = join(homedir(), '.free-coding-models-daemon.port')
export const ROUTER_LOG_PATH = join(homedir(), '.free-coding-models-daemon.log')
export const ROUTER_TOKENS_PATH = join(homedir(), '.free-coding-models-tokens.json')

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI_ENTRY_PATH = join(__dirname, '..', 'bin', 'free-coding-models.js')
const MAX_BODY_BYTES = 10 * 1024 * 1024
const MAX_REQUEST_LOG = 200
const MAX_SSE_CLIENTS = 10
const MAX_CONCURRENT_REQUESTS = 50
const MAX_PROBE_WINDOW = 20
const TOKEN_FLUSH_INTERVAL_MS = 60000
const CONFIG_RELOAD_INTERVAL_MS = 60000
const STATS_RETENTION_DAYS = 90
const TIER_ORDER = ['S+', 'S', 'A+', 'A', 'A-', 'B+', 'B', 'C']
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503])
const AUTH_STATUS_CODES = new Set([401, 403])

function nowIso() {
  return new Date().toISOString()
}

function modelKey(provider, model) {
  return `${provider}/${model}`
}

function safeJsonParse(raw, fallback = null) {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function atomicWriteJson(path, data, mode = 0o600) {
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tempPath, JSON.stringify(data, null, 2), { mode })
  renameSync(tempPath, path)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readNumberFile(path) {
  try {
    const value = Number.parseInt(readFileSync(path, 'utf8').trim(), 10)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function headerEntries(headers) {
  const entries = {}
  if (!headers || typeof headers.forEach !== 'function') return entries
  headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (['connection', 'content-encoding', 'content-length', 'transfer-encoding'].includes(lower)) return
    entries[lower] = value
  })
  return entries
}

function cloneHeadersForUpstream(reqHeaders, apiKey, providerKey) {
  const headers = {}
  for (const [key, value] of Object.entries(reqHeaders || {})) {
    const lower = key.toLowerCase()
    if (['host', 'connection', 'content-length', 'authorization'].includes(lower)) continue
    if (typeof value === 'string') headers[key] = value
  }
  headers['Content-Type'] = headers['Content-Type'] || headers['content-type'] || 'application/json'
  headers.Authorization = `Bearer ${apiKey}`
  if (providerKey === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/vava-nessa/free-coding-models'
    headers['X-Title'] = 'free-coding-models'
  }
  return headers
}

function getApiModelId(providerKey, modelId) {
  return providerKey === 'zai' ? modelId.replace(/^zai\//, '') : modelId
}

function isRouteableProvider(providerKey) {
  const source = sources[providerKey]
  return Boolean(source?.url && !source.cliOnly && source.url.includes('/chat/completions'))
}

function resolveProviderUrl(providerKey) {
  const url = sources[providerKey]?.url
  if (!url) return null
  return providerKey === 'cloudflare' ? resolveCloudflareUrl(url) : url
}

function buildProviderModelsUrl(providerKey) {
  const url = resolveProviderUrl(providerKey)
  if (typeof url !== 'string' || !url.includes('/chat/completions')) return null
  return url.replace(/\/chat\/completions$/, '/models')
}

function extractUsage(payload) {
  const usage = payload?.usage
  if (!usage || typeof usage !== 'object') return null
  const promptTokens = Number(usage.prompt_tokens ?? 0)
  const completionTokens = Number(usage.completion_tokens ?? 0)
  const totalTokens = Number(usage.total_tokens ?? promptTokens + completionTokens)
  if (![promptTokens, completionTokens, totalTokens].every(Number.isFinite)) return null
  if (promptTokens <= 0 && completionTokens <= 0 && totalTokens <= 0) return null
  return {
    prompt_tokens: Math.max(0, Math.round(promptTokens)),
    completion_tokens: Math.max(0, Math.round(completionTokens)),
    total_tokens: Math.max(0, Math.round(totalTokens)),
  }
}

export function formatOpenAiError(message, type, code, requestId, extra = {}) {
  return {
    error: {
      message,
      type,
      code,
      request_id: requestId,
      ...extra,
    },
  }
}

function sendJson(res, statusCode, payload, headers = {}) {
  if (res.writableEnded) return
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  })
  res.end(body)
}

function sendError(res, statusCode, message, type, code, requestId, extra = {}) {
  sendJson(res, statusCode, formatOpenAiError(message, type, code, requestId, extra))
}

function readRequestBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(Object.assign(new Error('Request body too large'), { code: 'BODY_TOO_LARGE' }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function readJsonBody(req) {
  return readRequestBody(req).then((raw) => {
    if (!raw.trim()) return {}
    const parsed = safeJsonParse(raw)
    if (parsed === null) {
      throw Object.assign(new Error('Invalid JSON'), { code: 'INVALID_JSON' })
    }
    return parsed
  })
}

class RouterLogger {
  constructor(logPath, level = 'info') {
    this.logPath = logPath
    this.level = level
    this.levelRank = { error: 0, warn: 1, info: 2, debug: 3 }
  }

  shouldLog(level) {
    return this.levelRank[level] <= this.levelRank[this.level]
  }

  rotateIfNeeded() {
    try {
      if (!existsSync(this.logPath)) return
      const stat = statSync(this.logPath)
      if (stat.size < 5 * 1024 * 1024) return
      const rotatedPath = `${this.logPath}.1`
      try { unlinkSync(rotatedPath) } catch {}
      renameSync(this.logPath, rotatedPath)
    } catch {
      // 📖 Logging should never be capable of taking the daemon down.
    }
  }

  write(level, message, meta = null) {
    if (!this.shouldLog(level)) return
    const suffix = meta ? ` ${this.safeStringify(meta)}` : ''
    const line = `[${nowIso()}] [${level.toUpperCase()}] ${message}${suffix}\n`
    try {
      this.rotateIfNeeded()
      appendFileSync(this.logPath, line, { mode: 0o600 })
    } catch {
      try { process.stderr.write(line) } catch {}
    }
  }

  safeStringify(meta) {
    try {
      return JSON.stringify(meta)
    } catch {
      return '[unserializable-meta]'
    }
  }

  error(message, meta = null) { this.write('error', message, meta) }
  warn(message, meta = null) { this.write('warn', message, meta) }
  info(message, meta = null) { this.write('info', message, meta) }
  debug(message, meta = null) { this.write('debug', message, meta) }
}

class TokenTracker {
  constructor(path, logger) {
    this.path = path
    this.logger = logger
    this.stats = this.load()
    this.dirty = false
    this.flushFailures = 0
  }

  load() {
    try {
      if (!existsSync(this.path)) {
        return {
          daily: {},
          all_time: {
            total_tokens: 0,
            prompt_tokens: 0,
            completion_tokens: 0,
            requests: 0,
            first_tracked: nowIso(),
          },
        }
      }
      const parsed = safeJsonParse(readFileSync(this.path, 'utf8'), null)
      if (!parsed || typeof parsed !== 'object') throw new Error('Token stats JSON is invalid')
      return {
        daily: parsed.daily && typeof parsed.daily === 'object' ? parsed.daily : {},
        all_time: {
          total_tokens: Number(parsed.all_time?.total_tokens ?? 0),
          prompt_tokens: Number(parsed.all_time?.prompt_tokens ?? 0),
          completion_tokens: Number(parsed.all_time?.completion_tokens ?? 0),
          requests: Number(parsed.all_time?.requests ?? 0),
          first_tracked: parsed.all_time?.first_tracked || nowIso(),
        },
      }
    } catch (error) {
      this.logger.warn('Token stats read failed; starting fresh counters', { error: error.message })
      return {
        daily: {},
        all_time: {
          total_tokens: 0,
          prompt_tokens: 0,
          completion_tokens: 0,
          requests: 0,
          first_tracked: nowIso(),
        },
      }
    }
  }

  todayKey() {
    return new Date().toISOString().slice(0, 10)
  }

  ensureDaily(dateKey) {
    if (!this.stats.daily[dateKey]) {
      this.stats.daily[dateKey] = {
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        requests: 0,
        by_model: {},
      }
    }
    if (!this.stats.daily[dateKey].by_model || typeof this.stats.daily[dateKey].by_model !== 'object') {
      this.stats.daily[dateKey].by_model = {}
    }
    return this.stats.daily[dateKey]
  }

  record(provider, model, usage) {
    if (!usage) return
    const dateKey = this.todayKey()
    const daily = this.ensureDaily(dateKey)
    const key = modelKey(provider, model)
    if (!daily.by_model[key]) daily.by_model[key] = { total: 0, requests: 0 }

    daily.total_tokens += usage.total_tokens
    daily.prompt_tokens += usage.prompt_tokens
    daily.completion_tokens += usage.completion_tokens
    daily.requests += 1
    daily.by_model[key].total += usage.total_tokens
    daily.by_model[key].requests += 1

    this.stats.all_time.total_tokens += usage.total_tokens
    this.stats.all_time.prompt_tokens += usage.prompt_tokens
    this.stats.all_time.completion_tokens += usage.completion_tokens
    this.stats.all_time.requests += 1
    this.dirty = true
  }

  prune() {
    const cutoff = Date.now() - STATS_RETENTION_DAYS * 24 * 60 * 60 * 1000
    for (const dateKey of Object.keys(this.stats.daily)) {
      const time = Date.parse(`${dateKey}T00:00:00.000Z`)
      if (Number.isFinite(time) && time < cutoff) delete this.stats.daily[dateKey]
    }
  }

  flush({ force = false } = {}) {
    if (!this.dirty && !force) return
    try {
      this.prune()
      atomicWriteJson(this.path, this.stats, 0o600)
      this.dirty = false
      this.flushFailures = 0
    } catch (error) {
      this.flushFailures += 1
      this.logger.warn('Token stats write failed; keeping counters in memory', {
        error: error.message,
        failures: this.flushFailures,
      })
    }
  }

  summary() {
    const today = this.ensureDaily(this.todayKey())
    return {
      today,
      all_time: this.stats.all_time,
      daily: this.stats.daily,
    }
  }
}

class RouterRuntime {
  constructor({ config, port, logger }) {
    this.config = config
    this.port = port
    this.logger = logger
    this.startedAt = Date.now()
    this.inFlight = 0
    this.shuttingDown = false
    this.crashRecovered = 0
    this.uncaughtTimestamps = []
    this.server = null
    this.configReloadTimer = null
    this.tokenFlushTimer = null
    this.probeTimer = null
    this.probeTimeouts = new Set()
    this.tokenTracker = new TokenTracker(ROUTER_TOKENS_PATH, logger)
    this.modelCatalog = this.buildModelCatalog()
    this.probeWindows = new Map()
    this.circuit = new Map()
    this.requestLog = []
    this.sseClients = new Set()
    this.lastProbeAt = null
    this.totalRequestsRouted = 0
    this.quotaExhausted = new Set()
    this.staleNotifications = new Set()
    this.refreshRouteState()
  }

  buildModelCatalog() {
    const catalog = new Map()
    for (const [providerKey, source] of Object.entries(sources)) {
      if (!Array.isArray(source.models)) continue
      for (const [modelId, label, tier, sweScore, ctx] of source.models) {
        catalog.set(modelKey(providerKey, modelId), {
          providerKey,
          modelId,
          label,
          tier,
          sweScore,
          ctx,
          routeable: isRouteableProvider(providerKey),
        })
      }
    }
    return catalog
  }

  refreshRouteState() {
    const router = this.routerConfig()
    this.logger.level = router.logLevel
    for (const set of Object.values(router.sets || {})) {
      for (const model of set.models || []) {
        const key = modelKey(model.provider, model.model)
        if (!this.probeWindows.has(key)) this.probeWindows.set(key, [])
        if (!this.circuit.has(key)) {
          this.circuit.set(key, {
            state: 'CLOSED',
            consecutiveFailures: 0,
            cooldownMs: router.circuitBreaker.initialCooldownMs,
            openedAt: null,
            lastError: null,
            authError: false,
            stale: false,
          })
        }
        const entry = this.circuit.get(key)
        entry.stale = !this.modelCatalog.has(key)
        const catalogEntry = this.modelCatalog.get(key)
        entry.unsupported = Boolean(catalogEntry && !catalogEntry.routeable)
        if (entry.stale && !this.staleNotifications.has(key)) {
          this.staleNotifications.add(key)
          this.logger.warn(`${key} is no longer available and will be skipped`)
        }
      }
    }
  }

  routerConfig() {
    const normalized = normalizeRouterConfig(this.config.router)
    if (normalized) return normalized
    const defaultSet = buildDefaultRouterSet(this.config)
    return normalizeRouterConfig({
      ...DEFAULT_ROUTER_SETTINGS,
      enabled: true,
      onboardingSeen: true,
      activeSet: defaultSet.name,
      sets: { [defaultSet.name]: defaultSet },
    })
  }

  setRouterConfig(router) {
    this.config.router = normalizeRouterConfig(router)
    this.refreshRouteState()
  }

  saveRouterConfig() {
    const result = saveConfig(this.config)
    if (!result.success) this.logger.warn('Router config write failed', { error: result.error })
    return result
  }

  reloadConfigFromDisk() {
    try {
      const nextConfig = loadConfig()
      if (!nextConfig.router) nextConfig.router = this.routerConfig()
      this.config = nextConfig
      this.refreshRouteState()
      this.scheduleProbeLoop()
      this.broadcast('config', { activeSet: this.routerConfig().activeSet })
      this.logger.debug('Router config reloaded from disk')
    } catch (error) {
      this.logger.warn('Config reload failed; keeping in-memory config', { error: error.message })
    }
  }

  getApiKeyForProvider(providerKey) {
    // 📖 Router background startup should work without inherited shell env, so
    // 📖 config keys are primary. Env is only a fallback for headless sessions.
    const configured = this.config?.apiKeys?.[providerKey]
    if (Array.isArray(configured)) return configured.find(Boolean) || null
    if (typeof configured === 'string' && configured.trim()) return configured.trim()
    return getApiKey({ apiKeys: {}, providers: {} }, providerKey)
  }

  getSet(setName = null) {
    const router = this.routerConfig()
    const name = setName || router.activeSet
    return router.sets?.[name] || null
  }

  listSetModels(set) {
    return [...(set?.models || [])].sort((a, b) => a.priority - b.priority)
  }

  updateCircuitForCooldown(key) {
    const state = this.circuit.get(key)
    if (!state || state.state !== 'OPEN') return state
    const elapsed = Date.now() - (state.openedAt || 0)
    if (elapsed >= state.cooldownMs) {
      const oldState = state.state
      state.state = 'HALF_OPEN'
      this.broadcast('circuit', { model: key, old_state: oldState, new_state: state.state, cooldown_ms: state.cooldownMs })
    }
    return state
  }

  recordProbeResult(key, result) {
    const window = this.probeWindows.get(key) || []
    window.push({ ...result, at: Date.now() })
    while (window.length > MAX_PROBE_WINDOW) window.shift()
    this.probeWindows.set(key, window)
    this.lastProbeAt = Date.now()
    this.broadcast('probe', {
      model: key,
      status: result.ok ? 'ok' : 'fail',
      latency_ms: result.latencyMs ?? null,
      circuit_state: this.circuit.get(key)?.state || 'UNKNOWN',
    })
  }

  markAuthError(key, detail = 'authentication failed') {
    const state = this.circuit.get(key)
    if (!state) return
    state.authError = true
    state.lastError = detail
    this.broadcast('circuit', { model: key, old_state: state.state, new_state: 'AUTH_ERROR', cooldown_ms: 0 })
  }

  markSuccess(key, latencyMs = null) {
    const state = this.circuit.get(key)
    if (!state) return
    const oldState = state.state
    state.state = 'CLOSED'
    state.consecutiveFailures = 0
    state.cooldownMs = this.routerConfig().circuitBreaker.initialCooldownMs
    state.openedAt = null
    state.lastError = null
    state.authError = false
    if (oldState !== state.state) {
      this.broadcast('circuit', { model: key, old_state: oldState, new_state: state.state, cooldown_ms: state.cooldownMs })
    }
    if (latencyMs !== null) this.recordProbeResult(key, { ok: true, latencyMs, code: 200 })
  }

  markFailure(key, detail, statusCode = null) {
    const state = this.circuit.get(key)
    if (!state) return
    state.authError = false
    state.consecutiveFailures += 1
    state.lastError = detail
    if (statusCode === 429) this.quotaExhausted.add(key)
    const router = this.routerConfig()
    if (state.state === 'HALF_OPEN' || state.consecutiveFailures >= router.circuitBreaker.failureThreshold) {
      const oldState = state.state
      state.state = 'OPEN'
      state.openedAt = Date.now()
      state.cooldownMs = Math.min(
        router.circuitBreaker.maxCooldownMs,
        Math.max(router.circuitBreaker.initialCooldownMs, state.cooldownMs * router.circuitBreaker.backoffMultiplier),
      )
      this.broadcast('circuit', { model: key, old_state: oldState, new_state: state.state, cooldown_ms: state.cooldownMs })
      this.logger.warn(`Circuit opened for ${key}`, { reason: detail, cooldown_ms: state.cooldownMs })
      void sendUsageTelemetry(this.config, {}, {
        event: 'app_router_circuit_open',
        mode: 'daemon',
        properties: {
          model: key,
          consecutive_failures: state.consecutiveFailures,
          cooldown_ms: state.cooldownMs,
        },
      })
    }
    this.recordProbeResult(key, { ok: false, latencyMs: null, code: statusCode || 'ERR', error: detail })
  }

  getWindowStats(key) {
    const window = this.probeWindows.get(key) || []
    const successes = window.filter((entry) => entry.ok && Number.isFinite(entry.latencyMs))
    const sortedLatencies = successes.map((entry) => entry.latencyMs).sort((a, b) => a - b)
    const p95 = sortedLatencies.length > 0
      ? sortedLatencies[Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1)]
      : null
    return {
      total: window.length,
      successful: successes.length,
      uptime: window.length > 0 ? successes.length / window.length : null,
      p95,
      last: window[window.length - 1] || null,
    }
  }

  scoreCandidates(set) {
    const models = this.listSetModels(set)
    const maxP95 = Math.max(
      1,
      ...models
        .map((entry) => this.getWindowStats(modelKey(entry.provider, entry.model)).p95)
        .filter((value) => Number.isFinite(value)),
    )
    const router = this.routerConfig()
    const setSize = Math.max(1, models.length)
    const weights = router.scoring

    return models.map((entry) => {
      const key = modelKey(entry.provider, entry.model)
      const stats = this.getWindowStats(key)
      const hasData = stats.total > 0
      const latencyScore = stats.p95 === null ? 0.5 : Math.max(0, 1 - (stats.p95 / maxP95))
      const uptimeScore = stats.uptime === null ? 0.5 : stats.uptime
      const priorityBonus = 1 - ((entry.priority - 1) / setSize)
      const score = hasData
        ? (weights.latencyWeight * latencyScore) + (weights.uptimeWeight * uptimeScore) + (weights.priorityWeight * priorityBonus)
        : priorityBonus
      const state = this.updateCircuitForCooldown(key) || {}
      return {
        ...entry,
        key,
        score,
        stats,
        circuit: state,
        catalog: this.modelCatalog.get(key) || null,
      }
    })
  }

  getRoutingCandidates(set) {
    const scored = this.scoreCandidates(set)
    const usable = scored.filter((candidate) => {
      if (!candidate.catalog || candidate.circuit?.stale) return false
      if (!candidate.catalog.routeable || candidate.circuit?.unsupported) return false
      if (candidate.circuit?.authError) return false
      if (!this.getApiKeyForProvider(candidate.provider)) return false
      return candidate.circuit?.state === 'CLOSED' || candidate.circuit?.state === 'HALF_OPEN'
    })
    const closed = usable.filter((candidate) => candidate.circuit.state === 'CLOSED')
    const halfOpen = usable.filter((candidate) => candidate.circuit.state === 'HALF_OPEN')
    const byScore = (a, b) => b.score - a.score || a.priority - b.priority
    return [...closed.sort(byScore), ...halfOpen.sort(byScore)]
  }

  getModelHealth(set = this.getSet()) {
    return this.scoreCandidates(set || { models: [] }).map((candidate) => ({
      provider: candidate.provider,
      model: candidate.model,
      key: candidate.key,
      priority: candidate.priority,
      state: candidate.circuit?.authError
        ? 'AUTH_ERROR'
        : candidate.circuit?.stale
          ? 'STALE'
          : candidate.circuit?.unsupported
            ? 'UNSUPPORTED'
            : candidate.circuit?.state || 'UNKNOWN',
      score: Number(candidate.score.toFixed(4)),
      last_latency_ms: candidate.stats.last?.latencyMs ?? null,
      uptime: candidate.stats.uptime,
      last_error: candidate.circuit?.lastError || null,
    }))
  }

  addRequestLog(entry) {
    this.requestLog.unshift({ ...entry, at: nowIso() })
    while (this.requestLog.length > MAX_REQUEST_LOG) this.requestLog.pop()
    this.broadcast('request', entry)
  }

  broadcast(event, payload) {
    const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
    for (const client of [...this.sseClients]) {
      try {
        client.write(message)
      } catch {
        this.sseClients.delete(client)
      }
    }
  }

  statusPayload() {
    const router = this.routerConfig()
    const activeSet = this.getSet(router.activeSet)
    return {
      ok: true,
      pid: process.pid,
      port: this.port,
      enabled: router.enabled,
      activeSet: router.activeSet,
      activeModelCount: activeSet?.models?.length || 0,
      setCount: Object.keys(router.sets || {}).length,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      requestsRouted: this.totalRequestsRouted,
      inFlight: this.inFlight,
      shuttingDown: this.shuttingDown,
      probeMode: router.probeMode,
      lastProbeAt: this.lastProbeAt ? new Date(this.lastProbeAt).toISOString() : null,
      crashRecovered: this.crashRecovered,
      configPath: CONFIG_PATH,
      tokenStatsPath: ROUTER_TOKENS_PATH,
      logPath: ROUTER_LOG_PATH,
    }
  }

  statsPayload() {
    const router = this.routerConfig()
    const activeSet = this.getSet(router.activeSet)
    return {
      ...this.statusPayload(),
      tokens: this.tokenTracker.summary(),
      models: this.getModelHealth(activeSet),
      requestLog: this.requestLog.slice(0, 20),
      circuitBreakers: Object.fromEntries([...this.circuit.entries()].map(([key, value]) => [key, {
        state: value.authError ? 'AUTH_ERROR' : value.stale ? 'STALE' : value.unsupported ? 'UNSUPPORTED' : value.state,
        consecutiveFailures: value.consecutiveFailures,
        cooldownMs: value.cooldownMs,
        openedAt: value.openedAt ? new Date(value.openedAt).toISOString() : null,
        lastError: value.lastError,
      }])),
    }
  }

  async probeCandidate(candidate, { eco = false } = {}) {
    const key = modelKey(candidate.provider, candidate.model)
    const apiKey = this.getApiKeyForProvider(candidate.provider)
    if (!apiKey) {
      this.markAuthError(key, 'missing API key')
      return
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const started = performance.now()
    try {
      const modelsUrl = eco ? buildProviderModelsUrl(candidate.provider) : null
      const response = modelsUrl
        ? await fetch(modelsUrl, {
            method: 'GET',
            headers: cloneHeadersForUpstream({}, apiKey, candidate.provider),
            signal: controller.signal,
          })
        : await fetch(resolveProviderUrl(candidate.provider), {
            method: 'POST',
            headers: cloneHeadersForUpstream({}, apiKey, candidate.provider),
            body: JSON.stringify({
              model: getApiModelId(candidate.provider, candidate.model),
              messages: [{ role: 'user', content: 'hi' }],
              max_tokens: 1,
              stream: false,
            }),
            signal: controller.signal,
          })
      const latencyMs = Math.round(performance.now() - started)
      if (response.ok) {
        this.markSuccess(key)
        this.recordProbeResult(key, { ok: true, latencyMs, code: response.status })
        this.logger.info(`Probe ok ${key} — ${latencyMs}ms`)
      } else if (AUTH_STATUS_CODES.has(response.status)) {
        this.markAuthError(key, `HTTP ${response.status}`)
        this.recordProbeResult(key, { ok: false, latencyMs, code: response.status })
      } else if (RETRYABLE_STATUS_CODES.has(response.status)) {
        this.markFailure(key, `HTTP ${response.status}`, response.status)
      } else {
        this.recordProbeResult(key, { ok: false, latencyMs, code: response.status })
      }
    } catch (error) {
      const detail = error.name === 'AbortError' ? 'probe timeout' : error.message
      this.markFailure(key, detail)
    } finally {
      clearTimeout(timeout)
    }
  }

  async runProbeBurst() {
    const set = this.getSet()
    if (!set) return
    const candidates = this.scoreCandidates(set)
      .filter((candidate) => candidate.catalog?.routeable && !candidate.circuit?.stale)
    await Promise.allSettled(candidates.map((candidate) => this.probeCandidate(candidate, {
      eco: this.routerConfig().probeMode === 'eco',
    })))
  }

  scheduleProbeLoop() {
    if (this.probeTimer) clearInterval(this.probeTimer)
    for (const timeout of this.probeTimeouts) clearTimeout(timeout)
    this.probeTimeouts.clear()
    const router = this.routerConfig()
    const interval = router.probeIntervals[router.probeMode] || DEFAULT_ROUTER_SETTINGS.probeIntervals.balanced
    this.probeTimer = setInterval(() => {
      const set = this.getSet()
      if (!set || this.shuttingDown) return
      const candidates = this.scoreCandidates(set)
        .filter((candidate) => candidate.catalog?.routeable && !candidate.circuit?.stale)
      const stagger = candidates.length > 0 ? Math.max(250, Math.floor(interval / candidates.length)) : interval
      candidates.forEach((candidate, index) => {
        const timeout = setTimeout(() => {
          this.probeTimeouts.delete(timeout)
          void this.probeCandidate(candidate, { eco: router.probeMode === 'eco' })
        }, index * stagger)
        this.probeTimeouts.add(timeout)
      })
    }, interval)
  }

  async routeRequest({ req, res, body, setName, requestId }) {
    if (this.shuttingDown) {
      sendError(res, 503, 'Daemon is shutting down', 'service_unavailable', 'daemon_shutting_down', requestId)
      return
    }
    if (this.inFlight >= MAX_CONCURRENT_REQUESTS) {
      sendError(res, 503, 'Router overloaded, too many concurrent requests', 'service_unavailable', 'router_overloaded', requestId)
      return
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      sendError(res, 400, 'Request body must be a JSON object', 'invalid_request_error', 'invalid_json_object', requestId)
      return
    }
    if (typeof body.model !== 'string' || !body.model.trim()) {
      sendError(res, 400, 'Missing required field: model', 'invalid_request_error', 'missing_model', requestId)
      return
    }

    const set = this.getSet(setName)
    if (!set) {
      sendError(res, 404, `Router set not found: ${setName || this.routerConfig().activeSet}`, 'invalid_request_error', 'set_not_found', requestId)
      return
    }

    const candidates = this.getRoutingCandidates(set)
    const maxRetries = this.routerConfig().failover.maxRetries
    const attempts = candidates.slice(0, Math.max(1, maxRetries))
    if (attempts.length === 0) {
      const health = this.getModelHealth(set)
      const quotaExhausted = [...this.quotaExhausted].filter((key) => set.models.some((model) => modelKey(model.provider, model.model) === key))
      sendError(res, 503, `All models in set are unavailable: ${set.name}`, 'service_unavailable', 'all_models_unavailable', requestId, {
        set: set.name,
        models_tried: [],
        quota_exhausted: quotaExhausted,
        model_health: health,
      })
      void sendUsageTelemetry(this.config, {}, {
        event: 'app_router_all_down',
        mode: 'daemon',
        properties: {
          set_name: set.name,
          models_tried: [],
          quota_exhausted_count: quotaExhausted.length,
        },
      })
      return
    }

    this.inFlight += 1
    try {
      const tried = []
      for (const [attemptIndex, candidate] of attempts.entries()) {
        tried.push(candidate.key)
        const result = body.stream === true
          ? await this.proxyStreamingRequest({ req, res, body, candidate, requestId, attemptIndex })
          : await this.proxyJsonRequest({ req, res, body, candidate, requestId, attemptIndex })
        if (result.done) return
        if (result.failoverToNext && attemptIndex < attempts.length - 1) {
          const next = attempts[attemptIndex + 1]
          this.logger.warn(`Failover ${candidate.key} -> ${next.key}`, { request_id: requestId, reason: result.reason })
          void sendUsageTelemetry(this.config, {}, {
            event: 'app_router_failover',
            mode: 'daemon',
            properties: {
              from_model: candidate.key,
              to_model: next.key,
              reason: result.reason,
              attempt_number: attemptIndex + 1,
            },
          })
          continue
        }
      }

      const quotaExhausted = [...this.quotaExhausted].filter((key) => tried.includes(key))
      sendError(res, 503, `All routed models failed for set: ${set.name}`, 'service_unavailable', 'all_models_failed', requestId, {
        set: set.name,
        models_tried: tried,
        quota_exhausted: quotaExhausted,
      })
    } finally {
      this.inFlight -= 1
    }
  }

  async proxyJsonRequest({ req, res, body, candidate, requestId, attemptIndex }) {
    const key = candidate.key
    const apiKey = this.getApiKeyForProvider(candidate.provider)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.routerConfig().failover.requestTimeoutMs)
    const started = performance.now()
    const upstreamBody = {
      ...body,
      model: getApiModelId(candidate.provider, candidate.model),
      stream: false,
    }
    try {
      const response = await fetch(resolveProviderUrl(candidate.provider), {
        method: 'POST',
        headers: {
          ...cloneHeadersForUpstream(req.headers, apiKey, candidate.provider),
          'X-Request-Id': requestId,
        },
        body: JSON.stringify(upstreamBody),
        signal: controller.signal,
      })
      const latencyMs = Math.round(performance.now() - started)
      const text = await response.text()

      if (response.ok) {
        this.markSuccess(key, latencyMs)
        const parsed = safeJsonParse(text, null)
        const usage = extractUsage(parsed)
        this.tokenTracker.record(candidate.provider, candidate.model, usage)
        this.totalRequestsRouted += 1
        this.addRequestLog({
          request_id: requestId,
          model: key,
          status: response.status,
          latency_ms: latencyMs,
          tokens: usage?.total_tokens || 0,
          failover: attemptIndex > 0,
        })
        this.logger.info(`Routed to ${key} — ${latencyMs}ms`, { request_id: requestId, status: response.status })
        res.writeHead(response.status, {
          ...headerEntries(response.headers),
          'x-fcm-router-model': key,
          'x-request-id': requestId,
        })
        res.end(text)
        return { done: true }
      }

      if (AUTH_STATUS_CODES.has(response.status)) {
        this.markAuthError(key, `HTTP ${response.status}`)
        this.addRequestLog({ request_id: requestId, model: key, status: response.status, latency_ms: latencyMs, tokens: 0, failover: attemptIndex > 0, error: 'auth_error' })
        return { done: false, failoverToNext: true, reason: `auth_${response.status}` }
      }

      if (RETRYABLE_STATUS_CODES.has(response.status)) {
        this.markFailure(key, `HTTP ${response.status}`, response.status)
        this.addRequestLog({ request_id: requestId, model: key, status: response.status, latency_ms: latencyMs, tokens: 0, failover: attemptIndex > 0, error: `http_${response.status}` })
        return { done: false, failoverToNext: true, reason: `http_${response.status}` }
      }

      res.writeHead(response.status, {
        ...headerEntries(response.headers),
        'x-fcm-router-model': key,
        'x-request-id': requestId,
      })
      res.end(text)
      return { done: true }
    } catch (error) {
      const reason = error.name === 'AbortError' ? 'timeout' : error.message
      this.markFailure(key, reason)
      this.addRequestLog({ request_id: requestId, model: key, status: 'ERR', latency_ms: null, tokens: 0, failover: attemptIndex > 0, error: reason })
      return { done: false, failoverToNext: true, reason }
    } finally {
      clearTimeout(timeout)
    }
  }

  async proxyStreamingRequest({ req, res, body, candidate, requestId, attemptIndex }) {
    const key = candidate.key
    const apiKey = this.getApiKeyForProvider(candidate.provider)
    const controller = new AbortController()
    const started = performance.now()
    const upstreamBody = {
      ...body,
      model: getApiModelId(candidate.provider, candidate.model),
      stream: true,
    }
    const timeout = setTimeout(() => controller.abort(), this.routerConfig().failover.requestTimeoutMs)
    let sentToClient = false
    try {
      const response = await fetch(resolveProviderUrl(candidate.provider), {
        method: 'POST',
        headers: {
          ...cloneHeadersForUpstream(req.headers, apiKey, candidate.provider),
          'X-Request-Id': requestId,
        },
        body: JSON.stringify(upstreamBody),
        signal: controller.signal,
      })
      const latencyMs = Math.round(performance.now() - started)
      if (!response.ok) {
        if (AUTH_STATUS_CODES.has(response.status)) {
          this.markAuthError(key, `HTTP ${response.status}`)
          this.addRequestLog({ request_id: requestId, model: key, status: response.status, latency_ms: latencyMs, tokens: 0, failover: attemptIndex > 0, error: 'auth_error', stream: true })
          return { done: false, failoverToNext: true, reason: `auth_${response.status}` }
        }
        if (RETRYABLE_STATUS_CODES.has(response.status)) {
          this.markFailure(key, `HTTP ${response.status}`, response.status)
          this.addRequestLog({ request_id: requestId, model: key, status: response.status, latency_ms: latencyMs, tokens: 0, failover: attemptIndex > 0, error: `http_${response.status}`, stream: true })
          return { done: false, failoverToNext: true, reason: `http_${response.status}` }
        }
        res.writeHead(response.status, {
          ...headerEntries(response.headers),
          'x-fcm-router-model': key,
          'x-request-id': requestId,
        })
        res.end(await response.text())
        return { done: true }
      }

      const reader = response.body?.getReader()
      if (!reader) {
        this.markFailure(key, 'empty stream')
        return { done: false, failoverToNext: true, reason: 'empty_stream' }
      }

      const firstChunk = await this.readStreamChunkWithTimeout(reader)
      if (firstChunk.done) {
        this.markFailure(key, 'stream ended before first chunk')
        return { done: false, failoverToNext: true, reason: 'empty_stream' }
      }

      res.writeHead(response.status, {
        ...headerEntries(response.headers),
        'x-fcm-router-model': key,
        'x-request-id': requestId,
      })
      sentToClient = true
      res.write(Buffer.from(firstChunk.value))

      while (!res.writableEnded) {
        const chunk = await this.readStreamChunkWithTimeout(reader)
        if (chunk.done) break
        res.write(Buffer.from(chunk.value))
      }

      this.markSuccess(key, latencyMs)
      this.totalRequestsRouted += 1
      this.addRequestLog({
        request_id: requestId,
        model: key,
        status: response.status,
        latency_ms: latencyMs,
        tokens: 0,
        failover: attemptIndex > 0,
        stream: true,
      })
      res.end()
      return { done: true }
    } catch (error) {
      controller.abort()
      const reason = error.name === 'AbortError' ? 'timeout' : error.message
      this.markFailure(key, reason)
      if (sentToClient) {
        this.logger.warn(`Streaming failure after partial response from ${key}`, { request_id: requestId, reason })
        try { res.end() } catch {}
        return { done: true }
      }
      return { done: false, failoverToNext: true, reason }
    } finally {
      clearTimeout(timeout)
    }
  }

  readStreamChunkWithTimeout(reader) {
    const timeoutMs = this.routerConfig().failover.streamStallTimeoutMs
    let timeout = null
    return Promise.race([
      reader.read().finally(() => {
        if (timeout) clearTimeout(timeout)
      }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('stream_stall_timeout')), timeoutMs)
      }),
    ])
  }

  async handleSetsRequest(req, res, url, requestId) {
    const router = this.routerConfig()
    const setNameMatch = url.pathname.match(/^\/sets\/([^/]+)$/)
    const activateMatch = url.pathname.match(/^\/sets\/([^/]+)\/activate$/)

    if (req.method === 'GET' && url.pathname === '/sets') {
      sendJson(res, 200, { activeSet: router.activeSet, sets: router.sets })
      return
    }

    if (req.method === 'POST' && url.pathname === '/sets') {
      const body = await readJsonBody(req)
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) {
        sendError(res, 400, 'Set name is required', 'invalid_request_error', 'missing_set_name', requestId)
        return
      }
      const normalized = normalizeRouterConfig({
        ...router,
        sets: {
          ...router.sets,
          [name]: {
            name,
            models: Array.isArray(body.models) ? body.models : [],
            created: nowIso(),
          },
        },
      })
      this.setRouterConfig(normalized)
      this.saveRouterConfig()
      this.broadcast('set_change', { old_set: router.activeSet, new_set: normalized.activeSet })
      sendJson(res, 201, { set: normalized.sets[normalized.activeSet] || normalized.sets[name], router: normalized })
      return
    }

    if (activateMatch && req.method === 'POST') {
      const name = decodeURIComponent(activateMatch[1])
      if (!router.sets[name]) {
        sendError(res, 404, `Router set not found: ${name}`, 'invalid_request_error', 'set_not_found', requestId)
        return
      }
      this.setRouterConfig({ ...router, activeSet: name })
      this.saveRouterConfig()
      this.broadcast('set_change', { old_set: router.activeSet, new_set: name })
      void this.runProbeBurst()
      sendJson(res, 200, { activeSet: name })
      return
    }

    if (setNameMatch && req.method === 'PUT') {
      const name = decodeURIComponent(setNameMatch[1])
      if (!router.sets[name]) {
        sendError(res, 404, `Router set not found: ${name}`, 'invalid_request_error', 'set_not_found', requestId)
        return
      }
      const body = await readJsonBody(req)
      const nextName = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : name
      const nextSets = { ...router.sets }
      delete nextSets[name]
      nextSets[nextName] = {
        ...router.sets[name],
        ...body,
        name: nextName,
        models: Array.isArray(body.models) ? body.models : router.sets[name].models,
      }
      const nextActiveSet = router.activeSet === name ? nextName : router.activeSet
      const normalized = normalizeRouterConfig({ ...router, activeSet: nextActiveSet, sets: nextSets })
      this.setRouterConfig(normalized)
      this.saveRouterConfig()
      sendJson(res, 200, { set: normalized.sets[nextName], router: normalized })
      return
    }

    if (setNameMatch && req.method === 'DELETE') {
      const name = decodeURIComponent(setNameMatch[1])
      if (!router.sets[name]) {
        sendError(res, 404, `Router set not found: ${name}`, 'invalid_request_error', 'set_not_found', requestId)
        return
      }
      const nextSets = { ...router.sets }
      delete nextSets[name]
      const nextActiveSet = router.activeSet === name ? (Object.keys(nextSets)[0] || DEFAULT_ROUTER_SETTINGS.activeSet) : router.activeSet
      this.setRouterConfig({ ...router, activeSet: nextActiveSet, sets: nextSets })
      this.saveRouterConfig()
      sendJson(res, 200, { deleted: name, activeSet: this.routerConfig().activeSet })
      return
    }

    sendError(res, 404, 'Not found', 'invalid_request_error', 'not_found', requestId)
  }

  async handleHttp(req, res) {
    const requestId = req.headers['x-request-id'] || `req-${randomUUID()}`
    const url = new URL(req.url, `http://localhost:${this.port}`)
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, this.statusPayload(), { 'x-request-id': requestId })
        return
      }
      if (req.method === 'GET' && url.pathname === '/stats') {
        sendJson(res, 200, this.statsPayload(), { 'x-request-id': requestId })
        return
      }
      if (req.method === 'GET' && url.pathname === '/stats/tokens') {
        sendJson(res, 200, this.tokenTracker.summary(), { 'x-request-id': requestId })
        return
      }
      if (req.method === 'GET' && url.pathname.startsWith('/stats/tokens/daily/')) {
        const date = decodeURIComponent(url.pathname.replace('/stats/tokens/daily/', ''))
        sendJson(res, 200, { date, usage: this.tokenTracker.stats.daily[date] || null }, { 'x-request-id': requestId })
        return
      }
      if (req.method === 'GET' && url.pathname === '/v1/models') {
        const router = this.routerConfig()
        sendJson(res, 200, {
          object: 'list',
          data: [
            { id: 'fcm', object: 'model', owned_by: 'fcm-router' },
            ...Object.keys(router.sets || {}).map((name) => ({ id: `fcm:${name}`, object: 'model', owned_by: 'fcm-router' })),
          ],
        }, { 'x-request-id': requestId })
        return
      }
      if (req.method === 'GET' && url.pathname === '/stream/events') {
        if (this.sseClients.size >= MAX_SSE_CLIENTS) {
          sendError(res, 503, 'Too many dashboard clients', 'service_unavailable', 'too_many_sse_clients', requestId)
          return
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'x-request-id': requestId,
        })
        res.write(`event: hello\ndata: ${JSON.stringify(this.statusPayload())}\n\n`)
        this.sseClients.add(res)
        req.on('close', () => this.sseClients.delete(res))
        return
      }
      if (url.pathname === '/daemon/shutdown' && req.method === 'POST') {
        sendJson(res, 200, { ok: true, message: 'Daemon shutting down' }, { 'x-request-id': requestId })
        setTimeout(() => this.shutdown(0), 50)
        return
      }
      if (url.pathname === '/daemon/restart' && req.method === 'POST') {
        sendJson(res, 501, { ok: false, message: 'Restart is handled by CLI lifecycle in this release' }, { 'x-request-id': requestId })
        return
      }
      if (url.pathname === '/sets' || url.pathname.startsWith('/sets/')) {
        await this.handleSetsRequest(req, res, url, requestId)
        return
      }
      if (url.pathname === '/v1/chat/completions' || url.pathname.match(/^\/v1\/sets\/[^/]+\/chat\/completions$/)) {
        if (req.method !== 'POST') {
          sendError(res, 405, 'Method not allowed', 'invalid_request_error', 'method_not_allowed', requestId, { allowed: ['POST'] })
          return
        }
        const setMatch = url.pathname.match(/^\/v1\/sets\/([^/]+)\/chat\/completions$/)
        const body = await readJsonBody(req)
        await this.routeRequest({ req, res, body, setName: setMatch ? decodeURIComponent(setMatch[1]) : null, requestId })
        return
      }
      sendError(res, 404, 'Not found', 'invalid_request_error', 'not_found', requestId)
    } catch (error) {
      if (error.code === 'BODY_TOO_LARGE') {
        sendError(res, 413, 'Request body too large', 'invalid_request_error', 'request_body_too_large', requestId, { max_bytes: MAX_BODY_BYTES })
        return
      }
      if (error.code === 'INVALID_JSON') {
        sendError(res, 400, 'Invalid JSON', 'invalid_request_error', 'invalid_json', requestId, { detail: error.message })
        return
      }
      this.logger.error('Internal router error', { request_id: requestId, error: error.stack || error.message })
      sendError(res, 500, 'Internal router error', 'server_error', 'internal_router_error', requestId)
    }
  }

  installProcessSafety() {
    process.on('uncaughtException', (error) => {
      this.crashRecovered += 1
      this.uncaughtTimestamps.push(Date.now())
      this.uncaughtTimestamps = this.uncaughtTimestamps.filter((ts) => Date.now() - ts < 5 * 60 * 1000)
      this.logger.error('Recovered uncaught exception', { error: error.stack || error.message })
      if (this.uncaughtTimestamps.length >= 10) {
        this.logger.error('Too many uncaught exceptions; shutting down for external restart')
        void this.shutdown(1)
      }
    })
    process.on('unhandledRejection', (reason) => {
      this.crashRecovered += 1
      this.logger.error('Recovered unhandled rejection', { error: reason?.stack || String(reason) })
    })
    process.on('SIGTERM', () => void this.shutdown(0))
    process.on('SIGINT', () => void this.shutdown(0))
    process.on('SIGHUP', () => this.reloadConfigFromDisk())
  }

  async shutdown(exitCode = 0) {
    if (this.shuttingDown) return
    this.shuttingDown = true
    this.logger.info('Router daemon stopping')
    if (this.probeTimer) clearInterval(this.probeTimer)
    if (this.configReloadTimer) clearInterval(this.configReloadTimer)
    if (this.tokenFlushTimer) clearInterval(this.tokenFlushTimer)
    for (const timeout of this.probeTimeouts) clearTimeout(timeout)
    const started = Date.now()
    while (this.inFlight > 0 && Date.now() - started < 30000) {
      await sleep(100)
    }
    this.tokenTracker.flush({ force: true })
    try { this.server?.close() } catch {}
    try { unlinkSync(ROUTER_PID_PATH) } catch {}
    try { unlinkSync(ROUTER_PORT_PATH) } catch {}
    void sendUsageTelemetry(this.config, {}, {
      event: 'app_daemon_stop',
      mode: 'daemon',
      properties: {
        uptime_seconds: Math.floor((Date.now() - this.startedAt) / 1000),
        total_requests_routed: this.totalRequestsRouted,
        total_tokens: this.tokenTracker.stats.all_time.total_tokens,
      },
    })
    setTimeout(() => process.exit(exitCode), 20)
  }
}

export function buildDefaultRouterSet(config = {}, maxModels = 5) {
  const keyedProviders = new Set(Object.entries(config.apiKeys || {})
    .filter(([, value]) => (Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim()))
    .map(([provider]) => provider))
  const entries = []
  for (const [providerKey, source] of Object.entries(sources)) {
    if (!isRouteableProvider(providerKey)) continue
    for (const [model, label, tier, sweScore, ctx] of source.models || []) {
      entries.push({
        provider: providerKey,
        model,
        label,
        tier,
        sweScore,
        ctx,
        hasKey: keyedProviders.has(providerKey),
      })
    }
  }
  const preferred = entries.some((entry) => entry.hasKey)
    ? entries.filter((entry) => entry.hasKey)
    : entries
  preferred.sort((a, b) => {
    const tierCmp = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
    if (tierCmp !== 0) return tierCmp
    const sweA = Number.parseFloat(a.sweScore) || 0
    const sweB = Number.parseFloat(b.sweScore) || 0
    return sweB - sweA
  })
  return {
    name: DEFAULT_ROUTER_SETTINGS.activeSet,
    models: preferred.slice(0, maxModels).map((entry, index) => ({
      provider: entry.provider,
      model: entry.model,
      priority: index + 1,
    })),
    created: nowIso(),
  }
}

function ensureRouterConfigForDaemon(config) {
  const existing = normalizeRouterConfig(config.router)
  if (existing && Object.keys(existing.sets || {}).length > 0) {
    config.router = { ...existing, enabled: true, onboardingSeen: true }
    return config.router
  }
  const defaultSet = buildDefaultRouterSet(config)
  config.router = normalizeRouterConfig({
    ...DEFAULT_ROUTER_SETTINGS,
    enabled: true,
    onboardingSeen: true,
    activeSet: defaultSet.name,
    sets: { [defaultSet.name]: defaultSet },
  })
  saveConfig(config)
  return config.router
}

function listenOnPort(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve(port)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

async function listenWithFallback(server, preferredPort, logger) {
  const start = Math.max(1, preferredPort || ROUTER_DEFAULT_PORT)
  const candidates = []
  for (let port = start; port <= ROUTER_MAX_PORT; port += 1) candidates.push(port)
  if (!candidates.includes(ROUTER_DEFAULT_PORT)) {
    for (let port = ROUTER_DEFAULT_PORT; port <= ROUTER_MAX_PORT; port += 1) candidates.push(port)
  }
  let lastError = null
  for (const port of candidates) {
    try {
      await listenOnPort(server, port)
      return port
    } catch (error) {
      lastError = error
      logger.warn(`Port ${port} unavailable`, { error: error.code || error.message })
    }
  }
  throw lastError || new Error('No router ports available')
}

export async function runRouterDaemon() {
  const config = loadConfig()
  const router = ensureRouterConfigForDaemon(config)
  const logger = new RouterLogger(ROUTER_LOG_PATH, router.logLevel)
  const runtime = new RouterRuntime({ config, port: router.port, logger })
  runtime.installProcessSafety()
  const server = createServer((req, res) => void runtime.handleHttp(req, res))
  runtime.server = server
  const port = await listenWithFallback(server, router.port, logger)
  runtime.port = port
  runtime.config.router.port = port
  saveConfig(runtime.config)
  try { writeFileSync(ROUTER_PID_PATH, String(process.pid), { mode: 0o600 }) } catch (error) { logger.warn('PID file write failed', { error: error.message }) }
  try { writeFileSync(ROUTER_PORT_PATH, String(port), { mode: 0o600 }) } catch (error) { logger.warn('Port file write failed', { error: error.message }) }
  logger.info('Router daemon started', { pid: process.pid, port, activeSet: runtime.routerConfig().activeSet })
  void sendUsageTelemetry(runtime.config, {}, {
    event: 'app_daemon_start',
    mode: 'daemon',
    properties: {
      port,
      set_count: Object.keys(runtime.routerConfig().sets || {}).length,
      models_in_active_set: runtime.getSet()?.models?.length || 0,
      auto_start: false,
      probe_mode: runtime.routerConfig().probeMode,
    },
  })
  runtime.configReloadTimer = setInterval(() => runtime.reloadConfigFromDisk(), CONFIG_RELOAD_INTERVAL_MS)
  runtime.tokenFlushTimer = setInterval(() => runtime.tokenTracker.flush(), TOKEN_FLUSH_INTERVAL_MS)
  void runtime.runProbeBurst()
  runtime.scheduleProbeLoop()
  return runtime
}

export async function getRouterDaemonStatus() {
  const ports = []
  const recordedPort = readNumberFile(ROUTER_PORT_PATH)
  if (recordedPort) ports.push(recordedPort)
  for (let port = ROUTER_DEFAULT_PORT; port <= ROUTER_MAX_PORT; port += 1) {
    if (!ports.includes(port)) ports.push(port)
  }
  for (const port of ports) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return await response.json()
    } catch {
      // 📖 Keep scanning the small discovery range.
    }
  }
  const pid = readNumberFile(ROUTER_PID_PATH)
  return {
    ok: false,
    running: false,
    stalePid: pid && !isProcessAlive(pid) ? pid : null,
    pid: pid || null,
    port: recordedPort || null,
  }
}

export async function startRouterDaemonBackground() {
  const existing = await getRouterDaemonStatus()
  if (existing.ok) return { ...existing, alreadyRunning: true }

  const child = fork(CLI_ENTRY_PATH, ['--daemon'], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  child.unref()
  for (let i = 0; i < 40; i += 1) {
    await sleep(250)
    const status = await getRouterDaemonStatus()
    if (status.ok) return { ...status, alreadyRunning: false }
  }
  return { ok: false, running: false, pid: child.pid, error: 'Daemon did not become healthy before timeout' }
}

export async function stopRouterDaemon() {
  const pid = readNumberFile(ROUTER_PID_PATH)
  if (!pid) return { ok: false, stopped: false, error: 'No daemon PID file found' }
  if (!isProcessAlive(pid)) {
    try { unlinkSync(ROUTER_PID_PATH) } catch {}
    return { ok: true, stopped: false, stalePid: pid }
  }
  process.kill(pid, 'SIGTERM')
  for (let i = 0; i < 60; i += 1) {
    await sleep(250)
    if (!isProcessAlive(pid)) return { ok: true, stopped: true, pid }
  }
  return { ok: false, stopped: false, pid, error: 'Daemon did not stop before timeout' }
}
