import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'

import {
  approveLocalConsent,
  assertConnected,
  buildApprovalBody,
  buildConnectArgs,
  isLoopback,
  parseConsentAttributes,
  parseFinalJson,
  parseFlags,
  parseUserCode,
  runLocalConnect,
} from '../../../tools/dev/local-connect.mjs'

const BASE_URL = 'http://127.0.0.1:3024'

const consentPage = (overrides: Partial<Record<string, string>> = {}) => {
  const attributes = {
    'data-grant-ref': 'device:grant-1',
    'data-grant-revision': '1',
    'data-flow': 'device_code',
    'data-authority-mode': 'spending_policy',
    'data-tool-access': 'all_admitted',
    ...overrides,
  }
  const rendered = Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ')
  return `<main data-ae-consent ${rendered}><form method="post" action="/oauth/authorize"></form></main>`
}

const progressBlock = (userCode = 'WDJB-MJHT') =>
  `Approve: ${BASE_URL}/oauth/authorize?user_code=${userCode}\nUser code: ${userCode}\nWaiting for authorization…\n`

type FetchCall = {
  url: string
  init: {
    method?: string
    headers?: Record<string, string>
    body?: string
    redirect?: string
  }
}

type StubResponse = { status: number, body: string, headers?: Record<string, string> }

function fetchStub(responses: readonly StubResponse[]) {
  const calls: FetchCall[] = []
  const queue = [...responses]
  const fetchImpl = async (url: string, init: FetchCall['init'] = {}) => {
    calls.push({ url, init })
    const next = queue.shift() ?? { status: 500, body: 'no stubbed response' }
    const headers = next.headers ?? {}
    return {
      status: next.status,
      text: async () => next.body,
      headers: { get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null },
    }
  }
  return { calls, fetchImpl }
}

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
  readonly signals: string[] = []

  kill(signal: string) {
    this.signals.push(signal)
    return true
  }

  finish(stdoutJson: unknown, code = 0) {
    this.stdout.emit('data', `${JSON.stringify(stdoutJson, undefined, 2)}\n`)
    this.emit('close', code, null)
  }
}

function recorder() {
  const chunks: string[] = []
  return { chunks, write: (text: string) => { chunks.push(text) } }
}

const connectedResult = {
  kind: 'connected',
  clientId: 'client-1',
  profile: 'market',
  authorityMode: 'spending_policy',
  credentialStored: true,
}

const pendingResult = {
  kind: 'pending',
  clientId: 'client-1',
  verificationUri: `${BASE_URL}/oauth/authorize`,
  userCode: 'WDJB-MJHT',
}

describe('isLoopback', () => {
  it('accepts http and https loopback hosts', () => {
    expect(isLoopback(BASE_URL)).toBe(true)
    expect(isLoopback('http://localhost:3024')).toBe(true)
    expect(isLoopback('https://127.9.9.9/')).toBe(true)
    expect(isLoopback('http://[::1]:3024')).toBe(true)
  })

  it('rejects remote hosts, other schemes, and unparseable input', () => {
    expect(isLoopback('https://agenticeconomy.example')).toBe(false)
    expect(isLoopback('http://127.0.0.1.evil.example')).toBe(false)
    expect(isLoopback('http://10.0.0.1:3024')).toBe(false)
    expect(isLoopback('ftp://127.0.0.1')).toBe(false)
    expect(isLoopback('not a url')).toBe(false)
    expect(isLoopback(undefined)).toBe(false)
  })
})

describe('parseUserCode', () => {
  it('reads the code and verification URI out of the progress block', () => {
    expect(parseUserCode(progressBlock())).toEqual({
      userCode: 'WDJB-MJHT',
      verificationUri: `${BASE_URL}/oauth/authorize?user_code=WDJB-MJHT`,
    })
  })

  it('returns the code alone when only that line has arrived', () => {
    expect(parseUserCode('User code: ABCD-EFGH\n')).toEqual({ userCode: 'ABCD-EFGH' })
  })

  it('waits for a complete line and returns undefined otherwise', () => {
    expect(parseUserCode(`Approve: ${BASE_URL}\nUser code: WDJ`)).toBeUndefined()
    expect(parseUserCode('Waiting for authorization…\n')).toBeUndefined()
    expect(parseUserCode('')).toBeUndefined()
    expect(parseUserCode(undefined)).toBeUndefined()
  })
})

describe('parseConsentAttributes', () => {
  it('reads the grant ref, revision, tool access, and requested mode', () => {
    expect(parseConsentAttributes(consentPage())).toEqual({
      grantRef: 'device:grant-1',
      grantRevision: 1,
      toolAccess: 'all_admitted',
      requestedAuthorityMode: 'spending_policy',
    })
  })

  it('unescapes attribute entities', () => {
    const parsed = parseConsentAttributes(consentPage({ 'data-grant-ref': 'device:a&amp;b' }))
    expect(parsed?.grantRef).toBe('device:a&b')
  })

  it('omits an unrecognised requested authority mode', () => {
    const parsed = parseConsentAttributes(consentPage({ 'data-authority-mode': 'made_up' }))
    expect(parsed).toEqual({ grantRef: 'device:grant-1', grantRevision: 1, toolAccess: 'all_admitted' })
  })

  it('rejects pages that are not a consent form or carry invalid fields', () => {
    expect(parseConsentAttributes('<html><body>Sign in</body></html>')).toBeUndefined()
    expect(parseConsentAttributes(consentPage({ 'data-grant-ref': '' }))).toBeUndefined()
    expect(parseConsentAttributes(consentPage({ 'data-grant-revision': '0' }))).toBeUndefined()
    expect(parseConsentAttributes(consentPage({ 'data-grant-revision': 'x' }))).toBeUndefined()
    expect(parseConsentAttributes(consentPage({ 'data-tool-access': 'anything' }))).toBeUndefined()
    expect(parseConsentAttributes(undefined)).toBeUndefined()
  })
})

describe('buildApprovalBody', () => {
  it('builds a new-agent approval whose expected target revision is the grant revision', () => {
    const body = new URLSearchParams(buildApprovalBody({
      grantRef: 'device:grant-1',
      grantRevision: 3,
      toolAccess: 'all_admitted',
      authorityMode: 'spending_policy',
    }))
    expect(Object.fromEntries(body)).toEqual({
      grant_ref: 'device:grant-1',
      expected_grant_revision: '3',
      expected_target_revision: '3',
      decision: 'approve',
      authority_mode: 'spending_policy',
      approved_tool_access: 'all_admitted',
      connection_target: 'new_agent',
    })
  })

  it('defaults to spending policy over all admitted tools and appends selected tool refs', () => {
    expect(buildApprovalBody({ grantRef: 'device:grant-1', grantRevision: 1 }))
      .toContain('authority_mode=spending_policy')
    const selected = new URLSearchParams(buildApprovalBody({
      grantRef: 'device:grant-1',
      grantRevision: 1,
      toolAccess: 'selected_tools',
      toolRefs: ['tool-a', 'tool-b'],
      state: 'xyz',
    }))
    expect(selected.getAll('approved_tool_ref')).toEqual(['tool-a', 'tool-b'])
    expect(selected.get('approved_tool_access')).toBe('selected_tools')
    expect(selected.get('state')).toBe('xyz')
  })

  it('throws on missing or invalid fields', () => {
    expect(() => buildApprovalBody({ grantRef: '', grantRevision: 1 })).toThrow(/grant_ref/u)
    expect(() => buildApprovalBody({ grantRef: 'g', grantRevision: 0 })).toThrow(/expected_grant_revision/u)
    expect(() => buildApprovalBody({ grantRef: 'g', grantRevision: 1, authorityMode: 'nope' as never }))
      .toThrow(/authority_mode/u)
    expect(() => buildApprovalBody({ grantRef: 'g', grantRevision: 1, toolAccess: 'nope' as never }))
      .toThrow(/approved_tool_access/u)
    expect(() => buildApprovalBody({ grantRef: 'g', grantRevision: 1, toolAccess: 'selected_tools' }))
      .toThrow(/approved_tool_ref/u)
  })
})

describe('assertConnected', () => {
  it('returns the connected payload', () => {
    expect(assertConnected(connectedResult)).toBe(connectedResult)
  })

  it('throws for pending, non-objects, and missing output', () => {
    expect(() => assertConnected(pendingResult)).toThrow(/kind "pending"/u)
    expect(() => assertConnected({ nope: true })).toThrow(/kind "unknown"/u)
    expect(() => assertConnected(undefined)).toThrow(/JSON object/u)
    expect(() => assertConnected([])).toThrow(/JSON object/u)
  })
})

describe('parseFlags', () => {
  it('defaults to the local dev server and spending policy', () => {
    expect(parseFlags([])).toEqual({
      baseUrl: 'http://127.0.0.1:3024',
      authorityMode: 'spending_policy',
      json: false,
    })
  })

  it('reads spaced and inline values', () => {
    expect(parseFlags(['--base-url', 'http://localhost:9', '--authority-mode', 'read_only', '--json']))
      .toEqual({ baseUrl: 'http://localhost:9', authorityMode: 'read_only', json: true })
    expect(parseFlags(['--base-url=http://localhost:9']).baseUrl).toBe('http://localhost:9')
  })

  it('rejects unknown options, missing values, and invalid modes', () => {
    expect(() => parseFlags(['--wat'])).toThrow(/Unknown option/u)
    expect(() => parseFlags(['--base-url'])).toThrow(/requires a value/u)
    expect(() => parseFlags(['--authority-mode', 'root'])).toThrow(/authority-mode/u)
  })
})

describe('parseFinalJson', () => {
  it('parses the single JSON value ae writes on stdout', () => {
    expect(parseFinalJson(`${JSON.stringify(connectedResult, undefined, 2)}\n`)).toEqual(connectedResult)
  })

  it('falls back to the outermost braces and gives up on garbage', () => {
    expect(parseFinalJson('noise\n{"kind":"pending"}\n')).toEqual({ kind: 'pending' })
    expect(parseFinalJson('no json here')).toBeUndefined()
    expect(parseFinalJson('')).toBeUndefined()
  })
})

describe('buildConnectArgs', () => {
  it('runs the workspace ae CLI in JSON mode against the given base URL', () => {
    expect(buildConnectArgs(BASE_URL)).toEqual([
      'run', '--silent', 'ae', '--', 'connect', '--base-url', BASE_URL, '--json',
    ])
  })
})

describe('approveLocalConsent', () => {
  it('reads the consent page then posts an origin-bound approval', async () => {
    const { calls, fetchImpl } = fetchStub([
      { status: 200, body: consentPage() },
      { status: 200, body: JSON.stringify({ kind: 'approved', grantRef: 'device:grant-1' }) },
    ])

    const approval = await approveLocalConsent({
      baseUrl: BASE_URL,
      userCode: 'WDJB-MJHT',
      authorityMode: 'spending_policy',
      fetchImpl,
    })

    expect(approval).toEqual({
      kind: 'approved',
      grantRef: 'device:grant-1',
      requestedAuthorityMode: 'spending_policy',
    })
    expect(calls[0]?.url).toBe(`${BASE_URL}/oauth/authorize?user_code=WDJB-MJHT`)
    expect(calls[0]?.init.method).toBe('GET')
    expect(calls[0]?.init.redirect).toBe('manual')
    expect(calls[1]?.url).toBe(`${BASE_URL}/oauth/authorize`)
    expect(calls[1]?.init.method).toBe('POST')
    expect(calls[1]?.init.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE_URL,
    })
    expect(Object.fromEntries(new URLSearchParams(calls[1]?.init.body ?? ''))).toEqual({
      grant_ref: 'device:grant-1',
      expected_grant_revision: '1',
      expected_target_revision: '1',
      decision: 'approve',
      authority_mode: 'spending_policy',
      approved_tool_access: 'all_admitted',
      connection_target: 'new_agent',
    })
  })

  it('reports the redirect body when the local bypass is off and no Location header is given', async () => {
    const { calls, fetchImpl } = fetchStub([{ status: 302, body: '' }])

    const approval = await approveLocalConsent({ baseUrl: BASE_URL, userCode: 'WDJB-MJHT', fetchImpl })

    expect(approval).toEqual({ kind: 'failed', stage: 'consent_page', status: 302, body: '' })
    expect(calls).toHaveLength(1)
  })

  it('follows a same-origin redirect to the consent page and posts to its form action', async () => {
    const { calls, fetchImpl } = fetchStub([
      { status: 307, body: '', headers: { location: `${BASE_URL}/oauth/authorize?user_code=WDJB-MJHT&hop=1` } },
      { status: 200, body: consentPage() },
      { status: 200, body: JSON.stringify({ kind: 'approved', grantRef: 'device:grant-1' }) },
    ])

    const approval = await approveLocalConsent({ baseUrl: BASE_URL, userCode: 'WDJB-MJHT', fetchImpl })

    expect(approval).toMatchObject({ kind: 'approved', grantRef: 'device:grant-1' })
    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      `GET ${BASE_URL}/oauth/authorize?user_code=WDJB-MJHT`,
      `GET ${BASE_URL}/oauth/authorize?user_code=WDJB-MJHT&hop=1`,
      `POST ${BASE_URL}/oauth/authorize`,
    ])
  })

  it('never follows a redirect off the base origin, and reports the Clerk bypass guidance when it is a Clerk handshake', async () => {
    const { calls, fetchImpl } = fetchStub([
      { status: 307, body: '', headers: { location: 'https://composed-stallion-40.clerk.accounts.dev/v1/client/handshake' } },
    ])

    const approval = await approveLocalConsent({ baseUrl: BASE_URL, userCode: 'WDJB-MJHT', fetchImpl })

    expect(approval).toEqual({
      kind: 'failed',
      stage: 'clerk_bypass_off',
      status: 307,
      body: '',
      message: `this server runs with the Clerk bypass OFF; approve in the browser with 'npm run ae -- connect --base-url ${BASE_URL}' or restart with 'VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run dev:local'`,
    })
    expect(calls).toHaveLength(1)
  })

  it('also recognises the Clerk bypass from an x-clerk-auth-status header on an off-origin redirect', async () => {
    const { fetchImpl } = fetchStub([
      {
        status: 307,
        body: '',
        headers: {
          location: 'https://accounts.example.com/sign-in',
          'x-clerk-auth-status': 'signed-out',
        },
      },
    ])

    const approval = await approveLocalConsent({ baseUrl: BASE_URL, userCode: 'WDJB-MJHT', fetchImpl })

    expect(approval).toMatchObject({
      stage: 'clerk_bypass_off',
      message: expect.stringContaining("VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run dev:local'"),
    })
  })

  it('does not mistake an ordinary off-origin redirect for a Clerk handshake', async () => {
    const { fetchImpl } = fetchStub([
      { status: 307, body: '', headers: { location: 'https://other-service.example/redirect' } },
    ])

    const approval = await approveLocalConsent({ baseUrl: BASE_URL, userCode: 'WDJB-MJHT', fetchImpl })

    expect(approval).toEqual({ kind: 'failed', stage: 'consent_page', status: 307, body: '' })
  })

  it('gives up after too many same-origin redirects instead of looping forever', async () => {
    const responses = Array.from({ length: 7 }, (_unused, index) => ({
      status: 307,
      body: '',
      headers: { location: `${BASE_URL}/oauth/authorize?user_code=WDJB-MJHT&hop=${index + 1}` },
    }))
    const { calls, fetchImpl } = fetchStub(responses)

    const approval = await approveLocalConsent({ baseUrl: BASE_URL, userCode: 'WDJB-MJHT', fetchImpl })

    expect(approval).toMatchObject({ kind: 'failed', stage: 'consent_page', status: 307 })
    expect(calls).toHaveLength(6)
  })

  it('reports the server body when the approval is rejected', async () => {
    const { fetchImpl } = fetchStub([
      { status: 200, body: consentPage() },
      { status: 400, body: JSON.stringify({ error: 'invalid_scope' }) },
    ])

    const approval = await approveLocalConsent({
      baseUrl: BASE_URL,
      userCode: 'WDJB-MJHT',
      authorityMode: 'read_only',
      fetchImpl,
    })

    expect(approval).toEqual({
      kind: 'failed',
      stage: 'approval',
      status: 400,
      body: '{"error":"invalid_scope"}',
      requestedAuthorityMode: 'spending_policy',
    })
  })
})

describe('runLocalConnect', () => {
  const harness = (responses: readonly StubResponse[]) => {
    const child = new FakeChild()
    const stdout = recorder()
    const stderr = recorder()
    const { calls, fetchImpl } = fetchStub(responses)
    const spawned: string[] = []
    const run = (argv: readonly string[]) => runLocalConnect({
      argv,
      spawnImpl: (baseUrl: string) => {
        spawned.push(baseUrl)
        return child as never
      },
      fetchImpl,
      stdout: stdout.write,
      stderr: stderr.write,
    })
    return { child, stdout, stderr, calls, spawned, run }
  }

  it('refuses a non-loopback base URL without spawning anything', async () => {
    const { spawned, stderr, run } = harness([])

    const outcome = await run(['--base-url', 'https://agenticeconomy.example'])

    expect(outcome.exitCode).toBe(2)
    expect(spawned).toEqual([])
    expect(stderr.chunks.join('')).toContain('refusing https://agenticeconomy.example')
  })

  it('exits 2 on an unknown flag', async () => {
    const { spawned, stderr, run } = harness([])

    const outcome = await run(['--nope'])

    expect(outcome.exitCode).toBe(2)
    expect(spawned).toEqual([])
    expect(stderr.chunks.join('')).toContain('Unknown option --nope')
  })

  it('approves the printed user code and exits 0 when ae reports connected', async () => {
    const { child, stdout, calls, spawned, run } = harness([
      { status: 200, body: consentPage({ 'data-grant-revision': '2' }) },
      { status: 200, body: JSON.stringify({ kind: 'approved', grantRef: 'device:grant-1' }) },
    ])

    const running = run(['--base-url', BASE_URL, '--json'])
    child.stderr.emit('data', progressBlock())
    await Promise.resolve()
    child.finish(connectedResult)
    const outcome = await running

    expect(spawned).toEqual([BASE_URL])
    expect(outcome.exitCode).toBe(0)
    expect(outcome.approval).toMatchObject({ kind: 'approved', grantRef: 'device:grant-1' })
    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      `GET ${BASE_URL}/oauth/authorize?user_code=WDJB-MJHT`,
      `POST ${BASE_URL}/oauth/authorize`,
    ])
    expect(new URLSearchParams(calls[1]?.init.body ?? '').get('expected_target_revision')).toBe('2')
    expect(JSON.parse(stdout.chunks.join(''))).toEqual(connectedResult)
    expect(child.signals).toEqual([])
  })

  it('approves once even when the code arrives across several chunks', async () => {
    const { child, calls, run } = harness([
      { status: 200, body: consentPage() },
      { status: 200, body: JSON.stringify({ kind: 'approved', grantRef: 'device:grant-1' }) },
    ])

    const running = run(['--json'])
    child.stderr.emit('data', 'Approve: http://127.0.0.1:3024/oauth/authorize\nUser co')
    child.stderr.emit('data', 'de: WDJB-MJHT\n')
    child.stderr.emit('data', 'Waiting for authorization…\n')
    await Promise.resolve()
    child.finish(connectedResult)
    await running

    expect(calls).toHaveLength(2)
  })

  it('forwards a pending result and exits 1 without redacted secrets', async () => {
    const { child, stdout, stderr, calls, run } = harness([])

    const running = run(['--json'])
    child.finish({ ...pendingResult, access_token: 'ae_secret_value' }, 0)
    const outcome = await running

    expect(outcome.exitCode).toBe(1)
    expect(calls).toEqual([])
    const printed = stdout.chunks.join('')
    expect(JSON.parse(printed)).toEqual(pendingResult)
    expect(printed).not.toContain('ae_secret_value')
    expect(stderr.chunks.join('')).toContain('kind "pending"')
    expect(stderr.chunks.join('')).toContain('no user code appeared')
  })

  it('stops the child and reports the server body when approval is rejected', async () => {
    const { child, stderr, run } = harness([
      { status: 200, body: consentPage() },
      { status: 409, body: JSON.stringify({ kind: 'conflict', code: 'grant_revision_mismatch' }) },
    ])

    const running = run(['--json'])
    child.stderr.emit('data', progressBlock())
    await Promise.resolve()
    await Promise.resolve()
    child.finish(pendingResult)
    const outcome = await running

    expect(outcome.exitCode).toBe(1)
    expect(outcome.approval).toMatchObject({ kind: 'failed', stage: 'approval', status: 409 })
    expect(child.signals).toEqual(['SIGTERM'])
    const errors = stderr.chunks.join('')
    expect(errors).toContain('approval failed at approval (HTTP 409)')
    expect(errors).toContain('grant_revision_mismatch')
  })

  it('suggests the requested mode when the chosen mode is refused', async () => {
    const { child, stderr, run } = harness([
      { status: 200, body: consentPage() },
      { status: 400, body: JSON.stringify({ error: 'invalid_scope' }) },
    ])

    const running = run(['--json', '--authority-mode', 'read_only'])
    child.stderr.emit('data', progressBlock())
    await Promise.resolve()
    await Promise.resolve()
    child.finish(pendingResult)
    await running

    expect(stderr.chunks.join('')).toContain('rerun with --authority-mode spending_policy')
  })

  it('prints the Clerk bypass guidance instead of the generic HTTP status when the bypass is off', async () => {
    const { child, stderr, run } = harness([
      { status: 307, body: '', headers: { location: 'https://composed-stallion-40.clerk.accounts.dev/v1/client/handshake' } },
    ])

    const running = run(['--json', '--base-url', BASE_URL])
    child.stderr.emit('data', progressBlock())
    await Promise.resolve()
    await Promise.resolve()
    child.finish(pendingResult)
    const outcome = await running

    expect(outcome.exitCode).toBe(1)
    const errors = stderr.chunks.join('')
    expect(errors).toContain(
      `local-connect: this server runs with the Clerk bypass OFF; approve in the browser with 'npm run ae -- connect --base-url ${BASE_URL}' or restart with 'VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run dev:local'`,
    )
    expect(errors).not.toContain('HTTP 307')
  })

  it('exits 1 when the child cannot be started', async () => {
    const { child, stderr, run } = harness([])

    const running = run(['--json'])
    child.emit('error', new Error('spawn npm ENOENT'))
    const outcome = await running

    expect(outcome.exitCode).toBe(1)
    expect(stderr.chunks.join('')).toContain('spawn npm ENOENT')
  })
})
