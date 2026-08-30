import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { spawnCli } from './cli-errors-harness'

const temporaryDirectories: string[] = []
const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => await new Promise<void>((resolve) => server.close(() => resolve()))))
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('ae doctor', () => {
  it('returns one degraded diagnosis and inspects connections before authorizing a new identity', async () => {
    const requests: Array<{ method: string; path: string }> = []
    const origin = await startServer((request, response) => {
      requests.push({ method: request.method ?? '', path: request.url ?? '' })
      respondJson(response, {
        schemaVersion: 'ae-site-discovery:v2',
        origin: `http://${request.headers.host}`,
      })
    })
    const directory = makeConfigDirectory()
    const before = readFileSync(join(directory, 'sentinel.txt'), 'utf8')

    const result = await spawnCli(['doctor', '--base-url', origin, '--json'], {
      env: cleanEnvironment(directory),
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual({
      kind: 'degraded',
      checks: [
        { id: 'origin', state: 'pass', summary: `Configured origin is ${origin}.` },
        { id: 'server', state: 'pass', summary: 'AE server is reachable and manifest ae-site-discovery:v2 is compatible.' },
        { id: 'buyer', state: 'warn', summary: 'No buyer credential is selected for this origin; anonymous search and inspection remain available.', nextCommand: 'ae account connections' },
        { id: 'balance', state: 'warn', summary: 'Balance is unavailable until a buyer credential is connected.' },
        { id: 'invocation', state: 'warn', summary: 'Invocation recovery is unavailable until a buyer credential is connected.' },
      ],
    })
    expect(requests).toEqual([{ method: 'GET', path: '/.well-known/ucp' }])
    expect(readFileSync(join(directory, 'sentinel.txt'), 'utf8')).toBe(before)
  })

  it('checks the buyer loop and points an uncertain invocation to status without exposing credentials', async () => {
    const buyerSecret = 'FAKE_BUYER_SECRET_51f8'
    const invocationRef = 'invocation:v1:needs-attention'
    let invocationState: 'pending' | 'reconciliation_required' = 'reconciliation_required'
    const observed: Array<{ method: string; path: string; authorization?: string; body?: string }> = []
    const origin = await startServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        observed.push({
          method: request.method ?? '',
          path: request.url ?? '',
          ...(request.headers.authorization === undefined ? {} : { authorization: request.headers.authorization }),
          ...(chunks.length === 0 ? {} : { body: Buffer.concat(chunks).toString('utf8') }),
        })
        if (request.url === '/.well-known/ucp') {
          respondJson(response, { schemaVersion: 'ae-site-discovery:v2', origin })
          return
        }
        if (request.url === '/api/v1/account') {
          respondJson(response, {
            kind: 'authenticated', principalRef: 'prn_buyer', accountRef: 'acc_owner',
            credentialId: 'credential_buyer', applicationRef: 'agentic-economy',
            environment: 'sandbox', scopes: ['market_operations:invoke'], authorityMode: 'bounded_mandate',
          })
          return
        }
        if (request.url === '/api/v1/account/balance') {
          respondJson(response, {
            kind: 'available', principalRef: 'prn_buyer', accountRef: 'acc_owner',
            balance: { currency: 'USD', units: '2500', exponent: 2 },
            recoveryDue: { currency: 'USD', units: '0', exponent: 2 },
            accountState: 'active', version: 1, updatedAt: 10,
            funding: { kind: 'owner_browser_required', path: '/owner/credit', anchor: 'fund' },
          })
          return
        }
        if (request.url === '/api/v1/operations?limit=100') {
          respondJson(response, {
            kind: 'available', hasMore: false,
            items: [{
              invocationRef, operationRef: 'operation:v1:one', state: invocationState,
              resultKind: invocationState, createdAt: 10, updatedAt: 20,
            }],
          })
          return
        }
        respondJson(response, { error: 'unexpected' }, 404)
      })
    })
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })
    expect(json.status).toBe(0)
    expect(json.stderr).toBe('')
    expect(json.stdout).not.toContain(buyerSecret)
    expect(JSON.parse(json.stdout)).toEqual({
      kind: 'degraded',
      checks: [
        { id: 'origin', state: 'pass', summary: `Configured origin is ${origin}.` },
        { id: 'server', state: 'pass', summary: 'AE server is reachable and manifest ae-site-discovery:v2 is compatible.' },
        { id: 'buyer', state: 'pass', summary: 'Buyer credential is origin-bound, authenticated, and has market_operations:invoke.' },
        { id: 'balance', state: 'pass', summary: 'Buyer balance is available and the account is active.' },
        {
          id: 'invocation', state: 'warn',
          summary: 'A reconciliation-required invocation needs attention.',
          nextCommand: `ae status ${invocationRef}`,
        },
      ],
    })
    expect(observed).toEqual([
      { method: 'GET', path: '/.well-known/ucp' },
      { method: 'GET', path: '/api/v1/account', authorization: `Bearer ${buyerSecret}` },
      { method: 'POST', path: '/api/v1/account/balance', authorization: `Bearer ${buyerSecret}`, body: '{"currency":"USD"}' },
      { method: 'GET', path: '/api/v1/operations?limit=100', authorization: `Bearer ${buyerSecret}` },
    ])

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
    expect(human.status).toBe(0)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('AE doctor: degraded')
    expect(human.stdout).toContain('! A reconciliation-required invocation needs attention.')
    expect(human.stdout.match(/^Next: /gmu)).toEqual([`Next: `])
    expect(human.stdout).toContain(`Next: ae status ${invocationRef}`)
    expect(human.stdout).not.toContain(buyerSecret)

    invocationState = 'pending'
    const pending = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })
    expect(pending.status).toBe(0)
    expect(JSON.parse(pending.stdout)).toMatchObject({
      kind: 'degraded',
      checks: expect.arrayContaining([{
        id: 'invocation',
        state: 'warn',
        summary: 'A nonterminal invocation is still pending.',
        nextCommand: `ae wait ${invocationRef}`,
      }]),
    })
  })

  it('summarizes supplier Operation and connection readiness for one requested business', async () => {
    const buyerSecret = 'FAKE_BUYER_SECRET_1872'
    const supplierSecret = 'FAKE_SUPPLIER_SECRET_8431'
    const supplierRequests: Array<{ path: string; body: unknown }> = []
    const origin = await startServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8')
        const authorization = request.headers.authorization
        if (request.url === '/.well-known/ucp') {
          respondJson(response, { schemaVersion: 'ae-site-discovery:v2', origin })
          return
        }
        if (request.url === '/api/v1/account') {
          const supplier = authorization === `Bearer ${supplierSecret}`
          respondJson(response, {
            kind: 'authenticated', principalRef: supplier ? 'prn_supplier' : 'prn_buyer', accountRef: 'acc_owner',
            credentialId: supplier ? 'credential_supplier' : 'credential_buyer', applicationRef: 'agentic-economy',
            environment: 'sandbox', scopes: [supplier ? 'market_supply:manage' : 'market_operations:invoke'],
            authorityMode: 'bounded_mandate',
          })
          return
        }
        if (request.url === '/api/v1/account/balance') {
          respondJson(response, {
            kind: 'available', principalRef: 'prn_buyer', accountRef: 'acc_owner',
            balance: { currency: 'USD', units: '2500', exponent: 2 },
            recoveryDue: { currency: 'USD', units: '0', exponent: 2 },
            accountState: 'active', version: 1, updatedAt: 10,
            funding: { kind: 'owner_browser_required', path: '/owner/credit', anchor: 'fund' },
          })
          return
        }
        if (request.url === '/api/v1/operations?limit=100') {
          respondJson(response, { kind: 'available', items: [], hasMore: false })
          return
        }
        if (request.url === '/api/v1/supply/status') {
          supplierRequests.push({ path: request.url, body: JSON.parse(bodyText) })
          respondJson(response, {
            kind: 'available', businessId: 'business:one', business: { name: 'One', slug: 'one' }, activityTruncated: false,
            operations: [
              supplyOperation('offering:live', true),
              supplyOperation('offering:unready', false),
            ],
          })
          return
        }
        if (request.url === '/api/v1/supply/connections/list') {
          supplierRequests.push({ path: request.url, body: JSON.parse(bodyText) })
          respondJson(response, {
            kind: 'available', businessId: 'business:one',
            connections: [
              supplyConnection('connection:ready', true, 'active'),
              supplyConnection('connection:cleanup', false, 'cleanup_required'),
            ],
          })
          return
        }
        respondJson(response, { error: 'unexpected' }, 404)
      })
    })
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret, supplierSecret)

    const result = await spawnCli(['doctor', 'business:one', '--supplier', '--base-url', origin, '--json'], {
      env: cleanEnvironment(directory),
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toContain(buyerSecret)
    expect(result.stdout).not.toContain(supplierSecret)
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'degraded',
      checks: [
        { id: 'origin', state: 'pass' },
        { id: 'server', state: 'pass' },
        { id: 'buyer', state: 'pass' },
        { id: 'balance', state: 'pass' },
        { id: 'invocation', state: 'pass' },
        { id: 'supplier', state: 'pass', summary: 'Supplier credential is origin-bound, authenticated, and has market_supply:manage.' },
        {
          id: 'supplier.readiness', state: 'warn',
          summary: 'Supplier business has 2 Operations (1 live, 1 unready) and 2 provider connections (1 ready, 1 needing attention).',
          nextCommand: 'ae supply status business:one',
        },
      ],
    })
    expect(supplierRequests.toSorted((left, right) => left.path.localeCompare(right.path))).toEqual([
      { path: '/api/v1/supply/connections/list', body: { businessId: 'business:one', limit: 100 } },
      { path: '/api/v1/supply/status', body: { businessId: 'business:one' } },
    ])
  })

  it('never sends or echoes a credential whose configured origin does not match', async () => {
    const secret = 'FAKE_MISMATCHED_SECRET_9097'
    const requests: string[] = []
    const origin = await startServer((request, response) => {
      requests.push(request.url ?? '')
      respondJson(response, { schemaVersion: 'ae-site-discovery:v2', origin })
    })
    const directory = makeConfigDirectory()
    const result = await spawnCli(['doctor', '--base-url', origin, '--json'], {
      env: {
        ...cleanEnvironment(directory),
        AE_API_KEY: secret,
        AE_API_KEY_ORIGIN: 'https://private.example.test/credential?token=hidden',
      },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toContain(secret)
    expect(result.stdout).not.toContain('private.example.test')
    const diagnosis = JSON.parse(result.stdout) as { kind: string; checks: unknown[] }
    expect(diagnosis.kind).toBe('degraded')
    expect(diagnosis.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
          id: 'buyer', state: 'fail',
          summary: 'Buyer credential is not safely bound to the configured origin.',
          nextCommand: 'ae account connections',
      }),
    ]))
    expect(requests).toEqual(['/.well-known/ucp'])
  })

  it('returns ready when the buyer can safely continue the market loop', async () => {
    const buyerSecret = 'FAKE_READY_BUYER_SECRET_7351'
    const origin = await startServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        if (request.url === '/.well-known/ucp') {
          respondJson(response, { schemaVersion: 'ae-site-discovery:v2', origin })
        } else if (request.url === '/api/v1/account') {
          respondJson(response, {
            kind: 'authenticated', principalRef: 'prn_buyer', accountRef: 'acc_owner',
            credentialId: 'credential_buyer', applicationRef: 'agentic-economy', environment: 'sandbox',
            scopes: ['market_operations:invoke'], authorityMode: 'bounded_mandate',
          })
        } else if (request.url === '/api/v1/account/balance') {
          respondJson(response, {
            kind: 'available', principalRef: 'prn_buyer', accountRef: 'acc_owner',
            balance: { currency: 'USD', units: '1', exponent: 2 },
            recoveryDue: { currency: 'USD', units: '0', exponent: 2 }, accountState: 'active',
            version: 1, updatedAt: 10,
            funding: { kind: 'owner_browser_required', path: '/owner/credit', anchor: 'fund' },
          })
        } else if (request.url === '/api/v1/operations?limit=100') {
          respondJson(response, { kind: 'available', items: [], hasMore: false })
        } else {
          respondJson(response, { error: 'unexpected' }, 404)
        }
      })
    })
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const result = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual({
      kind: 'ready',
      checks: [
        { id: 'origin', state: 'pass', summary: `Configured origin is ${origin}.` },
        { id: 'server', state: 'pass', summary: 'AE server is reachable and manifest ae-site-discovery:v2 is compatible.' },
        { id: 'buyer', state: 'pass', summary: 'Buyer credential is origin-bound, authenticated, and has market_operations:invoke.' },
        { id: 'balance', state: 'pass', summary: 'Buyer balance is available and the account is active.' },
        { id: 'invocation', state: 'pass', summary: 'No pending or reconciliation-required invocation needs attention.' },
      ],
    })
  })

  it('does not send a bound credential when the server manifest names another origin', async () => {
    const secret = 'FAKE_SERVER_IDENTITY_SECRET_1790'
    const requests: Array<{ path: string; authorization?: string }> = []
    const origin = await startServer((request, response) => {
      requests.push({
        path: request.url ?? '',
        ...(request.headers.authorization === undefined ? {} : { authorization: request.headers.authorization }),
      })
      respondJson(response, {
        schemaVersion: 'ae-site-discovery:v2',
        origin: 'https://different.example.test',
      })
    })
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, secret)

    const result = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })

    expect(result.status).toBe(0)
    expect(result.stdout).not.toContain(secret)
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'degraded',
      checks: expect.arrayContaining([
        expect.objectContaining({
          id: 'server', state: 'fail',
          summary: 'AE server manifest origin does not match the configured origin.',
        }),
      ]),
    })
    expect(requests).toEqual([{ path: '/.well-known/ucp' }])
  })
})

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('doctor_test_server_missing')
  return `http://127.0.0.1:${address.port}`
}

function respondJson(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

function makeConfigDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ae-doctor-'))
  temporaryDirectories.push(directory)
  writeFileSync(join(directory, 'sentinel.txt'), 'unchanged')
  return directory
}

function writeStoredConfig(directory: string, origin: string, buyerSecret: string, supplierSecret?: string): void {
  writeFileSync(join(directory, 'config.json'), JSON.stringify({
    version: 1,
    connections: {
      [origin]: {
        accessToken: buyerSecret,
        tokenType: 'Bearer',
        profile: 'market',
        scope: 'market_operations:invoke',
        connectedAt: '2026-08-30T00:00:00.000Z',
      },
      ...(supplierSecret === undefined ? {} : {
        [`${origin}#supplier`]: {
          accessToken: supplierSecret,
          tokenType: 'Bearer',
          profile: 'supplier',
          scope: 'market_supply:manage',
          connectedAt: '2026-08-30T00:00:00.000Z',
        },
      }),
    },
  }))
}

function supplyOperation(offeringRef: string, live: boolean) {
  return {
    offeringRef, revision: 1, name: offeringRef, summary: 'Operation', catalogStatus: live ? 'published' : 'draft',
    lifecycle: { state: live ? 'active' : 'inactive', reasons: [] },
    readiness: { outcome: live ? 'routeable' : 'not_ready' }, live: { available: live },
    currentStep: live ? 'test' : 'readiness',
    stepStates: { describe: 'completed', admission: 'completed', readiness: live ? 'completed' : 'refused', test: live ? 'completed' : 'not_started' },
  }
}

function supplyConnection(connectionRef: string, available: boolean, lifecycle: 'active' | 'cleanup_required') {
  return {
    connectionRef, businessId: 'business:one', providerRef: 'provider:one', providerAccountRef: 'provider-account:one',
    adapterId: 'x402:v1', grantedScopes: [], grantedResources: [], authorityGeneration: 1,
    authorityDigest: 'sha256:authority', lifecycle, available, credentialConfigured: available,
    observedAt: 10, reasonCode: available ? null : 'cleanup_failed', evidenceRefs: [], createdAt: 1, updatedAt: 10,
  }
}

function cleanEnvironment(directory: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AE_CONFIG_DIR: directory,
    AE_API_KEY: '',
    AE_API_KEY_ORIGIN: '',
    AE_CLI_BASE_URL: '',
    AE_CANONICAL_BASE_URL: '',
  }
}
