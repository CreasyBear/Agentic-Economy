import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { listMcpActions, mcpToolName } from '@/modules/actions'
import { spawnCli } from './cli-errors-harness'

const temporaryDirectories: string[] = []
const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => await new Promise<void>((resolve) => server.close(() => resolve()))))
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('ae doctor', () => {
  it('routes an unreachable remote origin to configuration truth instead of doctor recursion', async () => {
    const origin = 'https://ae-unreachable.invalid'
    const configContinuation = `ae config --base-url ${origin} --json`
    const directory = makeConfigDirectory()

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], {
      env: cleanEnvironment(directory),
    })

    expect(json.status).toBe(0)
    expect(json.stderr).toBe('')
    expect(JSON.parse(json.stdout)).toEqual({
      kind: 'degraded',
      checks: [
        { id: 'origin', state: 'pass', summary: `Configured origin is ${origin}.` },
        {
          id: 'server', state: 'fail', summary: 'AE server is not reachable.',
          nextCommand: configContinuation,
        },
        { id: 'mcp', state: 'warn', summary: 'MCP initialization was not checked because server identity is unavailable.' },
        { id: 'buyer', state: 'warn', summary: 'Buyer credential was not sent because server identity is unavailable.' },
        { id: 'balance', state: 'warn', summary: 'Balance was not checked because server identity is unavailable.' },
        { id: 'invocation', state: 'warn', summary: 'Invocation recovery was not checked because server identity is unavailable.' },
      ],
    })
    expect(json.stdout).not.toContain('ae doctor')
    expect(json.stdout).not.toContain('npm run')

    const human = await spawnCli(['doctor', '--base-url', origin], {
      env: cleanEnvironment(directory),
    })
    expect(human.status).toBe(1)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('✗ AE server is not reachable.')
    expect(human.stdout).toContain(`Next: ${configContinuation}`)
    expect(human.stdout).not.toContain('Next: ae doctor')
    expect(human.stdout).not.toContain('npm run')
  })

  it('routes an unreachable loopback origin through the installed CLI to hosted AE', async () => {
    const origin = 'http://127.0.0.1:1'
    const hostedDoctor = 'ae doctor --base-url https://agentic-economy-phi.vercel.app'
    const directory = makeConfigDirectory()

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], {
      env: cleanEnvironment(directory),
    })

    expect(json.status).toBe(0)
    expect(json.stderr).toBe('')
    expect(JSON.parse(json.stdout)).toMatchObject({
      kind: 'degraded',
      checks: expect.arrayContaining([{
        id: 'server', state: 'fail', summary: 'AE server is not reachable.',
        nextCommand: hostedDoctor,
      }]),
    })
    expect(json.stdout).not.toContain('npm run')

    const human = await spawnCli(['doctor', '--base-url', origin], {
      env: cleanEnvironment(directory),
    })
    expect(human.status).toBe(1)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain(`Next: ${hostedDoctor}`)
    expect(human.stdout).not.toContain('npm run')
  })

  it('returns one degraded diagnosis and inspects connections before authorizing a new identity', async () => {
    const requests: Array<{ method: string; path: string }> = []
    const origin = await startServer((request, response) => {
      if (respondHealthyDeployment(request, response)) return
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
        { id: 'mcp', state: 'pass', summary: 'MCP initialization and 4 public tools passed.' },
        { id: 'readiness', state: 'pass', summary: 'Server operational readiness passed.' },
        { id: 'release', state: 'pass', summary: `Release identity is ${'a'.repeat(40)}.` },
        { id: 'buyer', state: 'warn', summary: 'No buyer credential is selected for this origin; anonymous search and inspection remain available.', nextCommand: `ae connect --base-url ${origin}` },
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
      if (respondHealthyDeployment(request, response)) return
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
            balance: { currency: 'AUD', units: '25000000', exponent: 6 },
            accountState: 'active', version: 1, updatedAt: 10,
            funding: { kind: 'agent_funding_handoff', configAction: 'funding.handoff.config', createAction: 'funding.handoff.create', statusAction: 'funding.handoff.status' },
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
        if (request.url === '/api/v1/market-requests/list') {
          respondJson(response, { kind: 'available', items: [], hasMore: false })
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
        { id: 'mcp', state: 'pass', summary: 'MCP initialization and 4 public tools passed.' },
        { id: 'readiness', state: 'pass', summary: 'Server operational readiness passed.' },
        { id: 'release', state: 'pass', summary: `Release identity is ${'a'.repeat(40)}.` },
        { id: 'buyer', state: 'pass', summary: 'Buyer credential is origin-bound, authenticated, and has market_operations:invoke.' },
        { id: 'balance', state: 'pass', summary: 'Buyer balance is available and the account is active.' },
        {
          id: 'invocation', state: 'warn',
          summary: 'A reconciliation-required invocation needs attention.',
          nextCommand: `ae status ${invocationRef}`,
        },
        { id: 'market_requests', state: 'pass', summary: 'No private market requests need rechecking.' },
      ],
    })
    expect(observed).toEqual([
      { method: 'GET', path: '/.well-known/ucp' },
      { method: 'GET', path: '/api/v1/account', authorization: `Bearer ${buyerSecret}` },
      { method: 'POST', path: '/api/v1/account/balance', authorization: `Bearer ${buyerSecret}`, body: '{"currency":"AUD"}' },
      { method: 'GET', path: '/api/v1/operations?limit=100', authorization: `Bearer ${buyerSecret}` },
      { method: 'POST', path: '/api/v1/market-requests/list', authorization: `Bearer ${buyerSecret}`, body: '{"limit":5}' },
    ])

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
    expect(human.status).toBe(1)
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
  }, 20_000)

  it('resurfaces a newly matched private market request as one safe re-entry command', async () => {
    const buyerSecret = 'FAKE_REENTRY_BUYER_SECRET_4127'
    const savedQuery = 'translate a deeply private acquisition memo'
    const requestRef = `market-request:v1:${'a'.repeat(64)}`
    const operationRef = `operation:v1:${'b'.repeat(64)}`
    const priorOperationRef = `operation:v1:${'d'.repeat(64)}`
    const statusBodies: unknown[] = []
    const origin = await startServer((request, response) => {
      if (respondHealthyDeployment(request, response)) return
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        if (request.url === '/.well-known/ucp') {
          respondJson(response, { schemaVersion: 'ae-site-discovery:v2', origin })
          return
        }
        if (request.url === '/api/v1/account') {
          respondJson(response, {
            kind: 'authenticated', principalRef: 'prn_buyer', accountRef: 'acc_owner',
            credentialId: 'credential_buyer', applicationRef: 'agentic-economy', environment: 'sandbox',
            scopes: ['market_operations:invoke'], authorityMode: 'bounded_mandate',
          })
          return
        }
        if (request.url === '/api/v1/account/balance') {
          respondJson(response, {
            kind: 'available', principalRef: 'prn_buyer', accountRef: 'acc_owner',
            balance: { currency: 'AUD', units: '25000000', exponent: 6 }, accountState: 'active',
            version: 1, updatedAt: 10,
            funding: { kind: 'agent_funding_handoff', configAction: 'funding.handoff.config', createAction: 'funding.handoff.create', statusAction: 'funding.handoff.status' },
          })
          return
        }
        if (request.url === '/api/v1/operations?limit=100') {
          respondJson(response, {
            kind: 'available', hasMore: false,
            items: [{
              invocationRef: 'invocation:v1:prior-success', operationRef: priorOperationRef,
              state: 'completed', resultKind: 'completed', createdAt: 1, updatedAt: 2,
            }],
          })
          return
        }
        if (request.url === '/api/v1/market-requests/list') {
          respondJson(response, {
            kind: 'available', hasMore: false,
            items: [{ requestRef, query: savedQuery, createdAt: 10, updatedAt: 10 }],
          })
          return
        }
        if (request.url === '/api/v1/market-requests/status') {
          statusBodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          respondJson(response, {
            kind: 'matched', requestRef, query: savedQuery, createdAt: 10, matchedCount: 1,
            operations: [{
              operationRef, capabilityId: 'document.translate', title: 'Document translation',
              summary: 'Translate one document.', supplier: { name: 'Reference Services', slug: 'reference' },
              price: { kind: 'fixed', amount: { currency: 'USD', units: '50', exponent: 2 } },
              authentication: { kind: 'ae_api_key' }, availability: { posture: 'setup_required' }, navigation: [],
            }],
          })
          return
        }
        if (request.url === '/api/v1/market-operations/detail') {
          respondJson(response, {
            kind: 'found', schemaVersion: 'registry-operations:v1', operation: currentOperation(priorOperationRef),
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
    expect(json.stdout).not.toContain(savedQuery)
    expect(json.stdout).not.toContain(requestRef)
    expect(JSON.parse(json.stdout)).toMatchObject({
      kind: 'ready',
      checks: expect.arrayContaining([expect.objectContaining({
        id: 'market_requests', state: 'pass',
        summary: '1 of 1 recent private market request now has matching Operations.',
        nextCommand: `ae inspect ${operationRef}`,
      }), expect.objectContaining({
        id: 'repeat_use', state: 'pass',
        nextCommand: `ae inspect ${priorOperationRef}`,
      })]),
    })

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
    expect(human.status).toBe(0)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('AE doctor: ready')
    expect(human.stdout).toContain('✓ 1 of 1 recent private market request now has matching Operations.')
    expect(human.stdout.match(/^Next: /gmu)).toEqual(['Next: '])
    expect(human.stdout).toContain(`Next: ae inspect ${operationRef}`)
    expect(human.stdout).not.toContain(savedQuery)
    expect(human.stdout).not.toContain(requestRef)
    expect(statusBodies).toEqual([{ requestRef }, { requestRef }])
  }, 20_000)

  it('recalls the newest successful current Operation without replaying private invocation material', async () => {
    const buyerSecret = 'FAKE_REPEAT_BUYER_SECRET_8182'
    const invocationRef = 'invocation:v1:private-repeat-receipt'
    const evidenceHash = 'sha256:private-repeat-evidence'
    const operationRef = `operation:v1:${'c'.repeat(64)}`
    const detailRequests: Array<{ authorization?: string; body: unknown }> = []
    let current = true
    const origin = await startServer((request, response) => {
      if (respondHealthyDeployment(request, response)) return
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        if (request.url === '/.well-known/ucp') {
          respondJson(response, { schemaVersion: 'ae-site-discovery:v2', origin })
          return
        }
        if (request.url === '/api/v1/account') {
          respondJson(response, {
            kind: 'authenticated', principalRef: 'prn_buyer', accountRef: 'acc_owner',
            credentialId: 'credential_buyer', applicationRef: 'agentic-economy', environment: 'sandbox',
            scopes: ['market_operations:invoke'], authorityMode: 'bounded_mandate',
          })
          return
        }
        if (request.url === '/api/v1/account/balance') {
          respondJson(response, {
            kind: 'available', principalRef: 'prn_buyer', accountRef: 'acc_owner',
            balance: { currency: 'AUD', units: '25000000', exponent: 6 }, accountState: 'active',
            version: 1, updatedAt: 10,
            funding: { kind: 'agent_funding_handoff', configAction: 'funding.handoff.config', createAction: 'funding.handoff.create', statusAction: 'funding.handoff.status' },
          })
          return
        }
        if (request.url === '/api/v1/operations?limit=100') {
          respondJson(response, {
            kind: 'available', hasMore: false,
            items: [{
              invocationRef, operationRef, state: 'completed', resultKind: 'completed',
              receiptRef: 'receipt:v1:private-repeat', evidenceHash, createdAt: 10, updatedAt: 20,
            }],
          })
          return
        }
        if (request.url === '/api/v1/market-requests/list') {
          respondJson(response, { kind: 'available', items: [], hasMore: false })
          return
        }
        if (request.url === '/api/v1/market-operations/detail') {
          detailRequests.push({
            ...(request.headers.authorization === undefined ? {} : { authorization: request.headers.authorization }),
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          })
          respondJson(response, current
            ? { kind: 'found', schemaVersion: 'registry-operations:v1', operation: currentOperation(operationRef) }
            : { kind: 'not_found', schemaVersion: 'registry-operations:v1', operationRef, navigation: [] })
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
    expect(json.stdout).not.toContain(invocationRef)
    expect(json.stdout).not.toContain(evidenceHash)
    expect(detailRequests).toEqual([{ body: { operationRef } }])
    expect(JSON.parse(json.stdout)).toMatchObject({
      kind: 'ready',
      checks: expect.arrayContaining([{
        id: 'repeat_use', state: 'pass',
        summary: 'A previously successful Operation is still current and ready to inspect.',
        nextCommand: `ae inspect ${operationRef}`,
      }]),
    })

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
    expect(human.status).toBe(0)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('✓ A previously successful Operation is still current and ready to inspect.')
    expect(human.stdout.match(/^Next: /gmu)).toEqual(['Next: '])
    expect(human.stdout).toContain(`Next: ae inspect ${operationRef}`)
    expect(human.stdout).not.toContain(invocationRef)
    expect(human.stdout).not.toContain(evidenceHash)

    current = false
    const retired = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })
    expect(retired.status).toBe(0)
    expect(JSON.parse(retired.stdout)).toMatchObject({ kind: 'ready' })
    expect(JSON.parse(retired.stdout).checks).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'repeat_use' }),
    ]))
    expect(detailRequests).toEqual([
      { body: { operationRef } },
      { body: { operationRef } },
      { body: { operationRef } },
    ])
  }, 20_000)

  it('summarizes supplier Operation and connection readiness for one requested business', async () => {
    const buyerSecret = 'FAKE_BUYER_SECRET_1872'
    const supplierSecret = 'FAKE_SUPPLIER_SECRET_8431'
    const supplierRequests: Array<{ path: string; body: unknown }> = []
    const origin = await startServer((request, response) => {
      if (respondHealthyDeployment(request, response)) return
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
            balance: { currency: 'AUD', units: '25000000', exponent: 6 },
            accountState: 'active', version: 1, updatedAt: 10,
            funding: { kind: 'agent_funding_handoff', configAction: 'funding.handoff.config', createAction: 'funding.handoff.create', statusAction: 'funding.handoff.status' },
          })
          return
        }
        if (request.url === '/api/v1/operations?limit=100') {
          respondJson(response, { kind: 'available', items: [], hasMore: false })
          return
        }
        if (request.url === '/api/v1/market-requests/list') {
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
        { id: 'mcp', state: 'pass' },
        { id: 'readiness', state: 'pass' },
        { id: 'release', state: 'pass' },
        { id: 'buyer', state: 'pass' },
        { id: 'balance', state: 'pass' },
        { id: 'invocation', state: 'pass' },
        { id: 'market_requests', state: 'pass', summary: 'No private market requests need rechecking.' },
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
      if (respondHealthyDeployment(request, response)) return
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
          nextCommand: `ae connect --base-url ${origin}`,
      }),
    ]))
    expect(requests).toEqual(['/.well-known/ucp'])

    const human = await spawnCli(['doctor', '--base-url', origin], {
      env: {
        ...cleanEnvironment(directory),
        AE_API_KEY: secret,
        AE_API_KEY_ORIGIN: 'https://private.example.test/credential?token=hidden',
      },
    })
    expect(human.status).toBe(1)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('AE doctor: degraded')
    expect(human.stdout).toContain('✗ Buyer credential is not safely bound to the configured origin.')
    expect(human.stdout).not.toContain(secret)
    expect(human.stdout).not.toContain('private.example.test')
  })

  it('returns ready when the buyer can safely continue the market loop', async () => {
    const buyerSecret = 'FAKE_READY_BUYER_SECRET_7351'
    const origin = await startServer((request, response) => {
      if (respondHealthyDeployment(request, response)) return
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
            balance: { currency: 'AUD', units: '10000', exponent: 6 }, accountState: 'active',
            version: 1, updatedAt: 10,
            funding: { kind: 'agent_funding_handoff', configAction: 'funding.handoff.config', createAction: 'funding.handoff.create', statusAction: 'funding.handoff.status' },
          })
        } else if (request.url === '/api/v1/operations?limit=100') {
          respondJson(response, { kind: 'available', items: [], hasMore: false })
        } else if (request.url === '/api/v1/market-requests/list') {
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
        { id: 'mcp', state: 'pass', summary: 'MCP initialization and 4 public tools passed.' },
        { id: 'readiness', state: 'pass', summary: 'Server operational readiness passed.' },
        { id: 'release', state: 'pass', summary: `Release identity is ${'a'.repeat(40)}.` },
        { id: 'buyer', state: 'pass', summary: 'Buyer credential is origin-bound, authenticated, and has market_operations:invoke.' },
        { id: 'balance', state: 'pass', summary: 'Buyer balance is available and the account is active.' },
        { id: 'invocation', state: 'pass', summary: 'No pending or reconciliation-required invocation needs attention.' },
        { id: 'market_requests', state: 'pass', summary: 'No private market requests need rechecking.' },
      ],
    })

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
    expect(human.status).toBe(0)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('AE doctor: ready')
    expect(human.stdout).toContain('✓ No pending or reconciliation-required invocation needs attention.')
    expect(human.stdout).not.toContain(buyerSecret)
  })

  it('does not send a bound credential when the server manifest names another origin', async () => {
    const secret = 'FAKE_SERVER_IDENTITY_SECRET_1790'
    const requests: Array<{ path: string; authorization?: string }> = []
    const origin = await startServer((request, response) => {
      if (respondHealthyDeployment(request, response)) return
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

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
    expect(human.status).toBe(1)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('AE doctor: degraded')
    expect(human.stdout).toContain('✗ AE server manifest origin does not match the configured origin.')
    expect(human.stdout).not.toContain(secret)
  })

  it('reports manifest compatibility separately from failed operational readiness and release identity', async () => {
    const secret = 'FAKE_DIAGNOSTIC_SECRET_6712'
    const origin = await startServer((request, response) => {
      if (request.url === '/mcp' && respondHealthyDeployment(request, response)) return
      if (request.url === '/.well-known/ucp') {
        respondJson(response, { schemaVersion: 'ae-site-discovery:v2', origin })
        return
      }
      if (request.url === '/api/ready') {
        respondJson(response, {
          kind: 'UNAVAILABLE',
          code: 'server_not_ready',
          checks: {
            config: { status: 'failed', code: 'deployment_manifest_invalid' },
            convex: { status: 'failed', code: 'convex_probe_skipped' },
          },
          diagnostics: { configured: [{ name: 'AE_SECRET', configured: false }] },
        }, 503)
        return
      }
      if (request.url === '/api/v1/release') {
        respondJson(response, { kind: 'unavailable', reason: 'source_revision_unconfigured' }, 503)
        return
      }
      respondJson(response, { error: 'unexpected', secret }, 404)
    })
    const directory = makeConfigDirectory()

    const result = await spawnCli(['doctor', '--base-url', origin, '--json'], {
      env: cleanEnvironment(directory),
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toContain(secret)
    expect(JSON.parse(result.stdout)).toEqual({
      kind: 'degraded',
      checks: [
        { id: 'origin', state: 'pass', summary: `Configured origin is ${origin}.` },
        { id: 'server', state: 'pass', summary: 'AE server is reachable and manifest ae-site-discovery:v2 is compatible.' },
        { id: 'mcp', state: 'pass', summary: 'MCP initialization and 4 public tools passed.' },
        {
          id: 'readiness', state: 'fail',
          summary: 'Server is reachable but operational readiness failed (deployment_manifest_invalid). The service operator must restore operational readiness before calls proceed; the caller should not continue or retry.',
        },
        {
          id: 'release', state: 'fail',
          summary: 'Release identity is unavailable (source_revision_unconfigured). The service operator must configure a valid release identity before calls proceed; the caller should not continue or retry.',
        },
        {
          id: 'buyer', state: 'warn',
          summary: 'No buyer credential is selected for this origin; anonymous search and inspection remain available.',
          nextCommand: `ae connect --base-url ${origin}`,
        },
        { id: 'balance', state: 'warn', summary: 'Balance is unavailable until a buyer credential is connected.' },
        { id: 'invocation', state: 'warn', summary: 'Invocation recovery is unavailable until a buyer credential is connected.' },
      ],
    })

    const human = await spawnCli(['doctor', '--base-url', origin], {
      env: cleanEnvironment(directory),
    })
    expect(human.status).toBe(1)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('✗ Server is reachable but operational readiness failed (deployment_manifest_invalid). The service operator must restore operational readiness before calls proceed; the caller should not continue or retry.')
    expect(human.stdout).toContain('✗ Release identity is unavailable (source_revision_unconfigured). The service operator must configure a valid release identity before calls proceed; the caller should not continue or retry.')
    expect(human.stdout).not.toContain('Next: ae connect')
    expect(human.stdout).not.toContain(secret)
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

function respondHealthyDeployment(request: IncomingMessage, response: ServerResponse): boolean {
  if (request.url === '/mcp' && request.method === 'GET') {
    response.writeHead(405)
    response.end()
    return true
  }
  if (request.url === '/mcp' && request.method === 'POST') {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const message = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        id?: string | number
        method?: string
        params?: { protocolVersion?: string }
      }
      if (message.method === 'notifications/initialized') {
        response.writeHead(202)
        response.end()
        return
      }
      if (message.method === 'initialize') {
        respondJson(response, {
          jsonrpc: '2.0', id: message.id,
          result: {
            protocolVersion: message.params?.protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: 'ae-doctor-test', version: '1.0.0' },
          },
        })
        return
      }
      if (message.method === 'tools/list') {
        respondJson(response, {
          jsonrpc: '2.0', id: message.id,
          result: {
            tools: listMcpActions()
              .filter((action) => action.readOnly && action.credentialAdmission === undefined)
              .map((action) => ({
                name: mcpToolName(action),
                inputSchema: { type: 'object', additionalProperties: true },
              })),
          },
        })
        return
      }
      respondJson(response, {
        jsonrpc: '2.0', id: message.id,
        error: { code: -32601, message: 'Method not found' },
      })
    })
    return true
  }
  if (request.url === '/api/ready') {
    respondJson(response, { status: 'ready', checks: { config: 'ready', convex: 'ready' }, diagnostics: {} })
    return true
  }
  if (request.url === '/api/v1/release') {
    respondJson(response, { kind: 'ok', sourceRevision: 'a'.repeat(40) })
    return true
  }
  return false
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

function currentOperation(operationRef: string) {
  return {
    operationRef,
    callVia: '/api/v1/operations/call',
    paymentLane: 'brokered',
    operationId: 'reference.lookup',
    contract: {
      capabilityId: 'reference.lookup', version: 1,
      inputJsonSchema: { type: 'object' }, outputJsonSchema: { type: 'object' }, customerAnnotations: [],
    },
    business: { businessId: 'business:reference', slug: 'reference', name: 'Reference Services' },
    offering: { offeringRef: 'offering:reference', revision: 1, label: 'Reference lookup', summary: 'Current reference lookup' },
    summary: 'Current reference lookup',
    commercial: {
      price: { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 2 } },
      materialTerms: [], relationship: { kind: 'none', summary: 'No commercial relationship.' },
    },
    dataUse: [], effects: [], evidence: [], cancellation: { kind: 'unsupported' },
    recovery: { idempotency: 'required', recovery: 'retry_safe' },
    authentication: { kind: 'ae_api_key' },
    transport: {
      method: 'GET', pathTemplate: '/lookup', responseStatus: 200,
      responseContentType: 'application/json', requestTimeoutMs: 5_000,
    },
    provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
    availability: { posture: 'setup_required' }, navigation: [],
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
