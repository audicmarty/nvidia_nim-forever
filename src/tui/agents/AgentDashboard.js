/**
 * @file AgentDashboard.js
 * @description TUI dashboard for multi-agent system
 * 
 * @details
 * Visual interface showing:
 * - Active agents and their status
 * - RPM usage
 * - Files being edited
 * - Live message log
 * - Controls (spawn, kill, pause)
 */

import chalk from 'chalk'

// 📖 Spinner frames for live updates
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export class AgentDashboard {
  constructor(orchestrator) {
    this.orchestrator = orchestrator
    this.screen = null
    this.spinnerIndex = 0
    this.spinnerInterval = null
    this.selectedRow = 0
    this.scrollOffset = 0
    this.paused = false
    this.showFileMap = false
    this.showChat = false
  }

  async start() {
    // Setup terminal
    this.setupTerminal()
    
    // Start spinner animation
    this.spinnerInterval = setInterval(() => {
      this.spinnerIndex = (this.spinnerIndex + 1) % SPINNER_FRAMES.length
      this.render()
    }, 80)
    
    // Start update loop
    this.updateInterval = setInterval(() => {
      if (!this.paused) {
        this.render()
      }
    }, 500)
    
    // Initial render
    this.render()
  }

  setupTerminal() {
    // Clear screen and hide cursor
    process.stdout.write('\x1b[2J\x1b[H\x1b[?25l')
    
    // Handle resize
    process.stdout.on('resize', () => this.render())
    
    // Cleanup on exit
    process.on('exit', () => this.cleanup())
    process.on('SIGINT', () => {
      this.cleanup()
      process.exit(0)
    })
  }

  cleanup() {
    if (this.spinnerInterval) clearInterval(this.spinnerInterval)
    if (this.updateInterval) clearInterval(this.updateInterval)
    process.stdout.write('\x1b[?25h') // Show cursor
  }

  getState() {
    return this.orchestrator.getDashboardState()
  }

  render() {
    const state = this.getState()
    const spinner = SPINNER_FRAMES[this.spinnerIndex]
    const { rows, cols } = process.stdout
    
    let output = []
    
    // Header
    output.push(this.renderHeader(state, spinner, cols))
    
    // RPM bar
    output.push(this.renderRPMBar(state.rpm, cols))
    
    // Main content area
    const contentHeight = rows - 10 // Reserve space for header, RPM, footer
    output.push(this.renderAgentsPanel(state, contentHeight, cols))
    
    // Footer
    output.push(this.renderFooter(cols))
    
    // Clear and draw
    process.stdout.write('\x1b[2J\x1b[H' + output.join('\n'))
  }

  renderHeader(state, spinner, width) {
    const title = `🤖 MULTI-AGENT ORCHESTRATOR`
    const project = `Project: ${state.project}`
    const sprint = `Sprint: ${state.sprint || 0}/${state.totalSprints || 0}`
    
    const line1 = `${spinner} ${title}`.padEnd(width - project.length) + project
    const line2 = `Task: ${this.orchestrator.initialTask.slice(0, width - sprint.length - 15)}...`.padEnd(width - sprint.length) + sprint
    
    return `${chalk.bold.cyan(line1)}\n${chalk.dim(line2)}\n${'─'.repeat(width)}`
  }

  renderRPMBar(rpm, width) {
    const barWidth = width - 30
    const used = Math.min(rpm.used, rpm.max)
    const filled = Math.round((used / rpm.max) * barWidth)
    const empty = barWidth - filled
    
    let color = chalk.green
    if (rpm.used > 60) color = chalk.yellow
    if (rpm.used > 75) color = chalk.red
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty)
    const percent = Math.round((rpm.used / rpm.max) * 100)
    
    return ` ${color('RPM:')} ${color(`[${bar}]`)} ${color(`${rpm.used}/${rpm.max}`)} (${percent}%)\n`
  }

  renderAgentsPanel(state, height, width) {
    const lines = []
    const agentHeight = Math.floor(height * 0.7)
    const filesHeight = height - agentHeight - 2
    
    // Agent list
    lines.push(this.renderAgentList(state, agentHeight, width))
    lines.push('─'.repeat(width))
    
    // Files being edited
    lines.push(this.renderFileList(state, filesHeight, width))
    
    return lines.join('\n')
  }

  renderAgentList(state, height, width) {
    const lines = []
    const agents = Object.entries(state.agents)
    
    // Header
    lines.push(chalk.bold('ACTIVE AGENTS'))
    lines.push(`${'Agent'.padEnd(20)} ${'Model'.padEnd(25)} ${'Status'.padEnd(12)} ${'Task/Progress'.padEnd(30)}`)
    lines.push(chalk.dim('─'.repeat(width)))
    
    // Agent rows
    const visibleAgents = agents.slice(this.scrollOffset, this.scrollOffset + height - 3)
    
    for (let i = 0; i < height - 3; i++) {
      const agentEntry = visibleAgents[i]
      if (!agentEntry) {
        lines.push('')
        continue
      }
      
      const [id, agent] = agentEntry
      const isSelected = i + this.scrollOffset === this.selectedRow
      const prefix = isSelected ? chalk.cyan('▶ ') : '  '
      
      const roleEmoji = {
        manager: '🧠',
        coder: '💻',
        reviewer: '🔍',
        helper: '🛠️'
      }[agent.role] || '🤖'
      
      const statusColor = {
        thinking: chalk.yellow,
        working: chalk.green,
        idle: chalk.gray,
        terminated: chalk.red
      }[agent.status] || chalk.white
      
      const spinner = agent.status === 'thinking' || agent.status === 'working' 
        ? SPINNER_FRAMES[this.spinnerIndex] 
        : ' '
      
      const name = `${roleEmoji} ${agent.name}`.slice(0, 18).padEnd(20)
      const model = agent.model?.split('/').pop()?.slice(0, 23).padEnd(25) || ''.padEnd(25)
      const status = statusColor(`${spinner} ${agent.status}`.padEnd(12))
      const taskStr = typeof agent.currentTask === 'string' ? agent.currentTask : 
                     typeof agent.currentTask === 'object' && agent.currentTask?.description ? agent.currentTask.description :
                     'Idle'
      const task = taskStr.slice(0, 28).padEnd(30)
      
      lines.push(`${prefix}${name} ${chalk.dim(model)} ${status} ${task}`)
    }
    
    return lines.join('\n')
  }

  renderFileList(state, height, width) {
    const lines = []
    const files = state.lockedFiles || []
    
    lines.push(chalk.bold('FILES BEING EDITED'))
    
    for (const file of files.slice(0, height - 1)) {
      const editor = state.agents[file.lockedBy]?.name || 'Unknown'
      const path = file.path.slice(0, width - editor.length - 10)
      lines.push(`  ${chalk.cyan('✎')} ${path} ${chalk.dim('←')} ${chalk.yellow(editor)}`)
    }
    
    if (files.length === 0) {
      lines.push(chalk.dim('  No files currently being edited'))
    }
    
    return lines.join('\n')
  }

  renderFooter(width) {
    const controls = [
      '[S] Spawn',
      '[K] Kill',
      '[P] Pause',
      '[F] Files',
      '[C] Chat',
      '[M] Manager',
      '[↑↓] Navigate',
      '[Q] Quit'
    ]
    
    if (this.paused) {
      controls.push(chalk.bgRed.white(' PAUSED '))
    }
    
    const line = controls.join('  ')
    return `\n${'─'.repeat(width)}\n${chalk.dim(line)}`
  }

  // 📖 Handle keyboard input
  handleKey(key) {
    const state = this.getState()
    const agentIds = Object.keys(state.agents)
    
    switch (key.name) {
      case 'up':
        this.selectedRow = Math.max(0, this.selectedRow - 1)
        break
      case 'down':
        this.selectedRow = Math.min(agentIds.length - 1, this.selectedRow + 1)
        break
        
      case 's':
        this.spawnPrompt()
        break
        
      case 'k':
        this.killSelectedAgent()
        break
        
      case 'p':
        this.paused = !this.paused
        break
        
      case 'f':
        this.showFileMap = !this.showFileMap
        break
        
      case 'c':
        this.showChat = !this.showChat
        break
        
      case 'm':
        this.showManagerView()
        break
        
      case 'q':
        this.cleanup()
        this.orchestrator.stop()
        process.exit(0)
    }
    
    this.render()
  }

  spawnPrompt() {
    // Would show interactive prompt in real implementation
    console.log('\n\nSpawn agent: [C]oder [H]elper [R]eviewer')
    // Simplified - just spawn a coder
    this.orchestrator.spawnAgent('coder', {
      task: 'Help with implementation',
      files: []
    })
  }

  killSelectedAgent() {
    const state = this.getState()
    const agentIds = Object.keys(state.agents)
    const targetId = agentIds[this.selectedRow]
    
    if (targetId) {
      const agent = this.orchestrator.agents.get(targetId)
      if (agent) {
        console.log(chalk.yellow(`\nKilling ${agent.name}...`))
        agent.terminate()
      }
    }
  }

  showManagerView() {
    const state = this.getState()
    const manager = Object.values(state.agents).find(a => a.role === 'manager')
    
    if (manager) {
      console.log('\n\n')
      console.log(chalk.bold('🧠 Manager Plan:'))
      console.log(manager.plan || 'Planning in progress...')
      console.log('\n' + chalk.dim('Press any key to continue...'))
    }
  }
}

// 📖 Helper to create dashboard
export function createAgentDashboard(orchestrator) {
  return new AgentDashboard(orchestrator)
}
