#!/usr/bin/env node
/**
 * @file nvidia-nim-forever.js
 * @description Live terminal availability checker for NVIDIA NIM models with OpenCode integration.
 */

import chalk from 'chalk';
import { parseArgs, TIER_LETTER_MAP } from '../src/utils.js';
import { loadConfig } from '../src/config.js';
import { ensureTelemetryConfig } from '../src/telemetry.js';
import { ensureFavoritesConfig } from '../src/favorites.js';
import { buildCliHelpText } from '../src/cli-help.js';
import { ALT_LEAVE } from '../src/constants.js';
import { runApp } from '../src/app.js';

// Global error handlers to ensure terminal is restored if something crashes catastrophically
process.on('uncaughtException', (err) => {
  if (process.argv.some(arg => arg === '--daemon')) {
    console.error(err);
    return;
  }
  process.stdout.write(ALT_LEAVE);
  console.error(chalk.red('\n[Fatal Error] An unhandled exception occurred.'));
  console.error(err);
    console.error(chalk.yellow('\nPlease file an issue at https://github.com/vava-nessa/nvidia-nim-forever/issues or use the feedback form (I key) to report this to the author.'));
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  if (process.argv.some(arg => arg === '--daemon')) {
    console.error(reason);
    return;
  }
  process.stdout.write(ALT_LEAVE);
  console.error(chalk.red('\n[Fatal Error] An unhandled promise rejection occurred.'));
  console.error(reason);
    console.error(chalk.yellow('\nPlease file an issue at https://github.com/vava-nessa/nvidia-nim-forever/issues or use the feedback form (I key) to report this to the author.'));
  process.exit(1);
});

async function main() {
  const cliArgs = parseArgs(process.argv);

  if (cliArgs.helpMode) {
    console.log();
    console.log(buildCliHelpText({ chalk, title: 'nvidia-nim-forever' }));
    console.log();
    process.exit(0);
  }



  // Validate --tier early, before entering alternate screen
  if (cliArgs.tierFilter && !TIER_LETTER_MAP[cliArgs.tierFilter]) {
    console.error(chalk.red(`  Unknown tier "${cliArgs.tierFilter}". Valid tiers: S, A, B, C`));
    process.exit(1);
  }

  // 📖 --web mode: launch the web dashboard instead of the TUI
  if (cliArgs.webMode) {
    const { startWebServer } = await import('../web/server.js')
    const port = parseInt(process.env.NNF_PORT || '3333', 10)
    await startWebServer(port, { open: true })
    return
  }

  // 📖 Load JSON config (needed before agents mode)
  const config = loadConfig();
  
  // 📖 --agents mode: launch multi-agent orchestrator
  if (cliArgs.agentsMode) {
    const { runAgentsMode } = await import('../src/agents/cli.js')
    const apiKeys = [
      config?.apiKeys?.nvidia || process.env.NVIDIA_API_KEY,
      Array.isArray(config?.apiKeys?.nvidia) ? config.apiKeys.nvidia[1] : null
    ].filter(Boolean)
    
    if (apiKeys.length === 0) {
      console.error(chalk.red('No NVIDIA API keys configured. Add keys with: nvidia-nim-forever'))
      process.exit(1)
    }
    
    await runAgentsMode(cliArgs, apiKeys)
    return
  }
  ensureTelemetryConfig(config);
  ensureFavoritesConfig(config);

  await runApp(cliArgs, config);
}

main().catch((err) => {
  process.stdout.write(ALT_LEAVE);
  console.error(chalk.red('\n[Fatal Error]'));
  console.error(err);
    console.error(chalk.yellow('\nPlease file an issue at https://github.com/vava-nessa/nvidia-nim-forever/issues or use the feedback form (I key) to report this to the author.'));
  process.exit(1);
});

// Contributors: @whit3rabbit @PhucTruong-ctrl

