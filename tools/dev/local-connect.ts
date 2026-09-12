/**
 * Local `ae connect` runner.
 *
 * `ae connect`'s owner-approval step goes through the same in-app consent
 * page production uses, and that approve action is wrapped in Clerk's
 * `useReverification`
 * (src/components/ae/agent-access/AeAgentAccessAuthorizeForm.tsx:167-172),
 * which the server enforces as `authObject.has({ reverification: 'strict' })`
 * (src/lib/server/agent-access-oauth-api.ts:569). A session minted headlessly
 * (e.g. via `@clerk/backend`'s `sessions.createSession` + `getToken`) carries
 * no factor-verification age, so it can never satisfy `strict`
 * reverification — every automated approval attempt is refused with a 403
 * `reverification-error`, and there is no server-side workaround short of
 * weakening that gate in production.
 *
 * So approval here is manual: this script only spawns the child `ae connect`
 * process and streams its output straight to this terminal — including the
 * verification URL and user code it prints — for the owner to open and
 * approve in the browser, exactly like an interactive run.
 */
import { spawn } from 'node:child_process'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DEFAULT_BASE_URL = 'http://127.0.0.1:3024'
const LOG_PREFIX = 'local-connect'
const LOOPBACK_IPV4_PATTERN = /^127(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/u

type LocalConnectFlags = {
  baseUrl: string
  provider: boolean
  businessId?: string
}

type ConnectChildStream = {
  on: (event: 'data', listener: (chunk: unknown) => void) => unknown
}

type ConnectChild = {
  stdout?: ConnectChildStream | null
  stderr?: ConnectChildStream | null
  on: (event: 'close' | 'error', listener: (...args: never[]) => void) => unknown
}

type LocalConnectOptions = {
  argv?: readonly string[]
  spawnImpl?: (baseUrl: string, provider: boolean) => ConnectChild
  stdout?: (text: string) => void
  stderr?: (text: string) => void
}

type LocalConnectOutcome = {
  exitCode: number
}

/** True when the URL is an http(s) loopback address safe for this driver to run against. */
export function isLoopback(url: unknown): boolean {
  let parsed: URL
  try {
    parsed = new URL(String(url ?? ''))
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, '')
  if (host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true
  return LOOPBACK_IPV4_PATTERN.test(host)
}

const USAGE = 'Usage: node tools/dev/local-connect.ts [--base-url <url>] [--provider [businessId]]'

/** Parse the CLI flags. Throws with a usage message on anything unknown. */
export function parseFlags(argv: readonly string[] = []): LocalConnectFlags {
  let baseUrl = DEFAULT_BASE_URL
  let provider = false
  let businessId: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index])
    const [name, inlineValue] = arg.startsWith('--') && arg.includes('=')
      ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
      : [arg, undefined]
    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue
      index += 1
      const next = argv[index]
      if (next === undefined) throw new Error(`${name} requires a value.`)
      return String(next)
    }
    if (name === '--base-url') baseUrl = readValue()
    else if (name === '--provider') {
      provider = true
      // The business id is optional and, unlike --base-url, is never
      // required: a bare `--provider` followed by another flag (or nothing)
      // must not swallow that flag as a value.
      if (inlineValue !== undefined) {
        businessId = inlineValue
      } else if (argv[index + 1] !== undefined && !String(argv[index + 1]).startsWith('--')) {
        index += 1
        businessId = String(argv[index])
      }
    } else throw new Error(`Unknown option ${name}. ${USAGE}`)
  }
  return {
    baseUrl,
    provider,
    ...(businessId === undefined ? {} : { businessId }),
  }
}

function repoRoot(): string {
  return resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

/**
 * Argv for the child `ae connect` run. `ae connect` (tools/ae/commands/connect.ts:221-223)
 * refuses any positional argument, so there is nowhere to forward a business
 * id even for the provider profile — only the bare `--provider` flag is
 * passed through (tools/ae/cli.ts:47,65).
 */
export function buildConnectArgs(baseUrl: string, provider = false): string[] {
  return ['run', '--silent', 'ae', '--', 'connect', ...(provider ? ['--provider'] : []), '--base-url', baseUrl, '--json']
}

function defaultSpawn(baseUrl: string, provider: boolean): ConnectChild {
  return spawn('npm', buildConnectArgs(baseUrl, provider), {
    cwd: repoRoot(),
    env: { ...process.env, AE_DISABLE_BROWSER_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  }) as unknown as ConnectChild
}

/**
 * Run `ae connect` and stream its progress straight to this terminal — the
 * verification URL and user code it prints (`--json`'s stderr progress
 * block, tools/ae/commands/connect.ts:299-301) are for the owner to open and
 * approve manually. See the file header for why that step cannot be
 * automated. Once the child exits, print the follow-up command to check the
 * result.
 */
export async function runLocalConnect(options: LocalConnectOptions = {}): Promise<LocalConnectOutcome> {
  const stdout = options.stdout ?? ((text: string) => { process.stdout.write(text) })
  const stderr = options.stderr ?? ((text: string) => { process.stderr.write(text) })
  const spawnImpl = options.spawnImpl ?? defaultSpawn

  let flags: LocalConnectFlags
  try {
    flags = parseFlags(options.argv ?? process.argv.slice(2))
  } catch (error) {
    stderr(`${LOG_PREFIX}: ${error instanceof Error ? error.message : String(error)}\n`)
    return { exitCode: 2 }
  }
  if (!isLoopback(flags.baseUrl)) {
    stderr(`${LOG_PREFIX}: refusing ${flags.baseUrl}. This tool only runs against a loopback deployment.\n`)
    return { exitCode: 2 }
  }

  const child = spawnImpl(flags.baseUrl, flags.provider)
  child.stdout?.on('data', (chunk) => { stdout(String(chunk)) })
  child.stderr?.on('data', (chunk) => { stderr(String(chunk)) })

  const closed = await new Promise<{ code: number | null, error?: Error }>((resolve) => {
    child.on('error', (error: Error) => { resolve({ code: 1, error }) })
    child.on('close', (code: number | null) => { resolve({ code }) })
  })

  if (closed.error !== undefined) {
    stderr(`${LOG_PREFIX}: ae connect could not be started: ${closed.error.message}\n`)
    return { exitCode: 1 }
  }

  const exitCode = closed.code ?? 1
  const nextCommand = flags.baseUrl === DEFAULT_BASE_URL
    ? 'npm run ae -- account status'
    : `npm run ae -- account status --base-url ${flags.baseUrl}`
  stderr(`${LOG_PREFIX}: next: ${nextCommand}\n`)
  return { exitCode }
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const outcome = await runLocalConnect()
  process.exitCode = outcome.exitCode
}
