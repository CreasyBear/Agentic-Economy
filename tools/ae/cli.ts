#!/usr/bin/env tsx
/**
 * AE CLI. Exercises AE the way an external agent would: over the public
 * machine surfaces, and in-process over the real action registry.
 *
 * Run: npm run -s ae -- <command> [args] [--json]
 *
 * Evidence class: every HTTP command here is labelled local execution against
 * whatever `--base-url` points at. It never proves hosted behavior.
 */

import { loadEnv } from 'vite'

import { parseArgs, printUsage, type CliOptions, type ParsedArgs } from './lib/args'
import { CliFailure, printJson, sourceErrorToCliFailure } from './lib/output'
import type { ProblemKind } from '@/lib/errors'

type CommandRunner = (args: readonly string[], options: CliOptions) => Promise<void>

async function main(): Promise<number> {
  loadCliEnvironment()
  const [
    actionCommands,
    askCommands,
    businessCommands,
    compareCommands,
    doctorCommands,
    discoverCommands,
    enrichCommands,
    evalCommands,
    feedsCommands,
    importCommands,
    journeyCommands,
    manifestCommands,
    policyCommands,
    requestCommands,
    runCommands,
    searchCommands,
    studyCommands,
  ] = await Promise.all([
    import('./commands/actions'),
    import('./commands/ask'),
    import('./commands/business'),
    import('./commands/compare'),
    import('./commands/doctor'),
    import('./commands/discover'),
    import('./commands/enrich'),
    import('./commands/eval'),
    import('./commands/feeds'),
    import('./commands/import'),
    import('./commands/journey'),
    import('./commands/manifest'),
    import('./commands/policy'),
    import('./commands/request'),
    import('./commands/run'),
    import('./commands/search'),
    import('./commands/study'),
  ])
  const commands: Record<string, CommandRunner> = {
    search: searchCommands.runSearchCommand,
    business: businessCommands.runBusinessCommand,
    discover: discoverCommands.runDiscoverCommand,
    import: importCommands.runImportCommand,
    enrich: enrichCommands.runEnrichCommand,
    ask: askCommands.runAskCommand,
    request: requestCommands.runRequestCommand,
    actions: actionCommands.runActionsCommand,
    action: actionCommands.runActionCommand,
    journey: journeyCommands.runJourneyCommand,
    eval: evalCommands.runEvalCommand,
    feeds: feedsCommands.runFeedsCommand,
    run: runCommands.runRunCommand,
    compare: compareCommands.runCompareCommand,
    manifest: manifestCommands.runManifestCommand,
    policy: policyCommands.runPolicyCommand,
    study: studyCommands.runStudyCommand,
    doctor: doctorCommands.runDoctorCommand,
  }

  const rawArgv = process.argv.slice(2)
  let parsed: ParsedArgs
  try {
    parsed = parseArgs(rawArgv)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const wantsJson = rawArgv.some((arg) => arg === '--json' || arg.startsWith('--json='))
    if (wantsJson) {
      printJson({ kind: 'INVALID_ARGUMENT', code: 'invalid-arguments', message, exitCode: 1 })
    } else {
      process.stderr.write(`${message}\n`)
    }
    return 1
  }
  const isHelp = parsed.command === 'help' || parsed.options.help
  if (parsed.command === undefined || isHelp) {
    if (parsed.options.json && !isHelp) {
      printJson({ kind: 'INVALID_ARGUMENT', code: 'no-command', message: 'No command provided. See --help for usage.', exitCode: 1 })
      return 1
    }
    printUsage()
    return isHelp ? 0 : 1
  }

  const run = commands[parsed.command]
  if (run === undefined) {
    if (parsed.options.json) {
      printJson({ kind: 'INVALID_ARGUMENT', code: 'unknown-command', message: `Unknown command: ${parsed.command}`, exitCode: 1 })
      return 1
    }
    process.stderr.write(`Unknown command: ${parsed.command}\n\n`)
    process.stderr.write(`Known commands: ${Object.keys(commands).join(', ')}\n\n`)
    printUsage()
    return 1
  }

  try {
    await run(parsed.positionals, parsed.options)
    return 0
  } catch (error) {
    let exitCode: number
    let message: string
    let kind: ProblemKind = 'INTERNAL'
    let code: string | undefined
    let detail: unknown
    const mappedFailure = error instanceof CliFailure ? error : sourceErrorToCliFailure(error)
    if (mappedFailure !== undefined) {
      exitCode = mappedFailure.exitCode
      message = mappedFailure.message
      kind = mappedFailure.kind
      code = mappedFailure.code
      detail = mappedFailure.detail
    } else if (isConnectionRefused(error)) {
      exitCode = 1
      kind = 'UNAVAILABLE'
      code = 'connection_refused'
      message = `Could not reach ${parsed.options.baseUrl}. Is the dev server running? Start it with: npm run dev`
    } else {
      exitCode = 1
      kind = 'INTERNAL'
      code = 'unexpected_error'
      message = 'Command failed.'
    }

    if (parsed.options.json) {
      printJson({ kind, code, message, detail, exitCode })
    } else {
      process.stderr.write(`${message}\n`)
    }
    return exitCode
  }
}

function loadCliEnvironment(): void {
  const fileEnvironment = loadEnv('development', process.cwd(), '')
  for (const [name, value] of Object.entries(fileEnvironment)) {
    if (process.env[name] === undefined) process.env[name] = value
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
