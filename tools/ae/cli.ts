#!/usr/bin/env tsx
/**
 * AE CLI. Exercises AE the way an external agent would: over the public
 * machine surfaces, and in-process over the real action registry.
 *
 * Run: npm run ae -- <command> [args] [--json]
 *
 * Evidence class: every HTTP command here is labelled local execution against
 * whatever `--base-url` points at. It never proves hosted behavior.
 */

import { runActionCommand, runActionsCommand } from './commands/actions'
import { runAskCommand } from './commands/ask'
import { runBusinessCommand } from './commands/business'
import { runDiscoverCommand } from './commands/discover'
import { runEnrichCommand } from './commands/enrich'
import { runImportCommand } from './commands/import'
import { runJourneyCommand } from './commands/journey'
import { runRequestCommand } from './commands/request'
import { runSearchCommand } from './commands/search'
import { parseArgs, printUsage, type CliOptions } from './lib/args'
import { CliFailure } from './lib/output'

const commands: Record<string, (args: readonly string[], options: CliOptions) => Promise<void>> = {
  search: runSearchCommand,
  business: runBusinessCommand,
  discover: runDiscoverCommand,
  import: runImportCommand,
  enrich: runEnrichCommand,
  ask: runAskCommand,
  request: runRequestCommand,
  actions: runActionsCommand,
  action: runActionCommand,
  journey: runJourneyCommand,
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2))
  if (parsed.command === undefined || parsed.command === 'help' || parsed.options.help) {
    printUsage()
    return parsed.command === undefined && !parsed.options.help ? 1 : 0
  }

  const run = commands[parsed.command]
  if (run === undefined) {
    process.stderr.write(`Unknown command: ${parsed.command}\n\n`)
    printUsage()
    return 1
  }

  try {
    await run(parsed.positionals, parsed.options)
    return 0
  } catch (error) {
    if (error instanceof CliFailure) {
      process.stderr.write(`${error.message}\n`)
      return error.exitCode
    }
    if (isConnectionRefused(error)) {
      process.stderr.write(
        `Could not reach ${parsed.options.baseUrl}. Is the dev server running? Start it with: npm run dev\n`,
      )
      return 1
    }
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

function isConnectionRefused(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.message.includes('fetch failed')) return true
  if (!('cause' in error)) return false
  const cause = error.cause
  if (cause === null || typeof cause !== 'object' || !('code' in cause)) return false
  return cause.code === 'ECONNREFUSED'
}

process.exitCode = await main()
