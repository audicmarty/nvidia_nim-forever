/**
 * @file Agent.js
 * @description Base agent class with tool-calling during thinking
 * 
 * @details
 * Agents can:
 * - Think and reason (GLM 5.1 for Manager/Reviewer, Kimi K2.5 for Coder)
 * - Call tools WHILE thinking (not after)
 * - Read files, write files, search codebase, run commands
 * - Spawn child agents
 * - Send messages to other agents
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { request as httpsRequest } from 'https'
import chalk from 'chalk'

// 📖 Tool definitions for agent to call during thinking
const TOOLS = {
  read_file: {
    description: 'Read content of a file',
    parameters: {
      path: 'string - relative path to file'
    }
  },
  write_file: {
    description: 'Write content to a file (creates if not exists)',
    parameters: {
      path: 'string - relative path',
      content: 'string - file content'
    }
  },
  edit_file: {
    description: 'Edit specific lines in a file',
    parameters: {
      path: 'string - relative path',
      oldString: 'string - text to replace',
      newString: 'string - replacement text'
    }
  },
  search_code: {
    description: 'Search for pattern in codebase',
    parameters: {
      pattern: 'string - search pattern',
      filePattern: 'string - optional file glob'
    }
  },
  list_files: {
    description: 'List files in directory',
    parameters: {
      path: 'string - directory path',
      recursive: 'boolean - include subdirectories'
    }
  },
  run_command: {
    description: 'Run shell command',
    parameters: {
      command: 'string - shell command',
      timeout: 'number - timeout in ms'
    }
  },
  spawn_agent: {
    description: 'Spawn a new agent to help',
    parameters: {
      role: 'string - manager|coder|reviewer',
      task: 'string - what the agent should do',
      files: 'array - files to work on'
    }
  },
  send_message: {
    description: 'Send message to another agent',
    parameters: {
      to: 'string - agent ID',
      content: 'string - message content'
    }
  },
  get_file_status: {
    description: 'Check who is editing a file',
    parameters: {
      path: 'string - file path'
    }
  },
  request_review: {
    description: 'Request code review',
    parameters: {
      file: 'string - file to review',
      priority: 'string - low|medium|high'
    }
  }
}

export class Agent {
  constructor({ id, name, model, role, apiKeys, sharedMemory }) {
    this.id = id
    this.name = name
    this.model = model // 'z-ai/glm-5.1' or 'moonshotai/kimi-k2.5'
    this.role = role // 'manager' | 'coder' | 'reviewer' | 'helper'
    this.apiKeys = apiKeys // Array of keys for rotation
    this.currentKeyIndex = 0
    this.sharedMemory = sharedMemory
    this.tools = TOOLS
    this.toolHandlers = this.createToolHandlers()
    this.conversation = [] // Thinking context
    this.status = 'idle'
    this.currentTask = null
    this.currentFile = null
    this.stats = {
      tokensUsed: 0,
      apiCalls: 0,
      toolsCalled: 0,
      filesRead: 0,
      filesWritten: 0
    }
  }

  getNextKey() {
    const key = this.apiKeys[this.currentKeyIndex]
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length
    return key
  }

  createToolHandlers() {
    return {
      read_file: async ({ path }) => {
        try {
          const fullPath = this.resolvePath(path)
          if (!existsSync(fullPath)) {
            return { error: `File not found: ${path}` }
          }
          const content = readFileSync(fullPath, 'utf8')
          this.stats.filesRead++
          return { content, path, lines: content.split('\n').length }
        } catch (err) {
          return { error: err.message }
        }
      },

      write_file: async ({ path, content }) => {
        try {
          const fullPath = this.resolvePath(path)
          // Lock file first
          if (!this.sharedMemory.lockFile(path, this.id)) {
            return { error: `File ${path} is locked by another agent` }
          }
          writeFileSync(fullPath, content)
          this.sharedMemory.saveVersion(path, content, this.id)
          this.stats.filesWritten++
          this.currentFile = path
          return { success: true, path, bytesWritten: content.length }
        } catch (err) {
          return { error: err.message }
        }
      },

      edit_file: async ({ path, oldString, newString }) => {
        try {
          const readResult = await this.toolHandlers.read_file({ path })
          if (readResult.error) return readResult
          
          if (!readResult.content.includes(oldString)) {
            return { error: `Could not find text to replace in ${path}` }
          }
          
          const newContent = readResult.content.replace(oldString, newString)
          return await this.toolHandlers.write_file({ path, content: newContent })
        } catch (err) {
          return { error: err.message }
        }
      },

      search_code: async ({ pattern, filePattern = '*' }) => {
        const results = []
        const files = Array.from(this.sharedMemory.fileIndex.keys())
          .filter(f => filePattern === '*' || f.includes(filePattern))
        
        for (const file of files.slice(0, 50)) { // Limit search
          try {
            const { content } = await this.toolHandlers.read_file({ path: file })
            if (content && content.includes(pattern)) {
              const lines = content.split('\n')
              const matches = lines
                .map((line, i) => line.includes(pattern) ? { line: i + 1, text: line.trim() } : null)
                .filter(Boolean)
                .slice(0, 3) // First 3 matches
              if (matches.length) {
                results.push({ file, matches })
              }
            }
          } catch {}
        }
        
        return { results, total: results.length }
      },

      list_files: async ({ path, recursive = false }) => {
        try {
          const entries = []
          const basePath = this.resolvePath(path)
          // Quick implementation - would use fs.readdir in real code
          return { path, entries, count: entries.length }
        } catch (err) {
          return { error: err.message }
        }
      },

      spawn_agent: async ({ role, task, files }) => {
        // Request orchestrator to spawn new agent
        return { 
          request: 'SPAWN',
          role,
          task,
          files,
          requestedBy: this.id
        }
      },

      send_message: async ({ to, content }) => {
        this.sharedMemory.broadcast(this.id, 'AGENT_MESSAGE', { content }, to)
        return { sent: true, to }
      },

      get_file_status: async ({ path }) => {
        const fileInfo = this.sharedMemory.data.files[path]
        return {
          path,
          locked: fileInfo?.lockedBy || null,
          versions: fileInfo?.versions?.length || 0
        }
      },

      request_review: async ({ file, priority }) => {
        this.sharedMemory.broadcast(this.id, 'REVIEW_REQUEST', { file, priority })
        return { requested: true, file }
      }
    }
  }

  resolvePath(path) {
    if (path.startsWith('/')) return path
    return join(this.sharedMemory.repoPath, path)
  }

  // 📖 Main thinking loop with tool calling
  async think(prompt, context = {}) {
    this.status = 'thinking'
    this.sharedMemory.setAgentState(this.id, {
      status: 'thinking',
      currentTask: this.currentTask,
      currentFile: this.currentFile
    })

    // Build messages with full repo context
    const messages = this.buildMessages(prompt, context)
    
    // Call LLM with tool support
    let thinking = true
    let iterations = 0
    const maxIterations = 20 // Prevent infinite loops
    const toolResults = []

    while (thinking && iterations < maxIterations) {
      iterations++
      
      const response = await this.callLLM(messages)
      
      if (response.toolCalls && response.toolCalls.length > 0) {
        // Execute tools and add results to context
        for (const toolCall of response.toolCalls) {
          const result = await this.executeTool(toolCall)
          toolResults.push({ tool: toolCall.name, result })
          
          // Check for spawn request
          if (toolCall.name === 'spawn_agent' && result.request === 'SPAWN') {
            return { action: 'SPAWN', ...result }
          }
        }
        
        // Continue thinking with tool results
        messages.push({
          role: 'assistant',
          content: response.content,
          tool_calls: response.toolCalls
        })
        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResults.slice(-5)) // Last 5 results
        })
      } else {
        // No more tools - thinking complete
        thinking = false
        
        return {
          content: response.content,
          toolCalls: toolResults.length,
          iterations,
          stats: this.stats
        }
      }
    }

    return { content: 'Max iterations reached', toolCalls: toolResults.length }
  }

  buildMessages(prompt, context) {
    const systemPrompt = this.getSystemPrompt()
    const repoContext = this.sharedMemory.getRepoContext(50)
    
    return [
      {
        role: 'system',
        content: `${systemPrompt}

You are working in a repository with ${repoContext.totalFiles} files.
Key files: ${repoContext.keyFiles.slice(0, 20).join(', ')}

Available tools: ${Object.keys(this.tools).join(', ')}

When you need to use a tool, output:
<tool name="TOOL_NAME">
{ "param": "value" }
</tool>

Think step by step. Use tools to explore the codebase before making changes.`
      },
      ...this.conversation.slice(-10), // Keep last 10 messages
      {
        role: 'user',
        content: prompt
      }
    ]
  }

  getSystemPrompt() {
    const prompts = {
      manager: `You are a project manager agent. Your job:
1. Break down large tasks into small, specific subtasks
2. Assign tasks to coder agents
3. Monitor progress and coordinate
4. Use spawn_agent to create coder agents for parallel work
5. Use send_message to communicate with agents

Be decisive. Create clear task descriptions with specific file names.`,

      coder: `You are a senior developer agent. Your job:
1. Read existing code before writing
2. Write clean, working code
3. Follow existing patterns in the codebase
4. Use edit_file for small changes, write_file for new files
5. Use search_code to find relevant code
6. Request review when done

Always check file structure first. Match existing code style.`,

      reviewer: `You are a code reviewer agent. Your job:
1. Read code carefully
2. Check for bugs, security issues, best practices
3. Verify the code matches requirements
4. Suggest specific improvements

Be thorough. Cite specific lines and issues.`,

      helper: `You are a helper coder agent. Your job:
1. Assist with specific subtasks assigned by manager
2. Focus on one file at a time
3. Report progress to manager

Work fast and report completion.`
    }
    
    return prompts[this.role] || prompts.helper
  }

  async callLLM(messages) {
    const apiKey = this.getNextKey()
    const modelId = this.model.includes('glm') ? this.model : `nvidia/${this.model}`
    
    const body = JSON.stringify({
      model: modelId,
      messages,
      temperature: 0.7,
      max_tokens: 4000
    })

    return new Promise((resolve, reject) => {
      const req = httpsRequest({
        hostname: 'integrate.api.nvidia.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            const content = json.choices[0].message.content
            const toolCalls = this.parseToolCalls(content)
            
            this.stats.tokensUsed += json.usage?.total_tokens || 0
            this.stats.apiCalls++
            
            resolve({ content, toolCalls })
          } catch (err) {
            reject(err)
          }
        })
      })
      
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }

  parseToolCalls(content) {
    const toolCalls = []
    const regex = /<tool name="([^"]+)">\s*({[\s\S]*?})\s*<\/tool>/g
    let match
    
    while ((match = regex.exec(content)) !== null) {
      try {
        toolCalls.push({
          name: match[1],
          parameters: JSON.parse(match[2])
        })
      } catch {}
    }
    
    return toolCalls
  }

  async executeTool(toolCall) {
    const handler = this.toolHandlers[toolCall.name]
    if (!handler) {
      return { error: `Unknown tool: ${toolCall.name}` }
    }
    
    this.stats.toolsCalled++
    console.log(chalk.dim(` [${this.name}] Using tool: ${toolCall.name}`))
    
    return await handler(toolCall.parameters)
  }

  // 📖 Run agent's main loop
  async run(task) {
    this.currentTask = task
    this.status = 'working'
    
    // Get instructions from task
    const result = await this.think(task.description, task.context)
    
    this.status = 'idle'
    this.sharedMemory.setAgentState(this.id, {
      status: 'idle',
      lastResult: result
    })
    
    return result
  }

  terminate() {
    this.status = 'terminated'
    // Unlock any files
    Object.entries(this.sharedMemory.data.files).forEach(([path, file]) => {
      if (file.lockedBy === this.id) {
        this.sharedMemory.unlockFile(path, this.id)
      }
    })
    this.sharedMemory.setAgentState(this.id, { status: 'terminated' })
  }
}
