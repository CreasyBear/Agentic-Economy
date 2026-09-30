import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'

import { listMcpActions, mcpToolName } from '@/modules/actions'
import { TOOL_MARKET_DESCRIBE_PATH, TOOL_MARKET_LIST_PATH } from '@/modules/common/market-tool-paths'
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
} from '@/modules/capability-supply/server'

import { CLI_BUNDLE_PATH, spawnCli } from './cli-errors-harness'

export const SANDBOX_TOOL_SLUG = 'sandbox-aecon-reference'
export const SANDBOX_TOOL_REF = `operation:v1:${'e'.repeat(64)}`
export const LOCAL_DEV_COMMAND = 'npm run dev:local'
export const LOOPBACK_NO_SANDBOX_TOOL_REASON = 'no routeable sandbox Tool on this loopback origin. The readiness probe only reaches public HTTPS endpoints, so the seeded sandbox Tool is listed on hosted origins (preview or production), not on 127.0.0.1. Discover and connect are provable here; Quote is provable on a hosted origin.'
export const LOOPBACK_DOCTOR_COMMAND = 'ae doctor --base-url <hosted origin> --json'
export const FRESH_CATALOGUE_CHECK = { id: 'catalogue', group: 'discovery', state: 'pass', summary: 'Market catalogue coverage is fresh.' }

export const TIER1_ENV: NodeJS.ProcessEnv = {
  AE_DEPLOYMENT_ENVIRONMENT: 'development',
  STRIPE_SECRET_KEY: 'rk_test_FIXTURE',
  STRIPE_WEBHOOK_SECRET: 'whsec_FIXTURE',
  STRIPE_V2_WEBHOOK_SECRET: 'whsec_FIXTURE_V2',
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
export const TIER0_MISSING_NAMES = [...STRIPE_MONEY_ENV_NAMES, ...X402_CUSTODY_ENV_NAMES]
export const TIER1_RESULT = { level: 1, missing: [] }
export const LOCAL_STRIPE_TEST_MODE_DOC = 'docs/operations/local-stripe-test-mode.md'

export const AGENT_FUNDING_HANDOFF = {
  kind: 'agent_funding_handoff',
  configAction: 'funding.handoff.config',
  createAction: 'funding.handoff.create',
  statusAction: 'funding.handoff.status',
}

const RELEASE_IDENTITY = 'a'.repeat(40)

export function tier0Environment(directory: string): NodeJS.ProcessEnv {
  const blanked = Object.fromEntries(Object.keys(TIER1_ENV).map((name) => [name, '']))
  return { ...cleanEnvironment(directory), ...blanked }
}

export function skippedQuoteCheck(reason: string, nextCommand?: string, code?: string) {
  const trimmedReason = reason.endsWith('.') ? reason.slice(0, -1) : reason
  return {
    id: 'quote', group: 'quoting', state: 'skipped', reason,
    summary: `Quote inspection was skipped: ${trimmedReason}.`,
    ...(nextCommand === undefined ? {} : { nextCommand }),
    ...(code === undefined ? {} : { code }),
  }
}

export function unconnectedQuoteCheck(connectCommand: string) {
  return skippedQuoteCheck('no buyer credential for this origin', connectCommand, 'no_buyer_credential')
}

export function originPassCheck(origin: string) {
  return { id: 'origin', group: 'discovery', state: 'pass', summary: `Configured origin is ${origin}.` }
}

export function discoveryPassChecks(origin: string) {
  return [
    originPassCheck(origin),
    { id: 'server', group: 'discovery', state: 'pass', summary: 'AE server is reachable and manifest ae-site-discovery:v2 is compatible.' },
    expect.objectContaining({ id: 'mcp', group: 'discovery', state: 'pass' }),
    { id: 'readiness', group: 'discovery', state: 'pass', summary: 'Server operational readiness passed.' },
    { id: 'release', group: 'discovery', state: 'pass', summary: `Release identity is ${RELEASE_IDENTITY}.` },
    FRESH_CATALOGUE_CHECK,
  ]
}

export function buyerPassCheck() {
  return { id: 'buyer', group: 'quoting', state: 'pass', summary: 'Buyer credential is origin-bound, authenticated, and has market_tools:call.' }
}

export function balancePassCheck() {
  return { id: 'balance', group: 'purchase', state: 'pass', summary: 'Buyer balance is available and the account is active.' }
}

export function fundingPassCheck(balanceUnits: string) {
  return {
    id: 'funding', group: 'purchase', state: 'pass',
    summary: `Account funding is available; buyer balance is ${balanceUnits} × 10^-6 AUD.`,
  }
}

export function callPassCheck(summary = 'No pending or reconciliation-required Call needs attention.') {
  return { id: 'call', group: 'purchase', state: 'pass', summary }
}

export function marketRequestsPassCheck(summary = 'No private market requests need rechecking.') {
  return { id: 'market_requests', group: 'purchase', state: 'pass', summary }
}

export function authenticatedBuyerAccount(scope: 'market_tools:call' | 'market_supply:manage' = 'market_tools:call', principalRef = 'prn_buyer', credentialId = 'credential_buyer') {
  return {
    kind: 'authenticated', principalRef, accountRef: 'acc_owner',
    credentialId, applicationRef: 'agentic-economy', environment: 'sandbox',
    scopes: [scope], authorityMode: 'spending_policy',
  }
}

export function buyerBalancePayload(units: string) {
  return {
    kind: 'available', principalRef: 'prn_buyer', accountRef: 'acc_owner',
    balance: { currency: 'AUD', units, exponent: 6 },
    accountState: 'active', version: 1, updatedAt: 10,
    funding: AGENT_FUNDING_HANDOFF,
  }
}

export function emptyPagedList() {
  return { kind: 'available', items: [], hasMore: false }
}

export function unconnectedBuyerChecks(connectCommand: string) {
  return [
    {
      id: 'buyer', group: 'quoting', state: 'warn',
      summary: 'No buyer credential is selected for this origin; anonymous search and describe remain available.',
      nextCommand: connectCommand,
    },
    unconnectedQuoteCheck(connectCommand),
    { id: 'balance', group: 'purchase', state: 'warn', summary: 'Balance is unavailable until a buyer credential is connected.' },
    { id: 'call', group: 'purchase', state: 'warn', summary: 'Call recovery is unavailable until a buyer credential is connected.' },
  ]
}

export function readyBuyerPurchaseChecks(balanceUnits: string) {
  return [
    balancePassCheck(),
    fundingPassCheck(balanceUnits),
    callPassCheck(),
    marketRequestsPassCheck(),
  ]
}

export function readyBuyerDiagnosisChecks(origin: string, balanceUnits: string, quoteCheck: ReturnType<typeof skippedQuoteCheck>) {
  return [
    ...discoveryPassChecks(origin),
    buyerPassCheck(),
    quoteCheck,
    ...readyBuyerPurchaseChecks(balanceUnits),
  ]
}

export type CliResult = Readonly<{ status: number | null; stderr: string; stdout: string }>

export function assertCliSuccess(result: CliResult, status?: number): void {
  const expected = status ?? (result.stdout.startsWith('{') && JSON.parse(result.stdout).kind === 'degraded' ? 1 : 0)
  expect(result.status).toBe(expected)
  expect(result.stderr).toBe('')
}

export function parseDoctorJson(result: CliResult) {
  return JSON.parse(result.stdout) as {
    kind: string
    information?: { localProviderEnvironment: { level: number; missing: string[] } }
    groups?: unknown
    checks: unknown[]
  }
}

export async function runDoctor(
  directory: string,
  origin: string,
  options?: { json?: boolean; extraArgs?: readonly string[]; env?: NodeJS.ProcessEnv },
): Promise<CliResult> {
  const json = options?.json !== false
  const extra = options?.extraArgs ?? []
  const args = ['doctor', ...extra, '--base-url', origin, ...(json ? ['--json'] as const : [])]
  return await spawnCli(args, { env: options?.env ?? cleanEnvironment(directory) })
}

export const temporaryDirectories: string[] = []
export const servers: ReturnType<typeof createServer>[] = []

export async function teardownDoctorHarness(): Promise<void> {
  await Promise.all(servers.splice(0).map(async (server) => await new Promise<void>((resolve) => server.close(() => resolve()))))
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
}

export type ObservedRequest = Readonly<{ path: string; authorization?: string; body: unknown }>

export type QuoteScenario = {
  quote: unknown
  list?: unknown
  catalogue?: 'fresh' | 'stale' | 'failed' | 'absent'
  balanceUnits?: string
}

export type RequestRouteContext = {
  request: IncomingMessage
  response: ServerResponse
  url: string
  bodyText: string
  body: unknown
  authorization?: string
}

export function onRequestEnd(request: IncomingMessage, handler: (body: Buffer) => void): void {
  const chunks: Buffer[] = []
  request.on('data', (chunk: Buffer) => chunks.push(chunk))
  request.on('end', () => handler(Buffer.concat(chunks)))
}

export function routeContext(request: IncomingMessage, response: ServerResponse, body: Buffer): RequestRouteContext {
  const bodyText = body.toString('utf8')
  return {
    request,
    response,
    url: request.url ?? '',
    bodyText,
    body: bodyText.length === 0 ? undefined : JSON.parse(bodyText),
    ...(request.headers.authorization === undefined ? {} : { authorization: request.headers.authorization }),
  }
}

export type BuyerServerOptions = {
  host?: string
  manifestOrigin?: string
  balanceUnits?: string
  calls?: unknown[] | (() => unknown[])
  marketRequestItems?: unknown[]
  marketRequestStatus?: (body: unknown) => unknown
  describeTool?: (body: unknown, authorization?: string) => unknown
  accountResponse?: (authorization?: string) => unknown
  observed?: Array<{ method: string; path: string; authorization?: string; body?: string }>
  providerRequests?: Array<{ path: string; body: unknown }>
  providerRequestPaths?: string[]
  extraRoute?: (ctx: RequestRouteContext) => boolean
}

export async function startBuyerServer(options: BuyerServerOptions = {}): Promise<string> {
  let origin = ''
  const balanceUnits = options.balanceUnits ?? '25000000'
  origin = await startServer((request, response) => {
    if (respondHealthyDeployment(request, response)) return
    onRequestEnd(request, (bodyBuffer) => {
      const ctx = routeContext(request, response, bodyBuffer)
      options.observed?.push({
        method: request.method ?? '',
        path: ctx.url,
        ...(ctx.authorization === undefined ? {} : { authorization: ctx.authorization }),
        ...(bodyBuffer.length === 0 ? {} : { body: ctx.bodyText }),
      })

      if (ctx.url === '/.well-known/ucp') {
        const manifestOrigin = options.manifestOrigin ?? origin
        respondJson(response, { schemaVersion: 'ae-site-discovery:v2', origin: manifestOrigin })
        return
      }
      if (ctx.url === '/api/v1/account') {
        const payload = options.accountResponse === undefined
          ? authenticatedBuyerAccount()
          : options.accountResponse(ctx.authorization)
        respondJson(response, payload)
        return
      }
      if (ctx.url === '/api/v1/account/balance') {
        respondJson(response, buyerBalancePayload(balanceUnits))
        return
      }
      if (ctx.url === '/api/v1/calls?limit=100') {
        const items = typeof options.calls === 'function' ? options.calls() : (options.calls ?? [])
        respondJson(response, { kind: 'available', hasMore: false, items })
        return
      }
      if (ctx.url === '/api/v1/market-requests/list') {
        respondJson(response, {
          kind: 'available',
          hasMore: false,
          items: options.marketRequestItems ?? [],
        })
        return
      }
      if (ctx.url === '/api/v1/market-requests/status' && options.marketRequestStatus !== undefined) {
        respondJson(response, options.marketRequestStatus(ctx.body))
        return
      }
      if (ctx.url === '/api/v1/market-tools/describe' && options.describeTool !== undefined) {
        respondJson(response, options.describeTool(ctx.body, ctx.authorization))
        return
      }
      if (ctx.url === '/api/v1/supply/tools/list' && options.providerRequests !== undefined) {
        options.providerRequests.push({ path: ctx.url, body: ctx.body })
        respondJson(response, {
          kind: 'available', schemaVersion: 'provider_tools:v1', businessRef: 'business:one', isDone: true, continueCursor: null,
          page: [supplyOperation('offering:live', true), supplyOperation('offering:unready', false)],
        })
        return
      }
      if (ctx.url === '/api/v1/supply/connections/list' && options.providerRequests !== undefined) {
        options.providerRequests.push({ path: ctx.url, body: ctx.body })
        respondJson(response, {
          kind: 'available', businessId: 'business:one',
          connections: [
            supplyConnection('connection:ready', true, 'active'),
            supplyConnection('connection:cleanup', false, 'cleanup_required'),
          ],
        })
        return
      }
      if (options.providerRequestPaths !== undefined) {
        options.providerRequestPaths.push(ctx.url)
      }
      if (options.extraRoute?.(ctx)) return
      respondJson(response, { error: 'unexpected' }, 404)
    })
  }, options.host)
  return origin
}

export async function startQuoteServer(scenario: QuoteScenario, observed: ObservedRequest[], host?: string): Promise<string> {
  return await startServer((request, response) => {
    const url = request.url ?? ''
    if (url === TOOL_MARKET_LIST_PATH || url === TOOL_MARKET_DESCRIBE_PATH || url === TOOL_QUOTE_PATH) {
      onRequestEnd(request, (bodyBuffer) => {
        observed.push({
          path: url,
          ...(request.headers.authorization === undefined ? {} : { authorization: request.headers.authorization }),
          body: JSON.parse(bodyBuffer.toString('utf8')),
        })
        respondJson(response, url === TOOL_QUOTE_PATH ? scenario.quote
          : url === TOOL_MARKET_LIST_PATH ? scenario.list ?? sandboxListResult()
          : { kind: 'found', schemaVersion: 'registry-tools:v3', tool: {
              ...currentTool(SANDBOX_TOOL_REF),
              capabilityId: 'sandbox.frankfurter-fx',
              priceLabel: 'AUD 1.00',
              commercialPrice: { kind: 'fixed', amount: { currency: 'AUD', units: '1000000', exponent: 6 } },
              provider: { name: 'AEcon sandbox reference provider', slug: SANDBOX_TOOL_SLUG },
            } })
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
      respondJson(response, authenticatedBuyerAccount())
      return
    }
    if (url === '/api/v1/account/balance') {
      respondJson(response, buyerBalancePayload(scenario.balanceUnits ?? '25000000'))
      return
    }
    if (url === '/api/v1/calls?limit=100' || url === '/api/v1/market-requests/list') {
      respondJson(response, emptyPagedList())
      return
    }
    respondJson(response, { error: 'unexpected' }, 404)
  }, host)
}

export async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  host = '127.0.0.1',
): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, host, resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('doctor_test_server_missing')
  return `http://${host}:${address.port}`
}

export function respondJson(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

export function respondHealthyDeployment(request: IncomingMessage, response: ServerResponse): boolean {
  if (request.url === '/mcp' && request.method === 'GET') {
    response.writeHead(405)
    response.end()
    return true
  }
  if (request.url === '/mcp' && request.method === 'POST') {
    onRequestEnd(request, (bodyBuffer) => {
      const message = JSON.parse(bodyBuffer.toString('utf8')) as {
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
    respondJson(response, { kind: 'ok', sourceRevision: RELEASE_IDENTITY })
    return true
  }
  if (request.url === '/api/v1/catalogue-status') {
    respondJson(response, catalogueStatus('fresh'))
    return true
  }
  if (request.url === TOOL_MARKET_LIST_PATH) {
    respondJson(response, emptyListResult())
    return true
  }
  return false
}

export function catalogueStatus(status: 'fresh' | 'stale' | 'failed' | 'absent') {
  const completedAt = Date.now() - (status === 'stale' ? 40 * 60 * 60 * 1000 : 3_600_000)
  return {
    schemaVersion: 'catalogue-status:v1',
    status,
    refreshState: status === 'failed' ? 'failed' : 'complete',
    ...(status === 'absent' ? {} : { generation: 'g1', completedAt, ageHours: status === 'stale' ? 40 : 1 }),
  }
}

export function emptyListResult() {
  return {
    kind: 'ok', schemaVersion: 'registry-tools:v3', count: 0,
    items: [], pagination: { limit: 100, hasMore: false },
  }
}

export function sandboxListResult() {
  return {
    kind: 'ok', schemaVersion: 'registry-tools:v3', count: 1,
    items: [{
      toolRef: SANDBOX_TOOL_REF, capabilityId: 'sandbox.frankfurter-fx',
      title: 'AEcon sandbox reference Tool', description: 'Deterministic sandbox Tool.',
      provider: { name: 'AEcon sandbox reference provider', slug: SANDBOX_TOOL_SLUG },
      priceLabel: 'AUD 1.00', healthStatus: 'operational', listingTier: 'reviewed',
      verification: 'verified', network: 'unknown', claimSource: 'provider',
    }],
    pagination: { limit: 100, hasMore: false },
  }
}

export function committedQuote() {
  return {
    kind: 'committed', quoteRef: 'quote:v1:sandbox', toolRef: SANDBOX_TOOL_REF, toolVersion: 1,
    expiresAt: 1, normalizedInput: { from: 'EUR', to: 'USD' },
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

export function refusedQuote(code: string) {
  return { kind: 'refused', toolRef: SANDBOX_TOOL_REF, code, retryable: false, correlationRef: 'corr_sandbox' }
}

export function makeConfigDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ae-doctor-'))
  temporaryDirectories.push(directory)
  writeFileSync(join(directory, 'sentinel.txt'), 'unchanged')
  return directory
}

export function readSentinel(directory: string): string {
  return readFileSync(join(directory, 'sentinel.txt'), 'utf8')
}

export function installAeShim(directory: string): void {
  writeFileSync(join(directory, 'ae'), '#!/bin/sh\nexec "$AE_TEST_NODE" "$AE_TEST_CLI" "$@"\n', { mode: 0o755 })
}

export async function runShell(command: string, environment: NodeJS.ProcessEnv): Promise<CliResult> {
  const { promise, resolve: resolveResult, reject } = Promise.withResolvers<CliResult>()
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

export function writeStoredConfig(directory: string, origin: string, buyerSecret: string, providerSecret?: string): void {
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

export function supplyOperation(offeringRef: string, live: boolean) {
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

export function supplyConnection(connectionRef: string, available: boolean, lifecycle: 'active' | 'cleanup_required') {
  return {
    connectionRef, businessId: 'business:one', providerRef: 'provider:one', providerAccountRef: 'provider-account:one',
    adapterId: 'x402:v1', grantedScopes: [], grantedResources: [], authorityGeneration: 1,
    authorityDigest: 'sha256:authority', lifecycle, available, credentialConfigured: available,
    observedAt: 10, reasonCode: available ? null : 'cleanup_failed', evidenceRefs: [], createdAt: 1, updatedAt: 10,
  }
}

export function currentTool(toolRef: string) {
  return {
    toolRef,
    capabilityId: 'reference.lookup',
    title: 'Reference lookup',
    description: 'Current reference lookup',
    provider: { slug: 'reference', name: 'Reference Services' },
    priceLabel: 'USD 0.00',
    commercialPrice: { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 6 } },
    healthStatus: 'operational',
    readiness: 'ready',
    verification: 'verified',
    network: 'unknown',
    claimSource: 'provider',
    inputJsonSchema: { type: 'object' },
    outputJsonSchema: { type: 'object' },
    materialTerms: [],
    dataUse: [],
    effects: [],
    evidence: [],
    authentication: { kind: 'ae_api_key' },
    listingTier: 'reviewed',
  }
}

export function cleanEnvironment(directory: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...TIER1_ENV,
    AE_CONFIG_DIR: directory,
    AE_API_KEY: '',
    AE_API_KEY_ORIGIN: '',
    AE_CLI_BASE_URL: '',
    AE_CANONICAL_BASE_URL: '',
    CLAUDECODE: '',
    CLAUDE_CODE_CHILD_SESSION: '',
  }
}

export function providerAccountResponse(providerSecret: string, authorization?: string) {
  const provider = authorization === `Bearer ${providerSecret}`
  return authenticatedBuyerAccount(
    provider ? 'market_supply:manage' : 'market_tools:call',
    provider ? 'prn_provider' : 'prn_buyer',
    provider ? 'credential_provider' : 'credential_buyer',
  )
}

export function hostedConnectCommand(origin: string) {
  return `ae connect --base-url ${origin} --json`
}

export function localConnectCommand(origin: string) {
  return `npm run connect:local -- --base-url ${origin}`
}

export { CLI_BUNDLE_PATH, spawnCli }
