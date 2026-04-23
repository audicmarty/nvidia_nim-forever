/**
 * @file opencode.js
 * @description OpenCode integration helpers for direct launches and Desktop setup.
 */

import chalk from 'chalk'
import { createServer } from 'net'
import { createServer as createHttpServer } from 'http'
import { request as httpsRequest, Agent } from 'https'
import { homedir } from 'os'
import { join } from 'path'
import { copyFileSync, existsSync, appendFileSync } from 'fs'
import { PROVIDER_COLOR } from './render-table.js'
import { loadOpenCodeConfig, saveOpenCodeConfig } from './opencode-config.js'
import { getApiKey, listApiKeys } from './config.js'
import { ENV_VAR_NAMES, OPENCODE_MODEL_MAP, isWindows, isMac, isLinux } from './provider-metadata.js'
import { resolveToolBinaryPath } from './tool-bootstrap.js'

// 📖 OpenCode config location: ~/.config/opencode/opencode.json on ALL platforms.
const OPENCODE_CONFIG = join(homedir(), '.config', 'opencode', 'opencode.json')
const OPENCODE_PORT_RANGE_START = 4096
const OPENCODE_PORT_RANGE_END = 5096

// 📖 Keep merged model references available for future OpenCode-related features.
let mergedModelsRef = []
let mergedModelByLabelRef = new Map()

// 📖 Global Agent with TCP Keep-Alive to prevent ETIMEDOUT during long thinking
const glmAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 10000, // Send TCP probe every 10 seconds
  timeout: 1200000 // 20 minute socket timeout
})

// 📖 Multi-key rotation state for GLM proxy
let glmCurrentKeyIndex = 0
let glmApiKeys = []

// 📖 getNextGlmApiKey: Round-robin through multiple API keys
function getNextGlmApiKey() {
  if (glmApiKeys.length === 0) return null
  const key = glmApiKeys[glmCurrentKeyIndex]
  glmCurrentKeyIndex = (glmCurrentKeyIndex + 1) % glmApiKeys.length
  return key
}

// 📖 SSE termination marker
const SSE_TERMINATION = '\n\ndata: [DONE]\n\n'

// 📖 makeGlmNvidiaRequest: Try with retries and key rotation
// Note: Headers already sent by caller, clientConnected tracked by caller via object ref
async function makeGlmNvidiaRequest(req, body, res, startTime, clientRef, reqId = 'UNKNOWN') {
  let attempt = 0
  const maxAttempts = 20  // Increased for rate limit retries with 2 keys (40 RPM each)

  // Send immediate REAL data to signal "I'm alive" to OpenCode
  // OpenCode's SSE parser needs actual data events, not just comments
  try {
    const initPayload = {
      id: "init",
      object: "chat.completion.chunk",
      created: Date.now(),
      model: "glm-5.1",
      choices: [{
        delta: { role: "assistant" },
        index: 0,
        finish_reason: null
      }]
    }
    res.write(`data: ${JSON.stringify(initPayload)}\n\n`)
  } catch (e) {
    return
  }

  while (attempt < maxAttempts && clientRef.connected) {
    attempt++
    const apiKey = getNextGlmApiKey();
    logToRealtimeFile(`REQ ${reqId}`, `makeGlmNvidiaRequest Attempt ${attempt} (apiKey starts with ${apiKey?.slice(0, 8)})`);
    if (!apiKey) {
      if (!res.writableEnded) {
        const errorPayload = {
          id: "error",
          object: "chat.completion.chunk",
          created: Date.now(),
          model: "glm-5.1",
          choices: [{
            delta: { content: "\n\n**[Proxy Error]** No API keys available" },
            index: 0,
            finish_reason: "stop"
          }]
        }
        res.write(`data: ${JSON.stringify(errorPayload)}\n\n`)
        res.write(SSE_TERMINATION)
        res.end()
      }
      return
    }

    try {
      logToRealtimeFile(`REQ ${reqId}`, `Calling tryGlmRequest for Attempt ${attempt}`);
      await tryGlmRequest(req, body, res, apiKey, attempt, startTime, () => clientRef.connected, reqId);
      logToRealtimeFile(`REQ ${reqId}`, `tryGlmRequest finished successfully`);
      return;
    } catch (err) {
      if (!clientRef.connected) {
        return
      }

      // Classify the error for retry decisions
      const isRateLimit = err.message?.includes('Rate limited') || err.message?.includes('429')
      const isRetryable = isRateLimit
        || err.message?.includes('ETIMEDOUT')
        || err.message?.includes('ECONNRESET')
        || err.message?.includes('EPIPE')
        || err.message?.includes('timeout')
        || err.message?.includes('socket hang up')
      
      // 📖 ETIMEDOUT FIX: SSE is append-only — we can retry upstream and keep piping
      // Only give up if the response stream itself is dead (writableEnded)
      if (!isRetryable) {
        try { if (!res.writableEnded) res.end() } catch {}
        return
      }
      
      if (res.writableEnded) {
        return
      }

      // 🚀 SPEED FIX 5: Zero-delay key rotation on rate limits with multiple keys
      let delay = Math.min(500 * Math.pow(2, attempt - 1), 5000)
      if (isRateLimit && glmApiKeys.length > 1) {
        delay = 50 // Instant retry with next key
      } else if (!isRateLimit) {
        // For ETIMEDOUT/ECONNRESET, use shorter retry delay (the model is still thinking)
        delay = Math.min(1000, delay)
      }
      
      // Send SSE keepalive comment so OpenCode knows we're still alive
      try {
        if (!res.writableEnded) res.write(': retrying upstream connection...\n\n')
      } catch {}

      await new Promise(r => setTimeout(r, delay))
    }
  }

  if (!res.writableEnded && clientRef.connected) {
    const errorPayload = {
      id: "error",
      object: "chat.completion.chunk",
      created: Date.now(),
      model: "glm-5.1",
      choices: [{
        delta: { content: "\n\n**[Proxy Error]** All attempts failed" },
        index: 0,
        finish_reason: "stop"
      }]
    }
    res.write(`data: ${JSON.stringify(errorPayload)}\n\n`)
    res.write(SSE_TERMINATION)
    res.end()
  }
}

// 📖 tryGlmRequest: Single attempt with bulletproof error handling
// Note: Headers are ALREADY sent by makeGlmNvidiaRequest before calling this function
function tryGlmRequest(req, body, res, apiKey, attempt, startTime, isClientConnected, reqId = 'UNKNOWN') {
  return new Promise((resolve, reject) => {
    // Check connection status immediately
    if (isClientConnected && !isClientConnected()) {
      resolve()
      return
    }

    let lastActivity = Date.now()
    let activityTimeout = null
    let chunksReceived = 0
    let thinkingStartTime = Date.now()

    let keepAliveInterval = setInterval(() => {
      try {
        if (!res.writableEnded) {
          res.write(': keepalive\n\n')
        } else {
          clearInterval(keepAliveInterval)
        }
      } catch (e) {
        clearInterval(keepAliveInterval)
      }
    }, 15000)

    const cleanup = () => {
      if (activityTimeout) clearTimeout(activityTimeout)
      if (keepAliveInterval) clearInterval(keepAliveInterval)
    }

    // Send status message to client
    try {
      if (!res.writableEnded) {
        res.write(': connecting to NVIDIA...\n\n')
      }
    } catch (e) {}

    const resetActivityTimeout = () => {
      lastActivity = Date.now()
      if (activityTimeout) clearTimeout(activityTimeout)
      activityTimeout = setTimeout(() => {
        const idle = Date.now() - lastActivity
        if (idle > 300000 && !res.writableEnded) { // 5 minutes of no data
          // Instead of silently completing the stream, abort so the retry loop catches it (if chunks === 0)
          proxyReq.destroy(new Error(`Stalled connection (no data for ${idle}ms)`))
        }
      }, 305000)
    }

    resetActivityTimeout();
      if (chunksReceived <= 3 || chunksReceived % 50 === 0) logToRealtimeFile(`REQ ${reqId}`, `Received chunk #${chunksReceived} (${chunk.length} bytes)`);
    
    // 📖 3. THE ENDPOINT FIX: Use the public NIM endpoint for API keys!
    // The HAR endpoint (api.ngc.nvidia.com) requires a captcha token. API keys MUST use integrate.api.nvidia.com.
    const proxyReq = httpsRequest({
      hostname: 'integrate.api.nvidia.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Accept': 'text/event-stream',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        // 🚀 SPEED FIX 3: Explicit Content-Length allows Envoy to route instantly
        'Content-Length': Buffer.byteLength(body)
      },
      agent: glmAgent, // Uses TCP Keep-Alive
      timeout: 1200000 // 20 minutes
    }, (proxyRes) => {
      const status = proxyRes.statusCode;
      logToRealtimeFile(`REQ ${reqId}`, `NIM responded with HTTP ${status}`);

      if (status < 200 || status >= 300) {
        let errorData = ''
        proxyRes.on('data', chunk => { errorData += chunk })
        proxyRes.on('end', () => {
      logToRealtimeFile(`REQ ${reqId}`, `NIM Response stream ENDED. Total chunks: ${chunksReceived}`);
          cleanup()
          
          // 📖 RETRY on 429 rate limit - don't give up!
          if (status === 429) {
            reject(new Error(`Rate limited (429)`))
            return
          }
          
          // 📖 4. THE PARSER FIX: Send errors as valid OpenAI chunks so OpenCode doesn't crash!
          // Only for non-retryable errors (4xx except 429, 5xx)
          try {
            if (!res.writableEnded) {
              const errMsg = `NVIDIA API Error ${status}: ${errorData.slice(0, 250)}`
              const errorPayload = {
                id: "error",
                object: "chat.completion.chunk",
                created: Date.now(),
                model: "glm-5.1",
                choices: [{
                  delta: { content: `\n\n**[Proxy Error]** ${errMsg}` },
                  index: 0,
                  finish_reason: "stop"
                }]
              }
              res.write(`data: ${JSON.stringify(errorPayload)}\n\n`)
              res.write(SSE_TERMINATION)
              res.end()
            }
          } catch(e) {}
          resolve() // Resolve so we don't infinitely retry hard API errors
        })
        return
      }
      
      resetActivityTimeout()
      
    proxyRes.on('data', (chunk) => {
      chunksReceived++
      resetActivityTimeout()

      try {
        if (!res.writableEnded) res.write(chunk)
      } catch (err) {
        cleanup()
        proxyReq.destroy()
        resolve() // 1000000% guarantee we don't leak a dangling promise if client disconnected
      }
    })
      
    proxyRes.on('end', () => {
      cleanup()
      try {
        if (!res.writableEnded) {
          res.write(SSE_TERMINATION)
          res.end()
        }
      } catch {}
      resolve()
    })
      
      proxyRes.on('error', (err) => {
        logToRealtimeFile(`REQ ${reqId}`, `NIM proxyRes Error: ${err.message}`);
        cleanup()
        if (chunksReceived > 0) {
          // If we already started streaming, we can't cleanly retry without duplicating text.
          // Gracefully complete the stream so OpenCode processes what it got.
          try {
            if (!res.writableEnded) {
              res.write(SSE_TERMINATION)
              res.end()
            }
          } catch {}
          resolve()
        } else {
          reject(err)
        }
    })
  })

   // 🚀 SPEED FIX 2: Disable Nagle's algorithm on NVIDIA connection (before request is sent)
   proxyReq.on('socket', (socket) => {
      socket.setNoDelay(true)
    })

   proxyReq.on('error', (err) => {
      cleanup()
      if (chunksReceived > 0) {
        try {
          if (!res.writableEnded) {
            res.write(SSE_TERMINATION)
            res.end()
          }
        } catch {}
        resolve()
      } else {
        reject(err)
      }
    })
    
    proxyReq.on('timeout', () => {
      logToRealtimeFile(`REQ ${reqId}`, `NIM proxyReq Timeout fired!`);
      const err = new Error(`Request timeout (ETIMEDOUT after ${chunksReceived} chunks)`)
      proxyReq.destroy(err) // This triggers proxyReq.on('error') uniformly
    })
    
    logToRealtimeFile(`REQ ${reqId}`, `Writing body to NIM (length: ${Buffer.byteLength(body)})`);
    proxyReq.write(body);
    proxyReq.end();
  })
}


function logToRealtimeFile(prefix, data) {
  try {
    const ts = new Date().toISOString();
    let msg = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
    appendFileSync(require('path').join(process.cwd(), 'glm-proxy.log'), `[${ts}] ${prefix} | ${msg}\n`);
  } catch (e) {}
}

// 📖 createGlmProxy: Localhost reverse proxy with multi-key rotation
async function createGlmProxy(primaryKey, secondaryKey = null) {
  glmApiKeys = [primaryKey]
  if (secondaryKey) {
    glmApiKeys.push(secondaryKey)
    console.log(chalk.dim(` [GLM Proxy] Using ${glmApiKeys.length} API keys (${glmApiKeys.length * 40} RPM)`))
  }
  glmCurrentKeyIndex = 0
  
  const server = createHttpServer((req, res) => {
    // 🚀 SPEED FIX 1: Disable Nagle's algorithm for instant packet sending
    req.socket.setNoDelay(true)
    
    const reqId = Math.random().toString(36).slice(2, 8);
    logToRealtimeFile(`REQ ${reqId}`, `Incoming ${req.method} ${req.url}`);
    if (req.url !== '/v1/chat/completions' || req.method !== 'POST') {
      res.writeHead(404)
      res.end()
      return
    }

    const startTime = Date.now()

    // 📖 CRITICAL: Send headers IMMEDIATELY when request arrives
    // Don't wait for body - OpenCode will timeout!
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    })
    res.flushHeaders && res.flushHeaders()

    // Set up connection tracking via object ref (primitives are pass-by-value!)
    const clientRef = { connected: true }
    const onClientClose = () => { clientRef.connected = false }
    req.once('close', onClientClose)
    req.once('aborted', onClientClose)
    req.once('error', onClientClose)

    let body = ''

    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      // Check if client disconnected while we were receiving body
      if (!clientRef.connected || req.aborted) {
        try { res.end() } catch {}
        return
      }

      try {
        const json = JSON.parse(body)
        const isGlmThinking = json.model?.includes('glm') && json.model?.endsWith('-thinking')
        const actualModel = isGlmThinking ? json.model.replace('-thinking', '') : json.model

        if (actualModel && (actualModel.includes('glm-5.1') || actualModel.includes('glm5'))) {
          // 📖 Force the exact model name from the HAR
          json.model = "z-ai/glm-5.1"
          json.chat_template_kwargs = {
            ...(json.chat_template_kwargs || {}),
            enable_thinking: true,
            clear_thinking: false
          }
          // Remove thinking_length as it wasn't in the HAR and might cause API slowdowns
          if (json.chat_template_kwargs.thinking_length) {
            delete json.chat_template_kwargs.thinking_length
          }

          // 🚀 SPEED FIX 4: Remove continuous_usage_stats to prevent server-side buffering
          if (json.stream) {
            json.stream_options = { include_usage: true }
          }
          
          // 🚀 TOOL CALLING FIX: Force GLM to use tools properly
          if (json.tools && json.tools.length > 0) {
            const agentPrompt = `

[CRITICAL AGENT INSTRUCTIONS] You are operating in an agentic loop with access to external tools. If you need to read a file, list a directory, or execute code to gather context, you MUST use the provided tools. DO NOT guess or hallucinate file contents in your reasoning. When you need information, immediately invoke the appropriate tool call. I will provide the tool's output, and you can then resume your reasoning to solve the problem.`
            
            // Find the system message to append our instructions, or create one
            const sysMsgIndex = json.messages.findIndex(m => m.role === 'system')
            if (sysMsgIndex >= 0) {
              json.messages[sysMsgIndex].content += agentPrompt
            } else {
              json.messages.unshift({ role: 'system', content: "You are an expert coding assistant." + agentPrompt })
            }
          }
        }

        body = JSON.stringify(json);
        logToRealtimeFile(`REQ ${reqId}`, `Parsed body with model ${actualModel}`);
      } catch (e) {
        logToRealtimeFile(`REQ ${reqId}`, `Failed to parse body: ${e.message}`);
      }

      logToRealtimeFile(`REQ ${reqId}`, `Calling makeGlmNvidiaRequest`);
      await makeGlmNvidiaRequest(req, body, res, startTime, clientRef, reqId)
    })
    
    req.on('error', (err) => {
      console.error(chalk.red(` [GLM Proxy] Request error: ${err.message}`))
      if (!res.headersSent) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: 'Bad request' }))
      }
    })
  })
  
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  return { server, port: server.address().port }
}

// ─── Rest of OpenCode integration (unchanged) ─────────────────────────────────

// 📖 setOpenCodeModelData: Provide mergedModels + mergedModelByLabel to this module.
export function setOpenCodeModelData(mergedModels, mergedModelByLabel) {
  mergedModelsRef = Array.isArray(mergedModels) ? mergedModels : []
  mergedModelByLabelRef = mergedModelByLabel instanceof Map ? mergedModelByLabel : new Map()
}

// 📖 isTcpPortAvailable: checks if a local TCP port is free for OpenCode.
function isTcpPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port)
  })
}

// 📖 resolveOpenCodeTmuxPort: selects a safe port for OpenCode when inside tmux.
async function resolveOpenCodeTmuxPort() {
  const envPortRaw = process.env.OPENCODE_PORT
  const envPort = Number.parseInt(envPortRaw || '', 10)
  
  if (Number.isInteger(envPort) && envPort > 0 && envPort <= 65535) {
    if (await isTcpPortAvailable(envPort)) {
      return { port: envPort, source: 'env' }
    }
    console.log(chalk.yellow(` ⚠ OPENCODE_PORT=${envPort} is already in use; selecting another port for this run.`))
  }
  
  for (let port = OPENCODE_PORT_RANGE_START; port < OPENCODE_PORT_RANGE_END; port++) {
    if (await isTcpPortAvailable(port)) {
      return { port, source: 'auto' }
    }
  }
  
  return null
}

function getOpenCodeConfigPath() {
  return OPENCODE_CONFIG
}

// 📖 Map source model IDs to OpenCode built-in IDs when they differ.
function getOpenCodeModelId(providerKey, modelId) {
  if (providerKey === 'nvidia') return modelId.replace(/^nvidia\//, '')
  if (providerKey === 'zai') return modelId.replace(/^zai\//, '')
  return OPENCODE_MODEL_MAP[providerKey]?.[modelId] || modelId
}

// ─── Shared OpenCode spawn helper ─────────────────────────────────────────────

// 📖 spawnOpenCode: Resolve API keys + spawn opencode CLI with correct env.
async function spawnOpenCode(args, providerKey, fcmConfig, existingZaiProxy = null, model = null, existingGlmProxy = null) {
  const envVarName = ENV_VAR_NAMES[providerKey]
  const resolvedKey = getApiKey(fcmConfig, providerKey)
  const childEnv = { ...process.env }
  // 📖 Suppress MaxListenersExceededWarning from @modelcontextprotocol/sdk
  childEnv.NODE_NO_WARNINGS = '1'
  const finalArgs = [...args]
  const hasExplicitPortArg = finalArgs.includes('--port')
  if (envVarName && resolvedKey) childEnv[envVarName] = resolvedKey
  
  // 📖 ZAI proxy: OpenCode's Go binary doesn't know about ZAI as a provider.
  // 📖 Start proxy if needed, or reuse existing proxy if passed in.
  let zaiProxy = existingZaiProxy
  if (providerKey === 'zai' && resolvedKey && !zaiProxy) {
    const { createZaiProxy } = await import('./zai-proxy.js')
    const { server, port } = await createZaiProxy(resolvedKey)
    zaiProxy = server
    console.log(chalk.dim(` 🔀 ZAI proxy listening on port ${port} (rewrites /v1/* → ZAI API)`))
  }
  
  // 📖 GLM proxy: Use existing proxy if passed (set up in startOpenCode)
  let glmProxy = existingGlmProxy
  
  // 📖 In tmux, OpenCode sub-agents need a listening port to open extra panes.
  if (process.env.TMUX && !hasExplicitPortArg) {
    const tmuxPort = await resolveOpenCodeTmuxPort()
    if (tmuxPort) {
      const portValue = String(tmuxPort.port)
      childEnv.OPENCODE_PORT = portValue
      finalArgs.push('--port', portValue)
      if (tmuxPort.source === 'env') {
        console.log(chalk.dim(` 📺 tmux detected — using OPENCODE_PORT=${portValue}.`))
      } else {
        console.log(chalk.dim(` 📺 tmux detected — using OpenCode port ${portValue} for sub-agent panes.`))
      }
    } else {
      console.log(chalk.yellow(` ⚠ tmux detected but no free OpenCode port found in ${OPENCODE_PORT_RANGE_START}-${OPENCODE_PORT_RANGE_END - 1}; launching without --port.`))
    }
  }
  
  const { spawn } = await import('child_process')
  const child = spawn(resolveToolBinaryPath('opencode') || 'opencode', finalArgs, {
    stdio: 'inherit',
    shell: true,
    detached: false,
    env: childEnv
  })
  
  return new Promise((resolve, reject) => {
    child.on('exit', (code) => {
      if (zaiProxy) zaiProxy.close()
      if (glmProxy) glmProxy.close()
      // 📖 ZAI cleanup: remove the ephemeral proxy provider from opencode.json
      if (providerKey === 'zai') {
        try {
          const cfg = loadOpenCodeConfig()
          if (cfg.provider?.zai) delete cfg.provider.zai
          if (typeof cfg.model === 'string' && cfg.model.startsWith('zai/')) delete cfg.model
          saveOpenCodeConfig(cfg)
        } catch { /* best-effort cleanup */ }
      }
      // 📖 GLM cleanup: remove the ephemeral proxy provider from opencode.json
      if (providerKey === 'nvidia') {
        try {
          const cfg = loadOpenCodeConfig()
          if (cfg.provider?.['fcm-glm']) delete cfg.provider['fcm-glm']
          if (typeof cfg.model === 'string' && cfg.model.startsWith('fcm-glm/')) delete cfg.model
          saveOpenCodeConfig(cfg)
        } catch { /* best-effort cleanup */ }
      }
      resolve(code)
    })
    child.on('error', (err) => {
      if (zaiProxy) zaiProxy.close()
      if (glmProxy) glmProxy.close()
      if (err.code === 'ENOENT') {
        console.error(chalk.red('\n X Could not find "opencode" -- is it installed and in your PATH?'))
        console.error(chalk.dim(' Install: npm i -g opencode-ai or see https://opencode.ai'))
        resolve(1)
      } else {
        reject(err)
      }
    })
  })
}

// ─── Start OpenCode CLI ───────────────────────────────────────────────────────

export async function startOpenCode(model, fcmConfig) {
  const providerKey = model.providerKey ?? 'nvidia'
  const ocModelId = getOpenCodeModelId(providerKey, model.modelId)
  const modelRef = `${providerKey}/${ocModelId}`
  
  if (providerKey === 'nvidia') {
    const config = loadOpenCodeConfig()
    const backupPath = `${getOpenCodeConfigPath()}.backup-${Date.now()}`
    
    if (existsSync(getOpenCodeConfigPath())) {
      copyFileSync(getOpenCodeConfigPath(), backupPath)
      console.log(chalk.dim(` Backup: ${backupPath}`))
    }
    
    const resolvedKey = getApiKey(fcmConfig, 'nvidia')
    const isGlmModel = model?.modelId?.includes('glm-5.1') || model?.modelId?.includes('glm5')
    
    // 📖 GLM models need thinking proxy
    if (isGlmModel && resolvedKey) {
      // 📖 Get all API keys for rotation (supports multiple accounts)
      const allKeys = listApiKeys(fcmConfig, 'nvidia')
      const primaryKey = allKeys[0] || resolvedKey
      const secondaryKey = allKeys[1] || null
      
      const { server: glmProxyServer, port: glmProxyPort } = await createGlmProxy(primaryKey, secondaryKey)
      console.log(chalk.dim(` 🧠 GLM thinking proxy listening on port ${glmProxyPort}`))
      
      // 📖 Create custom GLM-thinking provider that points to proxy
      // 📖 Use 'thinking' suffix in model ID to trigger OpenCode's reasoning display
      if (!config.provider) config.provider = {}
      const thinkingModelId = ocModelId.includes('thinking') ? ocModelId : `${ocModelId}-thinking`
      config.provider['fcm-glm'] = {
        npm: '@ai-sdk/openai-compatible',
        name: 'FCM GLM (with thinking)',
        options: {
          baseURL: `http://127.0.0.1:${glmProxyPort}/v1`,
          apiKey: '{env:NVIDIA_API_KEY}'
        },
        models: {}
      }
      config.provider['fcm-glm'].models[thinkingModelId] = { name: `${model.label} (Thinking)` }
      const glmModelRef = `fcm-glm/${thinkingModelId}`
      config.model = glmModelRef
      
      saveOpenCodeConfig(config)
      
      console.log(chalk.green(` Setting ${chalk.bold(model.label)} as default (with thinking)...`))
      console.log(chalk.dim(` Model: ${glmModelRef}`))
      console.log()
      
      const savedConfig = loadOpenCodeConfig()
      console.log(chalk.dim(` Config saved to: ${getOpenCodeConfigPath()}`))
      console.log(chalk.dim(` Default model in config: ${savedConfig.model || 'NOT SET'}`))
      console.log()
      
      if (savedConfig.model === config.model) {
        console.log(chalk.green(` Default model set to: ${glmModelRef}`))
      } else {
        console.log(chalk.yellow(` Config might not have been saved correctly`))
      }
      console.log()
      console.log(chalk.dim(' Starting OpenCode...'))
      console.log()
      
      await spawnOpenCode(['--model', glmModelRef], providerKey, fcmConfig, null, model, glmProxyServer)
      return
    }
    
    // 📖 Regular NVIDIA models (no proxy needed)
    if (!config.provider) config.provider = {}
    if (!config.provider.nvidia) {
      config.provider.nvidia = {
        npm: '@ai-sdk/openai-compatible',
        name: 'NVIDIA NIM',
        options: {
          baseURL: 'https://integrate.api.nvidia.com/v1',
          apiKey: '{env:NVIDIA_API_KEY}'
        },
        models: {}
      }
      // 📖 Color provider name the same way as in the main table
      const providerRgb = PROVIDER_COLOR['nvidia'] ?? [105, 190, 245]
      const coloredNimName = chalk.bold.rgb(...providerRgb)('NVIDIA NIM')
      console.log(chalk.green(` + Auto-configured ${coloredNimName} provider in OpenCode`))
    }
    
    console.log(chalk.green(` Setting ${chalk.bold(model.label)} as default...`))
    console.log(chalk.dim(` Model: ${modelRef}`))
    console.log()
    
    config.model = modelRef
    if (!config.provider.nvidia.models) config.provider.nvidia.models = {}
    config.provider.nvidia.models[ocModelId] = { name: model.label }
    
    saveOpenCodeConfig(config)
    
    const savedConfig = loadOpenCodeConfig()
    console.log(chalk.dim(` Config saved to: ${getOpenCodeConfigPath()}`))
    console.log(chalk.dim(` Default model in config: ${savedConfig.model || 'NOT SET'}`))
    console.log()
    
    if (savedConfig.model === config.model) {
      console.log(chalk.green(` Default model set to: ${modelRef}`))
    } else {
      console.log(chalk.yellow(` Config might not have been saved correctly`))
    }
    console.log()
    console.log(chalk.dim(' Starting OpenCode...'))
    console.log()
    
    await spawnOpenCode(['--model', modelRef], providerKey, fcmConfig)
    return
  }
  
  if (providerKey === 'replicate') {
    console.log(chalk.yellow(' Replicate models are monitor-only for now in OpenCode mode.'))
    console.log(chalk.dim(' Reason: Replicate uses /v1/predictions instead of OpenAI chat-completions.'))
    console.log(chalk.dim(' You can still benchmark this model in the TUI and use other providers for OpenCode launch.'))
    console.log()
    return
  }
  
  if (providerKey === 'zai') {
    const resolvedKey = getApiKey(fcmConfig, providerKey)
    if (!resolvedKey) {
      console.log(chalk.yellow(' ZAI API key not found. Set ZAI_API_KEY environment variable.'))
      console.log()
      return
    }
    
    const { server: zaiProxyServer, port: zaiProxyPort } = await createZaiProxy(resolvedKey)
    console.log(chalk.dim(` ZAI proxy listening on port ${zaiProxyPort} (rewrites /v1/* -> ZAI API)`))
    
    console.log(chalk.green(` Setting ${chalk.bold(model.label)} as default...`))
    console.log(chalk.dim(` Model: ${modelRef}`))
    console.log()
    
    const config = loadOpenCodeConfig()
    const backupPath = `${getOpenCodeConfigPath()}.backup-${Date.now()}`
    
    if (existsSync(getOpenCodeConfigPath())) {
      copyFileSync(getOpenCodeConfigPath(), backupPath)
      console.log(chalk.dim(` Backup: ${backupPath}`))
    }
    
    if (!config.provider) config.provider = {}
    if (!config.provider.zai) {
      config.provider.zai = {
        npm: '@ai-sdk/openai-compatible',
        name: 'ZAI',
        options: {
          baseURL: `http://127.0.0.1:${zaiProxyPort}/v1`,
          apiKey: '{env:ZAI_API_KEY}'
        },
        models: {}
      }
      console.log(chalk.green(` + Auto-configured ${chalk.bold('ZAI')} provider in OpenCode`))
    }
    
    config.model = modelRef
    if (!config.provider.zai.models) config.provider.zai.models = {}
    config.provider.zai.models[ocModelId] = { name: model.label }
    
    saveOpenCodeConfig(config)
    
    const savedConfig = loadOpenCodeConfig()
    console.log(chalk.dim(` Config saved to: ${getOpenCodeConfigPath()}`))
    console.log(chalk.dim(` Default model in config: ${savedConfig.model || 'NOT SET'}`))
    console.log()
    
    if (savedConfig.model === config.model) {
      console.log(chalk.green(` Default model set to: ${modelRef}`))
    } else {
      console.log(chalk.yellow(` Config might not have been saved correctly`))
    }
    console.log()
    console.log(chalk.dim(' Starting OpenCode...'))
    console.log()
    
    await spawnOpenCode(['--model', modelRef], providerKey, fcmConfig, zaiProxyServer)
    return
  }
  
  console.log(chalk.yellow(` Provider "${providerKey}" launch integration coming soon.`))
  console.log(chalk.dim(' You can still ping and benchmark this provider in the main TUI.'))
  console.log()
}

// ─── Start OpenCode Web ───────────────────────────────────────────────────────

async function launchWeb(port) {
  const { spawn } = await import('child_process')
  const args = ['--port', String(port), '--web']
  const child = spawn(resolveToolBinaryPath('opencode') || 'opencode', args, {
    stdio: 'inherit',
    shell: true,
    detached: false
  })
  return new Promise((resolve) => {
    child.on('exit', (code) => resolve(code))
    child.on('error', () => resolve(1))
  })
}

export async function startOpenCodeWeb(model, fcmConfig) {
  console.log(chalk.green(` Starting OpenCode Web with ${chalk.bold(model.label)}...`))
  await launchWeb(3000)
}

// ─── Start OpenCode Desktop ─────────────────────────────────────────────────────

async function launchDesktop() {
  const { spawn } = await import('child_process')
  const { platform } = await import('os')
  const plat = platform()
  let cmd = 'opencode'
  if (plat === 'darwin') cmd = 'open -a "OpenCode"'
  else if (plat === 'win32') cmd = 'start opencode'
  const child = spawn(cmd, [], { stdio: 'ignore', shell: true, detached: true })
  return new Promise((resolve) => {
    child.on('exit', (code) => resolve(code))
    child.on('error', () => resolve(1))
  })
}

export async function startOpenCodeDesktop(model, fcmConfig) {
  const providerKey = model.providerKey ?? 'nvidia'
  const ocModelId = getOpenCodeModelId(providerKey, model.modelId)
  const modelRef = `${providerKey}/${ocModelId}`
  
  // 📖 Zen models are built-in to OpenCode — remap to `opencode/<model-id>` and skip provider config.
  if (providerKey === 'opencode-zen') {
    const zenModelRef = `opencode/${ocModelId}`
    console.log(chalk.green(` Setting ${chalk.bold(model.label)} as default for OpenCode Desktop (Zen built-in)...`))
    console.log(chalk.dim(` Model: ${zenModelRef}`))
    console.log()
    
    const config = loadOpenCodeConfig()
    const backupPath = `${getOpenCodeConfigPath()}.backup-${Date.now()}`
    
    if (existsSync(getOpenCodeConfigPath())) {
      copyFileSync(getOpenCodeConfigPath(), backupPath)
      console.log(chalk.dim(` Backup: ${backupPath}`))
    }
    
    config.model = zenModelRef
    saveOpenCodeConfig(config)
    
    const savedConfig = loadOpenCodeConfig()
    console.log(chalk.dim(` Config saved to: ${getOpenCodeConfigPath()}`))
    console.log(chalk.dim(` Default model in config: ${savedConfig.model || 'NOT SET'}`))
    console.log()
    
    if (savedConfig.model === config.model) {
      console.log(chalk.green(` Default model set to: ${zenModelRef}`))
    } else {
      console.log(chalk.yellow(` Config might not have been saved correctly`))
    }
    console.log()
    console.log(chalk.dim(' Opening OpenCode Desktop...'))
    console.log()
    
    await launchDesktop()
    return
  }
  
  console.log(chalk.green(` Setting ${chalk.bold(model.label)} as default for OpenCode Desktop...`))
  console.log(chalk.dim(` Model: ${modelRef}`))
  console.log()
  
  const config = loadOpenCodeConfig()
  const backupPath = `${getOpenCodeConfigPath()}.backup-${Date.now()}`
  
  if (existsSync(getOpenCodeConfigPath())) {
    copyFileSync(getOpenCodeConfigPath(), backupPath)
    console.log(chalk.dim(` Backup: ${backupPath}`))
  }
  
  if (!config.provider) config.provider = {}
  if (!config.provider[providerKey]) {
    if (providerKey === 'groq') {
      config.provider.groq = { options: { apiKey: '{env:GROQ_API_KEY}' }, models: {} }
    } else if (providerKey === 'cerebras') {
      config.provider.cerebras = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Cerebras',
        options: { baseURL: 'https://api.cerebras.ai/v1', apiKey: '{env:CEREBRAS_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'sambanova') {
      config.provider.sambanova = {
        npm: '@ai-sdk/openai-compatible',
        name: 'SambaNova',
        options: { baseURL: 'https://api.sambanova.ai/v1', apiKey: '{env:SAMBANOVA_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'openrouter') {
      config.provider.openrouter = {
        npm: '@ai-sdk/openai-compatible',
        name: 'OpenRouter',
        options: { baseURL: 'https://openrouter.ai/api/v1', apiKey: '{env:OPENROUTER_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'huggingface') {
      config.provider.huggingface = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Hugging Face Inference',
        options: { baseURL: 'https://router.huggingface.co/v1', apiKey: '{env:HUGGINGFACE_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'deepinfra') {
      config.provider.deepinfra = {
        npm: '@ai-sdk/openai-compatible',
        name: 'DeepInfra',
        options: { baseURL: 'https://api.deepinfra.com/v1/openai', apiKey: '{env:DEEPINFRA_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'fireworks') {
      config.provider.fireworks = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Fireworks AI',
        options: { baseURL: 'https://api.fireworks.ai/inference/v1', apiKey: '{env:FIREWORKS_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'codestral') {
      config.provider.codestral = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Codestral',
        options: { baseURL: 'https://api.codestral.com/v1', apiKey: '{env:CODESTRAL_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'hyperbolic') {
      config.provider.hyperbolic = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Hyperbolic',
        options: { baseURL: 'https://api.hyperbolic.xyz/v1', apiKey: '{env:HYPERBOLIC_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'scaleway') {
      config.provider.scaleway = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Scaleway',
        options: { baseURL: 'https://api.scaleway.ai/v1', apiKey: '{env:SCALEWAY_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'googleai') {
      config.provider.googleai = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Google AI Studio',
        options: { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: '{env:GOOGLE_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'siliconflow') {
      config.provider.siliconflow = {
        npm: '@ai-sdk/openai-compatible',
        name: 'SiliconFlow',
        options: { baseURL: 'https://api.siliconflow.com/v1', apiKey: '{env:SILICONFLOW_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'together') {
      config.provider.together = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Together AI',
        options: { baseURL: 'https://api.together.xyz/v1', apiKey: '{env:TOGETHER_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'cloudflare') {
      const cloudflareAccountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim()
      if (!cloudflareAccountId) {
        console.log(chalk.yellow(' Cloudflare Workers AI requires CLOUDFLARE_ACCOUNT_ID for OpenCode integration.'))
        console.log(chalk.dim(' Export CLOUDFLARE_ACCOUNT_ID and retry this selection.'))
        console.log()
        return
      }
      config.provider.cloudflare = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Cloudflare Workers AI',
        options: { baseURL: `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/ai/v1`, apiKey: '{env:CLOUDFLARE_API_TOKEN}' },
        models: {}
      }
    } else if (providerKey === 'perplexity') {
      config.provider.perplexity = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Perplexity API',
        options: { baseURL: 'https://api.perplexity.ai', apiKey: '{env:PERPLEXITY_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'iflow') {
      config.provider.iflow = {
        npm: '@ai-sdk/openai-compatible',
        name: 'iFlow',
        options: { baseURL: 'https://apis.iflow.cn/v1', apiKey: '{env:IFLOW_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'chutes') {
      config.provider.chutes = {
        npm: '@ai-sdk/openai-compatible',
        name: 'Chutes AI',
        options: { baseURL: 'https://chutes.ai/v1', apiKey: '{env:CHUTES_API_KEY}' },
        models: {}
      }
    } else if (providerKey === 'ovhcloud') {
      config.provider.ovhcloud = {
        npm: '@ai-sdk/openai-compatible',
        name: 'OVHcloud AI',
        options: { baseURL: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', apiKey: '{env:OVH_AI_ENDPOINTS_ACCESS_TOKEN}' },
        models: {}
      }
    }
  }
  
  config.model = modelRef
  saveOpenCodeConfig(config)
  
  const savedConfig = loadOpenCodeConfig()
  console.log(chalk.dim(` Config saved to: ${getOpenCodeConfigPath()}`))
  console.log(chalk.dim(` Default model in config: ${savedConfig.model || 'NOT SET'}`))
  console.log()
  
  if (savedConfig.model === config.model) {
    console.log(chalk.green(` Default model set to: ${modelRef}`))
  } else {
    console.log(chalk.yellow(` Config might not have been saved correctly`))
  }
  console.log()
  console.log(chalk.dim(' Opening OpenCode Desktop...'))
  console.log()
  
  await launchDesktop()
}

export { createGlmProxy }
