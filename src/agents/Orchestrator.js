/**
 * @file Orchestrator.js
 * @description Main controller for multi-agent system
 * 
 * @details
 * The Orchestrator:
 * - Spawns and manages all agents
 * - Balances API key usage across 80 RPM
 * - Assigns tasks to idle agents
 * - Resolves conflicts
 * - Updates dashboard
 */

import { Agent } from './Agent.js'
import { SharedMemory } from './SharedMemory.js'
import chalk from 'chalk'

export class Orchestrator {
  constructor({ projectName, task, apiKeys, onUpdate }) {
    this.projectName = projectName
    this.initialTask = task
    this.apiKeys = apiKeys // [key1, key2]
    this.onUpdate = onUpdate // Callback for UI updates
    
    this.sharedMemory = new SharedMemory(projectName)
    this.agents = new Map()
    this.agentCounter = 0
    this.running = false
    this.tickInterval = null
    this.messageQueue = []
    
    // RPM tracking
    this.rpmTracker = {
      window: [], // Last minute of requests
      max: 80
    }
    
    // Agent pool limits
    this.maxAgents = {
      manager: 1,
      reviewer: 1,
      coder: 5, // Can spawn up to 5 coders
      helper: 10
    }
    
    this.currentAgentCount = {
      manager: 0,
      reviewer: 0,
      coder: 0,
      helper: 0
    }
  }

  async start() {
    console.log(chalk.cyan(`\n🚀 Starting Multi-Agent Orchestrator`))
    console.log(chalk.dim(`   Project: ${this.projectName}`))
    console.log(chalk.dim(`   Task: ${this.initialTask}`))
    console.log(chalk.dim(`   API Keys: ${this.apiKeys.length} (80 RPM total)\n`))
    
    this.running = true
    
    // Create initial sprint
    this.sharedMemory.data.sprints.push({
      number: 1,
      name: 'Initial Implementation',
      tasks: [],
      status: 'active'
    })
    
    // Spawn Manager agent
    await this.spawnAgent('manager', {
      task: `Create a detailed plan for: ${this.initialTask}\n\n` +
             `First, explore the repository structure to understand what exists.\n` +
             `Then break this down into specific files to create or modify.\n` +
             `Use spawn_agent to create coder agents for parallel work.`
    })
    
    // Start main loop
    this.tickInterval = setInterval(() => this.tick(), 100)
    
    // Start update loop for UI
    setInterval(() => {
      if (this.onUpdate) {
        this.onUpdate(this.getDashboardState())
      }
    }, 500)
    
    return this
  }

  async spawnAgent(role, { task, parentId = null, files = [] }) {
    // Check limits
    if (this.currentAgentCount[role] >= this.maxAgents[role]) {
      console.log(chalk.yellow(`⚠ Max ${role} agents reached (${this.maxAgents[role]})`))
      return null
    }
    
    this.agentCounter++
    const id = `${role}-${this.agentCounter}`
    
    // Select model based on role
    const model = role === 'coder' || role === 'helper' 
      ? 'moonshotai/kimi-k2.5' 
      : 'z-ai/glm-5.1'
    
    const agent = new Agent({
      id,
      name: `${role.charAt(0).toUpperCase() + role.slice(1)}-${this.agentCounter}`,
      model,
      role,
      apiKeys: this.apiKeys,
      sharedMemory: this.sharedMemory
    })
    
    this.agents.set(id, agent)
    this.currentAgentCount[role]++
    
    console.log(chalk.green(`➕ Spawned ${chalk.bold(agent.name)} (${agent.model})`))
    
    // Set initial state
    this.sharedMemory.setAgentState(id, {
      role,
      status: 'idle',
      task,
      parentId,
      files,
      spawnedAt: new Date().toISOString()
    })
    
    // Start agent in background
    this.runAgent(agent, task)
    
    return agent
  }

  async runAgent(agent, task) {
    try {
      const result = await agent.run({
        description: task,
        context: {
          repoContext: this.sharedMemory.getRepoContext(50),
          parentTask: agent.parentId ? this.sharedMemory.getAgentState(agent.parentId)?.task : null
        }
      })
      
      // Handle spawn requests
      if (result.action === 'SPAWN') {
        await this.handleSpawnRequest(agent, result)
      }
      
      // Handle review requests
      if (this.needsReview(result)) {
        await this.spawnAgent('reviewer', {
          task: `Review the code written by ${agent.name}`,
          parentId: agent.id,
          files: result.files || []
        })
      }
      
    } catch (err) {
      console.error(chalk.red(`❌ Agent ${agent.name} error: ${err.message}`))
    }
  }

  async handleSpawnRequest(parentAgent, request) {
    const { role, task, files } = request
    
    console.log(chalk.cyan(`📢 ${parentAgent.name} requested ${role} agent`))
    
    await this.spawnAgent(role, {
      task,
      parentId: parentAgent.id,
      files
    })
  }

  needsReview(result) {
    // Auto-spawn reviewer if coder wrote code
    return result.toolCalls > 0 && this.currentAgentCount.reviewer < this.maxAgents.reviewer
  }

  tick() {
    if (!this.running) return
    
    // Check messages from agents
    this.processMessages()
    
    // Check for idle agents and assign work
    this.assignIdleWork()
    
    // Clean up terminated agents
    this.cleanupAgents()
    
    // Update RPM tracker
    this.updateRPMTracker()
  }

  processMessages() {
    for (const agent of this.agents.values()) {
      const messages = this.sharedMemory.getUnreadMessages(agent.id)
      
      for (const msg of messages) {
        this.sharedMemory.markAsRead(msg.id, agent.id)
        
        // Handle different message types
        if (msg.type === 'REVIEW_REQUEST') {
          this.handleReviewRequest(msg)
        }
        else if (msg.type === 'TASK_COMPLETE') {
          this.handleTaskComplete(msg)
        }
      }
    }
  }

  handleReviewRequest(msg) {
    // Spawn reviewer if not at max
    if (this.currentAgentCount.reviewer < this.maxAgents.reviewer) {
      this.spawnAgent('reviewer', {
        task: `Review ${msg.payload.file}`,
        files: [msg.payload.file]
      })
    }
  }

  handleTaskComplete(msg) {
    const agent = this.agents.get(msg.from)
    if (!agent) return
    
    // Check if parent needs to be notified
    if (agent.parentId) {
      this.sharedMemory.broadcast(
        agent.id,
        'CHILD_COMPLETE',
        { task: agent.currentTask, result: msg.payload },
        agent.parentId
      )
    }
    
    // Check if all tasks in sprint are complete
    this.checkSprintComplete()
  }

  assignIdleWork() {
    // Find idle coders
    const idleCoders = Array.from(this.agents.values())
      .filter(a => a.role === 'coder' && a.status === 'idle')
    
    // Find pending tasks in current sprint
    const currentSprint = this.sharedMemory.data.sprints[this.sharedMemory.data.currentSprint]
    const pendingTasks = currentSprint?.tasks.filter(t => t.status === 'pending') || []
    
    // Assign tasks to idle coders
    for (const coder of idleCoders) {
      if (pendingTasks.length === 0) break
      
      const task = pendingTasks.shift()
      task.status = 'in_progress'
      task.assignedTo = coder.id
      
      this.runAgent(coder, task.description)
    }
  }

  checkSprintComplete() {
    const currentSprint = this.sharedMemory.data.sprints[this.sharedMemory.data.currentSprint]
    if (!currentSprint) return
    
    const allComplete = currentSprint.tasks.every(t => t.status === 'complete')
    const noActiveAgents = Array.from(this.agents.values())
      .every(a => a.status === 'idle' || a.status === 'terminated')
    
    if (allComplete && noActiveAgents && currentSprint.tasks.length > 0) {
      console.log(chalk.green(`\n✅ Sprint ${currentSprint.number} complete!`))
      currentSprint.status = 'complete'
      
      // Could auto-start next sprint here
    }
  }

  cleanupAgents() {
    for (const [id, agent] of this.agents) {
      if (agent.status === 'terminated') {
        this.agents.delete(id)
        this.currentAgentCount[agent.role]--
      }
    }
  }

  updateRPMTracker() {
    const now = Date.now()
    // Remove requests older than 1 minute
    this.rpmTracker.window = this.rpmTracker.window.filter(t => now - t < 60000)
  }

  getCurrentRPM() {
    return this.rpmTracker.window.length
  }

  getAvailableRPM() {
    return this.rpmTracker.max - this.getCurrentRPM()
  }

  getDashboardState() {
    return {
      ...this.sharedMemory.getDashboardState(),
      rpm: {
        used: this.getCurrentRPM(),
        available: this.getAvailableRPM(),
        max: this.rpmTracker.max
      },
      agentLimits: this.maxAgents,
      agentCounts: this.currentAgentCount
    }
  }

  stop() {
    this.running = false
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
    }
    
    // Terminate all agents
    for (const agent of this.agents.values()) {
      agent.terminate()
    }
    
    console.log(chalk.yellow('\n👋 Orchestrator stopped'))
  }
}
