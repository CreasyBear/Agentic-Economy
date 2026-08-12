#!/usr/bin/env tsx
/**
 * AE CLI. Exercises AE the way an external agent would through public machine
 * surfaces. Market Operation search/detail/compare are anonymous HTTP reads;
 * connect uses the existing OAuth device flow; invoke/status/cancel/reconcile
 * use the canonical authenticated gateway (the CLI's `recover` command is
 * the `operation.reconcile` action).
 * Run: npm run -s ae -- <command> [args] [--json]
 *
 * Evidence class: every HTTP command here is labelled local execution against
 * whatever `--base-url` points at. It never proves hosted behavior.
 */

import { loadEnv } from 'vite'

import { parseArgs, printUsage, type CliOptions, type ParsedArgs } from './lib/args'
import { CliFailure, printJson, sourceErrorToCliFailure } from './lib/output'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import type { ProblemKind } from '@/lib/errors'

type CommandRunner = (args: readonly string[], options: CliOptions) => Promise<void>

const CLI_ENTRYPOINT = 'npm run -s ae --'
const JSON_HELP_FLAGS = {
  '--base-url': { type: 'string', description: 'Server to call; defaults to AE_CLI_BASE_URL, AE_CANONICAL_BASE_URL, or the hosted default.' },
  '--json': { type: 'boolean', description: 'Emit exactly one machine-readable JSON value on stdout.' },
  '--help': { type: 'boolean', description: 'Show help without performing command work.' },
  '--allow-write': { type: 'boolean', description: 'Permit a non-read-only action or explicit Braintrust export.' },
  '--idempotency-key': { type: 'string', description: 'Stable replay identity for invoke/cancel/reconcile; never generated.' },
  '--wait': { type: 'boolean', description: 'Bounded invoke wait; timeout returns durable recovery detail.' },
  '--thread-id': { type: 'string', description: 'Ask follow-up thread identifier.' },
  '--operation-ref': { type: 'string', description: 'Exact operation reference to select.' },
  '--candidate-digest': { type: 'string', description: 'Frozen candidate-set digest for a follow-up.' },
  '--turn-id': { type: 'string', repeatable: true, description: 'Explicit finalized answer turn identifier; repeatable up to 25.' },
  '--manifest': { type: 'string', description: 'Explicit JSON manifest with bounded turn IDs.' },
  '--project': { type: 'string', description: 'Braintrust project (or AE_BRAINTRUST_PROJECT).' },
  '--dataset': { type: 'string', description: 'Braintrust dataset (or AE_BRAINTRUST_DATASET).' },
  '--snapshot-name': { type: 'string', description: 'Snapshot name for advanced evaluation.' },
  '--update-snapshot': { type: 'boolean', description: 'Allow replacing an existing snapshot name.' },
} as const

const COMMAND_USAGE: Record<string, string> = {
  manifest: `${CLI_ENTRYPOINT} manifest`,
  search: `${CLI_ENTRYPOINT} search "<job>"`,
  inspect: `${CLI_ENTRYPOINT} inspect <operation-ref>`,
  compare: `${CLI_ENTRYPOINT} compare <ref> <ref> [...]`,
  connect: `${CLI_ENTRYPOINT} connect`,
  invoke: `${CLI_ENTRYPOINT} invoke <operation-ref> '<json>' --idempotency-key <key> [--wait]`,
  status: `${CLI_ENTRYPOINT} status <invocation-ref>`,
  recover: `${CLI_ENTRYPOINT} recover <invocation-ref> '<evidence-json>' --idempotency-key <key>`,
  'advanced cancel': `${CLI_ENTRYPOINT} advanced cancel <invocation-ref> --idempotency-key <key>`,
  demand: `${CLI_ENTRYPOINT} demand <subcommand> ...`,
  advanced: `${CLI_ENTRYPOINT} advanced <subcommand> ...`,
}

const AUTH_HELP = {
  credential: 'AE_API_KEY',
  credentialOrigin: 'AE_API_KEY_ORIGIN',
  scope: MARKET_OPERATIONS_INVOKE_SCOPE,
  deviceFlow: 'connect registers a public device client, displays the server-provided verification URI and user code, then polls for a one-time credential after approval.',
  existingKey: 'If AE_API_KEY is already set, connect validates it against the configured server before reporting connected; AE_API_KEY_ORIGIN must exactly match that server origin.',
  origin: 'Bind AE_API_KEY to the exact --base-url origin in AE_API_KEY_ORIGIN. Credentialed calls require HTTPS except loopback localhost, 127.0.0.1, or ::1 development.',
  next: 'After approval, export AE_API_KEY=<token> and AE_API_KEY_ORIGIN=<origin printed by connect>; invoke, status, cancel, and reconcile use the key as a Bearer credential.',
  authenticatedOperations: {
    invoke: COMMAND_USAGE.invoke,
    status: COMMAND_USAGE.status,
    cancel: COMMAND_USAGE['advanced cancel'],
    reconcile: COMMAND_USAGE.recover,
  },
  cancelRequirements: 'Cancel requires the AE access key AE_API_KEY plus --idempotency-key, sent as body.idempotencyKey.',
} as const


function commandHelpName(command: string | undefined, positionals: readonly string[]): string | undefined {
  if (command === undefined) return positionals[0]
  if (command === 'help') return positionals[0]
  if ((command === 'demand' || command === 'advanced') && positionals[0] !== undefined) {
    return `${command} ${positionals[0]}`
  }
  return command
}

function jsonHelp(
  command: string | undefined,
  positionals: readonly string[],
  knownCommands: readonly string[],
): Record<string, unknown> {
  const requested = commandHelpName(command, positionals)
  const commandName = requested ?? 'root'
  const usage = requested === undefined
    ? `${CLI_ENTRYPOINT} <command> [args] [flags]`
    : COMMAND_USAGE[requested] ?? `${CLI_ENTRYPOINT} ${requested} [args] [flags]`
  const commands = Object.fromEntries(knownCommands.map((name) => [name, { usage: COMMAND_USAGE[name] ?? `${CLI_ENTRYPOINT} ${name} ...` }]))
  return {
    kind: 'HELP',
    command: commandName,
    usage,
    flags: JSON_HELP_FLAGS,
    ...(requested === undefined ? { commands } : {}),
    auth: AUTH_HELP,
    ...(requested === 'connect' ? {
      auth: {
        ...AUTH_HELP,
        guidance: [
          'Keep the returned one-time credential private and set AE_API_KEY plus the exact printed origin as AE_API_KEY_ORIGIN in the calling environment.',
          'Open the displayed verification URI and approve the displayed user code.',
        ],
      },
    } : {}),
  }
}
function printAuthenticatedOperationHelp(): void {
  process.stdout.write([
    '',
    'Authenticated Operation actions:',
    `  invoke: ${AUTH_HELP.authenticatedOperations.invoke}`,
    `  status: ${AUTH_HELP.authenticatedOperations.status}`,
    `  cancel: ${AUTH_HELP.authenticatedOperations.cancel} (${AUTH_HELP.cancelRequirements})`,
    `  reconcile: ${AUTH_HELP.authenticatedOperations.reconcile}`,
  ].join('\n') + '\n')
}

function printUsageWithAuthenticatedOperationHelp(): void {
  printUsage()
  printAuthenticatedOperationHelp()
}

function printCommandHelp(command: string | undefined, positionals: readonly string[]): void {
  if (commandHelpName(command, positionals) !== 'connect') {
    printUsageWithAuthenticatedOperationHelp()
    return
  }
  process.stdout.write([
    `Usage: ${COMMAND_USAGE.connect}`,
    '',
    'Authentication:',
    `  Credential: ${AUTH_HELP.credential}`,
    `  Credential origin: ${AUTH_HELP.credentialOrigin}`,
    `  Scope: ${AUTH_HELP.scope}`,
    `  Device flow: ${AUTH_HELP.deviceFlow}`,
    `  Existing key: ${AUTH_HELP.existingKey}`,
    `  Origin policy: ${AUTH_HELP.origin}`,
    `  Next: ${AUTH_HELP.next}`,
  ].join('\n') + '\n')
  printAuthenticatedOperationHelp()
}


async function main(): Promise<number> {
  loadCliEnvironment()
  const [
    actionCommands,
    askCommands,
    businessCommands,
    cancelCommands,
    compareCommands,
    connectCommands,
    discoverCommands,
    doctorCommands,
    enrichCommands,
    evalCommands,
    importCommands,
    inspectCommands,
    invokeCommands,
    journeyCommands,
    manifestCommands,
    policyCommands,
    recoverCommands,
    requestCommands,
    searchCommands,
    statusCommands,
  ] = await Promise.all([
    import('./commands/actions'),
    import('./commands/ask'),
    import('./commands/business'),
    import('./commands/cancel'),
    import('./commands/compare'),
    import('./commands/connect'),
    import('./commands/discover'),
    import('./commands/doctor'),
    import('./commands/enrich'),
    import('./commands/eval'),
    import('./commands/import'),
    import('./commands/inspect'),
    import('./commands/invoke'),
    import('./commands/journey'),
    import('./commands/manifest'),
    import('./commands/policy'),
    import('./commands/recover'),
    import('./commands/request'),
    import('./commands/search'),
    import('./commands/status'),
  ])
  const demandCommands: Record<string, CommandRunner> = {
    ask: askCommands.runAskCommand,
    business: businessCommands.runBusinessCommand,
    discover: discoverCommands.runDiscoverCommand,
    enrich: enrichCommands.runEnrichCommand,
    import: importCommands.runImportCommand,
    journey: journeyCommands.runJourneyCommand,
    request: requestCommands.runRequestCommand,
  }
  const advancedCommands: Record<string, CommandRunner> = {
    action: actionCommands.runActionCommand,
    actions: actionCommands.runActionsCommand,
    cancel: cancelCommands.runCancelCommand,
    doctor: doctorCommands.runDoctorCommand,
    eval: evalCommands.runEvalCommand,
    policy: policyCommands.runPolicyCommand,
  }
  const groupCommand = (namespace: 'demand' | 'advanced', group: Record<string, CommandRunner>): CommandRunner => (
    async (args, options) => {
      const [subcommand, ...subArgs] = args
      const run = subcommand === undefined ? undefined : group[subcommand]
      if (run === undefined) {
        throw new CliFailure(
          `Usage: npm run -s ae -- ${namespace} <subcommand> ... (available: ${Object.keys(group).join(', ')})`,
          { kind: 'INVALID_ARGUMENT', code: `${namespace}-subcommand` },
        )
      }
      await run(subArgs, options)
    }
  )
  const commands: Record<string, CommandRunner> = {
    manifest: manifestCommands.runManifestCommand,
    search: searchCommands.runSearchCommand,
    inspect: inspectCommands.runInspectCommand,
    compare: compareCommands.runCompareCommand,
    connect: connectCommands.runConnectCommand,
    invoke: invokeCommands.runInvokeCommand,
    status: statusCommands.runStatusCommand,
    recover: recoverCommands.runRecoverCommand,
    demand: groupCommand('demand', demandCommands),
    advanced: groupCommand('advanced', advancedCommands),
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
  if (isHelp) {
    if (parsed.options.json) {
      printJson(jsonHelp(parsed.command, parsed.positionals, Object.keys(commands)))
    } else {
      printCommandHelp(parsed.command, parsed.positionals)
    }
    return 0
  }
  if (parsed.command === undefined) {
    if (parsed.options.json) {
      printJson({ kind: 'INVALID_ARGUMENT', code: 'no-command', message: 'No command provided. See --help for usage.', exitCode: 1 })
      return 1
    }
    printUsageWithAuthenticatedOperationHelp()
    return 1
  }

  const run = commands[parsed.command]
  if (run === undefined) {
    if (parsed.options.json) {
      printJson({ kind: 'INVALID_ARGUMENT', code: 'unknown-command', message: `Unknown command: ${parsed.command}`, exitCode: 1 })
      return 1
    }
    process.stderr.write(`Unknown command: ${parsed.command}\n\n`)
    process.stderr.write(`Known commands: ${Object.keys(commands).join(', ')}\n\n`)
    printUsageWithAuthenticatedOperationHelp()
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
    let retryable: boolean | undefined
    let retryAfter: string | undefined
    let recovery: unknown
    let nextAction: unknown
    const mappedFailure = error instanceof CliFailure ? error : sourceErrorToCliFailure(error)
    if (mappedFailure !== undefined) {
      exitCode = mappedFailure.exitCode
      message = mappedFailure.message
      kind = mappedFailure.kind
      code = mappedFailure.code
      detail = mappedFailure.detail
      retryable = mappedFailure.retryable
      retryAfter = mappedFailure.retryAfter
      recovery = mappedFailure.recovery
      nextAction = mappedFailure.nextAction
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
      printJson({
        kind,
        code,
        message,
        detail,
        exitCode,
        ...(retryable === undefined ? {} : { retryable }),
        ...(retryAfter === undefined ? {} : { retryAfter }),
        ...(recovery === undefined ? {} : { recovery }),
        ...(nextAction === undefined ? {} : { nextAction }),
      })
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
