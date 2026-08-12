import { parseArgs as parseNodeArgs } from 'node:util'
import { trimTrailingSlashes } from '../../../src/modules/common/trim-trailing-slashes'

export type CliOptions = {
  baseUrl: string
  json: boolean
  help: boolean
  allowWrite: boolean
  suburb?: string
  threadId?: string
  operationRef?: string
  candidateDigest?: string
  apply?: boolean
  idempotencyKey?: string
  wait?: boolean
  turnIds?: readonly string[]
  manifest?: string
  project?: string
  dataset?: string
  snapshotName?: string
  updateSnapshot?: boolean
}

export type ParsedArgs = {
  command?: string
  positionals: readonly string[]
  options: CliOptions
}

const DEFAULT_BASE_URL = 'https://agentic-economy-phi.vercel.app'
const CLI_ENTRYPOINT = 'npm run -s ae --'

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed = parseNodeArgs({
    args: argv,
    options: {
      'base-url': { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean' },
      'allow-write': { type: 'boolean' },
      apply: { type: 'boolean' },
      suburb: { type: 'string' },
      'thread-id': { type: 'string' },
      'operation-ref': { type: 'string' },
      'candidate-digest': { type: 'string' },
      'idempotency-key': { type: 'string' },
      wait: { type: 'boolean' },
      'turn-id': { type: 'string', multiple: true },
      manifest: { type: 'string' },
      project: { type: 'string' },
      dataset: { type: 'string' },
      'snapshot-name': { type: 'string' },
      'update-snapshot': { type: 'boolean' },
    },
    allowPositionals: true,
    tokens: true,
  })
  const seenLongOptions = new Set<string>()
  for (const token of parsed.tokens) {
    if (token.kind !== 'option' || !token.rawName.startsWith('--') || token.name === 'turn-id') continue
    if (seenLongOptions.has(token.name)) {
      throw new TypeError(`Option --${token.name} cannot be repeated`)
    }
    seenLongOptions.add(token.name)
  }
  const configuredBaseUrl = process.env.AE_CLI_BASE_URL?.trim() || process.env.AE_CANONICAL_BASE_URL?.trim()
  const baseUrl = parsed.values['base-url'] === undefined
    ? trimTrailingSlashes(configuredBaseUrl || DEFAULT_BASE_URL)
    : trimTrailingSlashes(parsed.values['base-url'])
  try {
    const url = new URL(baseUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new TypeError()
    }
  } catch {
    throw new TypeError('Invalid --base-url: ' + baseUrl)
  }
  const options: CliOptions = {
    baseUrl,
    json: parsed.values.json ?? false,
    help: parsed.values.help ?? false,
    allowWrite: parsed.values['allow-write'] ?? false,
    apply: parsed.values.apply ?? false,
    ...(parsed.values.suburb === undefined ? {} : { suburb: parsed.values.suburb }),
    ...(parsed.values['thread-id'] === undefined ? {} : { threadId: parsed.values['thread-id'] }),
    ...(parsed.values['operation-ref'] === undefined ? {} : { operationRef: parsed.values['operation-ref'] }),
    ...(parsed.values['candidate-digest'] === undefined ? {} : { candidateDigest: parsed.values['candidate-digest'] }),
    wait: parsed.values.wait ?? false,
    ...(parsed.values['idempotency-key'] === undefined ? {} : { idempotencyKey: parsed.values['idempotency-key'] }),
    ...(parsed.values['turn-id'] === undefined ? {} : { turnIds: parsed.values['turn-id'] }),
    ...(parsed.values.manifest === undefined ? {} : { manifest: parsed.values.manifest }),
    ...(parsed.values.project === undefined ? {} : { project: parsed.values.project }),
    ...(parsed.values.dataset === undefined ? {} : { dataset: parsed.values.dataset }),
    ...(parsed.values['snapshot-name'] === undefined ? {} : { snapshotName: parsed.values['snapshot-name'] }),
    ...(parsed.values['update-snapshot'] === undefined ? {} : { updateSnapshot: parsed.values['update-snapshot'] }),
  }
  const [command, ...positionals] = parsed.positionals
  return { ...(command === undefined ? {} : { command }), positionals, options }
}

export function printUsage(): void {
  process.stdout.write(`AE CLI - exercise AE the way an external agent would.

Usage: ${CLI_ENTRYPOINT} <command> [args] [flags]

Canonical Operation commands (need a running server; default ${DEFAULT_BASE_URL}):
  ${CLI_ENTRYPOINT} manifest
  ${CLI_ENTRYPOINT} search "<job>"
  ${CLI_ENTRYPOINT} inspect <operation-ref>
  ${CLI_ENTRYPOINT} compare <ref> <ref> [...]
  ${CLI_ENTRYPOINT} connect
  ${CLI_ENTRYPOINT} invoke <operation-ref> '<json>' --idempotency-key <key> [--wait]
  ${CLI_ENTRYPOINT} status <invocation-ref>
  ${CLI_ENTRYPOINT} recover <invocation-ref> '<evidence-json>' --idempotency-key <key>

Demand commands:
  ${CLI_ENTRYPOINT} demand ask "<question>" [--thread-id <id> --operation-ref <ref> --candidate-digest <digest> '<input-json>']
  ${CLI_ENTRYPOINT} demand business <slug>
  ${CLI_ENTRYPOINT} demand discover
  ${CLI_ENTRYPOINT} demand enrich "<business name>" [--suburb X]
  ${CLI_ENTRYPOINT} demand import <websiteUrl>
  ${CLI_ENTRYPOINT} demand journey "<query>"
  ${CLI_ENTRYPOINT} demand request create "<text>" | request get <ref> | request options <ref> | request confirm <ref> <optionRef>

Advanced/operator commands:
  ${CLI_ENTRYPOINT} advanced action <id> ['<json>'] [--allow-write]
  ${CLI_ENTRYPOINT} advanced actions
  ${CLI_ENTRYPOINT} advanced cancel <invocation-ref> --idempotency-key <key>
  ${CLI_ENTRYPOINT} advanced doctor
  ${CLI_ENTRYPOINT} advanced eval ...
  ${CLI_ENTRYPOINT} advanced policy [test|refine|fidelity]

Flags:
  --base-url <url>   server to call (env: AE_CLI_BASE_URL or AE_CANONICAL_BASE_URL)
  Credentials:
  AE_API_KEY <token>          reusable caller credential for credentialed commands
  AE_API_KEY_ORIGIN <origin>  exact origin bound to AE_API_KEY; required with HTTPS except loopback HTTP development
  --json             machine-readable output
  --allow-write      permit a non read-only action or explicit Braintrust export
  --idempotency-key <key>  stable replay identity for invoke/recovery (required; never generated)
  --wait                   bounded invoke wait; timeout returns durable recovery detail
  --thread-id <id>     ask follow-up thread (requires --operation-ref and --candidate-digest)
  --operation-ref <ref> exact operation to select (requires --thread-id and --candidate-digest)
  --candidate-digest <digest> frozen candidate set digest (requires --thread-id and --operation-ref)
  --turn-id <id>     explicit finalized answer turn id (repeatable; max 25)
  --manifest <path>  explicit JSON manifest with bounded turnIds
  --project <name>   Braintrust project (env: AE_BRAINTRUST_PROJECT)
  --dataset <name>   Braintrust dataset (env: AE_BRAINTRUST_DATASET)
  --snapshot-name <name>
  --update-snapshot  allow replacing an existing snapshot name
  --help
`)
}
