import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getVercelOidcToken: vi.fn(),
}))

vi.mock('@vercel/oidc', () => ({ getVercelOidcToken: mocks.getVercelOidcToken }))

vi.mock('@/modules/network-guard/server', () => ({
  sendGuardedHttpRequest: async (request: Request) => await fetch(request.url, {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    ...(request.method === 'GET' || request.method === 'HEAD'
      ? {}
      : { body: await request.text() }),
    redirect: request.redirect,
    signal: request.signal,
  }),
}))

import {
  Route,
  handleSecretLifecycleRequest,
} from '@/routes/api.internal.secret-lifecycle'

const NOW = 2_000_000_000_000
const TOKEN = 'c'.repeat(43)
const OTHER_TOKEN = 'd'.repeat(43)
const SECRET = 'sec_00000000000040008000000000000131'
const FIRST = 'sgn_00000000000040008000000000000131'
const CANARY = 'route-canary-never-crosses-convex'

type LifecycleRecord = Readonly<{
  operationRef: string
  idempotencyRef: string
  operation: 'provision' | 'rotate'
  secretRef: string
  targetGeneration: string
  previousGeneration?: string
  previousRevision: number
  state: 'prepared' | 'active' | 'failed_validation' | 'external_effect_unknown' | 'pointer_conflict'
  createdAt: number
  updatedAt: number
}>

type Pointer = Readonly<{
  secretRef: string
  activeGeneration: string
  revision: number
}>

const baseAuthority = Object.freeze({
  operation: 'provision' as const,
  snapshotRef: 'das_00000000000040008000000000000131',
  accountRef: 'acc_00000000000040008000000000000131',
  actorPrincipalRef: 'prn_00000000000040008000000000000131',
  grantRef: 'grt_00000000000040008000000000000131',
  grantGeneration: 1,
  correlationRef: 'secret:route:provision',
  idempotencyRef: 'secret:route:provision',
  occurredAt: NOW,
})

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    AE_SECRET_LIFECYCLE_RPC_TOKEN: TOKEN,
    AE_INFISICAL_BASE_URL: 'https://app.infisical.com',
    AE_INFISICAL_CUSTOMER_PROJECT_ID: 'project-customer',
    AE_INFISICAL_CUSTOMER_ENVIRONMENT: 'production',
    AE_INFISICAL_CUSTOMER_SECRET_PATH: '/agentic-economy/customer',
    AE_INFISICAL_CUSTOMER_MACHINE_IDENTITY_ID: 'machine-customer',
    CONVEX_SITE_URL: 'https://test-deployment.convex.site',
    ...overrides,
  }
}

function jwt(): string {
  const seconds = NOW / 1_000
  return [
    Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1' })).toString('base64url'),
    Buffer.from(JSON.stringify({
      iat: seconds - 60,
      nbf: seconds - 60,
      exp: seconds + 3_540,
    })).toString('base64url'),
    Buffer.from('signature').toString('base64url'),
  ].join('.')
}

function lifecycleRequest(
  action: 'provision' | 'rotate' | 'reconcile' = 'provision',
  overrides: Record<string, unknown> = {},
): Request {
  const idempotencyRef = `secret:route:${action}`
  const authority = {
    ...baseAuthority,
    operation: action,
    correlationRef: idempotencyRef,
    idempotencyRef,
  }
  const body = {
    action,
    authority,
    secretRef: SECRET,
    idempotencyRef,
    ...(action === 'reconcile' ? {} : { materialBase64: Buffer.from(CANARY).toString('base64') }),
    ...overrides,
  }
  return rawRequest(JSON.stringify(body))
}

function rawRequest(
  body: string,
  headers: Record<string, string> = { 'Content-Type': 'application/json' },
  token = TOKEN,
): Request {
  return new Request('https://agentic-economy.example/api/internal/secret-lifecycle', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...headers },
    body,
  })
}

function activeRecord(
  operation: 'provision' | 'rotate',
  targetGeneration: string,
  overrides: Partial<LifecycleRecord> = {},
): LifecycleRecord {
  return {
    operationRef: 'sop_00000000000040008000000000000131',
    idempotencyRef: `secret:route:${operation}`,
    operation,
    secretRef: SECRET,
    targetGeneration,
    ...(operation === 'rotate' ? { previousGeneration: FIRST } : {}),
    previousRevision: operation === 'rotate' ? 1 : 0,
    state: 'active',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function fetchHarness(options: Readonly<{
  pointer?: Pointer
  journal?: LifecycleRecord
  failRpcOperation?: string
  rpcFailure?: Readonly<{
    operation: string
    kind: 'status' | 'invalid-json' | 'array' | 'wrong-kind'
  }>
  pointerReadResult?: unknown
  failVaultAt?: 'login' | 'create' | 'read'
  mismatchedRead?: boolean
}> = {}) {
  let pointer = options.pointer
  const journal = new Map<string, LifecycleRecord>()
  if (options.journal !== undefined) journal.set(options.journal.idempotencyRef, options.journal)
  const rpcBodies: Array<Record<string, unknown>> = []
  const vaultRequests: Request[] = []
  const operations: string[] = []
  const events: string[] = []
  let vaultWrites = 0
  let pointerAdvances = 0

  const fetcher = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.hostname.endsWith('.convex.site')) {
      const body = await request.clone().json() as {
        operation: string
        args: Record<string, unknown>
      }
      rpcBodies.push(body as unknown as Record<string, unknown>)
      operations.push(body.operation)
      events.push(`rpc:${body.operation}`)
      if (body.operation === options.failRpcOperation) throw new Error(CANARY)
      if (body.operation === options.rpcFailure?.operation) {
        switch (options.rpcFailure.kind) {
          case 'status': return Response.json({ kind: 'ok', result: null }, { status: 503 })
          case 'invalid-json': return new Response('{', { status: 200 })
          case 'array': return Response.json([])
          case 'wrong-kind': return Response.json({ kind: 'unavailable' })
        }
      }
      const args = body.args
      let result: unknown = null
      switch (body.operation) {
        case 'journal_read':
          result = journal.get(String(args.idempotencyRef)) ?? null
          break
        case 'journal_insert': {
          const record = args.record as LifecycleRecord
          journal.set(record.idempotencyRef, structuredClone(record))
          break
        }
        case 'journal_replace': {
          const record = args.record as LifecycleRecord
          journal.set(record.idempotencyRef, structuredClone(record))
          break
        }
        case 'pointer_read':
          result = options.pointerReadResult ?? pointer ?? null
          break
        case 'pointer_initialize':
          pointerAdvances += 1
          pointer = {
            secretRef: String(args.secretRef),
            activeGeneration: String(args.activeGeneration),
            revision: 1,
          }
          break
        case 'pointer_advance':
          pointerAdvances += 1
          pointer = {
            secretRef: String(args.secretRef),
            activeGeneration: String(args.newGeneration),
            revision: Number(args.expectedRevision) + 1,
          }
          break
        default:
          throw new Error(`unexpected_rpc:${body.operation}`)
      }
      return Response.json({ kind: 'ok', result })
    }
    if (url.hostname === 'app.infisical.com') {
      vaultRequests.push(request)
      if (url.pathname === '/api/v1/auth/oidc-auth/login') {
        events.push('vault:login')
        if (options.failVaultAt === 'login') throw new Error(CANARY)
        return Response.json({
          accessToken: 'short-lived-vault-token', tokenType: 'Bearer',
          expiresIn: 60, accessTokenMaxTTL: 60,
        })
      }
      const encodedKey = url.pathname.slice('/api/v4/secrets/'.length)
      const key = decodeURIComponent(encodedKey)
      if (request.method === 'POST') {
        events.push('vault:create')
        vaultWrites += 1
        if (options.failVaultAt === 'create') throw new Error(CANARY)
        const body = await request.clone().json() as { secretValue: string }
        expect(body.secretValue).toBe(CANARY)
        return Response.json({ secret: {
          id: 'infisical-generation', version: 1, secretKey: key,
          environment: 'production', workspace: 'project-customer',
        } })
      }
      if (request.method === 'GET') {
        events.push('vault:read')
        if (options.failVaultAt === 'read') throw new Error(CANARY)
        return Response.json({ secret: {
          secretKey: key,
          secretValue: options.mismatchedRead === true ? 'different-material' : CANARY,
          environment: 'production', workspace: 'project-customer',
        } })
      }
      if (request.method === 'DELETE') {
        events.push('vault:discard')
        return Response.json({ secret: {
          id: 'infisical-generation', version: 1, secretKey: key,
          environment: 'production', workspace: 'project-customer',
        } })
      }
    }
    throw new Error(`unexpected_fetch:${request.method}:${url}`)
  })

  return {
    fetcher,
    events,
    journal,
    operations,
    rpcBodies,
    vaultRequests,
    pointer: () => pointer,
    pointerAdvances: () => pointerAdvances,
    vaultWrites: () => vaultWrites,
  }
}

describe('secret lifecycle Vercel route', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mocks.getVercelOidcToken.mockReset()
    mocks.getVercelOidcToken.mockResolvedValue(jwt())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('declares POST as the only method and routes POST through the production handler', async () => {
    const handlers = Route.options.server?.handlers
    if (typeof handlers !== 'object' || handlers === null) throw new Error('secret_lifecycle_handlers_missing')
    const indexed = handlers as Record<string, unknown>
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT']) {
      const methodHandler = indexed[method]
      if (typeof methodHandler !== 'function') throw new Error(`secret_lifecycle_${method}_missing`)
      const response = await methodHandler({
        request: new Request('https://agentic-economy.example/api/internal/secret-lifecycle'),
      } as never)
      if (!(response instanceof Response)) throw new Error('method_guard_response_missing')
      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('POST')
    }
    const post = indexed.POST
    if (typeof post !== 'function') throw new Error('secret_lifecycle_POST_missing')
    vi.stubEnv('AE_SECRET_LIFECYCLE_RPC_TOKEN', TOKEN)
    const response = await post({ request: rawRequest('{') } as never)
    if (!(response instanceof Response)) throw new Error('post_response_missing')
    expect(response.status).toBe(400)
  })

  it('provisions, validates, and advances only after the vault round-trip, then replays without another release', async () => {
    const harness = fetchHarness()
    vi.stubGlobal('fetch', harness.fetcher)
    const first = await handleSecretLifecycleRequest(lifecycleRequest(), environment())
    expect(first.status).toBe(200)
    expect(first.headers.get('cache-control')).toBe('no-store')
    const firstBody = await first.json() as Record<string, unknown>
    expect(firstBody).toMatchObject({ kind: 'active' })
    expect(JSON.stringify(firstBody)).not.toContain(CANARY)
    expect(harness.operations).toEqual([
      'journal_read', 'pointer_read', 'journal_insert',
      'pointer_initialize', 'pointer_read', 'journal_replace',
    ])
    expect(harness.events).toEqual([
      'rpc:journal_read', 'rpc:pointer_read', 'rpc:journal_insert',
      'vault:login', 'vault:create', 'vault:read',
      'rpc:pointer_initialize', 'rpc:pointer_read', 'rpc:journal_replace',
    ])
    expect(harness.vaultRequests.map((request) => request.method)).toEqual(['POST', 'POST', 'GET'])
    expect(harness.pointerAdvances()).toBe(1)
    expect(harness.vaultWrites()).toBe(1)

    const replay = await handleSecretLifecycleRequest(lifecycleRequest(), environment())
    expect(replay.status).toBe(200)
    await expect(replay.json()).resolves.toEqual(firstBody)
    expect(harness.vaultWrites()).toBe(1)
    expect(harness.pointerAdvances()).toBe(1)
    expect(harness.operations.slice(-2)).toEqual(['journal_read', 'pointer_read'])
    expect(JSON.stringify([...harness.journal.values()])).not.toContain(CANARY)
    expect(JSON.stringify(harness.pointer())).not.toContain(CANARY)
    expect(JSON.stringify(harness.rpcBodies)).not.toContain(CANARY)
  })

  it('rotates an existing pointer once and preserves the exact commercial-free lifecycle result on replay', async () => {
    const harness = fetchHarness({ pointer: { secretRef: SECRET, activeGeneration: FIRST, revision: 1 } })
    vi.stubGlobal('fetch', harness.fetcher)
    const rotate = lifecycleRequest('rotate')
    const first = await handleSecretLifecycleRequest(rotate, environment({
      AE_INFISICAL_CUSTOMER_ORGANIZATION_SLUG: 'customer-organization',
    }))
    expect(first.status).toBe(200)
    const body = await first.json() as { result: { activeGeneration: string; pointerRevision: number } }
    expect(body.result.pointerRevision).toBe(2)
    expect(body.result.activeGeneration).not.toBe(FIRST)
    expect(harness.pointer()).toEqual({
      secretRef: SECRET, activeGeneration: body.result.activeGeneration, revision: 2,
    })
    expect(harness.operations).toEqual([
      'journal_read', 'pointer_read', 'journal_insert',
      'pointer_advance', 'pointer_read', 'journal_replace',
    ])
    expect(harness.events).toEqual([
      'rpc:journal_read', 'rpc:pointer_read', 'rpc:journal_insert',
      'vault:login', 'vault:create', 'vault:read',
      'rpc:pointer_advance', 'rpc:pointer_read', 'rpc:journal_replace',
    ])

    const replay = await handleSecretLifecycleRequest(lifecycleRequest('rotate'), environment())
    expect(replay.status).toBe(200)
    await expect(replay.json()).resolves.toEqual(body)
    expect(harness.vaultWrites()).toBe(1)
    expect(harness.pointerAdvances()).toBe(1)
  })

  it('reconciles durable active state without reading or returning secret material', async () => {
    const record = activeRecord('rotate', 'sgn_00000000000040008000000000000132')
    const harness = fetchHarness({
      journal: record,
      pointer: { secretRef: SECRET, activeGeneration: record.targetGeneration, revision: 2 },
    })
    vi.stubGlobal('fetch', harness.fetcher)
    const response = await handleSecretLifecycleRequest(lifecycleRequest('reconcile', {
      idempotencyRef: record.idempotencyRef,
      authority: {
        ...baseAuthority,
        operation: 'reconcile',
        correlationRef: record.idempotencyRef,
        idempotencyRef: record.idempotencyRef,
      },
    }), environment())
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(JSON.parse(body)).toMatchObject({ kind: 'active', result: { state: 'active' } })
    expect(body).not.toContain(CANARY)
    expect(harness.operations).toEqual(['journal_read', 'pointer_read'])
    expect(harness.vaultRequests).toHaveLength(0)
  })

  it.each([
    ['vault login', { failVaultAt: 'login' as const }],
    ['vault create', { failVaultAt: 'create' as const }],
    ['vault read', { failVaultAt: 'read' as const }],
    ['validation mismatch', { mismatchedRead: true }],
    ['Convex journal insert', { failRpcOperation: 'journal_insert' }],
    ['Convex pointer advance after vault release', { failRpcOperation: 'pointer_initialize' }],
  ])('fails closed without blind retry or a duplicate effect during %s ambiguity', async (_label, options) => {
    const harness = fetchHarness(options)
    vi.stubGlobal('fetch', harness.fetcher)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const response = await handleSecretLifecycleRequest(lifecycleRequest(), environment())
    expect([409, 503]).toContain(response.status)
    const body = await response.text()
    expect(body).not.toContain(CANARY)
    expect(harness.vaultWrites()).toBeLessThanOrEqual(1)
    expect(harness.pointerAdvances()).toBeLessThanOrEqual(1)
    expect(harness.operations.filter((operation) => operation === 'pointer_initialize')).toHaveLength(
      'failRpcOperation' in options && options.failRpcOperation === 'pointer_initialize' ? 1 : 0,
    )
    if ('failRpcOperation' in options) {
      expect(harness.operations.filter((operation) => operation === options.failRpcOperation)).toHaveLength(1)
    }
    expect(JSON.stringify(harness.rpcBodies)).not.toContain(CANARY)
    expect(JSON.stringify([...harness.journal.values()])).not.toContain(CANARY)
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(CANARY)
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(CANARY)
    errorSpy.mockRestore()
    logSpy.mockRestore()
  })

  it.each(['status', 'invalid-json', 'array', 'wrong-kind'] as const)(
    'fails closed for Convex RPC response shape: %s',
    async (kind) => {
      const harness = fetchHarness({ rpcFailure: { operation: 'journal_read', kind } })
      vi.stubGlobal('fetch', harness.fetcher)
      const response = await handleSecretLifecycleRequest(lifecycleRequest(), environment())
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({
        kind: 'unavailable', code: 'secret_lifecycle_ambiguous',
      })
      expect(harness.vaultWrites()).toBe(0)
      expect(harness.pointerAdvances()).toBe(0)
    },
  )

  it('rejects a malformed Convex pointer and reports a durable pointer conflict without vault release', async () => {
    const malformed = fetchHarness({ pointerReadResult: 'caller-shaped-pointer' })
    vi.stubGlobal('fetch', malformed.fetcher)
    const unavailable = await handleSecretLifecycleRequest(lifecycleRequest(), environment())
    expect(unavailable.status).toBe(503)
    expect(malformed.vaultWrites()).toBe(0)

    const conflict = fetchHarness({ pointer: { secretRef: SECRET, activeGeneration: FIRST, revision: 1 } })
    vi.stubGlobal('fetch', conflict.fetcher)
    const denied = await handleSecretLifecycleRequest(lifecycleRequest(), environment())
    expect(denied.status).toBe(409)
    await expect(denied.json()).resolves.toEqual({
      kind: 'unavailable', code: 'secret_lifecycle_conflict',
    })
    expect(conflict.vaultWrites()).toBe(0)
    expect(conflict.pointerAdvances()).toBe(0)
  })

  it('compares transport digests without accepting different digest lengths', async () => {
    const originalCrypto = globalThis.crypto
    let calls = 0
    vi.stubGlobal('crypto', {
      ...originalCrypto,
      randomUUID: originalCrypto.randomUUID.bind(originalCrypto),
      subtle: {
        ...originalCrypto.subtle,
        digest: vi.fn(async () => new Uint8Array(++calls === 1 ? 32 : 0).buffer),
      },
    })
    const external = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', external)
    const response = await handleSecretLifecycleRequest(lifecycleRequest(), environment())
    expect(response.status).toBe(401)
    expect(external).not.toHaveBeenCalled()
  })

  it('rejects absent and non-Bearer authorization before reading the request', async () => {
    const external = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', external)
    for (const headers of [
      { 'Content-Type': 'application/json' },
      { 'Content-Type': 'application/json', Authorization: `Token ${TOKEN}` },
    ]) {
      const request = new Request('https://agentic-economy.example/api/internal/secret-lifecycle', {
        method: 'POST', headers, body: '{}',
      })
      await expect(handleSecretLifecycleRequest(request, environment())).resolves.toMatchObject({ status: 401 })
    }
    expect(external).not.toHaveBeenCalled()
  })

  it.each([
    ['missing authorization', lifecycleRequest(), { AE_SECRET_LIFECYCLE_RPC_TOKEN: TOKEN }, ''],
    ['short authorization', lifecycleRequest(), { AE_SECRET_LIFECYCLE_RPC_TOKEN: TOKEN }, 'short'],
    ['mismatched authorization', lifecycleRequest(), { AE_SECRET_LIFECYCLE_RPC_TOKEN: TOKEN }, OTHER_TOKEN],
    ['missing configured token', lifecycleRequest(), { AE_SECRET_LIFECYCLE_RPC_TOKEN: undefined }, TOKEN],
    ['invalid configured token', lifecycleRequest(), { AE_SECRET_LIFECYCLE_RPC_TOKEN: 'short' }, TOKEN],
  ])('rejects transport channel variant before any network effect: %s', async (
    _label,
    candidate,
    env,
    token,
  ) => {
    const external = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', external)
    const body = await candidate.text()
    const response = await handleSecretLifecycleRequest(rawRequest(body, {
      'Content-Type': 'application/json',
    }, token), environment(env))
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ kind: 'unavailable' })
    expect(external).not.toHaveBeenCalled()
  })

  it.each([
    ['missing media type', rawRequest('{}', {})],
    ['wrong media type', rawRequest('{}', { 'Content-Type': 'text/plain' })],
    ['oversize declaration', rawRequest('{}', {
      'Content-Type': 'application/json', 'Content-Length': String(257 * 1024),
    })],
    ['oversize body', rawRequest(JSON.stringify({ padding: 'x'.repeat(257 * 1024) }))],
    ['invalid JSON', rawRequest('{')],
    ['array body', rawRequest('[]')],
    ['unknown action', lifecycleRequest('provision', { action: 'admin' })],
    ['extra envelope key', lifecycleRequest('provision', { callerProof: 'attacker' })],
    ['non-record authority', lifecycleRequest('provision', { authority: 'attacker' })],
    ['extra authority key', lifecycleRequest('provision', {
      authority: { ...baseAuthority, callerPrincipal: 'attacker' },
    })],
    ['operation mismatch', lifecycleRequest('provision', {
      authority: { ...baseAuthority, operation: 'rotate' },
    })],
    ['idempotency mismatch', lifecycleRequest('provision', { idempotencyRef: 'secret:other' })],
    ['invalid secret ref', lifecycleRequest('provision', { secretRef: 'env:SECRET' })],
    ['empty material', lifecycleRequest('provision', { materialBase64: '' })],
    ['non-string material', lifecycleRequest('provision', { materialBase64: 7 })],
    ['malformed material', lifecycleRequest('provision', { materialBase64: 'not+canonical===' })],
    ['non-canonical pad bits', lifecycleRequest('provision', { materialBase64: '/x==' })],
    ['material on reconcile', lifecycleRequest('reconcile', { materialBase64: Buffer.from(CANARY).toString('base64') })],
  ])('rejects malformed and caller-shaped request before vault or Convex access: %s', async (_label, candidate) => {
    const external = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', external)
    const response = await handleSecretLifecycleRequest(candidate, environment())
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ kind: 'unavailable' })
    expect(external).not.toHaveBeenCalled()
  })

  it.each([
    ['invalid operation', { ...baseAuthority, operation: 'admin' }],
    ['zero grant generation', { ...baseAuthority, grantGeneration: 0 }],
    ['unsafe occurrence time', { ...baseAuthority, occurredAt: -1 }],
    ['invalid correlation ref', { ...baseAuthority, correlationRef: '' }],
    ['invalid idempotency ref', { ...baseAuthority, idempotencyRef: '' }],
  ])('rejects malformed canonical authority before network access: %s', async (_label, authority) => {
    const external = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', external)
    const response = await handleSecretLifecycleRequest(lifecycleRequest('provision', { authority }), environment())
    expect(response.status).toBe(400)
    expect(external).not.toHaveBeenCalled()
  })

  it('keeps the second decode guard fail-closed if bytes change after request canonicalization', async () => {
    const encoded = Buffer.from(CANARY).toString('base64')
    const originalFrom = Buffer.from.bind(Buffer) as typeof Buffer.from
    let targetDecodes = 0
    const fromSpy = vi.spyOn(Buffer, 'from').mockImplementation(((value: unknown, encoding?: string) => {
      if (value === encoded && encoding === 'base64' && ++targetDecodes === 2) {
        return originalFrom('different-material')
      }
      return originalFrom(value as never, encoding as never)
    }) as typeof Buffer.from)
    const external = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', external)
    const response = await handleSecretLifecycleRequest(lifecycleRequest('provision', {
      materialBase64: encoded,
    }), environment())
    expect(response.status).toBe(503)
    const body = await response.text()
    expect(body).not.toContain(CANARY)
    expect(external).not.toHaveBeenCalled()
    fromSpy.mockRestore()
  })

  it.each([
    ['malformed explicit site URL', { CONVEX_SITE_URL: 'https://[invalid' }],
    ['insecure explicit site URL', { CONVEX_SITE_URL: 'http://test-deployment.convex.site' }],
    ['credentialed explicit site URL', { CONVEX_SITE_URL: 'https://user:test@test-deployment.convex.site' }],
    ['explicit site URL path', { CONVEX_SITE_URL: 'https://test-deployment.convex.site/path' }],
    ['non-Convex explicit site URL', { CONVEX_SITE_URL: 'https://attacker.example' }],
    ['missing both Convex URLs', { CONVEX_SITE_URL: undefined, CONVEX_URL: undefined }],
    ['insecure Convex cloud URL', { CONVEX_SITE_URL: undefined, CONVEX_URL: 'http://test.convex.cloud' }],
    ['credentialed Convex cloud URL', {
      CONVEX_SITE_URL: undefined, CONVEX_URL: 'https://user:test@test.convex.cloud',
    }],
    ['Convex cloud URL path', { CONVEX_SITE_URL: undefined, CONVEX_URL: 'https://test.convex.cloud/path' }],
    ['non-Convex cloud URL', { CONVEX_SITE_URL: undefined, CONVEX_URL: 'https://attacker.example' }],
  ])('fails closed for deployment configuration variant: %s', async (_label, override) => {
    const external = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', external)
    const response = await handleSecretLifecycleRequest(lifecycleRequest(), environment(override))
    expect(response.status).toBe(503)
    const body = await response.text()
    expect(body).not.toContain(CANARY)
    expect(external).not.toHaveBeenCalled()
  })

  it('derives the Convex site fallback and fails closed on incomplete customer vault configuration', async () => {
    const fallback = fetchHarness()
    vi.stubGlobal('fetch', fallback.fetcher)
    const success = await handleSecretLifecycleRequest(lifecycleRequest(), environment({
      CONVEX_SITE_URL: undefined,
      CONVEX_URL: 'https://fallback-deployment.convex.cloud',
    }))
    expect(success.status).toBe(200)
    expect(fallback.fetcher.mock.calls.some(([input]) =>
      String(input).startsWith('https://fallback-deployment.convex.site/'))).toBe(true)

    for (const field of [
      'AE_INFISICAL_BASE_URL',
      'AE_INFISICAL_CUSTOMER_PROJECT_ID',
      'AE_INFISICAL_CUSTOMER_ENVIRONMENT',
      'AE_INFISICAL_CUSTOMER_SECRET_PATH',
      'AE_INFISICAL_CUSTOMER_MACHINE_IDENTITY_ID',
    ]) {
      const incomplete = fetchHarness()
      vi.stubGlobal('fetch', incomplete.fetcher)
      const response = await handleSecretLifecycleRequest(lifecycleRequest(), environment({ [field]: undefined }))
      expect(response.status).toBe(503)
      expect(incomplete.vaultWrites()).toBe(0)
      expect(incomplete.pointerAdvances()).toBe(0)
    }
  })
})
