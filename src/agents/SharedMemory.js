/**
 * @file SharedMemory.js
 * @description Central shared state for all agents - the "hive mind"
 * 
 * @details
 * All agents read/write to this shared memory. It contains:
 * - Project state (sprints, tasks, progress)
 * - File map (who's editing what, versions)
 * - Agent states (what each agent is doing)
 * - Message history
 * - Code repository index (thousands of files mapped)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, dirname, relative } from 'path'
import { homedir } from 'os'

// 📖 Shared memory location
const MEMORY_DIR = join(homedir(), '.free-coding-models', 'agents')

export class SharedMemory {
  constructor(projectName) {
    this.projectName = projectName
    this.memoryPath = join(MEMORY_DIR, `${projectName}.json`)
    this.repoPath = process.cwd()
    this.data = this.load()
    this.fileIndex = new Map() // Fast file lookup
    this.buildFileIndex()
  }

  load() {
    if (!existsSync(MEMORY_DIR)) {
      mkdirSync(MEMORY_DIR, { recursive: true })
    }
    
    if (existsSync(this.memoryPath)) {
      try {
        return JSON.parse(readFileSync(this.memoryPath, 'utf8'))
      } catch {
        // Corrupted - start fresh
      }
    }
    
    return this.createInitialState()
  }

  createInitialState() {
    return {
      project: this.projectName,
      created: new Date().toISOString(),
      sprints: [],
      currentSprint: 0,
      agents: {},
      files: {},
      messages: [],
      repo: {
        root: this.repoPath,
        totalFiles: 0,
        structure: {}
      },
      stats: {
        totalEdits: 0,
        filesCreated: 0,
        filesModified: 0,
        linesWritten: 0
      }
    }
  }

  // 📖 Build fast index of entire repo (thousands of files)
  buildFileIndex() {
    const extensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h', '.vue', '.svelte', '.css', '.scss', '.html', '.json', '.md', '.yml', '.yaml'])
    const ignore = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.cache', 'target', 'bin', 'obj'])
    
    const scan = (dir, depth = 0) => {
      if (depth > 10) return // Limit depth
      
      try {
        const entries = readdirSync(dir, { withFileTypes: true })
        
        for (const entry of entries) {
          const fullPath = join(dir, entry.name)
          const relPath = relative(this.repoPath, fullPath)
          
          if (entry.isDirectory()) {
            if (!ignore.has(entry.name)) {
              scan(fullPath, depth + 1)
            }
          } else if (entry.isFile()) {
            const ext = entry.name.slice(entry.name.lastIndexOf('.'))
            if (extensions.has(ext)) {
              this.fileIndex.set(relPath, {
                path: relPath,
                fullPath,
                type: this.classifyFile(relPath),
                size: statSync(fullPath).size,
                lastRead: null,
                lastModified: statSync(fullPath).mtime.toISOString()
              })
            }
          }
        }
      } catch {
        // Permission denied or other error - skip
      }
    }
    
    scan(this.repoPath)
    this.data.repo.totalFiles = this.fileIndex.size
    this.data.repo.structure = this.generateStructureSummary()
    this.save()
  }

  classifyFile(path) {
    if (path.includes('test') || path.includes('spec')) return 'test'
    if (path.includes('config')) return 'config'
    if (path.endsWith('.md')) return 'docs'
    if (path.includes('component') || path.includes('Component')) return 'component'
    if (path.includes('page') || path.includes('Page')) return 'page'
    if (path.includes('api') || path.includes('route')) return 'api'
    if (path.includes('hook') || path.includes('use')) return 'hook'
    if (path.includes('util') || path.includes('helper')) return 'util'
    if (path.includes('style') || path.endsWith('.css') || path.endsWith('.scss')) return 'style'
    return 'other'
  }

  generateStructureSummary() {
    const structure = {
      root: [],
      src: {},
      api: {},
      components: {},
      tests: {},
      config: {}
    }
    
    for (const [path, info] of this.fileIndex) {
      const parts = path.split('/')
      
      if (parts.length === 1) {
        structure.root.push(path)
      } else if (parts[0] === 'src') {
        this.addToStructure(structure.src, parts.slice(1), path)
      } else if (parts[0] === 'api') {
        this.addToStructure(structure.api, parts.slice(1), path)
      } else if (parts[0] === 'tests' || parts[0] === '__tests__') {
        this.addToStructure(structure.tests, parts.slice(1), path)
      } else if (parts[0].includes('config')) {
        this.addToStructure(structure.config, parts.slice(1), path)
      }
    }
    
    return structure
  }

  addToStructure(obj, parts, fullPath) {
    if (parts.length === 0) return
    
    const [first, ...rest] = parts
    if (rest.length === 0) {
      obj[first] = fullPath
    } else {
      obj[first] = obj[first] || {}
      this.addToStructure(obj[first], rest, fullPath)
    }
  }

  // 📖 Get context about repo for agents
  getRepoContext(maxFiles = 100) {
    const files = Array.from(this.fileIndex.values())
      .sort((a, b) => b.size - a.size) // Larger files first (more important)
      .slice(0, maxFiles)
    
    return {
      totalFiles: this.data.repo.totalFiles,
      keyFiles: files.map(f => f.path),
      structure: this.data.repo.structure
    }
  }

  // 📖 File locking for editing
  lockFile(filePath, agentId) {
    if (!this.data.files[filePath]) {
      this.data.files[filePath] = { versions: [] }
    }
    
    if (this.data.files[filePath].lockedBy && this.data.files[filePath].lockedBy !== agentId) {
      return false // Already locked
    }
    
    this.data.files[filePath].lockedBy = agentId
    this.data.files[filePath].lockedAt = new Date().toISOString()
    this.save()
    return true
  }

  unlockFile(filePath, agentId) {
    if (this.data.files[filePath]?.lockedBy === agentId) {
      delete this.data.files[filePath].lockedBy
      delete this.data.files[filePath].lockedAt
      this.save()
    }
  }

  // 📖 Save code version
  saveVersion(filePath, content, agentId) {
    const version = {
      content,
      agent: agentId,
      timestamp: new Date().toISOString(),
      version: (this.data.files[filePath]?.versions?.length || 0) + 1
    }
    
    if (!this.data.files[filePath]) {
      this.data.files[filePath] = { versions: [] }
    }
    
    this.data.files[filePath].versions.push(version)
    this.data.files[filePath].currentContent = content
    this.data.stats.totalEdits++
    this.save()
  }

  // 📖 Agent state management
  setAgentState(agentId, state) {
    this.data.agents[agentId] = {
      ...this.data.agents[agentId],
      ...state,
      lastUpdate: new Date().toISOString()
    }
    this.save()
  }

  getAgentState(agentId) {
    return this.data.agents[agentId]
  }

  // 📖 Broadcast message
  broadcast(from, type, payload, to = null) {
    const message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      from,
      to,
      type,
      payload,
      timestamp: new Date().toISOString(),
      read: []
    }
    
    this.data.messages.push(message)
    
    // Keep only last 1000 messages
    if (this.data.messages.length > 1000) {
      this.data.messages = this.data.messages.slice(-1000)
    }
    
    this.save()
    return message
  }

  getUnreadMessages(agentId) {
    return this.data.messages.filter(m => 
      (!m.to || m.to === agentId || m.to === 'all') && 
      !m.read.includes(agentId)
    )
  }

  markAsRead(messageId, agentId) {
    const msg = this.data.messages.find(m => m.id === messageId)
    if (msg && !msg.read.includes(agentId)) {
      msg.read.push(agentId)
      this.save()
    }
  }

  save() {
    writeFileSync(this.memoryPath, JSON.stringify(this.data, null, 2))
  }

  // 📖 Get summary for dashboard
  getDashboardState() {
    const activeAgents = Object.entries(this.data.agents)
      .filter(([_, a]) => a.status !== 'idle' && a.status !== 'terminated')
    
    const lockedFiles = Object.entries(this.data.files)
      .filter(([_, f]) => f.lockedBy)
      .map(([path, f]) => ({ path, lockedBy: f.lockedBy }))
    
    return {
      project: this.projectName,
      sprint: this.data.currentSprint,
      totalSprints: this.data.sprints.length,
      activeAgentCount: activeAgents.length,
      agents: Object.fromEntries(activeAgents),
      lockedFiles,
      recentMessages: this.data.messages.slice(-20),
      stats: this.data.stats,
      repoSize: this.data.repo.totalFiles
    }
  }
}
