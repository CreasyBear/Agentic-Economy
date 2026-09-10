import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { listMcpActions, mcpToolName } from '@/modules/actions'
import { TOOL_MARKET_SEARCH_PATH } from '@/modules/common/market-tool-paths'
import { TOOL_QUOTE_PATH } from '@/modules/capability-execution/quote'
import { STRIPE_MONEY_ENV_NAMES } from '@/lib/server/stripe-money-provider-config'
import {
  X402_CDP_ACCOUNT_NAME_ENV,
  X402_CDP_ACCOUNT_POLICY_ID_ENV,
  X402_CDP_API_KEY_ID_ENV,
  X402_CDP_API_KEY_SECRET_ENV,
  X402_CDP_CREDENTIAL_GENERATION_ENV,
  X402_CDP_EXPECTED_EVM_ADDRESS_ENV,
  X402_CDP_POLICY_RULES_DIGEST_ENV,
  X402_CDP_PROJECT_POLICY_ID_ENV,
  X402_CDP_WALLET_SECRET_ENV,
  X402_CUSTODY_DAILY_MAX_ATOMIC_ENV,
  X402_CUSTODY_ENABLED_ENV,
  X402_CUSTODY_ENV_NAMES,
  X402_CUSTODY_MAX_ATOMIC_ENV,
} from '@/modules/capability-supply/internal/x402-custody-configuration'
import { checkFunding } from '../../../tools/ae/commands/doctor'
import { spawnCli } from './cli-errors-harness'

const SANDBOX_TOOL_SLUG = 'sandbox-aecon-reference'
const SANDBOX_TOOL_REF = `operation:v1:${'e'.repeat(64)}`
const LOCAL_DEV_COMMAND = 'npm run dev:local'
const LOOPBACK_NO_SANDBOX_TOOL_REASON = 'no routeable sandbox Tool on this loopback origin. The readiness probe only reaches public HTTPS endpoints, so the seeded sandbox Tool is listed on hosted origins (preview or production), not on 127.0.0.1. Discover and connect are provable here; Quote is provable on a hosted origin.'
const LOOPBACK_DOCTOR_COMMAND = 'ae doctor --base-url <hosted origin> --json'
const FRESH_CATALOGUE_CHECK = { id: 'catalogue', group: 'discovery', state: 'pass', summary: 'Market catalogue coverage is fresh.' }

// A fully configured local environment: Stripe test mode plus the CDP/x402 sandbox
// bundle, so the default test double proves tier 1 (the full loop) rather than tier 0.
const TIER1_ENV: NodeJS.ProcessEnv = {
  STRIPE_SECRET_KEY: 'sk_test_doctor00000000000000000000',
  STRIPE_WEBHOOK_SECRET: 'whsec_doctor000000000000000000000',
  STRIPE_V2_WEBHOOK_SECRET: 'whsec_doctorv2_00000000000000000000',
  STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID: 'txr_doctor00000000000000000000000',
  STRIPE_CHECKOUT_HOST: 'checkout.doctor.test',
  [X402_CUSTODY_ENABLED_ENV]: 'true',
  [X402_CDP_API_KEY_ID_ENV]: 'key-id',
  [X402_CDP_API_KEY_SECRET_ENV]: 'key-secret',
  [X402_CDP_WALLET_SECRET_ENV]: 'wallet-secret',
  [X402_CDP_ACCOUNT_NAME_ENV]: 'agentic-economy-x402',
  [X402_CDP_EXPECTED_EVM_ADDRESS_ENV]: '0x0000000000000000000000000000000000000001',
  [X402_CDP_ACCOUNT_POLICY_ID_ENV]: '11111111-1111-4111-8111-111111111111',
  [X402_CDP_PROJECT_POLICY_ID_ENV]: '22222222-2222-4222-8222-222222222222',
  [X402_CDP_POLICY_RULES_DIGEST_ENV]: `sha256:${'a'.repeat(64)}`,
  [X402_CDP_CREDENTIAL_GENERATION_ENV]: '7',
  [X402_CUSTODY_MAX_ATOMIC_ENV]: '10000',
  [X402_CUSTODY_DAILY_MAX_ATOMIC_ENV]: '100000',
}
const TIER0_MISSING_NAMES = [...STRIPE_MONEY_ENV_NAMES, ...X402_CUSTODY_ENV_NAMES]
const TIER1_RESULT = { level: 1, missing: [] }
const LOCAL_STRIPE_TEST_MODE_DOC = 'docs/operations/local-stripe-test-mode.md'

function tier0Environment(directory: string): NodeJS.ProcessEnv {
  const blanked = Object.fromEntries(Object.keys(TIER1_ENV).map((name) => [name, '']))
  return { ...cleanEnvironment(directory), ...blanked }
}

function skippedQuoteCheck(reason: string, nextCommand?: string) {
  return {
    id: 'quote', group: 'quoting', state: 'skipped', reason,
    summary: `Quote inspection was skipped: ${reason}.`,
    ...(nextCommand === undefined ? {} : { nextCommand }),
  }
}

function unconnectedQuoteCheck(connectCommand: string) {
  return skippedQuoteCheck('no buyer credential for this origin', connectCommand)
}

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
    const directory = makeConfigDirectory()

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], {
      env: cleanEnvironment(directory),
    })

    expect(json.status).toBe(0)
    expect(json.stderr).toBe('')
    expect(JSON.parse(json.stdout)).toEqual({
      kind: 'degraded',
      tier: TIER1_RESULT,
      groups: { discovery: 'fail', quoting: 'warn', purchase: 'warn' },
      checks: [
        { id: 'origin', group: 'discovery', state: 'pass', summary: `Configured origin is ${origin}.` },
        {
          id: 'server', group: 'discovery', state: 'fail', summary: 'AE server is not reachable.',
          nextCommand: configContinuation,
        },
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
    expect(human.stdout).toContain(`Next: ${configContinuation}`)
    expect(human.stdout).not.toContain('Next: ae doctor')
    expect(human.stdout).not.toContain('npm run')
  })

  it('sends an unreachable loopback origin to start the local stack instead of hosted AE', async () => {
    const origin = 'http://127.0.0.1:3999'
    const summary = `AE server is not reachable: nothing is listening at ${origin}; start the local stack or fix --base-url.`
    const directory = makeConfigDirectory()

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], {
      env: cleanEnvironment(directory),
    })

    expect(json.status).toBe(0)
    expect(json.stderr).toBe('')
    expect(JSON.parse(json.stdout)).toMatchObject({
      kind: 'degraded',
      checks: expect.arrayContaining([{
        id: 'server', group: 'discovery', state: 'fail', summary,
        nextCommand: LOCAL_DEV_COMMAND,
      }]),
    })
    expect(json.stdout).not.toContain('agentic-economy-phi.vercel.app')

    const human = await spawnCli(['doctor', '--base-url', origin], {
      env: cleanEnvironment(directory),
    })
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
      tier: TIER1_RESULT,
      groups: { discovery: 'pass', quoting: 'skipped', purchase: 'warn' },
      checks: [
        { id: 'origin', group: 'discovery', state: 'pass', summary: `Configured origin is ${origin}.` },
        { id: 'server', group: 'discovery', state: 'pass', summary: 'AE server is reachable and manifest ae-site-discovery:v2 is compatible.' },
        { id: 'mcp', group: 'discovery', state: 'pass', summary: 'MCP initialization and 4 public tools passed.' },
        { id: 'readiness', group: 'discovery', state: 'pass', summary: 'Server operational readiness passed.' },
        { id: 'release', group: 'discovery', state: 'pass', summary: `Release identity is ${'a'.repeat(40)}.` },
        FRESH_CATALOGUE_CHECK,
        { id: 'buyer', group: 'quoting', state: 'warn', summary: 'No buyer credential is selected for this origin; anonymous search and describe remain available.', nextCommand: `npm run connect:local -- --base-url ${origin}` },
        unconnectedQuoteCheck(`npm run connect:local -- --base-url ${origin}`),
        { id: 'balance', group: 'purchase', state: 'warn', summary: 'Balance is unavailable until a buyer credential is connected.' },
        { id: 'call', group: 'purchase', state: 'warn', summary: 'Call recovery is unavailable until a buyer credential is connected.' },
      ],
    })
    expect(requests).toEqual([{ method: 'GET', path: '/.well-known/ucp' }])
    expect(readFileSync(join(directory, 'sentinel.txt'), 'utf8')).toBe(before)
  })

  it('keeps ae connect as the buyer-missing and quote-unconnected next command on a hosted origin', async () => {
    const origin = await startServer((request, response) => {
      if (respondHealthyDeployment(request, response)) return
      respondJson(response, {
        schemaVersion: 'ae-site-discovery:v2',
        origin: `http://${request.headers.host}`,
      })
    }, '0.0.0.0')
    const directory = makeConfigDirectory()

    const result = await spawnCli(['doctor', '--base-url', origin, '--json'], {
      env: cleanEnvironment(directory),
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const diagnosis = JSON.parse(result.stdout) as { checks: readonly { id: string; nextCommand?: string }[] }
    expect(diagnosis.checks).toEqual(expect.arrayContaining([
      {
        id: 'buyer', group: 'quoting', state: 'warn',
        summary: 'No buyer credential is selected for this origin; anonymous search and describe remain available.',
        nextCommand: `ae connect --base-url ${origin} --json`,
      },
      unconnectedQuoteCheck(`ae connect --base-url ${origin} --json`),
    ]))
    expect(result.stdout).not.toContain('connect:local')
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
      tier: TIER1_RESULT,
      groups: { discovery: 'pass', quoting: 'skipped', purchase: 'warn' },
      checks: [
        { id: 'origin', group: 'discovery', state: 'pass', summary: `Configured origin is ${origin}.` },
        { id: 'server', group: 'discovery', state: 'pass', summary: 'AE server is reachable and manifest ae-site-discovery:v2 is compatible.' },
        { id: 'mcp', group: 'discovery', state: 'pass', summary: 'MCP initialization and 4 public tools passed.' },
        { id: 'readiness', group: 'discovery', state: 'pass', summary: 'Server operational readiness passed.' },
        { id: 'release', group: 'discovery', state: 'pass', summary: `Release identity is ${'a'.repeat(40)}.` },
        FRESH_CATALOGUE_CHECK,
        { id: 'buyer', group: 'quoting', state: 'pass', summary: 'Buyer credential is origin-bound, authenticated, and has market_tools:call.' },
        skippedQuoteCheck(LOOPBACK_NO_SANDBOX_TOOL_REASON, LOOPBACK_DOCTOR_COMMAND),
        { id: 'balance', group: 'purchase', state: 'pass', summary: 'Buyer balance is available and the account is active.' },
        {
          id: 'funding', group: 'purchase', state: 'pass',
          summary: 'Account funding is available; buyer balance is 25000000 × 10^-6 AUD.',
        },
        {
          id: 'call', group: 'purchase', state: 'warn',
          summary: 'A reconciliation-required Call needs attention.',
          nextCommand: `ae status ${callRef} --base-url ${origin} --json`,
        },
        { id: 'market_requests', group: 'purchase', state: 'pass', summary: 'No private market requests need rechecking.' },
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
    expect(human.stdout).toContain(`Next: ae status ${callRef} --base-url ${origin} --json`)
    expect(human.stdout).not.toContain(buyerSecret)

    callState = 'pending'
    const pending = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })
    expect(pending.status).toBe(0)
    expect(JSON.parse(pending.stdout)).toMatchObject({
      kind: 'degraded',
      checks: expect.arrayContaining([{
        id: 'call',
        group: 'purchase',
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
            kind: 'found', schemaVersion: 'registry-tools:v3', tool: currentTool(priorToolRef),
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
    expect(human.stdout).toContain(`Next: ae describe ${toolRef} --base-url ${origin} --json`)
    expect(human.stdout).not.toContain(savedQuery)
    expect(human.stdout).not.toContain(requestRef)
    expect(statusBodies).toEqual([{ requestRef }, { requestRef }])
  }, 20_000)

  it('warns instead of passing when no current Tool matches a recent private market request', async () => {
    const buyerSecret = 'FAKE_UNMATCHED_BUYER_SECRET_3391'
    const requestRef = `market-request:v1:${'e'.repeat(64)}`
    const savedQuery = 'source a rare replacement part'
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
          respondJson(response, { kind: 'available', hasMore: false, items: [] })
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
          respondJson(response, { kind: 'open', requestRef, query: savedQuery, createdAt: 10, matchedCount: 0 })
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
    expect(JSON.parse(json.stdout)).toMatchObject({
      kind: 'degraded',
      groups: expect.objectContaining({ purchase: 'warn' }),
      checks: expect.arrayContaining([{
        id: 'market_requests', group: 'purchase', state: 'warn',
        summary: 'No current Tool matches the 1 most recent private market request yet.',
      }]),
    })

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
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
            ? { kind: 'found', schemaVersion: 'registry-tools:v3', tool: currentTool(toolRef) }
            : { kind: 'not_found', schemaVersion: 'registry-tools:v3', toolRef })
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
        id: 'repeat_use', group: 'purchase', state: 'pass',
        summary: 'A previously successful Tool is still in the current catalog.',
        nextCommand: `ae describe ${toolRef} --base-url ${origin} --json`,
      }]),
    })

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
    expect(human.status).toBe(0)
    expect(human.stderr).toBe('')
    expect(human.stdout).toContain('✓ A previously successful Tool is still in the current catalog.')
    expect(human.stdout.match(/^Next: /gmu)).toEqual(['Next: '])
    expect(human.stdout).toContain(`Next: ae describe ${toolRef} --base-url ${origin} --json`)
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
      groups: { discovery: 'pass', quoting: 'skipped', purchase: 'warn' },
      checks: [
        { id: 'origin', group: 'discovery', state: 'pass' },
        { id: 'server', group: 'discovery', state: 'pass' },
        { id: 'mcp', group: 'discovery', state: 'pass' },
        { id: 'readiness', group: 'discovery', state: 'pass' },
        { id: 'release', group: 'discovery', state: 'pass' },
        FRESH_CATALOGUE_CHECK,
        { id: 'buyer', group: 'quoting', state: 'pass' },
        skippedQuoteCheck(LOOPBACK_NO_SANDBOX_TOOL_REASON, LOOPBACK_DOCTOR_COMMAND),
        { id: 'balance', group: 'purchase', state: 'pass' },
        { id: 'funding', group: 'purchase', state: 'pass' },
        { id: 'call', group: 'purchase', state: 'pass' },
        { id: 'market_requests', group: 'purchase', state: 'pass', summary: 'No private market requests need rechecking.' },
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
    const origin = await startServer((request, response) => {
      if (respondHealthyDeployment(request, response)) return
      if (request.url === '/.well-known/ucp') {
        respondJson(response, { schemaVersion: 'ae-site-discovery:v2', origin })
        return
      }
      if (request.url === '/api/v1/account') {
        const provider = request.headers.authorization === `Bearer ${providerSecret}`
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
      // No handler for /api/v1/supply/tools/list or /api/v1/supply/connections/list: an
      // unscoped `--provider` check must never reach them, so any call here is a bug.
      providerRequests.push(request.url ?? '')
      respondJson(response, { error: 'unexpected' }, 404)
    })
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret, providerSecret)

    const result = await spawnCli(['doctor', '--provider', '--base-url', origin, '--json'], {
      env: cleanEnvironment(directory),
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
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

    const json = await spawnCli(['doctor', 'business:one', '--base-url', origin, '--json'], {
      env: cleanEnvironment(directory),
    })
    expect(json.status).toBe(1)
    expect(json.stderr).toBe('')
    expect(JSON.parse(json.stdout)).toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'doctor-usage',
      message: 'Usage: ae doctor [--provider [businessId]]',
    })

    const human = await spawnCli(['doctor', 'business:one', '--base-url', origin], {
      env: cleanEnvironment(directory),
    })
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
      tier: TIER1_RESULT,
      groups: { discovery: 'pass', quoting: 'skipped', purchase: 'pass' },
      checks: [
        { id: 'origin', group: 'discovery', state: 'pass', summary: `Configured origin is ${origin}.` },
        { id: 'server', group: 'discovery', state: 'pass', summary: 'AE server is reachable and manifest ae-site-discovery:v2 is compatible.' },
        { id: 'mcp', group: 'discovery', state: 'pass', summary: 'MCP initialization and 4 public tools passed.' },
        { id: 'readiness', group: 'discovery', state: 'pass', summary: 'Server operational readiness passed.' },
        { id: 'release', group: 'discovery', state: 'pass', summary: `Release identity is ${'a'.repeat(40)}.` },
        FRESH_CATALOGUE_CHECK,
        { id: 'buyer', group: 'quoting', state: 'pass', summary: 'Buyer credential is origin-bound, authenticated, and has market_tools:call.' },
        skippedQuoteCheck(LOOPBACK_NO_SANDBOX_TOOL_REASON, LOOPBACK_DOCTOR_COMMAND),
        { id: 'balance', group: 'purchase', state: 'pass', summary: 'Buyer balance is available and the account is active.' },
        {
          id: 'funding', group: 'purchase', state: 'pass',
          summary: 'Account funding is available; buyer balance is 10000 × 10^-6 AUD.',
        },
        { id: 'call', group: 'purchase', state: 'pass', summary: 'No pending or reconciliation-required Call needs attention.' },
        { id: 'market_requests', group: 'purchase', state: 'pass', summary: 'No private market requests need rechecking.' },
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
      tier: TIER1_RESULT,
      groups: { discovery: 'fail', quoting: 'skipped', purchase: 'warn' },
      checks: [
        { id: 'origin', group: 'discovery', state: 'pass', summary: `Configured origin is ${origin}.` },
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
        { id: 'catalogue', group: 'discovery', state: 'warn', summary: 'Market catalogue coverage could not be read.' },
        {
          id: 'buyer', group: 'quoting', state: 'warn',
          summary: 'No buyer credential is selected for this origin; anonymous search and describe remain available.',
          nextCommand: `npm run connect:local -- --base-url ${origin}`,
        },
        unconnectedQuoteCheck(`npm run connect:local -- --base-url ${origin}`),
        { id: 'balance', group: 'purchase', state: 'warn', summary: 'Balance is unavailable until a buyer credential is connected.' },
        { id: 'call', group: 'purchase', state: 'warn', summary: 'Call recovery is unavailable until a buyer credential is connected.' },
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

  it('passes quoting when the seeded sandbox Tool returns an admitted Quote', async () => {
    const buyerSecret = 'FAKE_QUOTE_BUYER_SECRET_2210'
    const observed: ObservedRequest[] = []
    const origin = await startQuoteServer({ quote: committedQuote() }, observed)
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })

    expect(json.status).toBe(0)
    expect(json.stderr).toBe('')
    expect(json.stdout).not.toContain(buyerSecret)
    const result = JSON.parse(json.stdout) as { kind: string; groups: unknown; checks: unknown[] }
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

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
    expect(human.status).toBe(0)
    expect(human.stdout).toContain('✓ Quote for the sandbox Tool was admitted at 1000000 × 10^-6 AUD.')
    expect(human.stdout).toContain('discovery: pass | quoting: pass | purchase: pass')
    expect(human.stdout).not.toContain(buyerSecret)
  }, 20_000)

  it('fails quoting with the refusal code verbatim and routes to the sandbox authority stage', async () => {
    const buyerSecret = 'FAKE_REFUSED_BUYER_SECRET_5540'
    const origin = await startQuoteServer({ quote: refusedQuote('grant_not_found') }, [])
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })

    expect(json.status).toBe(0)
    expect(json.stdout).not.toContain(buyerSecret)
    const result = JSON.parse(json.stdout) as { kind: string; groups: unknown; checks: unknown[] }
    expect(result.kind).toBe('degraded')
    expect(result.groups).toEqual({ discovery: 'pass', quoting: 'fail', purchase: 'pass' })
    expect(result.checks).toEqual(expect.arrayContaining([{
      id: 'quote', group: 'quoting', state: 'fail',
      summary: 'Quote for the sandbox Tool was refused (grant_not_found).',
      nextCommand: LOCAL_DEV_COMMAND,
    }]))

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
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

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })

    expect(json.status).toBe(0)
    const result = JSON.parse(json.stdout) as { groups: unknown; checks: unknown[] }
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

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })

    expect(json.status).toBe(0)
    const result = JSON.parse(json.stdout) as { groups: { quoting: string }; checks: unknown[] }
    expect(result.groups.quoting).toBe('skipped')
    expect(result.checks).toEqual(expect.arrayContaining([
      unconnectedQuoteCheck(`npm run connect:local -- --base-url ${origin}`),
    ]))

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
    expect(human.stdout).toContain('- Quote inspection was skipped: no buyer credential for this origin.')
    expect(human.stdout).toContain('quoting: skipped')
  }, 20_000)

  it('skips quoting when no sandbox Tool is published on a loopback origin and names the hosted alternative', async () => {
    const buyerSecret = 'FAKE_ABSENT_TOOL_SECRET_7724'
    const observed: ObservedRequest[] = []
    const origin = await startQuoteServer({ quote: committedQuote(), search: emptySearchResult() }, observed)
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })

    expect(json.status).toBe(0)
    const result = JSON.parse(json.stdout) as { groups: { quoting: string }; checks: unknown[] }
    expect(result.groups.quoting).toBe('skipped')
    expect(result.checks).toEqual(expect.arrayContaining([
      skippedQuoteCheck(LOOPBACK_NO_SANDBOX_TOOL_REASON, LOOPBACK_DOCTOR_COMMAND),
    ]))
    // No Tool to quote means no Quote request is sent at all.
    expect(observed.map((request) => request.path)).toEqual([TOOL_MARKET_SEARCH_PATH])
  }, 20_000)

  it('skips quoting instead of passing it when the Quote inspection cannot be read', async () => {
    const buyerSecret = 'FAKE_UNREADABLE_QUOTE_SECRET_8836'
    const origin = await startQuoteServer({ quote: committedQuote(), search: { unexpected: true } }, [])
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })

    expect(json.status).toBe(0)
    const result = JSON.parse(json.stdout) as { kind: string; groups: { quoting: string }; checks: unknown[] }
    // Buyer passes, so only the required skipped Quote keeps quoting off a pass.
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'buyer', group: 'quoting', state: 'pass' }),
      skippedQuoteCheck('quote inspection timed out'),
    ]))
    expect(result.groups.quoting).toBe('skipped')
    expect(result.kind).toBe('ready')
  }, 20_000)

  it('warns discovery on a stale catalogue and fails it on a failed refresh', async () => {
    const buyerSecret = 'FAKE_CATALOGUE_BUYER_SECRET_9948'
    const scenario: QuoteScenario = { quote: committedQuote(), catalogue: 'stale', balanceUnits: '0' }
    const origin = await startQuoteServer(scenario, [])
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const stale = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })
    expect(stale.status).toBe(0)
    const staleResult = JSON.parse(stale.stdout) as { groups: unknown; checks: unknown[] }
    expect(staleResult.groups).toEqual({ discovery: 'warn', quoting: 'pass', purchase: 'warn' })
    expect(staleResult.checks).toEqual(expect.arrayContaining([{
      id: 'catalogue', group: 'discovery', state: 'warn', summary: 'Market catalogue coverage is stale.',
    }]))

    scenario.catalogue = 'failed'
    const failed = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })
    expect(failed.status).toBe(0)
    const failedResult = JSON.parse(failed.stdout) as { groups: { discovery: string }; checks: unknown[] }
    expect(failedResult.groups.discovery).toBe('fail')
    expect(failedResult.checks).toEqual(expect.arrayContaining([{
      id: 'catalogue', group: 'discovery', state: 'fail', summary: 'Market catalogue refresh failed.',
    }]))
  }, 20_000)

  it('fails funding and reports tier 0 with the missing names on a loopback origin without Stripe or CDP/x402 sandbox credentials', async () => {
    const buyerSecret = 'FAKE_TIER0_LOOPBACK_BUYER_SECRET_3301'
    const origin = await startQuoteServer({ quote: committedQuote() }, [])
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: tier0Environment(directory) })
    expect(json.status).toBe(0)
    const result = JSON.parse(json.stdout) as { tier: unknown; checks: unknown[] }
    expect(result.tier).toEqual({ level: 0, missing: TIER0_MISSING_NAMES })
    expect(result.checks).toEqual(expect.arrayContaining([{
      id: 'funding', group: 'purchase', state: 'fail',
      summary: `Account funding is unavailable: Stripe test mode is not configured (missing: ${STRIPE_MONEY_ENV_NAMES.join(', ')}).`,
      nextCommand: LOCAL_STRIPE_TEST_MODE_DOC,
    }]))

    const human = await spawnCli(['doctor', '--base-url', origin], { env: tier0Environment(directory) })
    expect(human.stdout).toContain(`tier: 0 (missing: ${TIER0_MISSING_NAMES.join(', ')})`)
  }, 20_000)

  it('reports tier 1 once Stripe test mode and the CDP/x402 sandbox bundle are configured', async () => {
    const buyerSecret = 'FAKE_TIER1_BUYER_SECRET_3303'
    const origin = await startQuoteServer({ quote: committedQuote() }, [])
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })
    expect(json.status).toBe(0)
    const result = JSON.parse(json.stdout) as { tier: unknown }
    expect(result.tier).toEqual(TIER1_RESULT)

    const human = await spawnCli(['doctor', '--base-url', origin], { env: cleanEnvironment(directory) })
    expect(human.stdout).toContain('tier: 1')
  }, 20_000)

  it('warns to fund the Account at the owner credit page on a loopback origin once test mode is configured', async () => {
    const buyerSecret = 'FAKE_FUNDING_WARN_LOOPBACK_3304'
    const origin = await startQuoteServer({ quote: committedQuote(), balanceUnits: '0' }, [])
    const directory = makeConfigDirectory()
    writeStoredConfig(directory, origin, buyerSecret)

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })
    expect(json.status).toBe(0)
    const result = JSON.parse(json.stdout) as { checks: unknown[] }
    expect(result.checks).toEqual(expect.arrayContaining([{
      id: 'funding', group: 'purchase', state: 'warn',
      summary: `Buyer balance is empty; fund the Account as the owner at ${origin}/owner/credit (Stripe test mode).`,
      nextCommand: `${origin}/owner/credit`,
    }]))
  }, 20_000)

  // A hosted origin can only carry a bound, authenticated buyer credential over https,
  // which this suite's plain-http test servers cannot provide (see the loopback-only
  // `secure` check in doctor.ts's credentialOriginFailure). These two cases exercise the
  // funding check's loopback-vs-hosted branching directly instead of over the network.
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

    const json = await spawnCli(['doctor', '--base-url', origin, '--json'], { env: cleanEnvironment(directory) })
    expect(json.status).toBe(0)
    const result = JSON.parse(json.stdout) as { checks: unknown[] }
    expect(result.checks).toEqual(expect.arrayContaining([{
      id: 'funding', group: 'purchase', state: 'pass',
      summary: 'Account funding is available; buyer balance is 2000000 × 10^-6 AUD.',
    }]))
  }, 20_000)
})

type ObservedRequest = Readonly<{ path: string; authorization?: string; body: unknown }>

type QuoteScenario = {
  quote: unknown
  search?: unknown
  catalogue?: 'fresh' | 'stale' | 'failed' | 'absent'
  balanceUnits?: string
}

/**
 * One healthy buyer origin that also serves the sandbox search, Quote, and
 * catalogue answers each quoting case varies.
 */
async function startQuoteServer(scenario: QuoteScenario, observed: ObservedRequest[], host?: string): Promise<string> {
  return await startServer((request, response) => {
    const url = request.url ?? ''
    if (url === TOOL_MARKET_SEARCH_PATH || url === TOOL_QUOTE_PATH) {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        observed.push({
          path: url,
          ...(request.headers.authorization === undefined ? {} : { authorization: request.headers.authorization }),
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        })
        respondJson(response, url === TOOL_QUOTE_PATH ? scenario.quote : scenario.search ?? sandboxSearchResult())
      })
      return
    }
    if (url === '/api/v1/catalogue-status') {
      respondJson(response, catalogueStatus(scenario.catalogue ?? 'fresh'))
      return
    }
    if (respondHealthyDeployment(request, response)) return
    if (url === '/.well-known/ucp') {
      respondJson(response, { schemaVersion: 'ae-site-discovery:v2', origin: `http://${request.headers.host}` })
      return
    }
    if (url === '/api/v1/account') {
      respondJson(response, {
        kind: 'authenticated', principalRef: 'prn_buyer', accountRef: 'acc_owner',
        credentialId: 'credential_buyer', applicationRef: 'agentic-economy', environment: 'sandbox',
        scopes: ['market_tools:call'], authorityMode: 'spending_policy',
      })
      return
    }
    if (url === '/api/v1/account/balance') {
      respondJson(response, {
        kind: 'available', principalRef: 'prn_buyer', accountRef: 'acc_owner',
        balance: { currency: 'AUD', units: scenario.balanceUnits ?? '25000000', exponent: 6 },
        accountState: 'active', version: 1, updatedAt: 10,
        funding: { kind: 'agent_funding_handoff', configAction: 'funding.handoff.config', createAction: 'funding.handoff.create', statusAction: 'funding.handoff.status' },
      })
      return
    }
    if (url === '/api/v1/calls?limit=100' || url === '/api/v1/market-requests/list') {
      respondJson(response, { kind: 'available', items: [], hasMore: false })
      return
    }
    respondJson(response, { error: 'unexpected' }, 404)
  }, host)
}

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  // '0.0.0.0' resolves to the loopback interface but is not itself a loopback
  // hostname, so it stands in for a hosted origin without any real network.
  host = '127.0.0.1',
): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, host, resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('doctor_test_server_missing')
  return `http://${host}:${address.port}`
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
  if (request.url === '/api/v1/catalogue-status') {
    respondJson(response, catalogueStatus('fresh'))
    return true
  }
  // A healthy deployment with an empty market: doctor finds no sandbox Tool to quote.
  if (request.url === TOOL_MARKET_SEARCH_PATH) {
    respondJson(response, emptySearchResult())
    return true
  }
  return false
}

function catalogueStatus(status: 'fresh' | 'stale' | 'failed' | 'absent') {
  const completedAt = Date.now() - (status === 'stale' ? 40 * 60 * 60 * 1000 : 3_600_000)
  return {
    schemaVersion: 'catalogue-status:v1',
    status,
    refreshState: status === 'failed' ? 'failed' : 'complete',
    ...(status === 'absent' ? {} : { generation: 'g1', completedAt, ageHours: status === 'stale' ? 40 : 1 }),
  }
}

function emptySearchResult() {
  return {
    kind: 'no_candidates', schemaVersion: 'registry-tools:v3', query: SANDBOX_TOOL_SLUG, count: 0,
    items: [], note: 'No Tools match this search.', pagination: { limit: 10, hasMore: false },
  }
}

function sandboxSearchResult() {
  return {
    kind: 'ok', schemaVersion: 'registry-tools:v3', query: SANDBOX_TOOL_SLUG, count: 1,
    items: [{
      toolRef: SANDBOX_TOOL_REF, capabilityId: 'sandbox.aecon-reference',
      title: 'AEcon sandbox reference Tool', description: 'Deterministic sandbox Tool.',
      provider: { name: 'AEcon sandbox reference provider', slug: SANDBOX_TOOL_SLUG },
      priceLabel: 'AUD 1.00', healthStatus: 'operational',
    }],
    pagination: { limit: 10, hasMore: false },
  }
}

function committedQuote() {
  return {
    kind: 'committed', quoteRef: 'quote:v1:sandbox', toolRef: SANDBOX_TOOL_REF, toolVersion: 1,
    expiresAt: 1, normalizedInput: { request: 'ae doctor quote inspection' },
    price: { currency: 'AUD', units: '1000000', exponent: 6 },
    account: { accountRef: 'acc_owner', available: { currency: 'AUD', units: '25000000', exponent: 6 } },
    budget: { principalRef: 'prn_buyer', maximumPerCall: { currency: 'AUD', units: '5000000', exponent: 6 } },
    policyRefs: [], evidenceDigest: 'sha256:sandbox-quote',
    continuation: {
      action: 'tool.call', method: 'POST', path: '/api/v1/tools/call',
      input: { quoteRef: 'quote:v1:sandbox', idempotencyKey: 'idem-sandbox' },
    },
  }
}

function refusedQuote(code: string) {
  return { kind: 'refused', toolRef: SANDBOX_TOOL_REF, code, retryable: false, correlationRef: 'corr_sandbox' }
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
    ...TIER1_ENV,
    AE_CONFIG_DIR: directory,
    AE_API_KEY: '',
    AE_API_KEY_ORIGIN: '',
    AE_CLI_BASE_URL: '',
    AE_CANONICAL_BASE_URL: '',
    // The doctor command now loads the Stripe SDK to check test-mode configuration.
    // Stripe's SDK writes an unrelated agent hint to stderr when it sees these Claude
    // Code session markers, which would otherwise pollute the CLI's own stderr checks.
    CLAUDECODE: '',
    CLAUDE_CODE_CHILD_SESSION: '',
  }
}
