/**
 * @file opencode-simple.js
 * @description Simplified GLM proxy that just forwards requests
 */

import chalk from 'chalk'
import { createServer as createHttpServer } from 'http'
import { request as httpsRequest, Agent } from 'https'

// Global Agent with keepalive
const glmAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  timeout: 300000 // 5 minutes
})

let glmApiKeys = []
let glmCurrentKeyIndex = 0

function getNextKey() {
  if (glmApiKeys.length === 0) return null
  const key = glmApiKeys[glmCurrentKeyIndex]
  glmCurrentKeyIndex = (glmCurrentKeyIndex + 1) % glmApiKeys.length
  return key
}

export async function createGlmProxy(primaryKey, secondaryKey = null) {
  glmApiKeys = [primaryKey]
  if (secondaryKey) glmApiKeys.push(secondaryKey)
  
  console.log(chalk.dim(` [GLM Proxy] Using ${glmApiKeys.length} API key(s)`))
  
  const server = createHttpServer((req, res) => {
    if (req.url !== '/v1/chat/completions' || req.method !== 'POST') {
      res.writeHead(404)
      res.end()
      return
    }
    
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      // Parse and modify body for GLM thinking
      try {
        const json = JSON.parse(body)
        if (json.model?.includes('glm')) {
          json.chat_template_kwargs = {
            enable_thinking: true,
            clear_thinking: false
          }
          json.stream_options = {
            include_usage: true,
            continuous_usage_stats: true
          }
          body = JSON.stringify(json)
        }
      } catch {}
      
      const apiKey = getNextKey()
      if (!apiKey) {
        res.writeHead(500)
        res.end(JSON.stringify({ error: 'No API key' }))
        return
      }
      
      // Forward to NVIDIA
      const proxyReq = httpsRequest({
        hostname: 'integrate.api.nvidia.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'text/event-stream'
        },
        agent: glmAgent,
        timeout: 300000
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
        
        proxyRes.on('end', () => {
          console.log(chalk.dim(` [GLM Proxy] Request completed`))
        })
      })
      
      proxyReq.on('error', (err) => {
        console.error(chalk.red(` [GLM Proxy] Error: ${err.message}`))
        if (!res.headersSent) {
          res.writeHead(502)
          res.end(JSON.stringify({ error: err.message }))
        }
      })
      
      proxyReq.write(body)
      proxyReq.end()
    })
  })
  
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  return { server, port: server.address().port }
}
