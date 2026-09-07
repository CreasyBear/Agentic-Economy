import { isIP } from 'node:net'
import { parseArgs as parseNodeArgs } from 'node:util'

export type CliOptions = {
  baseUrl: string
  baseUrlSource?: CliBaseUrlSource
  json: boolean
  help: boolean
  version?: boolean
  allowWrite: boolean
  technical?: boolean
  threadId?: string
  toolRef?: string
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
  state?: string
  filters?: string | Record<string, unknown>
  input?: string
  provider?: boolean
}

export type CliBaseUrlSource =
  | 'flag'
  | 'AE_CLI_BASE_URL'
  | 'AE_CANONICAL_BASE_URL'
  | 'CONVEX_URL_loopback'
  | 'VITE_CONVEX_URL_loopback'
  | 'hosted_default'

export type ParsedArgs = {
  command?: string
  positionals: readonly string[]
  options: CliOptions
  providedOptions: readonly string[]
}

export const HOSTED_DEFAULT_BASE_URL = 'https://agentic-economy-phi.vercel.app'
const LOCAL_DEV_BASE_URL = 'http://127.0.0.1:3024'
export const INVALID_BASE_URL_PLACEHOLDER = '<invalid-origin>'

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

export function isLoopbackCliBaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase().replace(/^\[(.*)\]$/u, '$1')
    return hostname === 'localhost'
      || hostname === '::1'
      || (isIP(hostname) === 4 && hostname.startsWith('127.'))
  } catch {
    return false
  }
}

function defaultCliBaseUrl(): Readonly<{ value: string; source: CliBaseUrlSource }> {
  const serverConvexUrl = process.env.CONVEX_URL?.trim()
  const publicConvexUrl = process.env.VITE_CONVEX_URL?.trim()
  const convexUrl = serverConvexUrl || publicConvexUrl
  if (convexUrl !== undefined && convexUrl.length > 0 && isLoopbackCliBaseUrl(convexUrl)) {
    return {
      value: LOCAL_DEV_BASE_URL,
      source: serverConvexUrl === convexUrl ? 'CONVEX_URL_loopback' : 'VITE_CONVEX_URL_loopback',
    }
  }
  return { value: HOSTED_DEFAULT_BASE_URL, source: 'hosted_default' }
}

function selectedCliBaseUrl(explicit: string | undefined): Readonly<{
  value: string
  source: CliBaseUrlSource
}> {
  if (explicit !== undefined) return { value: explicit, source: 'flag' }
  const cliBaseUrl = process.env.AE_CLI_BASE_URL?.trim()
  if (cliBaseUrl !== undefined && cliBaseUrl.length > 0) {
    return { value: cliBaseUrl, source: 'AE_CLI_BASE_URL' }
  }
  const canonicalBaseUrl = process.env.AE_CANONICAL_BASE_URL?.trim()
  if (canonicalBaseUrl !== undefined && canonicalBaseUrl.length > 0) {
    return { value: canonicalBaseUrl, source: 'AE_CANONICAL_BASE_URL' }
  }
  return defaultCliBaseUrl()
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
      version: { type: 'boolean' },
      technical: { type: 'boolean' },
      'allow-write': { type: 'boolean' },
      apply: { type: 'boolean' },
      'thread-id': { type: 'string' },
      'tool-ref': { type: 'string' },
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
      state: { type: 'string' },
      filters: { type: 'string' },
      input: { type: 'string' },
      provider: { type: 'boolean' },
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
  const selectedBaseUrl = selectedCliBaseUrl(parsed.values['base-url'])
  const baseUrl = parseBaseUrl(selectedBaseUrl.value)
  const options: CliOptions = {
    baseUrl,
    baseUrlSource: selectedBaseUrl.source,
    json: parsed.values.json ?? false,
    help: parsed.values.help ?? false,
    version: parsed.values.version ?? false,
    allowWrite: parsed.values['allow-write'] ?? false,
    technical: parsed.values.technical ?? false,
    apply: parsed.values.apply ?? false,
    ...(parsed.values['thread-id'] === undefined ? {} : { threadId: parsed.values['thread-id'] }),
    ...(parsed.values['tool-ref'] === undefined ? {} : { toolRef: parsed.values['tool-ref'] }),
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
    ...(parsed.values.state === undefined ? {} : { state: parsed.values.state }),
    ...(parsed.values.filters === undefined ? {} : { filters: parsed.values.filters }),
    ...(parsed.values.input === undefined ? {} : { input: parsed.values.input }),
    provider: parsed.values.provider ?? false,
  }
  const [command, ...positionals] = parsed.positionals
  return {
    ...(command === undefined ? {} : { command }),
    positionals,
    options,
    providedOptions: [...seenLongOptions],
  }
}
