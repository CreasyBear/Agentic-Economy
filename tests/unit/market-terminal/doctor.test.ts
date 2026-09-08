import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { listMcpActions, mcpToolName } from '@/modules/actions'
import { spawnCli } from './cli-errors-harness'

// Every case here spawns the real CLI under tsx, which costs roughly a second
// per process before any assertion runs. Under a loaded parallel suite that
// exceeds the 5s default, so allow real wall-clock rather than trimming spawns.
vi.setConfig({ testTimeout: 30_000 })

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
    const humanConfigContinuation = `ae config --base-url ${origin}`
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
        { id: 'call', state: 'warn', summary: 'Call recovery was not checked because server identity is unavailable.' },
      ],
    })
    expect(json.stdout).not.toContain('ae doctor')
    expect(json.stdout).not.toContain('npm run')

    const diagnosis = JSON.parse(json.stdout) as { checks: readonly { id: string; nextCommand?: string }[] }
    const printedContinuation = diagnosis.checks.find((check) => check.id === 'server')?.nextCommand
    expect(printedContinuation).toBe(configContinuation)
    expect(printedContinuation?.match(/--base-url/gu)).toHaveLength(1)

    installAeShim(directory)
    const continued = await runShell(printedContinuation ?? '', {
      ...cleanEnvironment(directory),
      AE_TEST_CLI: resolve('tools/ae/cli.ts'),
      AE_TEST_NODE: process.execPath,
      PATH: `${directory}${delimiter}${process.env.PATH ?? ''}`,
    })
    expect(continued.status).toBe(0)
    expect(continued.stderr).toBe('')
    expect(JSON.parse(continued.stdout)).toMatchObject({
      kind: 'config',
      baseUrl: { origin },
    })

    const human = await spawnCli(['doctor', '--base-url', origin], {
      env: cleanEnvironment(directory),
    })
    expect(human.status).toBe(1)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('✗ AE server is not reachable.')
    expect(human.stdout).toContain(`Next: ${humanConfigContinuation}`)
    expect(human.stdout).not.toContain('Next: ae doctor')
    expect(human.stdout).not.toContain('npm run')
  })

  it('routes an unreachable loopback origin through the installed CLI to hosted AE', async () => {
    const origin = 'http://127.0.0.1:1'
    const hostedDoctorJson = 'ae doctor --base-url https://agentic-economy-phi.vercel.app --json'
    const hostedDoctorHuman = 'ae doctor --base-url https://agentic-economy-phi.vercel.app'
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
        nextCommand: hostedDoctorJson,
      }]),
    })
    expect(json.stdout).not.toContain('npm run')

    const human = await spawnCli(['doctor', '--base-url', origin], {
      env: cleanEnvironment(directory),
    })
    expect(human.status).toBe(1)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain(`Next: ${hostedDoctorHuman}`)
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
        { id: 'buyer', state: 'warn', summary: 'No buyer credential is selected for this origin; anonymous search and describe remain available.', nextCommand: `ae connect --base-url ${origin} --json` },
        { id: 'balance', state: 'warn', summary: 'Balance is unavailable until a buyer credential is connected.' },
        { id: 'call', state: 'warn', summary: 'Call recovery is unavailable until a buyer credential is connected.' },
      ],
    })
    expect(requests).toEqual([{ method: 'GET', path: '/.well-known/ucp' }])
    expect(readFileSync(join(directory, 'sentinel.txt'), 'utf8')).toBe(before)
  })

  it('checks the buyer loop and points an uncertain invocation to status without exposing credentials', async () => {
    const buyerSecret = 'FAKE_BUYER_SECRET_51f8'
    const callRef = 'invocation:v1:needs-attention'
    let callState: 'pending' | 'reconciliation_required' = 'reconciliation_required'
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
            environment: 'sandbox', scopes: ['market_tools:call'], authorityMode: 'spending_policy',
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
        if (request.url === '/api/v1/calls?limit=100') {
          respondJson(response, {
            kind: 'available', hasMore: false,
            items: [{
              callRef, toolRef: 'operation:v1:one', state: callState,
              resultKind: callState, createdAt: 10, updatedAt: 20,
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
        { id: 'buyer', state: 'pass', summary: 'Buyer credential is origin-bound, authenticated, and has market_tools:call.' },
        { id: 'balance', state: 'pass', summary: 'Buyer balance is available and the account is active.' },
        {
          id: 'call', state: 'warn',
          summary: 'A reconciliation-required Call needs attention.',
          nextCommand: `ae status ${callRef} --base-url ${origin} --json`,
        },
        { id: 'market_requests', state: 'pass', summary: 'No private market requests need rechecking.' },
      ],
    })
    expect(observed).toEqual([
      { method: 'GET', path: '/.well-known/ucp' },
      { method: 'GET', path: '/api/v1/account', authorization: `Bearer ${buyerSecret}` },
      { method: 'POST', path: '/api/v1/account/balance', authorization: `Bearer ${buyerSecret}`, body: '{"currency":"AUD"}' },
      { method: 'GET', path: '/api/v1/calls?limit=100', authorization: `Bearer ${buyerSecret}` },
      { method: 'POST', path: '/api/v1/market-requests/list', authorization: `Bearer ${buyerSecret}`, body: '{"limit":5}' },
    ])

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
    expect(human.status).toBe(1)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('AE doctor: degraded')
    expect(human.stdout).toContain('! A reconciliation-required Call needs attention.')
    expect(human.stdout.match(/^Next: /gmu)).toEqual([`Next: `])
    expect(human.stdout).toContain(`Next: ae status ${callRef} --base-url ${origin}`)
    expect(human.stdout).not.toContain(buyerSecret)

    callState = 'pending'
    const pending = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })
    expect(pending.status).toBe(0)
    expect(JSON.parse(pending.stdout)).toMatchObject({
      kind: 'degraded',
      checks: expect.arrayContaining([{
        id: 'call',
        state: 'warn',
        summary: 'A nonterminal Call is still pending.',
        nextCommand: `ae wait ${callRef} --base-url ${origin} --json`,
      }]),
    })
  }, 20_000)

  it('resurfaces a newly matched private market request as one safe re-entry command', async () => {
    const buyerSecret = 'FAKE_REENTRY_BUYER_SECRET_4127'
    const savedQuery = 'translate a deeply private acquisition memo'
    const requestRef = `market-request:v1:${'a'.repeat(64)}`
    const toolRef = `operation:v1:${'b'.repeat(64)}`
    const priorToolRef = `operation:v1:${'d'.repeat(64)}`
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
            scopes: ['market_tools:call'], authorityMode: 'spending_policy',
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
        if (request.url === '/api/v1/calls?limit=100') {
          respondJson(response, {
            kind: 'available', hasMore: false,
            items: [{
              callRef: 'invocation:v1:prior-success', toolRef: priorToolRef,
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
            tools: [{
              toolRef, capabilityId: 'document.translate', title: 'Document translation',
              description: 'Translate one document.', provider: { name: 'Reference Services', slug: 'reference' },
              priceLabel: 'USD 0.50', healthStatus: 'operational',
            }],
          })
          return
        }
        if (request.url === '/api/v1/market-tools/describe') {
          respondJson(response, {
            kind: 'found', schemaVersion: 'registry-tools:v2', tool: currentTool(priorToolRef),
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
        summary: '1 of 1 recent private market request now has matching Tools.',
        nextCommand: `ae describe ${toolRef} --base-url ${origin} --json`,
      }), expect.objectContaining({
        id: 'repeat_use', state: 'pass',
        nextCommand: `ae describe ${priorToolRef} --base-url ${origin} --json`,
      })]),
    })

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
    expect(human.status).toBe(0)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('AE doctor: ready')
    expect(human.stdout).toContain('✓ 1 of 1 recent private market request now has matching Tools.')
    expect(human.stdout.match(/^Next: /gmu)).toEqual(['Next: '])
    expect(human.stdout).toContain(`Next: ae describe ${toolRef} --base-url ${origin}`)
    expect(human.stdout).not.toContain(savedQuery)
    expect(human.stdout).not.toContain(requestRef)
    expect(statusBodies).toEqual([{ requestRef }, { requestRef }])
  }, 20_000)

  it('recalls the newest successful current Tool without replaying private Call material', async () => {
    const buyerSecret = 'FAKE_REPEAT_BUYER_SECRET_8182'
    const callRef = 'invocation:v1:private-repeat-receipt'
    const evidenceHash = 'sha256:private-repeat-evidence'
    const toolRef = `operation:v1:${'c'.repeat(64)}`
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
            scopes: ['market_tools:call'], authorityMode: 'spending_policy',
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
        if (request.url === '/api/v1/calls?limit=100') {
          respondJson(response, {
            kind: 'available', hasMore: false,
            items: [{
              callRef, toolRef, state: 'completed', resultKind: 'completed',
              receiptRef: 'receipt:v1:private-repeat', evidenceHash, createdAt: 10, updatedAt: 20,
            }],
          })
          return
        }
        if (request.url === '/api/v1/market-requests/list') {
          respondJson(response, { kind: 'available', items: [], hasMore: false })
          return
        }
        if (request.url === '/api/v1/market-tools/describe') {
          detailRequests.push({
            ...(request.headers.authorization === undefined ? {} : { authorization: request.headers.authorization }),
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          })
          respondJson(response, current
            ? { kind: 'found', schemaVersion: 'registry-tools:v2', tool: currentTool(toolRef) }
            : { kind: 'not_found', schemaVersion: 'registry-tools:v2', toolRef })
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
    expect(json.stdout).not.toContain(callRef)
    expect(json.stdout).not.toContain(evidenceHash)
    expect(detailRequests).toEqual([{ body: { toolRef } }])
    expect(JSON.parse(json.stdout)).toMatchObject({
      kind: 'ready',
      checks: expect.arrayContaining([{
        id: 'repeat_use', state: 'pass',
        summary: 'A previously successful Tool is still in the current catalog.',
        nextCommand: `ae describe ${toolRef} --base-url ${origin} --json`,
      }]),
    })

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
    expect(human.status).toBe(0)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('✓ A previously successful Tool is still in the current catalog.')
    expect(human.stdout.match(/^Next: /gmu)).toEqual(['Next: '])
    expect(human.stdout).toContain(`Next: ae describe ${toolRef} --base-url ${origin}`)
    expect(human.stdout).not.toContain(callRef)
    expect(human.stdout).not.toContain(evidenceHash)

    current = false
    const retired = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })
    expect(retired.status).toBe(0)
    expect(JSON.parse(retired.stdout)).toMatchObject({ kind: 'ready' })
    expect(JSON.parse(retired.stdout).checks).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'repeat_use' }),
    ]))
    expect(detailRequests).toEqual([
      { body: { toolRef } },
      { body: { toolRef } },
      { body: { toolRef } },
    ])
  }, 20_000)

  it('summarizes provider Tool and connection readiness for one requested business', async () => {
    const buyerSecret = 'FAKE_BUYER_SECRET_1872'
    const providerSecret = 'FAKE_PROVIDER_SECRET_8431'
    const providerRequests: Array<{ path: string; body: unknown }> = []
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
          const provider = authorization === `Bearer ${providerSecret}`
          respondJson(response, {
            kind: 'authenticated', principalRef: provider ? 'prn_provider' : 'prn_buyer', accountRef: 'acc_owner',
            credentialId: provider ? 'credential_provider' : 'credential_buyer', applicationRef: 'agentic-economy',
            environment: 'sandbox', scopes: [provider ? 'market_supply:manage' : 'market_tools:call'],
            authorityMode: 'spending_policy',
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
        if (request.url === '/api/v1/calls?limit=100') {
          respondJson(response, { kind: 'available', items: [], hasMore: false })
          return
        }
        if (request.url === '/api/v1/market-requests/list') {
          respondJson(response, { kind: 'available', items: [], hasMore: false })
          return
        }
        if (request.url === '/api/v1/supply/tools/list') {
          providerRequests.push({ path: request.url, body: JSON.parse(bodyText) })
          respondJson(response, {
            kind: 'available', schemaVersion: 'provider_tools:v1', businessRef: 'business:one', isDone: true, continueCursor: null,
            page: [
              supplyOperation('offering:live', true),
              supplyOperation('offering:unready', false),
            ],
          })
          return
        }
        if (request.url === '/api/v1/supply/connections/list') {
          providerRequests.push({ path: request.url, body: JSON.parse(bodyText) })
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
    writeStoredConfig(directory, origin, buyerSecret, providerSecret)

    const result = await spawnCli(['doctor', 'business:one', '--provider', '--base-url', origin, '--json'], {
      env: cleanEnvironment(directory),
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).not.toContain(buyerSecret)
    expect(result.stdout).not.toContain(providerSecret)
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
        { id: 'call', state: 'pass' },
        { id: 'market_requests', state: 'pass', summary: 'No private market requests need rechecking.' },
        { id: 'provider', state: 'pass', summary: 'Provider credential is origin-bound, authenticated, and has market_supply:manage.' },
        {
          id: 'provider.readiness', state: 'warn',
          summary: 'Provider business has 2 Tools (1 live, 1 unready) and 2 provider connections (1 ready, 1 needing attention).',
          nextCommand: `ae supply tools business:one --base-url ${origin} --json`,
        },
      ],
    })
    expect(providerRequests.toSorted((left, right) => left.path.localeCompare(right.path))).toEqual([
      { path: '/api/v1/supply/connections/list', body: { businessId: 'business:one', limit: 100 } },
      { path: '/api/v1/supply/tools/list', body: { businessRef: 'business:one', limit: 100 } },
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
          nextCommand: `ae connect --base-url ${origin} --json`,
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
            scopes: ['market_tools:call'], authorityMode: 'spending_policy',
          })
        } else if (request.url === '/api/v1/account/balance') {
          respondJson(response, {
            kind: 'available', principalRef: 'prn_buyer', accountRef: 'acc_owner',
            balance: { currency: 'AUD', units: '10000', exponent: 6 }, accountState: 'active',
            version: 1, updatedAt: 10,
            funding: { kind: 'agent_funding_handoff', configAction: 'funding.handoff.config', createAction: 'funding.handoff.create', statusAction: 'funding.handoff.status' },
          })
        } else if (request.url === '/api/v1/calls?limit=100') {
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
        { id: 'buyer', state: 'pass', summary: 'Buyer credential is origin-bound, authenticated, and has market_tools:call.' },
        { id: 'balance', state: 'pass', summary: 'Buyer balance is available and the account is active.' },
        { id: 'call', state: 'pass', summary: 'No pending or reconciliation-required Call needs attention.' },
        { id: 'market_requests', state: 'pass', summary: 'No private market requests need rechecking.' },
      ],
    })

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
    expect(human.status).toBe(0)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('AE doctor: ready')
    expect(human.stdout).toContain('✓ No pending or reconciliation-required Call needs attention.')
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
          summary: 'No buyer credential is selected for this origin; anonymous search and describe remain available.',
          nextCommand: `ae connect --base-url ${origin} --json`,
        },
        { id: 'balance', state: 'warn', summary: 'Balance is unavailable until a buyer credential is connected.' },
        { id: 'call', state: 'warn', summary: 'Call recovery is unavailable until a buyer credential is connected.' },
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

function installAeShim(directory: string): void {
  writeFileSync(join(directory, 'ae'), '#!/bin/sh\nexec "$AE_TEST_NODE" --import tsx "$AE_TEST_CLI" "$@"\n', { mode: 0o755 })
}

async function runShell(command: string, environment: NodeJS.ProcessEnv): Promise<ProcessResult> {
  const { promise, resolve: resolveResult, reject } = Promise.withResolvers<ProcessResult>()
  const child = spawn('/bin/sh', ['-c', command], {
    cwd: process.cwd(),
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
  child.once('error', reject)
  child.once('close', (status) => resolveResult({
    status,
    stderr: Buffer.concat(stderr).toString('utf8'),
    stdout: Buffer.concat(stdout).toString('utf8'),
  }))
  return promise
}

type ProcessResult = Readonly<{
  status: number | null
  stderr: string
  stdout: string
}>

function writeStoredConfig(directory: string, origin: string, buyerSecret: string, providerSecret?: string): void {
  writeFileSync(join(directory, 'config.json'), JSON.stringify({
    version: 1,
    connections: {
      [origin]: {
        accessToken: buyerSecret,
        tokenType: 'Bearer',
        profile: 'market',
        scope: 'market_tools:call',
        connectedAt: '2026-08-30T00:00:00.000Z',
      },
      ...(providerSecret === undefined ? {} : {
        [`${origin}#provider`]: {
          accessToken: providerSecret,
          tokenType: 'Bearer',
          profile: 'provider',
          scope: 'market_supply:manage',
          connectedAt: '2026-08-30T00:00:00.000Z',
        },
      }),
    },
  }))
}

function supplyOperation(offeringRef: string, live: boolean) {
  return {
    schemaVersion: 'provider_tools:v1',
    businessRef: 'business:one',
    providerRef: 'provider:one',
    toolRef: offeringRef,
    revision: 1,
    state: live ? 'Published' : 'Action required',
    reasonCodes: live ? [] : ['health_unhealthy'],
    observedAt: 10,
    source: { kind: 'openapi' },
    routeability: { available: live, reasonCodes: live ? [] : ['health_unhealthy'] },
    authority: { kind: 'public' },
    health: {
      connection: 'not_required',
      validation: live ? 'passed' : 'failed',
      publication: 'published',
      freshness: live ? 'current' : 'failed',
      delivery: { kind: 'unobserved', provenance: 'canonical_call_receipts' },
      usefulOutcome: { kind: 'unobserved', provenance: 'qualified_use_receipts' },
      operationalConditions: live ? [] : ['health_unhealthy'],
    },
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

function currentTool(toolRef: string) {
  return {
    toolRef,
    capabilityId: 'reference.lookup',
    title: 'Reference lookup',
    description: 'Current reference lookup',
    provider: { slug: 'reference', name: 'Reference Services' },
    priceLabel: 'USD 0.00',
    healthStatus: 'operational',
    inputJsonSchema: { type: 'object' },
    outputJsonSchema: { type: 'object' },
    materialTerms: [],
    dataUse: [],
    effects: [],
    evidence: [],
    authentication: { kind: 'ae_api_key' },
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
