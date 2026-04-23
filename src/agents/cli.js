/**
 * @file agents/cli.js
 * @description CLI entry point for multi-agent mode
 */

import chalk from 'chalk'
import readline from 'readline'
import { Orchestrator } from './Orchestrator.js'
import { AgentDashboard } from '../tui/agents/AgentDashboard.js'

export async function runAgentsMode(cliArgs, apiKeys) {
  console.log(chalk.cyan(`\n🤖 Multi-Agent Mode`))
  console.log(chalk.dim(`Using ${apiKeys.length} API keys (${apiKeys.length * 40} RPM total)\n`))
  
  // Get project name and task
  const projectName = cliArgs.project || await prompt('Project name: ')
  const task = cliArgs.task || await prompt('What should the agents build? ')
  
  if (!task) {
    console.log(chalk.yellow('No task specified. Exiting.'))
    return
  }
  
  // Create orchestrator
  const orchestrator = new Orchestrator({
    projectName,
    task,
    apiKeys,
    onUpdate: (state) => {
      // Dashboard will handle this
    }
  })
  
  // Create and start dashboard
  const dashboard = new AgentDashboard(orchestrator)
  
  // Setup keyboard handling
  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
  
  process.stdin.on('keypress', (str, key) => {
    dashboard.handleKey(key)
  })
  
  // Start everything
  await orchestrator.start()
  await dashboard.start()
  
  // Keep running until user quits
  await new Promise((resolve) => {
    process.stdin.on('keypress', (str, key) => {
      if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
        resolve()
      }
    })
  })
  
  dashboard.cleanup()
  orchestrator.stop()
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}
