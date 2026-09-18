import { delimiter } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TOOL_MARKET_SEARCH_PATH } from '@/modules/common/market-tool-paths'
import { TOOL_QUOTE_PATH } from '@/modules/capability-execution/quote'
import { STRIPE_MONEY_ENV_NAMES } from '@/lib/server/stripe-money-provider-config'
import { X402_CUSTODY_ENV_NAMES } from '@/modules/capability-supply/server'
import { checkFunding } from '../../../tools/ae/commands/doctor'
import {
  assertCliSuccess,
  balancePassCheck,
  buyerPassCheck,
  CLI_BUNDLE_PATH,
  cleanEnvironment,
  committedQuote,
  currentTool,
  discoveryPassChecks,
  emptySearchResult,
  FRESH_CATALOGUE_CHECK,
  fundingPassCheck,
  hostedConnectCommand,
  installAeShim,
  LOCAL_DEV_COMMAND,
  SANDBOX_TOOL_REF,
  SANDBOX_TOOL_SLUG,
  LOCAL_STRIPE_TEST_MODE_DOC,
  localConnectCommand,
  LOOPBACK_DOCTOR_COMMAND,
  LOOPBACK_NO_SANDBOX_TOOL_REASON,
  makeConfigDirectory,
  marketRequestsPassCheck,
  originPassCheck,
  parseDoctorJson,
  providerAccountResponse,
  readSentinel,
  readyBuyerDiagnosisChecks,
  refusedQuote,
  respondHealthyDeployment,
  respondJson,
  runDoctor,
  runShell,
  skippedQuoteCheck,
  startBuyerServer,
  startQuoteServer,
  startServer,
  teardownDoctorHarness,
  TIER0_MISSING_NAMES,
  TIER1_RESULT,
  tier0Environment,
  TIER1_ENV,
  unconnectedBuyerChecks,
  unconnectedQuoteCheck,
  writeStoredConfig,
} from './doctor-test-harness'

vi.setConfig({ testTimeout: 30_000 })

afterEach(teardownDoctorHarness)

const loopbackSkippedQuote = () => skippedQuoteCheck(LOOPBACK_NO_SANDBOX_TOOL_REASON, LOOPBACK_DOCTOR_COMMAND, 'loopback_readiness_unprovable')

describe('ae doctor', () => {
  it('routes an unreachable remote origin to configuration truth instead of doctor recursion', async () => {
    const origin = 'https://ae-unreachable.invalid'
    const configContinuation = `ae config --base-url ${origin} --json`
    const directory = makeConfigDirectory()

    const json = await runDoctor(directory, origin)
    assertCliSuccess(json)
    expect(JSON.parse(json.stdout)).toEqual({
      kind: 'degraded',
      tier: TIER1_RESULT,
      groups: { discovery: 'fail', quoting: 'warn', purchase: 'warn' },
      checks: [
        originPassCheck(origin),
        { id: 'server', group: 'discovery', state: 'fail', summary: 'AE server is not reachable.', nextCommand: configContinuation },
        { id: 'mcp', group: 'discovery', state: 'warn', summary: 'MCP initialization was not checked because server identity is unavailable.' },
        { id: 'buyer', group: 'quoting', state: 'warn', summary: 'Buyer credential was not sent because server identity is unavailable.' },
        { id: 'balance', group: 'purchase', state: 'warn', summary: 'Balance was not checked because server identity is unavailable.' },
        { id: 'call', group: 'purchase', state: 'warn', summary: 'Call recovery was not checked because server identity is unavailable.' },
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
      AE_TEST_CLI: CLI_BUNDLE_PATH,
      AE_TEST_NODE: process.execPath,
      PATH: `${directory}${delimiter}${process.env.PATH ?? ''}`,
    })
    assertCliSuccess(continued)
    expect(JSON.parse(continued.stdout)).toMatchObject({ kind: 'config', baseUrl: { origin } })

    const human = await runDoctor(directory, origin, { json: false })
    expect(human.status).toBe(1)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('✗ AE server is not reachable.')
    expect(human.stdout).toContain(`Next: ${configContinuation}`)
    expect(human.stdout).not.toContain('Next: ae doctor')
    expect(human.stdout).not.toContain('npm run')
  })

  it('sends an unreachable loopback origin to start the local stack instead of hosted AE', async () => {
    const origin = 'http://127.0.0.1:3999'
    const summary = `AE server is not reachable: nothing is listening at ${origin}; start the local stack or fix --base-url.`
    const directory = makeConfigDirectory()

    const json = await runDoctor(directory, origin)
    assertCliSuccess(json)
    expect(JSON.parse(json.stdout)).toMatchObject({
      kind: 'degraded',
      checks: expect.arrayContaining([{ id: 'server', group: 'discovery', state: 'fail', summary, nextCommand: LOCAL_DEV_COMMAND }]),
    })
    expect(json.stdout).not.toContain('agentic-economy-phi.vercel.app')

    const human = await runDoctor(directory, origin, { json: false })
    expect(human.status).toBe(1)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain(`✗ ${summary}`)
    expect(human.stdout).toContain(`Next: ${LOCAL_DEV_COMMAND}`)
    expect(human.stdout).not.toContain('agentic-economy-phi.vercel.app')
  })

  it('returns one degraded diagnosis and inspects connections before authorizing a new identity', async () => {
    const requests: Array<{ method: string; path: string }> = []
    const origin = await startServer((request, response) => {
      if (respondHealthyDeployment(request, response)) return
      requests.push({ method: request.method ?? '', path: request.url ?? '' })
      respondJson(response, { schemaVersion: 'ae-site-discovery:v2', origin: `http://${request.headers.host}` })
    })
    const directory = makeConfigDirectory()
    const before = readSentinel(directory)
    const connectCommand = localConnectCommand(origin)

    const result = await runDoctor(directory, origin)
    assertCliSuccess(result)
    expect(JSON.parse(result.stdout)).toEqual({
      kind: 'degraded',
      tier: TIER1_RESULT,
      groups: { discovery: 'pass', quoting: 'skipped', purchase: 'warn' },
      checks: [...discoveryPassChecks(origin), ...unconnectedBuyerChecks(connectCommand)],
    })
    expect(requests).toEqual([{ method: 'GET', path: '/.well-known/ucp' }])
    expect(readSentinel(directory)).toBe(before)
  })

  it('keeps ae connect as the buyer-missing and quote-unconnected next command on a hosted origin', async () => {
    const origin = await startServer((request, response) => {
      if (respondHealthyDeployment(request, response)) return
      respondJson(response, { schemaVersion: 'ae-site-discovery:v2', origin: `http://${request.headers.host}` })
    }, '0.0.0.0')
    const directory = makeConfigDirectory()
    const connectCommand = hostedConnectCommand(origin)

    const result = await runDoctor(directory, origin)
    assertCliSuccess(result)
    const diagnosis = JSON.parse(result.stdout) as { checks: readonly { id: string; nextCommand?: string }[] }
    expect(diagnosis.checks).toEqual(expect.arrayContaining([
      {
        id: 'buyer', group: 'quoting', state: 'warn',
        summary: 'No buyer credential is selected for this origin; anonymous search and describe remain available.',
        nextCommand: connectCommand,
      },
      unconnectedQuoteCheck(connectCommand),
    ]))
    expect(result.stdout).not.toContain('connect:local')
  })

  it('checks the buyer loop and points an uncertain invocation to status without exposing credentials', async () => {
    const buyerSecret = 'FAKE_BUYER_SECRET_51f8'
    const callRef = 'invocation:v1:needs-attention'
    let callState: 'pending' | 'reconciliation_required' = 'reconciliation_required'
    const observed: Array<{ method: string; path: string; authorization?: string; body?: string }> = []
    const origin = await startBuyerServer({
      calls: () => [{ callRef, toolRef: 'operation:v1:one', state: callState, resultKind: callState, createdAt: 10, updatedAt: 20 }],
      observed,
    })
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(json)
    expect(json.stdout).not.toContain(buyerSecret)
    expect(JSON.parse(json.stdout)).toEqual({
      kind: 'degraded',
      tier: TIER1_RESULT,
      groups: { discovery: 'pass', quoting: 'skipped', purchase: 'warn' },
      checks: [
        ...discoveryPassChecks(origin),
        buyerPassCheck(),
        loopbackSkippedQuote(),
        balancePassCheck(),
        fundingPassCheck('25000000'),
        {
          id: 'call', group: 'purchase', state: 'warn',
          summary: 'A reconciliation-required Call needs attention.',
          nextCommand: `ae status ${callRef} --base-url ${origin} --json`,
        },
        marketRequestsPassCheck(),
      ],
    })
    expect(observed).toEqual([
      { method: 'GET', path: '/.well-known/ucp' },
      { method: 'GET', path: '/api/v1/account', authorization: `Bearer ${buyerSecret}` },
      { method: 'POST', path: '/api/v1/account/balance', authorization: `Bearer ${buyerSecret}`, body: '{"currency":"AUD"}' },
      { method: 'GET', path: '/api/v1/calls?limit=100', authorization: `Bearer ${buyerSecret}` },
      { method: 'POST', path: '/api/v1/market-requests/list', authorization: `Bearer ${buyerSecret}`, body: '{"limit":5}' },
    ])

    const human = await runDoctor(directory, origin, { json: false, env: cleanEnvironment(directory) })
    expect(human.status).toBe(1)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('AE doctor: degraded')
    expect(human.stdout).toContain('! A reconciliation-required Call needs attention.')
    expect(human.stdout.match(/^Next: /gmu)).toEqual([`Next: `])
    expect(human.stdout).toContain(`Next: ae status ${callRef} --base-url ${origin} --json`)
    expect(human.stdout).not.toContain(buyerSecret)

    callState = 'pending'
    const pending = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(pending)
    expect(JSON.parse(pending.stdout)).toMatchObject({
      kind: 'degraded',
      checks: expect.arrayContaining([{
        id: 'call', group: 'purchase', state: 'warn',
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
    const origin = await startBuyerServer({
      calls: [{ callRef: 'invocation:v1:prior-success', toolRef: priorToolRef, state: 'completed', resultKind: 'completed', createdAt: 1, updatedAt: 2 }],
      marketRequestItems: [{ requestRef, query: savedQuery, createdAt: 10, updatedAt: 10 }],
      marketRequestStatus: (body) => {
        statusBodies.push(body)
        return {
          kind: 'matched', requestRef, query: savedQuery, createdAt: 10, matchedCount: 1,
          tools: [{
            toolRef, capabilityId: 'document.translate', title: 'Document translation',
            description: 'Translate one document.', provider: { name: 'Reference Services', slug: 'reference' },
            priceLabel: 'USD 0.50', healthStatus: 'operational', listingTier: 'reviewed',
          }],
        }
      },
      describeTool: () => ({ kind: 'found', schemaVersion: 'registry-tools:v3', tool: currentTool(priorToolRef) }),
    })
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(json)
    expect(json.stdout).not.toContain(buyerSecret)
    expect(json.stdout).not.toContain(savedQuery)
    expect(json.stdout).not.toContain(requestRef)
    expect(JSON.parse(json.stdout)).toMatchObject({
      kind: 'ready',
      checks: expect.arrayContaining([
        expect.objectContaining({
          id: 'market_requests', state: 'pass',
          summary: '1 of 1 recent private market request now has matching Tools.',
          nextCommand: `ae describe ${toolRef} --base-url ${origin} --json`,
        }),
        expect.objectContaining({
          id: 'repeat_use', state: 'pass',
          nextCommand: `ae describe ${priorToolRef} --base-url ${origin} --json`,
        }),
      ]),
    })

    const human = await runDoctor(directory, origin, { json: false, env: cleanEnvironment(directory) })
    assertCliSuccess(human)
    expect(human.stdout).toContain('AE doctor: ready')
    expect(human.stdout).toContain('✓ 1 of 1 recent private market request now has matching Tools.')
    expect(human.stdout.match(/^Next: /gmu)).toEqual(['Next: '])
    expect(human.stdout).toContain(`Next: ae describe ${toolRef} --base-url ${origin} --json`)
    expect(human.stdout).not.toContain(savedQuery)
    expect(human.stdout).not.toContain(requestRef)
    expect(statusBodies).toEqual([{ requestRef }, { requestRef }])
  }, 20_000)

  it('warns instead of passing when no current Tool matches a recent private market request', async () => {
    const buyerSecret = 'FAKE_UNMATCHED_BUYER_SECRET_3391'
    const requestRef = `market-request:v1:${'e'.repeat(64)}`
    const savedQuery = 'source a rare replacement part'
    const origin = await startBuyerServer({
      marketRequestItems: [{ requestRef, query: savedQuery, createdAt: 10, updatedAt: 10 }],
      marketRequestStatus: () => ({ kind: 'open', requestRef, query: savedQuery, createdAt: 10, matchedCount: 0 }),
    })
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(json)
    expect(JSON.parse(json.stdout)).toMatchObject({
      kind: 'degraded',
      groups: expect.objectContaining({ purchase: 'warn' }),
      checks: expect.arrayContaining([{
        id: 'market_requests', group: 'purchase', state: 'warn',
        summary: 'No current Tool matches the 1 most recent private market request yet.',
      }]),
    })

    const human = await runDoctor(directory, origin, { json: false, env: cleanEnvironment(directory) })
    expect(human.status).toBe(1)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('AE doctor: degraded')
    expect(human.stdout).toContain('! No current Tool matches the 1 most recent private market request yet.')
  }, 20_000)

  it('recalls the newest successful current Tool without replaying private Call material', async () => {
    const buyerSecret = 'FAKE_REPEAT_BUYER_SECRET_8182'
    const callRef = 'invocation:v1:private-repeat-receipt'
    const evidenceHash = 'sha256:private-repeat-evidence'
    const toolRef = `operation:v1:${'c'.repeat(64)}`
    const detailRequests: Array<{ authorization?: string; body: unknown }> = []
    let current = true
    const origin = await startBuyerServer({
      calls: [{
        callRef, toolRef, state: 'completed', resultKind: 'completed',
        receiptRef: 'receipt:v1:private-repeat', evidenceHash, createdAt: 10, updatedAt: 20,
      }],
      describeTool: (body, authorization) => {
        detailRequests.push({
          ...(authorization === undefined ? {} : { authorization }),
          body,
        })
        return current
          ? { kind: 'found', schemaVersion: 'registry-tools:v3', tool: currentTool(toolRef) }
          : { kind: 'not_found', schemaVersion: 'registry-tools:v3', toolRef }
      },
    })
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(json)
    expect(json.stdout).not.toContain(buyerSecret)
    expect(json.stdout).not.toContain(callRef)
    expect(json.stdout).not.toContain(evidenceHash)
    expect(detailRequests).toEqual([{ body: { toolRef } }])
    expect(JSON.parse(json.stdout)).toMatchObject({
      kind: 'ready',
      checks: expect.arrayContaining([{
        id: 'repeat_use', group: 'purchase', state: 'pass',
        summary: 'A previously successful Tool is still in the current catalog.',
        nextCommand: `ae describe ${toolRef} --base-url ${origin} --json`,
      }]),
    })

    const human = await runDoctor(directory, origin, { json: false, env: cleanEnvironment(directory) })
    assertCliSuccess(human)
    expect(human.stdout).toContain('✓ A previously successful Tool is still in the current catalog.')
    expect(human.stdout.match(/^Next: /gmu)).toEqual(['Next: '])
    expect(human.stdout).toContain(`Next: ae describe ${toolRef} --base-url ${origin} --json`)
    expect(human.stdout).not.toContain(callRef)
    expect(human.stdout).not.toContain(evidenceHash)

    current = false
    const retired = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(retired)
    expect(JSON.parse(retired.stdout)).toMatchObject({ kind: 'ready' })
    expect(JSON.parse(retired.stdout).checks).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'repeat_use' })]))
    expect(detailRequests).toEqual([{ body: { toolRef } }, { body: { toolRef } }, { body: { toolRef } }])
  }, 20_000)

  it('summarizes provider Tool and connection readiness for one requested business', async () => {
    const buyerSecret = 'FAKE_BUYER_SECRET_1872'
    const providerSecret = 'FAKE_PROVIDER_SECRET_8431'
    const providerRequests: Array<{ path: string; body: unknown }> = []
    const origin = await startBuyerServer({
      providerRequests,
      accountResponse: (authorization) => providerAccountResponse(providerSecret, authorization),
    })
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret, providerSecret)

    const result = await runDoctor(directory, origin, {
      extraArgs: ['business:one', '--provider'],
      env: cleanEnvironment(directory),
    })
    assertCliSuccess(result)
    expect(result.stdout).not.toContain(buyerSecret)
    expect(result.stdout).not.toContain(providerSecret)
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'degraded',
      groups: { discovery: 'pass', quoting: 'skipped', purchase: 'warn' },
      checks: [
        { id: 'origin', group: 'discovery', state: 'pass' },
        { id: 'server', group: 'discovery', state: 'pass' },
        { id: 'mcp', group: 'discovery', state: 'pass' },
        { id: 'readiness', group: 'discovery', state: 'pass' },
        { id: 'release', group: 'discovery', state: 'pass' },
        FRESH_CATALOGUE_CHECK,
        { id: 'buyer', group: 'quoting', state: 'pass' },
        loopbackSkippedQuote(),
        { id: 'balance', group: 'purchase', state: 'pass' },
        { id: 'funding', group: 'purchase', state: 'pass' },
        { id: 'call', group: 'purchase', state: 'pass' },
        marketRequestsPassCheck(),
        { id: 'provider', group: 'purchase', state: 'pass', summary: 'Provider credential is origin-bound, authenticated, and has market_supply:manage.' },
        {
          id: 'provider.readiness', group: 'purchase', state: 'warn',
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

  it('checks provider access without scoping to any business when --provider is given without a business ID', async () => {
    const buyerSecret = 'FAKE_BUYER_SECRET_2231'
    const providerSecret = 'FAKE_PROVIDER_SECRET_5567'
    const providerRequests: string[] = []
    const origin = await startBuyerServer({
      providerRequestPaths: providerRequests,
      accountResponse: (authorization) => providerAccountResponse(providerSecret, authorization),
    })
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret, providerSecret)

    const result = await runDoctor(directory, origin, {
      extraArgs: ['--provider'],
      env: cleanEnvironment(directory),
    })
    assertCliSuccess(result)
    expect(providerRequests).toEqual([])
    expect(JSON.parse(result.stdout)).toMatchObject({
      checks: expect.arrayContaining([
        { id: 'provider', group: 'purchase', state: 'pass', summary: 'Provider credential is origin-bound, authenticated, and has market_supply:manage.' },
        {
          id: 'provider.readiness', group: 'purchase', state: 'warn',
          summary: 'Provider access is ready; add a business ID to check Tool and provider readiness.',
        },
      ]),
    })
  })

  it('rejects a bare business ID without --provider and names --provider as the correct form', async () => {
    const origin = 'https://ae-unreachable.invalid'
    const directory = makeConfigDirectory()

    const json = await runDoctor(directory, origin, { extraArgs: ['business:one'] })
    expect(json.status).toBe(1)
    expect(json.stderr).toBe('')
    expect(JSON.parse(json.stdout)).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'doctor-usage',
      message: 'Usage: ae doctor [--provider [businessId]]',
    })

    const human = await runDoctor(directory, origin, { json: false, extraArgs: ['business:one'] })
    expect(human.status).toBe(1)
    expect(human.stdout).toBe('')
    expect(human.stderr).toContain('Usage: ae doctor [--provider [businessId]]')
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
    const mismatchedEnv = {
      ...cleanEnvironment(directory),
      AE_API_KEY: secret,
      AE_API_KEY_ORIGIN: 'https://private.example.test/credential?token=hidden',
    }
    const result = await runDoctor(directory, origin, { env: mismatchedEnv })
    assertCliSuccess(result)
    expect(result.stdout).not.toContain(secret)
    expect(result.stdout).not.toContain('private.example.test')
    const diagnosis = parseDoctorJson(result)
    expect(diagnosis.kind).toBe('degraded')
    expect(diagnosis.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'buyer', state: 'fail',
        summary: 'Buyer credential is not safely bound to the configured origin.',
        nextCommand: hostedConnectCommand(origin),
      }),
    ]))
    expect(requests).toEqual(['/.well-known/ucp'])

    const human = await runDoctor(directory, origin, { json: false, env: mismatchedEnv })
    expect(human.status).toBe(1)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('AE doctor: degraded')
    expect(human.stdout).toContain('✗ Buyer credential is not safely bound to the configured origin.')
    expect(human.stdout).not.toContain(secret)
    expect(human.stdout).not.toContain('private.example.test')
  })

  it('returns ready when the buyer can safely continue the market loop', async () => {
    const buyerSecret = 'FAKE_READY_BUYER_SECRET_7351'
    const origin = await startBuyerServer({ balanceUnits: '10000' })
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const result = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(result)
    expect(JSON.parse(result.stdout)).toEqual({
      kind: 'ready',
      tier: TIER1_RESULT,
      groups: { discovery: 'pass', quoting: 'skipped', purchase: 'pass' },
      checks: readyBuyerDiagnosisChecks(origin, '10000', loopbackSkippedQuote()),
    })

    const human = await runDoctor(directory, origin, { json: false, env: cleanEnvironment(directory) })
    assertCliSuccess(human)
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
      respondJson(response, { schemaVersion: 'ae-site-discovery:v2', origin: 'https://different.example.test' })
    })
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, secret)

    const result = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(result)
    expect(result.stdout).not.toContain(secret)
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: 'degraded',
      checks: expect.arrayContaining([expect.objectContaining({
        id: 'server', state: 'fail',
        summary: 'AE server manifest origin does not match the configured origin.',
      })]),
    })
    expect(requests).toEqual([{ path: '/.well-known/ucp' }])

    const human = await runDoctor(directory, origin, { json: false, env: cleanEnvironment(directory) })
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
    const connectCommand = localConnectCommand(origin)

    const result = await runDoctor(directory, origin)
    assertCliSuccess(result)
    expect(result.stdout).not.toContain(secret)
    expect(JSON.parse(result.stdout)).toEqual({
      kind: 'degraded',
      tier: TIER1_RESULT,
      groups: { discovery: 'fail', quoting: 'skipped', purchase: 'warn' },
      checks: [
        originPassCheck(origin),
        { id: 'server', group: 'discovery', state: 'pass', summary: 'AE server is reachable and manifest ae-site-discovery:v2 is compatible.' },
        { id: 'mcp', group: 'discovery', state: 'pass', summary: 'MCP initialization and 4 public tools passed.' },
        {
          id: 'readiness', group: 'discovery', state: 'fail',
          summary: 'Server is reachable but operational readiness failed (deployment_manifest_invalid). The service operator must restore operational readiness before calls proceed; the caller should not continue or retry.',
        },
        {
          id: 'release', group: 'discovery', state: 'fail',
          summary: 'Release identity is unavailable (source_revision_unconfigured). The service operator must configure a valid release identity before calls proceed; the caller should not continue or retry.',
        },
        { id: 'catalogue', group: 'discovery', state: 'warn', summary: 'Market catalogue coverage could not be read.', code: 'catalogue_unreadable' },
        ...unconnectedBuyerChecks(connectCommand),
      ],
    })

    const human = await runDoctor(directory, origin, { json: false })
    expect(human.status).toBe(1)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('✗ Server is reachable but operational readiness failed (deployment_manifest_invalid). The service operator must restore operational readiness before calls proceed; the caller should not continue or retry.')
    expect(human.stdout).toContain('✗ Release identity is unavailable (source_revision_unconfigured). The service operator must configure a valid release identity before calls proceed; the caller should not continue or retry.')
    expect(human.stdout).not.toContain('Next: ae connect')
    expect(human.stdout).not.toContain(secret)
  })

  it('passes quoting when the seeded sandbox Tool returns an admitted Quote', async () => {
    const buyerSecret = 'FAKE_QUOTE_BUYER_SECRET_2210'
    const observed: Array<{ path: string; authorization?: string; body: unknown }> = []
    const origin = await startQuoteServer({ quote: committedQuote() }, observed)
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(json)
    expect(json.stdout).not.toContain(buyerSecret)
    const result = parseDoctorJson(json)
    expect(result.kind).toBe('ready')
    expect(result.groups).toEqual({ discovery: 'pass', quoting: 'pass', purchase: 'pass' })
    expect(result.checks).toEqual(expect.arrayContaining([{
      id: 'quote', group: 'quoting', state: 'pass',
      summary: 'Quote for the sandbox Tool was admitted at 1000000 × 10^-6 AUD.',
    }]))
    expect(observed).toEqual([
      { path: TOOL_MARKET_SEARCH_PATH, body: { query: SANDBOX_TOOL_SLUG, limit: 10 } },
      {
        path: TOOL_QUOTE_PATH, authorization: `Bearer ${buyerSecret}`,
        body: { toolRef: SANDBOX_TOOL_REF, input: { request: 'ae doctor quote inspection' } },
      },
    ])

    const human = await runDoctor(directory, origin, { json: false, env: cleanEnvironment(directory) })
    assertCliSuccess(human)
    expect(human.stdout).toContain('✓ Quote for the sandbox Tool was admitted at 1000000 × 10^-6 AUD.')
    expect(human.stdout).toContain('discovery: pass | quoting: pass | purchase: pass')
    expect(human.stdout).not.toContain(buyerSecret)
  }, 20_000)

  it('fails quoting with the refusal code verbatim and routes to the sandbox authority stage', async () => {
    const buyerSecret = 'FAKE_REFUSED_BUYER_SECRET_5540'
    const origin = await startQuoteServer({ quote: refusedQuote('grant_not_found') }, [])
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(json)
    expect(json.stdout).not.toContain(buyerSecret)
    const result = parseDoctorJson(json)
    expect(result.kind).toBe('degraded')
    expect(result.groups).toEqual({ discovery: 'pass', quoting: 'fail', purchase: 'pass' })
    expect(result.checks).toEqual(expect.arrayContaining([{
      id: 'quote', group: 'quoting', state: 'fail',
      summary: 'Quote for the sandbox Tool was refused (grant_not_found).',
      nextCommand: LOCAL_DEV_COMMAND,
    }]))

    const human = await runDoctor(directory, origin, { json: false, env: cleanEnvironment(directory) })
    expect(human.status).toBe(1)
    expect(human.stdout).toContain('✗ Quote for the sandbox Tool was refused (grant_not_found).')
    expect(human.stdout).toContain('discovery: pass | quoting: fail | purchase: pass')
    expect(human.stdout.match(/^Next: /gmu)).toEqual(['Next: '])
    expect(human.stdout).toContain(`Next: ${LOCAL_DEV_COMMAND}`)
    expect(human.stdout).not.toContain(buyerSecret)
  }, 20_000)

  it('funds a quoting refusal that ran out of balance instead of reseeding authority', async () => {
    const buyerSecret = 'FAKE_FUNDING_BUYER_SECRET_6611'
    const origin = await startQuoteServer({ quote: refusedQuote('insufficient_balance') }, [])
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(json)
    const result = parseDoctorJson(json)
    expect(result.groups).toEqual(expect.objectContaining({ quoting: 'warn' }))
    expect(result.checks).toEqual(expect.arrayContaining([{
      id: 'quote', group: 'quoting', state: 'warn',
      summary: 'Quote reached the funding gate (insufficient_balance); authority and commercial policy are ready.',
      nextCommand: `ae fund --base-url ${origin} --json`,
    }]))
  }, 20_000)

  it('skips quoting without a buyer credential rather than reporting it as a pass', async () => {
    const origin = await startQuoteServer({ quote: committedQuote() }, [])
    const directory = makeConfigDirectory()

    const json = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(json)
    const result = parseDoctorJson(json)
    expect((result.groups as { quoting: string }).quoting).toBe('skipped')
    expect(result.checks).toEqual(expect.arrayContaining([
      unconnectedQuoteCheck(localConnectCommand(origin)),
    ]))

    const human = await runDoctor(directory, origin, { json: false, env: cleanEnvironment(directory) })
    expect(human.stdout).toContain('- Quote inspection was skipped: no buyer credential for this origin.')
    expect(human.stdout).toContain('quoting: skipped')
  }, 20_000)

  it('skips quoting when no sandbox Tool is published on a loopback origin and names the hosted alternative', async () => {
    const buyerSecret = 'FAKE_ABSENT_TOOL_SECRET_7724'
    const observed: Array<{ path: string; authorization?: string; body: unknown }> = []
    const origin = await startQuoteServer({ quote: committedQuote(), search: emptySearchResult() }, observed)
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(json)
    const result = parseDoctorJson(json)
    expect((result.groups as { quoting: string }).quoting).toBe('skipped')
    expect(result.checks).toEqual(expect.arrayContaining([loopbackSkippedQuote()]))
    const quoteCheck = result.checks.find((check) => (check as { id: string }).id === 'quote') as { code?: string; summary: string }
    expect(quoteCheck.code).toBe('loopback_readiness_unprovable')
    expect(quoteCheck.summary.endsWith('..')).toBe(false)
    expect(quoteCheck.summary.endsWith('.')).toBe(true)
    expect(observed.map((request) => request.path)).toEqual([TOOL_MARKET_SEARCH_PATH])
  }, 20_000)

  it('skips quoting instead of passing it when the Quote inspection cannot be read', async () => {
    const buyerSecret = 'FAKE_UNREADABLE_QUOTE_SECRET_8836'
    const origin = await startQuoteServer({ quote: committedQuote(), search: { unexpected: true } }, [])
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(json)
    const result = parseDoctorJson(json)
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'buyer', group: 'quoting', state: 'pass' }),
      skippedQuoteCheck('quote inspection timed out'),
    ]))
    expect((result.groups as { quoting: string }).quoting).toBe('skipped')
    expect(result.kind).toBe('ready')
  }, 20_000)

  it('warns discovery on a stale catalogue and fails it on a failed refresh', async () => {
    const buyerSecret = 'FAKE_CATALOGUE_BUYER_SECRET_9948'
    const scenario: { quote: unknown; catalogue: 'stale' | 'failed' | 'absent' | 'fresh'; balanceUnits: string } = {
      quote: committedQuote(),
      catalogue: 'stale',
      balanceUnits: '0',
    }
    const origin = await startQuoteServer(scenario, [])
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const stale = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(stale)
    const staleResult = parseDoctorJson(stale)
    expect(staleResult.groups).toEqual({ discovery: 'warn', quoting: 'pass', purchase: 'warn' })
    expect(staleResult.checks).toEqual(expect.arrayContaining([{
      id: 'catalogue', group: 'discovery', state: 'warn', summary: 'Market catalogue coverage is stale.', code: 'catalogue_stale',
    }]))

    scenario.catalogue = 'failed'
    const failed = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(failed)
    const failedResult = parseDoctorJson(failed)
    expect((failedResult.groups as { discovery: string }).discovery).toBe('fail')
    expect(failedResult.checks).toEqual(expect.arrayContaining([{
      id: 'catalogue', group: 'discovery', state: 'fail', summary: 'Market catalogue refresh failed.', code: 'catalogue_refresh_failed',
    }]))

    scenario.catalogue = 'absent'
    const absent = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(absent)
    const absentResult = parseDoctorJson(absent)
    expect(absentResult.groups).toEqual({ discovery: 'warn', quoting: 'pass', purchase: 'warn' })
    expect(absentResult.checks).toEqual(expect.arrayContaining([{
      id: 'catalogue', group: 'discovery', state: 'warn', summary: 'Market catalogue coverage is absent.', code: 'catalogue_absent',
    }]))
  }, 20_000)

  it('fails funding and reports tier 0 with the missing names on a loopback origin without Stripe or CDP/x402 sandbox credentials', async () => {
    const buyerSecret = 'FAKE_TIER0_LOOPBACK_BUYER_SECRET_3301'
    const origin = await startQuoteServer({ quote: committedQuote() }, [])
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await runDoctor(directory, origin, { env: tier0Environment(directory) })
    assertCliSuccess(json)
    const result = parseDoctorJson(json)
    expect(result.tier).toEqual({ level: 0, missing: TIER0_MISSING_NAMES })
    expect(result.checks).toEqual(expect.arrayContaining([{
      id: 'funding', group: 'purchase', state: 'fail',
      summary: `Account funding is unavailable: Stripe test mode is not configured (missing: ${STRIPE_MONEY_ENV_NAMES.join(', ')}).`,
      nextCommand: LOCAL_STRIPE_TEST_MODE_DOC,
    }]))

    const human = await runDoctor(directory, origin, { json: false, env: tier0Environment(directory) })
    expect(human.stdout).toContain(`tier: 0 (missing: ${TIER0_MISSING_NAMES.join(', ')})`)
  }, 20_000)

  it('reports tier 1 once Stripe test mode and the CDP/x402 sandbox bundle are configured', async () => {
    const buyerSecret = 'FAKE_TIER1_BUYER_SECRET_3303'
    const origin = await startQuoteServer({ quote: committedQuote() }, [])
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(json)
    expect(parseDoctorJson(json).tier).toEqual(TIER1_RESULT)

    const human = await runDoctor(directory, origin, { json: false, env: cleanEnvironment(directory) })
    expect(human.stdout).toContain('tier: 1')
  }, 20_000)

  it('warns to fund the Account at the owner credit page on a loopback origin once test mode is configured', async () => {
    const buyerSecret = 'FAKE_FUNDING_WARN_LOOPBACK_3304'
    const origin = await startQuoteServer({ quote: committedQuote(), balanceUnits: '0' }, [])
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(json)
    expect(parseDoctorJson(json).checks).toEqual(expect.arrayContaining([{
      id: 'funding', group: 'purchase', state: 'warn',
      summary: `Buyer balance is empty; fund the Account as the owner at ${origin}/owner/credit (Stripe test mode).`,
      nextCommand: `${origin}/owner/credit`,
    }]))
  }, 20_000)

  it('omits a local fix command for a hosted origin missing Stripe test mode', () => {
    for (const name of [...STRIPE_MONEY_ENV_NAMES, ...X402_CUSTODY_ENV_NAMES]) vi.stubEnv(name, '')
    try {
      const result = checkFunding(
        { baseUrl: 'https://hosted.ae-doctor-test.invalid', json: false, help: false, allowWrite: false },
        { check: { id: 'balance', state: 'pass', summary: 'Buyer balance is available and the account is active.' } },
      )
      expect(result).toEqual({
        id: 'funding', state: 'fail',
        summary: `Account funding is unavailable: Stripe test mode is not configured (missing: ${STRIPE_MONEY_ENV_NAMES.join(', ')}).`,
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('continues with ae fund on a hosted origin when the buyer balance is empty', () => {
    for (const [name, value] of Object.entries(TIER1_ENV)) vi.stubEnv(name, value as string)
    try {
      const result = checkFunding(
        { baseUrl: 'https://hosted.ae-doctor-test.invalid', json: true, help: false, allowWrite: false, baseUrlSource: 'flag' },
        { check: { id: 'balance', state: 'warn', summary: 'Buyer balance is empty.' } },
      )
      expect(result).toEqual({
        id: 'funding', state: 'warn',
        summary: 'Buyer balance is empty; fund the Account (Stripe test mode).',
        nextCommand: 'ae fund --base-url https://hosted.ae-doctor-test.invalid --json',
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('passes funding with the buyer balance once the Account is funded', async () => {
    const buyerSecret = 'FAKE_FUNDING_PASS_BUYER_SECRET_3306'
    const origin = await startQuoteServer({ quote: committedQuote(), balanceUnits: '2000000' }, [])
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await runDoctor(directory, origin, { env: cleanEnvironment(directory) })
    assertCliSuccess(json)
    expect(parseDoctorJson(json).checks).toEqual(expect.arrayContaining([{
      id: 'funding', group: 'purchase', state: 'pass',
      summary: 'Account funding is available; buyer balance is 2000000 × 10^-6 AUD.',
    }]))
  }, 20_000)
})
