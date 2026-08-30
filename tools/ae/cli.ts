/**
 * AE CLI. Exercises AE the way an external agent would through public machine
 * surfaces. Market Operation search/detail/compare are anonymous HTTP reads;
 * connect uses the existing OAuth device flow; call/status/cancel/reconcile
 * use the canonical authenticated gateway (the CLI's `recover` command is
 * the `operation.reconcile` action).
 * Run: ae <command> [args] [--json]
 *
 * Evidence class: every HTTP command here is labelled local execution against
 * whatever `--base-url` points at. It never proves hosted behavior.
 */

import { COMMANDS } from './commands/manifest'
import { parseArgs, safeOriginForDiagnostics, type CliOptions, type ParsedArgs } from './lib/args'
import { CliFailure, printJson, sourceErrorToCliFailure } from './lib/output'
import {
  CLI_ENTRYPOINT,
  commandMetadata,
  commandUsage,
  rootCommandHelpLines,
} from './lib/help'
import { MARKET_OPERATIONS_INVOKE_SCOPE, MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
import type { ProblemKind } from '@/lib/errors'

type CommandRunner = (args: readonly string[], options: CliOptions) => Promise<void>

const JSON_HELP_FLAGS = {
  '--base-url': { type: 'string', description: 'Server to call; defaults to AE_CLI_BASE_URL, AE_CANONICAL_BASE_URL, local Vite when Convex is loopback, or the hosted origin.' },
  '--limit': { type: 'string', description: 'Page size: search accepts 1-20; account activity and history accept 1-100.' },
  '--cursor': { type: 'string', description: 'Opaque search, account activity, or history continuation cursor.' },
  '--state': { type: 'string', description: 'Canonical invocation state filter; history only.' },
  '--filters': { type: 'string', description: 'Canonical JSON search filters; search only.' },
  '--input': { type: 'string', description: 'Schema-valid JSON object for call or supplier lifecycle write.' },
  '--mcp': { type: 'boolean', description: 'Write a user-only Streamable HTTP MCP connection file after connect.' },
  '--supplier': { type: 'boolean', description: 'Request a separate owner-approved supplier credential with market_supply:manage.' },
  '--json': { type: 'boolean', description: 'Emit exactly one machine-readable JSON value on stdout.' },
  '--help': { type: 'boolean', description: 'Show help without performing command work.' },
  '--technical': { type: 'boolean', description: 'Include operation identity and evidence metadata in human compare output.' },
  '--idempotency-key': { type: 'string', description: 'Optional stable retry identity for call or supplier lifecycle write.' },
  '--wait': { type: 'boolean', description: 'Wait for a bounded call result; timeout preserves recovery detail.' },
} as const

const COMMON_COMMAND_OPTIONS = ['base-url', 'json'] as const
const COMMAND_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  manifest: ['technical'],
  search: ['limit', 'cursor', 'filters'],
  inspect: [],
  compare: ['technical'],
  'inspect-plan': [],
  connect: ['mcp', 'supplier'],
  doctor: ['supplier'],
  account: [],
  'account activity': ['limit', 'cursor'],
  supply: [],
  'supply publish': ['input', 'idempotency-key'],
  'supply withdraw': ['input', 'idempotency-key'],
  'supply recheck': ['input', 'idempotency-key'],
  'supply republish': ['input', 'idempotency-key'],
  'supply connect': ['input', 'idempotency-key'],
  'supply reconnect': ['input', 'idempotency-key'],
  'supply revoke': ['input', 'idempotency-key'],
  'supply retry-cleanup': ['input', 'idempotency-key'],
  fund: [],
  call: ['input', 'idempotency-key', 'wait'],
  history: ['limit', 'cursor', 'state'],
  status: [],
  cancel: ['idempotency-key'],
  recover: ['idempotency-key'],
  revoke: [],
}

const AUTH_HELP = {
  credential: 'AE_API_KEY',
  credentialOrigin: 'AE_API_KEY_ORIGIN',
  scope: MARKET_OPERATIONS_INVOKE_SCOPE,
  deviceFlow: 'connect registers a public device client, displays the server-provided verification URI and user code, then polls for a one-time credential after approval.',
  existingKey: 'If AE_API_KEY is already set, connect validates it against the configured server before reporting connected; AE_API_KEY_ORIGIN must exactly match that server origin.',
  origin: 'Bind AE_API_KEY to the exact --base-url origin in AE_API_KEY_ORIGIN. Credentialed calls require HTTPS except loopback localhost, 127.0.0.1, or ::1 development.',
  next: 'Connect stores one origin-bound key with user-only permissions; call, history, status, cancel, and recovery reuse it automatically.',
  authenticatedOperations: {
    call: commandUsage('call'),
    history: commandUsage('history'),
    status: commandUsage('status'),
    cancel: commandUsage('cancel'),
    reconcile: commandUsage('recover'),
  },
  cancelRequirements: 'Cancel requires the AE access key AE_API_KEY plus --idempotency-key, sent as body.idempotencyKey.',
} as const

const SUPPLY_AUTH_HELP = {
  ...AUTH_HELP,
  scope: MARKET_SUPPLY_MANAGE_SCOPE,
  deviceFlow: 'Run ae connect --supplier to request a separate owner-approved supplier credential; ordinary ae connect remains buyer-scoped.',
  existingKey: 'Use an owner-issued AE key whose exact origin and market_supply:manage scope have already been established.',
  next: 'Use supply status for Operations and supply connections for provider authority before lifecycle writes; preserve returned revisions, generations, and digests.',
} as const

function commandHelpName(command: string | undefined, positionals: readonly string[]): string | undefined {
  const tokens = command === undefined
    ? []
    : command === 'help'
      ? positionals
      : [command, ...positionals]
  if (tokens.length === 0) return undefined
  const root = tokens[0]
  const child = tokens[1]
  if (root !== undefined && child !== undefined && COMMANDS[root]?.commands?.[child] !== undefined) {
    return `${root} ${child}`
  }
  return root
}

function commandHelpProjection(path: string): Record<string, unknown> {
  const metadata = commandMetadata(path)
  if (metadata === undefined) {
    return { usage: commandUsage(path) }
  }
  return {
    usage: commandUsage(path),
    summary: metadata.summary,
    ...(metadata.guidance === undefined ? {} : { guidance: metadata.guidance }),
    ...(metadata.commands === undefined ? {} : {
      commands: Object.fromEntries(Object.entries(metadata.commands).map(([name, child]) => [
        name,
        {
          usage: commandUsage(`${path} ${name}`),
          summary: child.summary,
          ...(child.guidance === undefined ? {} : { guidance: child.guidance }),
        },
      ])),
    }),
  }
}

function jsonHelp(
  command: string | undefined,
  positionals: readonly string[],
  knownCommands: readonly string[],
): Record<string, unknown> {
  const requested = commandHelpName(command, positionals)
  const commandName = requested ?? 'root'
  const commands = Object.fromEntries(knownCommands.map((name) => [name, commandHelpProjection(name)]))
  return {
    kind: 'HELP',
    command: commandName,
    ...(requested === undefined
      ? {
        usage: `${CLI_ENTRYPOINT} <command> [args] [flags]`,
        commands,
      }
      : commandHelpProjection(requested)),
    flags: JSON_HELP_FLAGS,
    auth: requested?.startsWith('supply') === true ? SUPPLY_AUTH_HELP : AUTH_HELP,
    ...(requested === 'connect' ? {
      auth: {
        ...AUTH_HELP,
        guidance: [
          'Open the displayed verification URI and approve the displayed user code.',
          'Connect validates the issued key and stores it for this exact origin with user-only file permissions.',
          'Pass --mcp to write the matching Streamable HTTP MCP connection at the same time.',
        ],
      },
    } : {}),
  }
}
function printAuthenticatedOperationHelp(): void {
  process.stdout.write([
    '',
    'Authenticated Operation actions:',
    `  call: ${AUTH_HELP.authenticatedOperations.call}`,
    `  history: ${AUTH_HELP.authenticatedOperations.history}`,
    `  status: ${AUTH_HELP.authenticatedOperations.status}`,
    `  cancel: ${AUTH_HELP.authenticatedOperations.cancel} (${AUTH_HELP.cancelRequirements})`,
    `  reconcile: ${AUTH_HELP.authenticatedOperations.reconcile}`,
  ].join('\n') + '\n')
}

function printUsage(): void {
  process.stdout.write(`AE CLI - exercise AE the way an external agent would.

Usage: ${CLI_ENTRYPOINT} <command> [args] [flags]

Canonical Operation commands (need a running server; hosted default https://agentic-economy-phi.vercel.app, or http://127.0.0.1:3024 when CONVEX_URL is loopback):
${rootCommandHelpLines().join('\n')}

Flags:
  --base-url <url>   server to call (env: AE_CLI_BASE_URL or AE_CANONICAL_BASE_URL)
  Credentials:
  AE_API_KEY <token>          reusable caller credential for credentialed commands
  AE_API_KEY_ORIGIN <origin>  exact origin bound to AE_API_KEY; required with HTTPS except loopback HTTP development
  --json             machine-readable output
  --limit <n>        bounded page size for search, account activity, or history
  --cursor <cursor>  opaque continuation cursor for search, account activity, or history
  --state <state>    canonical invocation state filter (history only)
  --filters '<json>' canonical search filters (search only)
  --technical        human compare output with operation identity and evidence metadata
  --supplier         connect a separate owner-approved supplier credential
  --idempotency-key <key>  optional stable retry identity; call generates one when omitted
  --wait             bounded call wait; timeout returns durable recovery detail
  --help
`)
}

function printUsageWithAuthenticatedOperationHelp(): void {
  printUsage()
  printAuthenticatedOperationHelp()
}

function printCommandHelp(command: string | undefined, positionals: readonly string[]): void {
  const requested = commandHelpName(command, positionals)
  if (requested === undefined) {
    printUsageWithAuthenticatedOperationHelp()
    return
  }
  const metadata = commandMetadata(requested)
  if (metadata === undefined) {
    printUsageWithAuthenticatedOperationHelp()
    return
  }
  const lines = [
    `Usage: ${commandUsage(requested)}`,
    '',
    metadata.summary,
    ...(metadata.guidance?.map((guidance) => `  ${guidance}`) ?? []),
    ...(metadata.commands === undefined
      ? []
      : [
        '',
        'Subcommands:',
        ...Object.entries(metadata.commands).map(([name, child]) => `  ${name}: ${commandUsage(`${requested} ${name}`)} — ${child.summary}`),
      ]),
  ]
  if (requested === 'connect') {
    lines.push(
      '',
      'Authentication:',
      `  Credential: ${AUTH_HELP.credential}`,
      `  Credential origin: ${AUTH_HELP.credentialOrigin}`,
      `  Scope: ${AUTH_HELP.scope}`,
      `  Device flow: ${AUTH_HELP.deviceFlow}`,
      `  Existing key: ${AUTH_HELP.existingKey}`,
      `  Origin policy: ${AUTH_HELP.origin}`,
      `  Next: ${AUTH_HELP.next}`,
      '  Supplier profile: ae connect --supplier requests market_supply:manage separately and does not replace the buyer credential.',
    )
  }
  if (requested.startsWith('supply')) {
    lines.push(
      '',
      'Supplier authentication:',
      `  Credential: ${SUPPLY_AUTH_HELP.credential}`,
      `  Scope: ${SUPPLY_AUTH_HELP.scope}`,
      `  Issuance: ${SUPPLY_AUTH_HELP.deviceFlow}`,
      `  Next: ${SUPPLY_AUTH_HELP.next}`,
    )
  }
  process.stdout.write(lines.join('\n') + '\n')
  if (requested === 'connect') printAuthenticatedOperationHelp()
}
type HelpPathResult = Readonly<{
  path?: string
  error?: Readonly<{ code: string; message: string }>
}>

function resolveHelpPath(
  command: string | undefined,
  positionals: readonly string[],
  commands: Readonly<Record<string, CommandRunner>>,
): HelpPathResult {
  const tokens = command === undefined
    ? []
    : command === 'help'
      ? positionals
      : [command, ...positionals]
  const root = tokens[0]
  if (root === undefined) return {}
  if (commands[root] === undefined) {
    // Never echo the raw token: hostile/paste argv can embed secrets.
    return { error: { code: 'unknown-command', message: 'Unknown command' } }
  }
  return { path: root }
}

function validateCommandOptions(parsed: ParsedArgs): void {
  const command = parsed.command
  if (command === undefined) return
  const subcommand = parsed.positionals[0]
  const commandPath = subcommand !== undefined && COMMANDS[command]?.commands?.[subcommand] !== undefined
    ? `${command} ${subcommand}`
    : command
  const allowed = new Set([
    ...COMMON_COMMAND_OPTIONS,
    ...(COMMAND_OPTIONS[commandPath] ?? []),
  ])
  const unsupported = parsed.providedOptions.filter(
    (option) => option !== 'help' && !allowed.has(option),
  )
  if (unsupported.length === 0) return
  throw new CliFailure(
    `Option --${unsupported[0]} is not valid for ${commandPath}.`,
    {
      kind: 'INVALID_ARGUMENT',
      code: 'option-not-supported',
      suggestion: 'Review the flags supported by this exact command and try again.',
      nextCommand: `ae help ${commandPath}`,
      detail: {
        command: commandPath,
        unsupportedOptions: unsupported.map((option) => `--${option}`),
        allowedOptions: [...allowed].map((option) => `--${option}`),
      },
    },
  )
}



async function main(): Promise<number> {
  const [
    accountCommands,
    cancelCommands,
    marketOperationCommands,
    connectCommands,
    doctorCommands,
    fundCommands,
    historyCommands,
    invokeCommands,
    manifestCommands,
    recoverCommands,
    revokeCommands,
    statusCommands,
    supplyCommands,
  ] = await Promise.all([
    import('./commands/account'),
    import('./commands/cancel'),
    import('./commands/market-operations'),
    import('./commands/connect'),
    import('./commands/doctor'),
    import('./commands/fund'),
    import('./commands/history'),
    import('./commands/invoke'),
    import('./commands/manifest'),
    import('./commands/recover'),
    import('./commands/revoke'),
    import('./commands/status'),
    import('./commands/supply'),
  ])
  const marketOperationRunners: Record<string, CommandRunner> = Object.fromEntries(
    marketOperationCommands.MARKET_OPERATION_COMMAND_DESCRIPTORS.map(({ command, run }) => [command, run] as const),
  )
  const commands: Record<string, CommandRunner> = {
    manifest: manifestCommands.runManifestCommand,
    ...marketOperationRunners,
    connect: connectCommands.runConnectCommand,
    doctor: doctorCommands.runDoctorCommand,
    account: accountCommands.runAccountCommand,
    supply: supplyCommands.runSupplyCommand,
    fund: fundCommands.runFundCommand,
    [invokeCommands.invokeCommandDescriptor.command]: invokeCommands.invokeCommandDescriptor.run,
    [historyCommands.historyCommandDescriptor.command]: historyCommands.historyCommandDescriptor.run,
    status: statusCommands.runStatusCommand,
    cancel: cancelCommands.runCancelCommand,
    recover: recoverCommands.runRecoverCommand,
    revoke: revokeCommands.runRevokeCommand,
  }

  const rawArgv = process.argv.slice(2)
  let parsed: ParsedArgs
  try {
    parsed = parseArgs(rawArgv)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const wantsJson = rawArgv.some((arg) => arg === '--json' || arg.startsWith('--json='))
    if (wantsJson) {
      printJson({
        kind: 'INVALID_ARGUMENT', code: 'invalid-arguments', message, exitCode: 1,
        suggestion: 'Review the command arguments and try again.',
        nextCommand: 'ae help',
      })
    } else {
      process.stderr.write(`${message}\n`)
      process.stderr.write('Review the command arguments and try again.\n')
      process.stderr.write('Next: ae help\n')
    }
    return 1
  }
  const isHelp = parsed.command === 'help' || parsed.options.help
  if (isHelp) {
    const helpPath = resolveHelpPath(parsed.command, parsed.positionals, commands)
    if (helpPath.error !== undefined) {
      if (parsed.options.json) {
        printJson({
          kind: 'INVALID_ARGUMENT',
          code: helpPath.error.code,
          message: helpPath.error.message,
          exitCode: 1,
          suggestion: 'Review the available commands and try again.',
          nextCommand: 'ae help',
        })
      } else {
        process.stderr.write(`${helpPath.error.message}\n`)
        process.stderr.write('Review the available commands and try again.\n')
        process.stderr.write('Next: ae help\n')
      }
      return 1
    }
    if (parsed.options.json) {
      printJson(jsonHelp(parsed.command, parsed.positionals, Object.keys(commands)))
    } else {
      printCommandHelp(parsed.command, parsed.positionals)
    }
    return 0
  }
  if (parsed.command === undefined) {
    if (parsed.options.json) {
      printJson({
        kind: 'INVALID_ARGUMENT', code: 'no-command', message: 'No command provided.', exitCode: 1,
        suggestion: 'Choose one command from the CLI help.',
        nextCommand: 'ae help',
      })
      return 1
    }
    printUsageWithAuthenticatedOperationHelp()
    return 1
  }

  const run = commands[parsed.command]
  if (run === undefined) {
    if (parsed.options.json) {
      printJson({
        kind: 'INVALID_ARGUMENT', code: 'unknown-command', message: 'Unknown command', exitCode: 1,
        suggestion: 'Review the available commands and try again.',
        nextCommand: 'ae help',
      })
      return 1
    }
    process.stderr.write('Unknown command\n')
    process.stderr.write('Review the available commands and try again.\n')
    process.stderr.write('Next: ae help\n')
    return 1
  }

  try {
    validateCommandOptions(parsed)
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
    let suggestion: string | undefined
    let nextCommand: string | undefined
    const mappedFailure = error instanceof CliFailure ? error : sourceErrorToCliFailure(error)
    if (mappedFailure !== undefined) {
      exitCode = mappedFailure.exitCode
      message = mappedFailure.message
      kind = mappedFailure.kind
      code = mappedFailure.code
      detail = mappedFailure.detail
      retryable = mappedFailure.retryable
      retryAfter = mappedFailure.retryAfter
      suggestion = mappedFailure.suggestion
      nextCommand = mappedFailure.nextCommand
      if (kind === 'INVALID_ARGUMENT') {
        suggestion ??= 'Review the command arguments and try again.'
        nextCommand ??= `ae help ${parsed.command}`
      }
    } else if (isConnectionRefused(error)) {
      exitCode = 1
      kind = 'UNAVAILABLE'
      code = 'connection_refused'
      message = `Could not reach ${safeOriginForDiagnostics(parsed.options.baseUrl)}.`
      suggestion = 'Start the AE server, then retry the command.'
      nextCommand = 'npm run dev'
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
        ...(suggestion === undefined ? {} : { suggestion }),
        ...(nextCommand === undefined ? {} : { nextCommand }),
      })
    } else {
      process.stderr.write(`${message}\n`)
      if (suggestion !== undefined) process.stderr.write(`${suggestion}\n`)
      if (nextCommand !== undefined) process.stderr.write(`Next: ${nextCommand}\n`)
    }
    return exitCode
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
