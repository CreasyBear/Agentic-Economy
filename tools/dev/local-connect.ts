/**
 * Local-only `ae connect` driver.
 *
 * Runs `ae connect --json` against a loopback deployment, reads the device
 * user code off the child's progress output, and approves the consent grant
 * as the seeded owner so a developer gets a spending-policy agent key
 * without a browser round trip. There is no auth bypass: the app always
 * mounts the real `ClerkProvider`, so this driver signs in as the owner
 * itself before it ever touches the consent page.
 *
 * It has no browser (unlike `tests/e2e/authenticated/*.spec.ts`, which drive
 * a Playwright `page` through `@clerk/testing`'s `clerk.signIn`), so it uses
 * `@clerk/backend`'s server-to-server session flow instead:
 * `users.getUserList` to resolve `AE_E2E_OWNER_EMAIL` to a Clerk user,
 * `sessions.createSession` to open a session for it, and `sessions.getToken`
 * to mint a session JWT — the same Backend API surface `@clerk/testing`
 * itself uses under the hood, without needing a page to click through.
 * That JWT rides as a bearer token on every consent-page request, which
 * `@clerk/backend`'s `authenticateRequest` accepts the same way it accepts a
 * native/mobile client's session token.
 *
 * The issued agent key is never read, printed, or persisted here — `ae
 * connect` stores it exactly as it would in an interactive run.
 */
import { createClerkClient } from '@clerk/backend'
import { spawn } from 'node:child_process'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { effectiveEnv, missingClerkEnvNames } from './local-dev.ts'

const DEFAULT_BASE_URL = 'http://127.0.0.1:3024'
const CONSENT_PATH = '/oauth/authorize'
// src/modules/agent-access/contract.ts:16 — AGENT_ACCESS_AUTHORITY_MODE_VALUES.
const AUTHORITY_MODES = ['read_only', 'approval_required', 'spending_policy', 'unrestricted_test_only'] as const
type AuthorityMode = typeof AUTHORITY_MODES[number]
// The buyer flow (`ae connect`) requests `customer_requests:spending_policy`
// (tools/ae/commands/connect.ts:229-231, buyer branch), and approveGrant
// refuses a mode that differs from the requested one
// (src/modules/agent-access/oauth-state.ts:452-454). The provider flow
// (`ae connect --provider`) requests only `market_supply:manage`
// (tools/ae/commands/connect.ts:229-231, provider branch), which
// normalizeRequestedScopes special-cases to the same `spending_policy` mode
// (src/modules/agent-access/oauth-state.ts:260-261) — so this default already
// covers both profiles. Still, the consent page's own `data-authority-mode`
// attribute is preferred over this default whenever it is present, since it
// reflects what the pending grant actually requested.
const DEFAULT_AUTHORITY_MODE: AuthorityMode = 'spending_policy'
// src/lib/server/agent-access-oauth-api.ts:1345 — parseApprovedToolSelection.
const TOOL_ACCESS_VALUES = ['all_admitted', 'selected_tools'] as const
type ToolAccess = typeof TOOL_ACCESS_VALUES[number]
const LOG_PREFIX = 'local-connect'
const USER_CODE_PATTERN = /^User code:[ \t]*(\S+)[ \t]*\r?\n/mu
const VERIFICATION_URI_PATTERN = /^Approve:[ \t]*(\S+)[ \t]*\r?\n/mu
const CONSENT_MARKER_PATTERN = /<main[^>]*\sdata-ae-consent[\s>]/u
const FORM_ACTION_PATTERN = /<form\b[^>]*\baction="([^"]*)"/u
const LOOPBACK_IPV4_PATTERN = /^127(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/u
const HTML_ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }
const REDACTED_KEYS = new Set(['access_token', 'accessToken', 'secret', 'apiKey', 'api_key'])
// A redirect chain that never lands within this many hops is treated as
// broken rather than followed forever.
const MAX_CONSENT_REDIRECTS = 5

type LocatedUserCode = {
  userCode: string
  verificationUri?: string
}

type ConsentAttributes = {
  grantRef: string
  grantRevision: number
  toolAccess: ToolAccess
  requestedAuthorityMode?: AuthorityMode
}

type ApprovalBodyInput = {
  grantRef: string
  grantRevision: number
  toolAccess?: ToolAccess
  authorityMode?: AuthorityMode
  toolRefs?: readonly string[]
  state?: string
}

type ApprovalResult =
  | { kind: 'approved', grantRef: string, requestedAuthorityMode?: AuthorityMode }
  | {
    kind: 'failed'
    stage: 'consent_page' | 'approval'
    status: number
    body: string
    requestedAuthorityMode?: AuthorityMode
  }
  | {
    kind: 'failed'
    stage: 'owner_session_not_accepted'
    status: number
    body: string
    message: string
    requestedAuthorityMode?: AuthorityMode
  }

type FetchLike = (
  url: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    redirect?: string
  },
) => Promise<{
  status: number
  text: () => Promise<string>
  headers?: { get: (name: string) => string | null }
}>

type ConnectChildStream = {
  on: (event: 'data', listener: (chunk: unknown) => void) => unknown
}

type ConnectChild = {
  stdout?: ConnectChildStream | null
  stderr?: ConnectChildStream | null
  on: (event: 'close' | 'error', listener: (...args: never[]) => void) => unknown
  kill?: (signal?: NodeJS.Signals) => unknown
}

type LocalConnectFlags = {
  baseUrl: string
  authorityMode?: AuthorityMode
  json: boolean
  provider: boolean
  businessId?: string
}

type LocalConnectOptions = {
  argv?: readonly string[]
  spawnImpl?: (baseUrl: string, provider: boolean) => ConnectChild
  fetchImpl?: FetchLike
  stdout?: (text: string) => void
  stderr?: (text: string) => void
  env?: Record<string, string | undefined>
  ownerSessionToken?: string
  mintOwnerSessionToken?: (input: { env: Record<string, string | undefined> }) => Promise<string>
}

type LocalConnectOutcome = {
  exitCode: number
  result?: unknown
  approval?: ApprovalResult
}

/** True when the URL is an http(s) loopback address safe for this driver to sign in against. */
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

/**
 * Read the device user code (and verification URI when present) out of the
 * progress block `ae connect --json` writes to stderr.
 * Returns undefined until a complete `User code:` line has arrived.
 */
export function parseUserCode(text: unknown): LocatedUserCode | undefined {
  const source = String(text ?? '')
  const userCode = USER_CODE_PATTERN.exec(source)?.[1]
  if (userCode === undefined || userCode.length === 0) return undefined
  const verificationUri = VERIFICATION_URI_PATTERN.exec(source)?.[1]
  return {
    userCode,
    ...(verificationUri === undefined || verificationUri.length === 0 ? {} : { verificationUri }),
  }
}

function unescapeHtml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/gu, (entity) => HTML_ENTITIES[entity] ?? entity)
}

function attribute(html: string, name: string): string | undefined {
  const match = new RegExp(`data-${name}="([^"]*)"`, 'u').exec(html)
  return match === null ? undefined : unescapeHtml(match[1] as string)
}

/**
 * Pull the fields the approval POST needs out of the consent page rendered by
 * `consentHtml` (src/lib/server/agent-access-oauth/protocol.ts:276).
 */
export function parseConsentAttributes(html: unknown): ConsentAttributes | undefined {
  const source = String(html ?? '')
  if (!CONSENT_MARKER_PATTERN.test(source)) return undefined
  const grantRef = attribute(source, 'grant-ref')
  const toolAccess = attribute(source, 'tool-access')
  const grantRevision = Number(attribute(source, 'grant-revision'))
  const requestedAuthorityMode = attribute(source, 'authority-mode')
  if (grantRef === undefined || grantRef.trim().length === 0) return undefined
  if (!Number.isSafeInteger(grantRevision) || grantRevision <= 0) return undefined
  if (toolAccess === undefined || !TOOL_ACCESS_VALUES.includes(toolAccess as ToolAccess)) return undefined
  return {
    grantRef,
    grantRevision,
    toolAccess: toolAccess as ToolAccess,
    ...(requestedAuthorityMode === undefined || !AUTHORITY_MODES.includes(requestedAuthorityMode as AuthorityMode)
      ? {}
      : { requestedAuthorityMode: requestedAuthorityMode as AuthorityMode }),
  }
}

/**
 * True when an off-origin redirect (or its response) is the Clerk hosted
 * sign-in handshake rather than some other cross-origin hop: either the
 * redirect target's host names Clerk, or the response already carries
 * Clerk's own auth-status header.
 */
function isClerkRedirect(next: URL, response: { headers?: { get: (name: string) => string | null } }): boolean {
  if (next.hostname.toLowerCase().includes('clerk.')) return true
  const status = response.headers?.get?.('x-clerk-auth-status')
  return status !== null && status !== undefined
}

/**
 * GET the consent page, sending the minted owner session as a bearer token
 * (`@clerk/backend`'s `authenticateRequest` accepts this the same way it
 * accepts a native/mobile client's session token) and following same-origin
 * redirects (a canonical-path hop, for example) up to
 * `MAX_CONSENT_REDIRECTS` times. A redirect that leaves the base origin is
 * never followed — it is returned as-is for `approveLocalConsent` to report
 * as a failure. When that off-origin hop is identifiable as Clerk's hosted
 * sign-in, `clerkRedirect: true` is set so the caller can explain that the
 * minted session was not accepted instead of printing a bare HTTP status.
 */
async function fetchConsentPage(fetchImpl: FetchLike, baseUrl: string, userCode: string, ownerSessionToken?: string) {
  const origin = new URL(baseUrl).origin
  const initial = new URL(CONSENT_PATH, baseUrl)
  initial.searchParams.set('user_code', userCode)
  let target = initial
  for (let hop = 0; hop <= MAX_CONSENT_REDIRECTS; hop += 1) {
    const response = await fetchImpl(target.toString(), {
      method: 'GET',
      headers: {
        Accept: 'text/html',
        ...(ownerSessionToken === undefined ? {} : { Authorization: `Bearer ${ownerSessionToken}` }),
      },
      redirect: 'manual',
    })
    if (response.status < 300 || response.status >= 400) return { response, url: target.toString() }
    const location = response.headers?.get?.('location')
    if (location === null || location === undefined || location.length === 0) return { response, url: target.toString() }
    let next: URL
    try {
      next = new URL(location, target)
    } catch {
      return { response, url: target.toString() }
    }
    if (next.origin !== origin || hop === MAX_CONSENT_REDIRECTS) {
      const clerkRedirect = next.origin !== origin && isClerkRedirect(next, response)
      return { response, url: target.toString(), ...(clerkRedirect ? { clerkRedirect: true } : {}) }
    }
    target = next
  }
  throw new Error('unreachable')
}

/** Resolve the `action` of the landed page's consent form against its URL. */
function formActionUrl(html: string, pageUrl: string): string {
  const action = FORM_ACTION_PATTERN.exec(html)?.[1]
  return new URL(action === undefined ? CONSENT_PATH : unescapeHtml(action), pageUrl).toString()
}

/**
 * Build the form body for a `connection_target=new_agent` approval. Mirrors
 * src/components/ae/agent-access/AeAgentAccessAuthorizeForm.tsx:266-281, where
 * the expected target revision is the grant revision for a new agent.
 */
export function buildApprovalBody(input: ApprovalBodyInput): string {
  const {
    grantRef,
    grantRevision,
    toolAccess = 'all_admitted',
    authorityMode = DEFAULT_AUTHORITY_MODE,
    toolRefs = [],
    state,
  } = input ?? {}
  if (typeof grantRef !== 'string' || grantRef.trim().length === 0) {
    throw new Error('grant_ref is required to approve a consent grant.')
  }
  if (!Number.isSafeInteger(grantRevision) || grantRevision <= 0) {
    throw new Error('expected_grant_revision must be a positive integer.')
  }
  if (!AUTHORITY_MODES.includes(authorityMode)) {
    throw new Error(`authority_mode must be one of ${AUTHORITY_MODES.join(', ')}.`)
  }
  if (!TOOL_ACCESS_VALUES.includes(toolAccess)) {
    throw new Error(`approved_tool_access must be one of ${TOOL_ACCESS_VALUES.join(', ')}.`)
  }
  if (toolAccess === 'selected_tools' && toolRefs.length === 0) {
    throw new Error('approved_tool_access=selected_tools requires at least one approved_tool_ref.')
  }
  const params = new URLSearchParams({
    grant_ref: grantRef,
    expected_grant_revision: String(grantRevision),
    expected_target_revision: String(grantRevision),
    decision: 'approve',
    authority_mode: authorityMode,
    approved_tool_access: toolAccess,
    connection_target: 'new_agent',
    ...(state === undefined ? {} : { state }),
  })
  for (const toolRef of toolRefs) params.append('approved_tool_ref', toolRef)
  return params.toString()
}

/** Return the connect result when it reports `kind: 'connected'`, else throw. */
export function assertConnected(json: unknown): Record<string, unknown> {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('ae connect did not emit a JSON object on stdout.')
  }
  const record = json as Record<string, unknown>
  if (record.kind === 'connected') return record
  const kind = typeof record.kind === 'string' ? record.kind : 'unknown'
  throw new Error(`ae connect finished with kind "${kind}" instead of "connected".`)
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Parse the single JSON value `ae ... --json` writes to stdout. */
export function parseFinalJson(text: unknown): unknown {
  const source = String(text ?? '').trim()
  if (source.length === 0) return undefined
  const direct = safeJson(source)
  if (direct !== undefined) return direct
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  return start === -1 || end <= start ? undefined : safeJson(source.slice(start, end + 1))
}

function redactSecrets(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([key]) => !REDACTED_KEYS.has(key)),
  )
}

/**
 * Approve the pending device grant as the signed-in owner. `authorityMode`
 * is an explicit override; when omitted, the consent page's own
 * `data-authority-mode` attribute (what the pending grant actually requested)
 * is used, falling back to `DEFAULT_AUTHORITY_MODE` only if the page carries
 * no recognised mode.
 */
export async function approveLocalConsent(input: {
  baseUrl: string
  userCode: string
  authorityMode?: AuthorityMode | undefined
  fetchImpl?: FetchLike | undefined
  ownerSessionToken?: string | undefined
}): Promise<ApprovalResult> {
  const { baseUrl, userCode, authorityMode, fetchImpl = fetch as unknown as FetchLike, ownerSessionToken } = input
  const origin = new URL(baseUrl).origin
  const { response: page, url: landedUrl, clerkRedirect } = await fetchConsentPage(fetchImpl, baseUrl, userCode, ownerSessionToken)
  const html = await page.text()
  const attributes = page.status === 200 ? parseConsentAttributes(html) : undefined
  if (attributes === undefined) {
    if (clerkRedirect === true) {
      return {
        kind: 'failed',
        stage: 'owner_session_not_accepted',
        status: page.status,
        body: html,
        message: 'the minted owner session was not accepted; check that CLERK_SECRET_KEY and AE_E2E_OWNER_EMAIL name a real user on this Clerk development instance',
      }
    }
    return {
      kind: 'failed',
      stage: 'consent_page',
      status: page.status,
      body: html,
    }
  }
  const chosenAuthorityMode = authorityMode ?? attributes.requestedAuthorityMode ?? DEFAULT_AUTHORITY_MODE
  const body = buildApprovalBody({ ...attributes, authorityMode: chosenAuthorityMode })
  const response = await fetchImpl(formActionUrl(html, landedUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: origin,
      ...(ownerSessionToken === undefined ? {} : { Authorization: `Bearer ${ownerSessionToken}` }),
    },
    body,
  })
  const text = await response.text()
  const requested = attributes.requestedAuthorityMode
  const result = safeJson(text) as { kind?: string } | undefined
  if (response.status === 200 && result !== null && typeof result === 'object' && result?.kind === 'approved') {
    return {
      kind: 'approved',
      grantRef: attributes.grantRef,
      ...(requested === undefined ? {} : { requestedAuthorityMode: requested }),
    }
  }
  return {
    kind: 'failed',
    stage: 'approval',
    status: response.status,
    body: text,
    ...(requested === undefined ? {} : { requestedAuthorityMode: requested }),
  }
}

const USAGE = 'Usage: node tools/dev/local-connect.ts [--base-url <url>] [--provider [businessId]] [--authority-mode <mode>] [--json]'

/** Parse the CLI flags. Throws with a usage message on anything unknown. */
export function parseFlags(argv: readonly string[] = []): LocalConnectFlags {
  let baseUrl = DEFAULT_BASE_URL
  let authorityMode: AuthorityMode | undefined
  let json = false
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
    else if (name === '--authority-mode') authorityMode = readValue() as AuthorityMode
    else if (name === '--json') json = true
    else if (name === '--provider') {
      provider = true
      // The business id is optional and, unlike --base-url/--authority-mode,
      // is never required: a bare `--provider` followed by another flag (or
      // nothing) must not swallow that flag as a value.
      if (inlineValue !== undefined) {
        businessId = inlineValue
      } else if (argv[index + 1] !== undefined && !String(argv[index + 1]).startsWith('--')) {
        index += 1
        businessId = String(argv[index])
      }
    } else throw new Error(`Unknown option ${name}. ${USAGE}`)
  }
  if (authorityMode !== undefined && !AUTHORITY_MODES.includes(authorityMode)) {
    throw new Error(`--authority-mode must be one of ${AUTHORITY_MODES.join(', ')}.`)
  }
  return {
    baseUrl,
    json,
    provider,
    ...(businessId === undefined ? {} : { businessId }),
    ...(authorityMode === undefined ? {} : { authorityMode }),
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
 * Mint a session JWT for `AE_E2E_OWNER_EMAIL` on the Clerk development
 * instance named by `CLERK_SECRET_KEY` — the same credentials
 * `tests/e2e/authenticated/environment.ts` requires. `createSession` +
 * `getToken` is the Backend API's direct route to a usable session (no
 * Frontend API ticket exchange, no browser), which is why this — rather than
 * `@clerk/testing`'s Playwright `clerk.signIn` — is what a headless CLI
 * driver uses.
 */
type OwnerSessionClerkClient = {
  users: {
    getUserList: (input: { emailAddress: readonly string[] }) => Promise<{ data: readonly { id: string }[] }>
  }
  sessions: {
    createSession: (input: { userId: string }) => Promise<{ id: string }>
    getToken: (sessionId: string) => Promise<{ jwt: string }>
  }
}

export async function mintOwnerSessionToken({ env, clerkClientFactory = createClerkClient }: {
  env: Record<string, string | undefined>
  clerkClientFactory?: (options: { secretKey: string }) => unknown
}): Promise<string> {
  const secretKey = env.CLERK_SECRET_KEY
  const ownerEmail = env.AE_E2E_OWNER_EMAIL
  const clerkClient = clerkClientFactory({ secretKey: secretKey as string }) as OwnerSessionClerkClient
  const users = await clerkClient.users.getUserList({ emailAddress: ownerEmail === undefined ? [] : [ownerEmail] })
  const user = users.data?.[0]
  if (user === undefined) {
    throw new Error(`no Clerk user found for AE_E2E_OWNER_EMAIL ${ownerEmail} on this Clerk development instance`)
  }
  const session = await clerkClient.sessions.createSession({ userId: user.id })
  const token = await clerkClient.sessions.getToken(session.id)
  return token.jwt
}

/**
 * Drive one local connect: spawn `ae connect --json`, approve the grant it
 * prints, forward the child's final JSON, and report the exit code.
 */
export async function runLocalConnect(options: LocalConnectOptions = {}): Promise<LocalConnectOutcome> {
  const stdout = options.stdout ?? ((text: string) => { process.stdout.write(text) })
  const stderr = options.stderr ?? ((text: string) => { process.stderr.write(text) })
  const spawnImpl = options.spawnImpl ?? defaultSpawn
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike)

  let flags: LocalConnectFlags
  try {
    flags = parseFlags(options.argv ?? process.argv.slice(2))
  } catch (error) {
    stderr(`${LOG_PREFIX}: ${error instanceof Error ? error.message : String(error)}\n`)
    return { exitCode: 2 }
  }
  if (!isLoopback(flags.baseUrl)) {
    stderr(`${LOG_PREFIX}: refusing ${flags.baseUrl}. This tool signs in and approves consent as the seeded owner, and only runs against a loopback deployment.\n`)
    return { exitCode: 2 }
  }

  let ownerSessionToken = options.ownerSessionToken
  if (ownerSessionToken === undefined) {
    const env = options.env ?? effectiveEnv().env
    const missing = missingClerkEnvNames(env)
    if (missing.length > 0) {
      stderr(`${LOG_PREFIX}: missing required Clerk env: ${missing.join(', ')}\n`)
      return { exitCode: 2 }
    }
    try {
      ownerSessionToken = await (options.mintOwnerSessionToken ?? mintOwnerSessionToken)({ env })
    } catch (error) {
      stderr(`${LOG_PREFIX}: could not mint the owner session: ${error instanceof Error ? error.message : String(error)}\n`)
      return { exitCode: 1 }
    }
  }

  const child = spawnImpl(flags.baseUrl, flags.provider)
  let stdoutText = ''
  let stderrText = ''
  let approval: ApprovalResult | undefined
  let approving = false
  const pending: Promise<unknown>[] = []

  const tryApprove = () => {
    if (approving) return
    const located = parseUserCode(stderrText) ?? parseUserCode(stdoutText)
    if (located === undefined) return
    approving = true
    if (!flags.json) {
      const modeNote = flags.authorityMode === undefined ? '' : ` as ${flags.authorityMode}`
      stderr(`${LOG_PREFIX}: approving user code ${located.userCode}${modeNote}.\n`)
    }
    pending.push((async () => {
      try {
        approval = await approveLocalConsent({
          baseUrl: flags.baseUrl,
          userCode: located.userCode,
          authorityMode: flags.authorityMode,
          fetchImpl,
          ownerSessionToken,
        })
      } catch (error) {
        approval = { kind: 'failed', stage: 'approval', status: 0, body: String(error instanceof Error ? error.message : error) }
      }
      if (approval.kind !== 'approved') child.kill?.('SIGTERM')
    })())
  }

  child.stdout?.on('data', (chunk) => {
    stdoutText += String(chunk)
    tryApprove()
  })
  child.stderr?.on('data', (chunk) => {
    const text = String(chunk)
    stderrText += text
    if (!flags.json) stderr(text)
    tryApprove()
  })

  const closed = await new Promise<{ code: number | null, signal?: NodeJS.Signals | null, error?: Error }>((resolve) => {
    child.on('error', (error: Error) => { resolve({ code: 1, error }) })
    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => { resolve({ code, signal }) })
  })
  await Promise.all(pending)

  if (closed.error !== undefined) {
    stderr(`${LOG_PREFIX}: ae connect could not be started: ${closed.error.message}\n`)
    return { exitCode: 1, ...(approval === undefined ? {} : { approval }) }
  }

  const result = parseFinalJson(stdoutText)
  if (result !== undefined) stdout(`${JSON.stringify(redactSecrets(result), undefined, 2)}\n`)

  let connected = false
  try {
    assertConnected(result)
    connected = true
  } catch (error) {
    stderr(`${LOG_PREFIX}: ${error instanceof Error ? error.message : String(error)}\n`)
  }
  if (approval !== undefined && approval.kind === 'failed') {
    if ('message' in approval && approval.message !== undefined) {
      stderr(`${LOG_PREFIX}: ${approval.message}\n`)
    } else {
      stderr(`${LOG_PREFIX}: approval failed at ${approval.stage} (HTTP ${approval.status}).\n${approval.body}\n`)
      // Only worth suggesting a rerun when the user's own explicit
      // --authority-mode conflicted with what the grant requested; when no
      // explicit mode was given, the consent page's mode was already tried.
      if (flags.authorityMode !== undefined
        && approval.requestedAuthorityMode !== undefined
        && approval.requestedAuthorityMode !== flags.authorityMode) {
        stderr(`${LOG_PREFIX}: the grant requested authority mode "${approval.requestedAuthorityMode}"; rerun with --authority-mode ${approval.requestedAuthorityMode}.\n`)
      }
    }
  }
  if (approval === undefined && !connected) {
    stderr(`${LOG_PREFIX}: no user code appeared before ae connect exited, so nothing was approved.\n`)
  }
  return {
    exitCode: connected ? 0 : 1,
    ...(result === undefined ? {} : { result }),
    ...(approval === undefined ? {} : { approval }),
  }
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const outcome = await runLocalConnect()
  process.exitCode = outcome.exitCode
}
