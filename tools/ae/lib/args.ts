import { parseArgs as parseNodeArgs } from 'node:util'

export type CliOptions = {
  baseUrl: string
  json: boolean
  help: boolean
  allowWrite: boolean
  technical?: boolean
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
  limit?: string | number
  cursor?: string
  filters?: string | Record<string, unknown>
}

export type ParsedArgs = {
  command?: string
  positionals: readonly string[]
  options: CliOptions
  providedOptions: readonly string[]
}

const DEFAULT_BASE_URL = 'https://agentic-economy-phi.vercel.app'
export const INVALID_BASE_URL_PLACEHOLDER = '<invalid-origin>'
const CLI_ENTRYPOINT = 'npm run -s ae --'

export function safeOriginForDiagnostics(value: unknown): string {
  if (typeof value !== 'string') return INVALID_BASE_URL_PLACEHOLDER
  try {
    const url = new URL(value.trim())
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:')
      || url.username !== ''
      || url.password !== ''
    ) return INVALID_BASE_URL_PLACEHOLDER
    return url.origin
  } catch {
    return INVALID_BASE_URL_PLACEHOLDER
  }
}

function parseBaseUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Invalid --base-url. Use an origin-only HTTP(S) URL.')
  }
  try {
    const url = new URL(value.trim())
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:')
      || url.username !== ''
      || url.password !== ''
      || (url.pathname !== '' && url.pathname !== '/')
      || url.search !== ''
      || url.hash !== ''
    ) throw new TypeError()
    return url.origin
  } catch {
    throw new TypeError('Invalid --base-url. Use an origin-only HTTP(S) URL.')
  }
}
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed = parseNodeArgs({
    args: argv,
    options: {
      'base-url': { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean' },
      technical: { type: 'boolean' },
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
      limit: { type: 'string' },
      cursor: { type: 'string' },
      filters: { type: 'string' },
    },
    allowPositionals: true,
    tokens: true,
  })
  const seenLongOptions = new Set<string>()
  for (const token of parsed.tokens) {
    if (token.kind !== 'option' || !token.rawName.startsWith('--')) continue
    if (seenLongOptions.has(token.name) && token.name !== 'turn-id') {
      throw new TypeError(`Option --${token.name} cannot be repeated`)
    }
    seenLongOptions.add(token.name)
  }
  const configuredBaseUrl = process.env.AE_CLI_BASE_URL?.trim() || process.env.AE_CANONICAL_BASE_URL?.trim()
  const baseUrl = parseBaseUrl(
    parsed.values['base-url'] === undefined
      ? configuredBaseUrl || DEFAULT_BASE_URL
      : parsed.values['base-url'],
  )
  const options: CliOptions = {
    baseUrl,
    json: parsed.values.json ?? false,
    help: parsed.values.help ?? false,
    allowWrite: parsed.values['allow-write'] ?? false,
    technical: parsed.values.technical ?? false,
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
    ...(parsed.values.limit === undefined ? {} : { limit: parsed.values.limit }),
    ...(parsed.values.cursor === undefined ? {} : { cursor: parsed.values.cursor }),
    ...(parsed.values.filters === undefined ? {} : { filters: parsed.values.filters }),
  }
  const [command, ...positionals] = parsed.positionals
  return {
    ...(command === undefined ? {} : { command }),
    positionals,
    options,
    providedOptions: [...seenLongOptions],
  }
}

export function printUsage(): void {
  process.stdout.write(`AE CLI - exercise AE the way an external agent would.

Usage: ${CLI_ENTRYPOINT} <command> [args] [flags]

Canonical Operation commands (need a running server; default ${DEFAULT_BASE_URL}):
  ${CLI_ENTRYPOINT} manifest
  ${CLI_ENTRYPOINT} search "<job>" [--limit <1-20>] [--cursor <cursor>] [--filters '<json>']
  ${CLI_ENTRYPOINT} inspect <operation-ref>
  ${CLI_ENTRYPOINT} compare <operation-ref> [operation-ref ...]
  ${CLI_ENTRYPOINT} inspect-plan <operation-ref> [operation-ref ...]
  ${CLI_ENTRYPOINT} connect
  ${CLI_ENTRYPOINT} invoke <operation-ref> '<json>' --idempotency-key <key> [--wait]
  ${CLI_ENTRYPOINT} status <invocation-ref>
  ${CLI_ENTRYPOINT} recover <invocation-ref> '<evidence-json>' --idempotency-key <key>

Demand commands:
  ${CLI_ENTRYPOINT} demand ask "<question>" [--thread-id <id>]
  ${CLI_ENTRYPOINT} demand ask --thread-id <id> --operation-ref <ref> --candidate-digest <digest> '<input-json>'
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
  --limit <1-20>     search page size (search only)
  --cursor <cursor>  opaque search continuation cursor (search only)
  --filters '<json>' canonical search filters (search only)
  --technical        human compare output with operation identity and evidence metadata
  --allow-write      permit a non read-only action or explicit Braintrust export
  --idempotency-key <key>  stable replay identity for invoke/recovery (required; never generated)
  --wait                   bounded invoke wait; timeout returns durable recovery detail
  --thread-id <id>     conversational ask thread; plain queries load continuation state server-side
  --operation-ref <ref> exact operation to select in automation mode (requires --thread-id and --candidate-digest)
  --candidate-digest <digest> frozen candidate set digest in automation mode (requires --thread-id and --operation-ref)
  --turn-id <id>     explicit finalized answer turn id (repeatable; max 25)
  --manifest <path>  explicit JSON manifest with bounded turnIds
  --project <name>   Braintrust project (env: AE_BRAINTRUST_PROJECT)
  --dataset <name>   Braintrust dataset (env: AE_BRAINTRUST_DATASET)
  --snapshot-name <name>
  --update-snapshot  allow replacing an existing snapshot name
  --help
`)
}
