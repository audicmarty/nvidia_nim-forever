const fs = require('fs');
let code = fs.readFileSync('src/opencode.js', 'utf8');

// 1. Add appendFileSync import
code = code.replace("import { copyFileSync, existsSync } from 'fs'", "import { copyFileSync, existsSync, appendFileSync } from 'fs'");

// 2. Add logToRealtimeFile function
const logFunc = `
function logToRealtimeFile(prefix, data) {
  try {
    const ts = new Date().toISOString();
    let msg = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
    appendFileSync(require('path').join(process.cwd(), 'glm-proxy.log'), \`[\${ts}] \${prefix} | \${msg}\\n\`);
  } catch (e) {}
}

// 📖 createGlmProxy: Localhost reverse proxy with multi-key rotation`;
code = code.replace("// 📖 createGlmProxy: Localhost reverse proxy with multi-key rotation", logFunc);

// 3. Instrument createGlmProxy
code = code.replace(
  "if (req.url !== '/v1/chat/completions' || req.method !== 'POST') {",
  `const reqId = Math.random().toString(36).slice(2, 8);
    logToRealtimeFile(\`REQ \${reqId}\`, \`Incoming \${req.method} \${req.url}\`);
    if (req.url !== '/v1/chat/completions' || req.method !== 'POST') {`
);

code = code.replace(
  "body = JSON.stringify(json)\n      } catch {}",
  `body = JSON.stringify(json);
        logToRealtimeFile(\`REQ \${reqId}\`, \`Parsed body with model \${actualModel}\`);
      } catch (e) {
        logToRealtimeFile(\`REQ \${reqId}\`, \`Failed to parse body: \${e.message}\`);
      }`
);

code = code.replace(
  "await makeGlmNvidiaRequest(req, body, res, startTime, clientRef)",
  `logToRealtimeFile(\`REQ \${reqId}\`, \`Calling makeGlmNvidiaRequest\`);
      await makeGlmNvidiaRequest(req, body, res, startTime, clientRef, reqId)`
);

// 4. Instrument makeGlmNvidiaRequest
code = code.replace(
  "async function makeGlmNvidiaRequest(req, body, res, startTime, clientRef) {",
  "async function makeGlmNvidiaRequest(req, body, res, startTime, clientRef, reqId = 'UNKNOWN') {"
);

code = code.replace(
  "const apiKey = getNextGlmApiKey()",
  "const apiKey = getNextGlmApiKey();\n    logToRealtimeFile(`REQ ${reqId}`, `makeGlmNvidiaRequest Attempt ${attempt} (apiKey starts with ${apiKey?.slice(0, 8)})`);"
);

code = code.replace(
  "return await tryGlmRequest(req, body, res, apiKey, attempt, startTime, () => clientRef.connected)",
  "logToRealtimeFile(`REQ ${reqId}`, `Calling tryGlmRequest for Attempt ${attempt}`);\n      await tryGlmRequest(req, body, res, apiKey, attempt, startTime, () => clientRef.connected, reqId);\n      logToRealtimeFile(`REQ ${reqId}`, `tryGlmRequest finished successfully`);\n      return;"
);

// 5. Instrument tryGlmRequest
code = code.replace(
  "function tryGlmRequest(req, body, res, apiKey, attempt, startTime, isClientConnected) {",
  "function tryGlmRequest(req, body, res, apiKey, attempt, startTime, isClientConnected, reqId = 'UNKNOWN') {"
);

code = code.replace(
  "const status = proxyRes.statusCode",
  "const status = proxyRes.statusCode;\n      logToRealtimeFile(`REQ ${reqId}`, `NIM responded with HTTP ${status}`);"
);

code = code.replace(
  "resetActivityTimeout()",
  "resetActivityTimeout();\n      if (chunksReceived <= 3 || chunksReceived % 50 === 0) logToRealtimeFile(`REQ ${reqId}`, `Received chunk #${chunksReceived} (${chunk.length} bytes)`);"
);

code = code.replace(
  "proxyRes.on('end', () => {",
  "proxyRes.on('end', () => {\n      logToRealtimeFile(`REQ ${reqId}`, `NIM Response stream ENDED. Total chunks: ${chunksReceived}`);"
);

code = code.replace(
  "proxyRes.on('error', (err) => {",
  "proxyRes.on('error', (err) => {\n        logToRealtimeFile(`REQ ${reqId}`, `NIM proxyRes Error: ${err.message}`);"
);

code = code.replace(
  "proxyReq.on('timeout', () => {",
  "proxyReq.on('timeout', () => {\n      logToRealtimeFile(`REQ ${reqId}`, `NIM proxyReq Timeout fired!`);"
);

code = code.replace(
  "proxyReq.write(body)\n    proxyReq.end()",
  "logToRealtimeFile(`REQ ${reqId}`, `Writing body to NIM (length: ${Buffer.byteLength(body)})`);\n    proxyReq.write(body);\n    proxyReq.end();"
);

fs.writeFileSync('src/opencode.js', code);
