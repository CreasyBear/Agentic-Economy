/**
 * Local-only `ae connect` driver.
 *
 * Runs `ae connect --json` against a loopback deployment, reads the device
 * user code off the child's progress output, and approves the consent grant
 * through the local auth bypass (`VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`)
 * so a developer gets a spending-policy agent key without a browser round
 * trip. Refuses any non-loopback base URL: the approval it performs is only
 * unauthenticated because the local bypass is on.
 *
 * The issued key is never read, printed, or persisted here — `ae connect`
 * stores it exactly as it would in an interactive run.
 */
import { spawn } from 'node:child_process'
import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DEFAULT_BASE_URL = 'http://127.0.0.1:3024'
const CONSENT_PATH = '/oauth/authorize'
// src/modules/agent-access/contract.ts:16 — AGENT_ACCESS_AUTHORITY_MODE_VALUES.
const AUTHORITY_MODES = ['read_only', 'approval_required', 'spending_policy', 'unrestricted_test_only']
// `ae connect` requests `customer_requests:spending_policy`, and approveGrant
// refuses a mode that differs from the requested one.
const DEFAULT_AUTHORITY_MODE = 'spending_policy'
// src/lib/server/agent-access-oauth-api.ts:1345 — parseApprovedToolSelection.
const TOOL_ACCESS_VALUES = ['all_admitted', 'selected_tools']
const LOG_PREFIX = 'local-connect'
const USER_CODE_PATTERN = /^User code:[ \t]*(\S+)[ \t]*\r?\n/mu
const VERIFICATION_URI_PATTERN = /^Approve:[ \t]*(\S+)[ \t]*\r?\n/mu
const CONSENT_MARKER_PATTERN = /<main[^>]*\sdata-ae-consent[\s>]/u
const LOOPBACK_IPV4_PATTERN = /^127(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/u
const HTML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }
const REDACTED_KEYS = new Set(['access_token', 'accessToken', 'secret', 'apiKey', 'api_key'])

/** True when the URL is an http(s) loopback address safe for the local bypass. */
export function isLoopback(url) {
  let parsed
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
export function parseUserCode(text) {
  const source = String(text ?? '')
  const userCode = USER_CODE_PATTERN.exec(source)?.[1]
  if (userCode === undefined || userCode.length === 0) return undefined
  const verificationUri = VERIFICATION_URI_PATTERN.exec(source)?.[1]
  return {
    userCode,
    ...(verificationUri === undefined || verificationUri.length === 0 ? {} : { verificationUri }),
  }
}

function unescapeHtml(value) {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/gu, (entity) => HTML_ENTITIES[entity] ?? entity)
}

function attribute(html, name) {
  const match = new RegExp(`data-${name}="([^"]*)"`, 'u').exec(html)
  return match === null ? undefined : unescapeHtml(match[1])
}

/**
 * Pull the fields the approval POST needs out of the consent page rendered by
 * `consentHtml` (src/lib/server/agent-access-oauth/protocol.ts:276).
 */
export function parseConsentAttributes(html) {
  const source = String(html ?? '')
  if (!CONSENT_MARKER_PATTERN.test(source)) return undefined
  const grantRef = attribute(source, 'grant-ref')
  const toolAccess = attribute(source, 'tool-access')
  const grantRevision = Number(attribute(source, 'grant-revision'))
  const requestedAuthorityMode = attribute(source, 'authority-mode')
  if (grantRef === undefined || grantRef.trim().length === 0) return undefined
  if (!Number.isSafeInteger(grantRevision) || grantRevision <= 0) return undefined
  if (toolAccess === undefined || !TOOL_ACCESS_VALUES.includes(toolAccess)) return undefined
  return {
    grantRef,
    grantRevision,
    toolAccess,
    ...(requestedAuthorityMode === undefined || !AUTHORITY_MODES.includes(requestedAuthorityMode)
      ? {}
      : { requestedAuthorityMode }),
  }
}

/**
 * Build the form body for a `connection_target=new_agent` approval. Mirrors
 * src/components/ae/agent-access/AeAgentAccessAuthorizeForm.tsx:266-281, where
 * the expected target revision is the grant revision for a new agent.
 */
export function buildApprovalBody(input) {
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
export function assertConnected(json) {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('ae connect did not emit a JSON object on stdout.')
  }
  if (json.kind === 'connected') return json
  const kind = typeof json.kind === 'string' ? json.kind : 'unknown'
  throw new Error(`ae connect finished with kind "${kind}" instead of "connected".`)
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Parse the single JSON value `ae ... --json` writes to stdout. */
export function parseFinalJson(text) {
  const source = String(text ?? '').trim()
  if (source.length === 0) return undefined
  const direct = safeJson(source)
  if (direct !== undefined) return direct
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  return start === -1 || end <= start ? undefined : safeJson(source.slice(start, end + 1))
}

function redactSecrets(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !REDACTED_KEYS.has(key)),
  )
}

/** Approve the pending device grant through the local auth bypass. */
export async function approveLocalConsent(input) {
  const { baseUrl, userCode, authorityMode = DEFAULT_AUTHORITY_MODE, fetchImpl = fetch } = input
  const origin = new URL(baseUrl).origin
  const consentUrl = new URL(CONSENT_PATH, baseUrl)
  consentUrl.searchParams.set('user_code', userCode)
  const page = await fetchImpl(consentUrl.toString(), {
    method: 'GET',
    headers: { Accept: 'text/html' },
    redirect: 'manual',
  })
  const html = await page.text()
  const attributes = page.status === 200 ? parseConsentAttributes(html) : undefined
  if (attributes === undefined) {
    return {
      kind: 'failed',
      stage: 'consent_page',
      status: page.status,
      body: html,
    }
  }
  const body = buildApprovalBody({ ...attributes, authorityMode })
  const response = await fetchImpl(new URL(CONSENT_PATH, baseUrl).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
    body,
  })
  const text = await response.text()
  const requested = attributes.requestedAuthorityMode
  const result = safeJson(text)
  if (response.status === 200 && result !== null && typeof result === 'object' && result.kind === 'approved') {
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

/** Parse the CLI flags. Throws with a usage message on anything unknown. */
export function parseFlags(argv = []) {
  let baseUrl = DEFAULT_BASE_URL
  let authorityMode = DEFAULT_AUTHORITY_MODE
  let json = false
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
    else if (name === '--authority-mode') authorityMode = readValue()
    else if (name === '--json') json = true
    else throw new Error(`Unknown option ${name}. Usage: node tools/dev/local-connect.mjs [--base-url <url>] [--authority-mode <mode>] [--json]`)
  }
  if (!AUTHORITY_MODES.includes(authorityMode)) {
    throw new Error(`--authority-mode must be one of ${AUTHORITY_MODES.join(', ')}.`)
  }
  return { baseUrl, authorityMode, json }
}

function repoRoot() {
  return resolvePath(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

/** Argv for the child `ae connect` run. */
export function buildConnectArgs(baseUrl) {
  return ['run', '--silent', 'ae', '--', 'connect', '--base-url', baseUrl, '--json']
}

function defaultSpawn(baseUrl) {
  return spawn('npm', buildConnectArgs(baseUrl), {
    cwd: repoRoot(),
    env: { ...process.env, AE_DISABLE_BROWSER_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
}

/**
 * Drive one local connect: spawn `ae connect --json`, approve the grant it
 * prints, forward the child's final JSON, and report the exit code.
 */
export async function runLocalConnect(options = {}) {
  const stdout = options.stdout ?? ((text) => { process.stdout.write(text) })
  const stderr = options.stderr ?? ((text) => { process.stderr.write(text) })
  const spawnImpl = options.spawnImpl ?? defaultSpawn
  const fetchImpl = options.fetchImpl ?? fetch

  let flags
  try {
    flags = parseFlags(options.argv ?? process.argv.slice(2))
  } catch (error) {
    stderr(`${LOG_PREFIX}: ${error.message}\n`)
    return { exitCode: 2 }
  }
  if (!isLoopback(flags.baseUrl)) {
    stderr(`${LOG_PREFIX}: refusing ${flags.baseUrl}. This tool approves consent without signing in and only runs against a loopback deployment started with VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true.\n`)
    return { exitCode: 2 }
  }

  const child = spawnImpl(flags.baseUrl)
  let stdoutText = ''
  let stderrText = ''
  let approval
  let approving = false
  const pending = []

  const tryApprove = () => {
    if (approving) return
    const located = parseUserCode(stderrText) ?? parseUserCode(stdoutText)
    if (located === undefined) return
    approving = true
    if (!flags.json) {
      stderr(`${LOG_PREFIX}: approving user code ${located.userCode} as ${flags.authorityMode}.\n`)
    }
    pending.push((async () => {
      try {
        approval = await approveLocalConsent({
          baseUrl: flags.baseUrl,
          userCode: located.userCode,
          authorityMode: flags.authorityMode,
          fetchImpl,
        })
      } catch (error) {
        approval = { kind: 'failed', stage: 'approval', status: 0, body: String(error?.message ?? error) }
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

  const closed = await new Promise((resolve) => {
    child.on('error', (error) => { resolve({ code: 1, error }) })
    child.on('close', (code, signal) => { resolve({ code, signal }) })
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
    stderr(`${LOG_PREFIX}: ${error.message}\n`)
  }
  if (approval !== undefined && approval.kind === 'failed') {
    stderr(`${LOG_PREFIX}: approval failed at ${approval.stage} (HTTP ${approval.status}).\n${approval.body}\n`)
    if (approval.requestedAuthorityMode !== undefined && approval.requestedAuthorityMode !== flags.authorityMode) {
      stderr(`${LOG_PREFIX}: the grant requested authority mode "${approval.requestedAuthorityMode}"; rerun with --authority-mode ${approval.requestedAuthorityMode}.\n`)
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
