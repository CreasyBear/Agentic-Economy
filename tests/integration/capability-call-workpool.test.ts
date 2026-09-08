import type { fetch as UndiciFetch } from 'undici'
import { Response as UndiciResponse } from 'undici'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  getFunctionName,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from 'convex/server'

const providerFetch = vi.hoisted(() => vi.fn<typeof UndiciFetch>())
vi.mock('undici', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  fetch: providerFetch,
}))

import { components, api, internal } from '../../convex/_generated/api'
import {
  convexTestWithWorkers,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import {
  admitPublication,
  capabilityPublicationInput,
  preparedPublicationArgs,
  seedCatalogOffering,
} from './capability-publication-harness'
import { installTestSourceWriteSecret, withSourceWrite, withSourceWriteCommand } from '../helpers/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  CUSTOMER_REQUEST_SPENDING_POLICY_SCOPE,
  MARKET_TOOLS_CALL_SCOPE,
} from '@/modules/agent-access/contract'
import {
  buildAgentAccessPolicy,
  createAgentAccessGrant,
} from '@/modules/agent-access/policy'
import {
  COMMERCIAL_POLICY_FAMILIES,
} from '@/modules/money/public'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../helpers/commercial-policy-fixtures'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { capabilitySupplyGraphPorts } from '../../convex/capabilitySupplyGraphPorts'
import { qualifySuppliedCandidate } from '@/modules/capability-supply/internal/graph/qualify-candidate'
import {
  setPublicSourceTransportForTests,
  type ConvexSourceTransport,
} from '@/lib/server/convex-source'
import { handleMarketToolSearchRequest } from '@/routes/api.v1.market-tools.search'
import { handleMarketToolDescribeRequest } from '@/routes/api.v1.market-tools.describe'
import { handleMarketToolCompareRequest } from '@/routes/api.v1.market-tools.compare'
import { handleAgentAccountGet } from '@/lib/server/agent-account-api'
import {
  handleToolQuotePost,
  handleToolCallPost,
  handleCallStatusGet,
} from '@/lib/server/call-api'
import { projectCallReceipt } from '@/modules/capability-execution/call-receipt-view'
import { callStatusResultSchema } from '@/modules/capability-execution/call-recovery.actions'

const INPUT = { request: 'lookup' } as const
const quoteByCallKey = new Map<string, string>()

type TestPrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'production'
  scopes: readonly string[]
  authorityMode: 'spending_policy'
}>

function publicReceipt(
  state: 'settled' | 'refunded' | 'reconciliation_required',
  suffix: string,
) {
  const buyerAmount = { currency: 'AUD', units: '1100000', exponent: 6 }
  const providerAmount = { currency: 'USDC', units: '1000000', exponent: 6 }
  return {
    commercialModel: 'account_aud' as const,
    receiptRef: `receipt:call-workpool:${suffix}`,
    state,
    buyerCharge: buyerAmount,
    serviceFee: { currency: 'AUD', units: '0', exponent: 6 },
    totalBuyerCharge: buyerAmount,
    providerObligation: {
      amount: providerAmount,
      settlementMethod: 'managed_x402' as const,
      payoutEligible: false as const,
    },
    providerSettlement: {
      network: 'eip155:8453' as const,
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,
      amount: providerAmount,
    },
    priceDigest: `price:call-workpool:${suffix}`,
    transactionRef: `transaction:call-workpool:${suffix}`,
    ...(state === 'refunded'
      ? { refundState: 'released' as const, lossState: 'provider_output_invalid' as const }
      : state === 'reconciliation_required'
        ? { refundState: 'unknown' as const, lossState: 'unknown' as const }
        : { refundState: 'not_applicable' as const, lossState: 'none' as const }),
    evidenceHash: `evidence:call-workpool:${suffix}`,
    issuedAt: '2026-08-12T00:00:00.000Z',
  }
}

async function seedKeylessLookup(
  backend: ConvexFixtureBackend,
  suffix = 'workpool-lookup',
): Promise<string> {
  const { businessId, owner } = await publishedBusinessOwner(backend, suffix)
  await seedCatalogOffering(backend, businessId, suffix, '/lookup', 'GET')
  const source = capabilityPublicationInput(businessId, suffix)
  const prepared = await preparedPublicationArgs(backend, {
    ...source,
    offering: {
      ...source.offering,
      presentation: {
        ...source.offering.presentation,
        price: {
          kind: 'fixed',
          amount: { currency: 'AUD', units: '0', exponent: 6 },
        },
      },
    },
    binding: {
      ...source.binding,
      endpointUrl: `https://${suffix}.example.test/lookup`,
      authority: { kind: 'public_upstream' },
      adapter: {
        adapterId: 'http-json:v1',
        config: {
          method: 'GET',
          query: [{ inputPointer: '/request', parameter: 'request' }],
          requestTimeoutMs: 5_000,
        },
      },
    },
  })
  const {
    sourceWrite: _sourceWrite,
    sourceWriteRequest: _sourceWriteRequest,
    ...preparedWithoutAdmission
  } = prepared
  const published = await owner.mutation(
    api.capabilitySupply.publishPreparedCapability,
    await withSourceWrite('catalog_publish', {
      ...preparedWithoutAdmission,
      proof: {
        reverificationId: `reverify:workpool-publication:${suffix}`,
        firstFactorAgeMinutes: 0,
        secondFactorAgeMinutes: 0,
      },
    }),
  )
  if ('reason' in published) throw new Error(`publication_refused:${published.reason}`)
  await admitPublication(backend, published, suffix)
  await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
  const publication = await backend.run(async (ctx) => (
    (await ctx.db.query('capabilityPublications').collect()).find((row) => (
      row.offeringId === published.offeringId && row.disposition === 'current'
    ))
  ))
  if (publication === undefined) throw new Error('workpool publication missing')
  const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: publication.publicationRef,
    expectedRevision: publication.revision,
    credentialState: 'ready',
    healthState: 'healthy',
    validUntil: Date.now() + 3_600_000,
    operationKey: `test:call-workpool:readiness:${publication.publicationRef}`,
    correlationId: 'test:call-workpool',
    reasonCode: 'test_readiness',
    evidenceRefs: ['test:call-workpool'],
  })
  if (observed.kind !== 'observed') throw new Error(`workpool readiness refused: ${observed.reason}`)
  const qualification = await backend.run(async (ctx) => qualifySuppliedCandidate(
    capabilitySupplyGraphPorts(ctx.db),
    {
      candidate: {
        publicationRef: publication.publicationRef,
        revision: publication.revision,
        networkId: publication.networkId,
        businessId: publication.businessId,
        offeringId: publication.offeringId,
        bindingId: publication.bindingId,
        contractRef: {
          capabilityId: publication.capabilityId,
          version: publication.version,
          contractDigest: publication.contractDigest,
        },
      },
      now: Date.now(),
    },
  ))
  expect(qualification).toMatchObject({ status: 'eligible', reasons: [] })
  return publication.toolRef
}

async function seedPrincipal(
  backend: ConvexFixtureBackend,
  suffix: string,
  now: number,
  toolRef: string,
  scopesOverride?: readonly string[],
): Promise<{ principal: TestPrincipal; grantRef: string }> {
  const ref = (kind: 'prn' | 'acc' | 'grt' | 'eid' | 'crd' | 'own', material: string) =>
    `${kind}_${canonicalDigest({ kind, material }).slice(7, 39)}`
  const principalId = ref('prn', suffix)
  const ownerId = ref('acc', suffix)
  const credentialId = `credential:call-workpool:${suffix}`
  const principal = {
    principalId,
    ownerId,
    credentialId,
    applicationRef: 'agentic-economy',
    environment: 'production' as const,
    scopes: [...(scopesOverride ?? [MARKET_TOOLS_CALL_SCOPE])],
    authorityMode: 'spending_policy' as const,
  }
  const grantRef = ref('grt', suffix)
  const amount = { currency: 'AUD' as const, units: '0', exponent: 6 as const }
  const policy = buildAgentAccessPolicy({
    environment: 'production',
    currency: 'AUD',
    exponent: 6,
    maximumSpendPerCall: amount,
    maximumDailySpend: amount,
    maximumMonthlySpend: amount,
  }
  )
  const expiresAt = now + 7 * 24 * 60 * 60 * 1_000
  const grantDecision = createAgentAccessGrant({
    grantRef,
    principalId: principal.principalId,
    ownerId: principal.ownerId,
    applicationRef: principal.applicationRef,
    credentialId: principal.credentialId,
    environment: principal.environment,
    toolAccess: 'all_admitted',
    toolRefs: [],
    authorityMode: principal.authorityMode,
    spendingPolicy: policy,
    lifecycle: 'active',
    generation: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  })
  if (grantDecision.kind !== 'accepted') throw new Error(`call_grant_refused:${grantDecision.code}`)
  const grant = grantDecision.grant
  const bindingRef = ref('eid', suffix)
  const canonicalCredentialRef = ref('crd', suffix)
  const ownershipRef = ref('own', suffix)
  const action = {
    actorPrincipalRef: principalId,
    activeAccountRef: ownerId,
    correlationRef: `correlation:call-workpool:${suffix}`,
    idempotencyRef: `idempotency:call-workpool:${suffix}`,
  }
  await backend.run(async (ctx) => {
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef,
      principalRef: principalId,
      providerNamespace: 'clerk/api-key',
      providerIdentifier: credentialId,
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: 1,
      bindIdempotencyRef: `bind:call-workpool:${suffix}`,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('credentials', {
      credentialRef: canonicalCredentialRef,
      bindingRef,
      principalRef: principalId,
      type: 'api_key',
      lifecycle: 'active',
      generation: 1,
      issueIdempotencyRef: `issue:call-workpool:${suffix}`,
      revision: 1,
      issuedAt: now,
      expiresAt: grant.expiresAt,
      updatedAt: now,
    })
    await ctx.db.insert('principals', {
      principalRef: principalId,
      kind: 'agent',
      displayName: `Call worker ${suffix}`,
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('accounts', {
      accountRef: ownerId,
      displayName: `Operation worker account ${suffix}`,
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: principalId,
      creationIdempotencyRef: `account:call-workpool:${suffix}`,
      initialOwnershipRef: ownershipRef,
      currentOwnershipRef: ownershipRef,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      lastAction: action,
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef,
      accountRef: ownerId,
      ownerPrincipalRef: principalId,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: now,
      createdBy: action,
    })
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef,
      accountRef: ownerId,
      actorPrincipalRef: principalId,
      subjectPrincipalRef: principalId,
      scopes: [...principal.scopes].sort(),
      resourceRefs: [toolRef],
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt: grant.expiresAt,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: now,
      createdBy: action,
    })
  })
  const recordedPrincipal = await backend.mutation(internal.agentAccessPrincipals.recordAgentPrincipal, {
    ...principal,
    scopes: [...principal.scopes],
    ownerTokenIdentifier: `token:call-workpool:${suffix}`,
    grantGeneration: 1,
    spendingPolicyDigest: grant.spendingPolicyDigest,
    lifecycle: 'active',
    seenAt: now,
  })
  if (recordedPrincipal.kind !== 'recorded') throw new Error(`principal fixture failed: ${recordedPrincipal.kind}`)
  const recordedGrant = await backend.mutation(internal.agentAccessPolicy.upsertGrant, { grant })
  if (recordedGrant.kind !== 'recorded') throw new Error(`grant fixture failed: ${recordedGrant.kind}`)
  return { principal, grantRef }
}

async function seedCommercialPolicies(backend: ConvexFixtureBackend, now: number): Promise<void> {
  await backend.run(async (ctx) => {
    for (const [index, family] of COMMERCIAL_POLICY_FAMILIES.entries()) {
      await ctx.db.insert('moneyCommercialPolicies', {
        policyRef: `commercial-policy:workpool:${family}:1`,
        family,
        environment: 'production',
        revision: 1,
        lifecycle: 'active',
        effectiveAt: now - 1,
        expiresAt: now + 7 * 24 * 60 * 60 * 1_000,
        evidenceRef: `approval:workpool:${family}:1`,
        evidenceDigest: canonicalDigest({ family, index, kind: 'workpool-approval' }),
        control: PRODUCTION_COMMERCIAL_POLICY_CONTROLS[family],
        approvedByPrincipalRef: 'principal:workpool-approver',
        activeAccountRef: 'account:workpool-approver',
        authorityGeneration: 1,
        correlationRef: `correlation:workpool:${family}:1`,
        idempotencyRef: `idempotency:workpool:${family}:1`,
        commandDigest: canonicalDigest({ family, index, kind: 'workpool-policy-command' }),
        activatedAt: now - 1,
        updatedAt: now - 1,
      })
    }
  })
}

const execFileAsync = promisify(execFile)

async function serveCallRoutes(input: Readonly<{
  apiKeyId: string
  apiKeySubject: string
  scopes: readonly string[]
  principal: TestPrincipal
}>): Promise<Readonly<{ origin: string; close: () => Promise<void> }>> {
  const authenticate = async () => ({
    isAuthenticated: true as const,
    tokenType: 'api_key' as const,
    id: input.apiKeyId,
    subject: input.apiKeySubject,
    scopes: input.scopes,
    claims: { aeEnvironment: 'production' },
  })
  const resolvePrincipal = async () => input.principal
  const server = createServer(async (incoming, outgoing) => {
    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('served_call_address_unavailable')
      const origin = `http://127.0.0.1:${address.port}`
      const url = new URL(incoming.url ?? '/', origin)
      const chunks: Buffer[] = []
      for await (const chunk of incoming) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      const body = Buffer.concat(chunks)
      const request = new Request(url, {
        ...(incoming.method === undefined ? {} : { method: incoming.method }),
        headers: incoming.headers as HeadersInit,
        ...(body.length === 0 ? {} : { body }),
      })
      let response: Response
      if (url.pathname === '/api/v1/market-tools/search') {
        response = await handleMarketToolSearchRequest(request)
      } else if (url.pathname === '/api/v1/market-tools/describe') {
        response = await handleMarketToolDescribeRequest(request)
      } else if (url.pathname === '/api/v1/market-tools/compare') {
        response = await handleMarketToolCompareRequest(request)
      } else if (url.pathname === '/api/v1/account') {
        response = await handleAgentAccountGet(request, { authenticate, resolvePrincipal })
      } else if (url.pathname === '/api/v1/tools/quote') {
        response = await handleToolQuotePost(request, { authenticate, resolvePrincipal })
      } else if (url.pathname === '/api/v1/tools/call') {
        response = await handleToolCallPost(request, { authenticate, resolvePrincipal })
      } else if (url.pathname.startsWith('/api/v1/calls/')) {
        const callRef = decodeURIComponent(url.pathname.slice('/api/v1/calls/'.length))
        response = await handleCallStatusGet(request, callRef, { authenticate, resolvePrincipal })
      } else {
        response = Response.json({ code: 'route_not_found' }, { status: 404 })
      }
      outgoing.statusCode = response.status
      response.headers.forEach((value, name) => outgoing.setHeader(name, value))
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      outgoing.statusCode = 500
      outgoing.end(JSON.stringify({ code: error instanceof Error ? error.message : 'served_call_error' }))
    }
  })
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('served_call_address_unavailable')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error === undefined ? resolveClose() : rejectClose(error))
    }),
  }
}

async function installPackagedCli(root: string): Promise<string> {
  const packageDirectory = join(root, 'package')
  const consumerDirectory = join(root, 'consumer')
  await mkdir(packageDirectory, { recursive: true })
  await mkdir(consumerDirectory, { recursive: true })
  await execFileAsync('npm', ['run', 'build:cli'], { cwd: resolve('.') })
  const packed = await execFileAsync('npm', [
    'pack',
    './packages/cli',
    '--json',
    '--pack-destination',
    packageDirectory,
  ], { cwd: resolve('.') })
  const packResult = JSON.parse(packed.stdout) as Array<{ filename: string }>
  const filename = packResult[0]?.filename
  if (filename === undefined) throw new Error('packaged_cli_tarball_missing')
  await writeFile(join(consumerDirectory, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  await execFileAsync('npm', [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--offline',
    join(packageDirectory, filename),
  ], {
    cwd: consumerDirectory,
  })
  return join(consumerDirectory, 'node_modules', '.bin', 'ae')
}

async function invokeCall(
  backend: ConvexFixtureBackend,
  principal: TestPrincipal,
  toolRef: string,
  idempotencyKey: string,
  suffix: string,
  sourcePrincipal: TestPrincipal = principal,
) {
  const callKey = `${principal.credentialId}:${idempotencyKey}`
  let quoteRef = quoteByCallKey.get(callKey)
  if (quoteRef === undefined) {
    const inspectionCommand = {
      operationKey: `test:call-workpool:quote:${suffix}`,
      correlationId: `test:call-workpool:quote:${suffix}`,
      principal: { ...principal, scopes: [...principal.scopes] },
      toolRef,
      input: INPUT,
    }
    const inspected = await backend.action(
      api.capabilityQuotes.quote,
      await withSourceWrite('protected_action', inspectionCommand),
    )
    if (inspected.kind !== 'committed') throw new Error(`call_quote_refused:${inspected.code}`)
    quoteRef = inspected.quoteRef
    quoteByCallKey.set(callKey, quoteRef)
  }
  const command = {
    operationKey: `test:call-workpool:call:${suffix}`,
    correlationId: `test:call-workpool:${suffix}`,
    principal: { ...principal, scopes: [...principal.scopes] },
    quoteRef,
    idempotencyKey,
  }
  const signed = await withSourceWrite('protected_action', {
    ...command,
    principal: { ...sourcePrincipal, scopes: [...sourcePrincipal.scopes] },
  })
  return await backend.action(
    api.capabilityCalls.call,
    { ...signed, principal: command.principal } as never,
  )
}

async function recoveryActionArgs(
  principal: TestPrincipal,
  callRef: string,
  suffix: string,
  idempotencyKey: string,
) {
  const args = {
    operationKey: `test:call-workpool:recovery:${suffix}`,
    correlationId: `test:call-workpool:recovery:${suffix}`,
    principal: { ...principal, scopes: [...principal.scopes] },
    callRef,
  }
  return await withSourceWriteCommand('protected_action', args, {
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    principal: args.principal,
    toolRef: '',
    input: {},
    idempotencyKey,
  })
}

async function readEvidence(
  backend: ConvexFixtureBackend,
  callRef: string,
) {
  return await backend.run(async (ctx) => {
    const call = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
      .unique()
    const control = await ctx.db.query('actionExecutionControls')
      .withIndex('by_executionRef', (query) => query.eq('executionRef', callRef))
      .unique()
    const attempt = await ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptRef', (query) => (
        query.eq('executionRef', callRef).eq('attemptRef', call?.attemptRef ?? '')
      ))
      .unique()
    const projection = await ctx.db.query('capabilityCallProjections')
      .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
      .unique()
    const history = await ctx.db.query('actionExecutionHistory')
      .withIndex('by_executionRef_and_executionVersion', (query) => query.eq('executionRef', callRef))
      .order('asc')
      .collect()
    return {
      call,
      control,
      attempt,
      history,
      projection,
    }
  })
}

afterEach(() => {
  quoteByCallKey.clear()
  providerFetch.mockReset()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('capability Call Workpool lifecycle', () => {
  it('executes once, replays without another effect, and refuses a revoked grant before claim', async () => {
    const signingSecretSentinel = 'call-workpool-signing-secret-sentinel-32-bytes'
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', signingSecretSentinel)
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-12T00:00:00Z'))

    const backend = convexTestWithWorkers()
    await seedCommercialPolicies(backend, Date.now())
    const toolRef = await seedKeylessLookup(backend)
    const now = Date.now()
    const first = await seedPrincipal(backend, 'success', now, toolRef)
    await expect(backend.query(
      internal.capabilitySupplyTools.readCurrentPublishedToolSnapshot,
      { toolRef },
    )).resolves.toMatchObject({ toolJson: expect.any(String) })
    const revoked = await seedPrincipal(backend, 'revoked', now, toolRef)
    await expect(backend.query(internal.agentAccessPolicy.readActiveGrant, {
      credentialId: first.principal.credentialId,
      environment: first.principal.environment,
      principalId: first.principal.principalId,
      applicationRef: first.principal.applicationRef,
      now,
    })).resolves.toMatchObject({ grantRef: first.grantRef })

    const providerOutput = { result: 'ok' }
    let historyObservedDuringProvider: string[] = []
    let pendingCallRef: string | undefined
    providerFetch.mockImplementation(async (input) => {
      expect(String(input)).toContain('workpool-lookup.example.test')
      const providerCallRef = pendingCallRef
      if (providerCallRef === undefined) {
        throw new Error('Call reference not assigned before provider transport')
      }
      historyObservedDuringProvider = await backend.run(async (ctx) => (
        (await ctx.db.query('actionExecutionHistory')
          .withIndex('by_executionRef_and_executionVersion', (query) => (
            query.eq('executionRef', providerCallRef)
          ))
          .order('asc')
          .collect())
          .map((row) => row.kind)
      ))
      return new UndiciResponse(JSON.stringify(providerOutput), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    providerFetch.mockClear()

    await expect(invokeCall(
      backend,
      first.principal,
      toolRef,
      'call-workpool-forged',
      'forged',
      {
        ...first.principal,
      principalId: revoked.principal.principalId,
      ownerId: revoked.principal.ownerId,
      },
    )).resolves.toMatchObject({
      kind: 'refused',
      code: 'invocation_runtime_unavailable',
    })
    expect(providerFetch).not.toHaveBeenCalled()

    const pending = await invokeCall(backend, first.principal, toolRef, 'call-workpool-success', 'success')
    expect(pending.kind).toBe('pending')
    if (pending.kind !== 'pending') throw new Error('successful operation did not enqueue')
    const successfulCallRef = pending.callRef
    pendingCallRef = successfulCallRef
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))

    const completed = await readEvidence(backend, successfulCallRef)
    const completedResult = completed.call?.result
    expect(completedResult).toMatchObject({ kind: 'completed' })
    if (completedResult?.kind !== 'completed') throw new Error('completed operation result missing')
    expect(completed.call).toMatchObject({
      state: 'completed',
      dispatchState: 'completed',
      workId: expect.any(String),
      result: { kind: 'completed', callRef: successfulCallRef, toolRef },
    })
    expect(completed.control?.control.control).toMatchObject({ state: 'terminal' })
    expect(completed.attempt?.release).toMatchObject({ state: 'released' })
    expect(completed.attempt?.outcome).toMatchObject({ state: 'returned' })
    expect(completed.history.map((row) => row.kind)).toEqual([
      'claim_before_effect',
      'release_fence_before_network',
      'terminal_returned',
    ])
    expect(completed.history.map((row) => row.executionVersion)).toEqual([1, 2, 3])
    expect(completedResult.output).toEqual(providerOutput)
    await expect(backend.action(
      api.capabilityCalls.readCallStatus,
      await recoveryActionArgs(
        first.principal,
        successfulCallRef,
        'status-owner',
        `status:${successfulCallRef}`,
      ),
    )).resolves.toMatchObject({
      kind: 'found',
      callRef: successfulCallRef,
      toolRef,
      state: 'terminal',
      result: {
        kind: 'completed',
        toolRef,
        output: providerOutput,
      },
    })
    await expect(backend.action(
      api.capabilityCalls.readCallStatus,
      await recoveryActionArgs(
        revoked.principal,
        successfulCallRef,
        'status-isolated',
        `status:${successfulCallRef}`,
      ),
    )).resolves.toMatchObject({
      kind: 'refused',
      callRef: successfulCallRef,
      code: 'invocation_not_found',
    })
    await expect(backend.action(
      api.capabilityCalls.cancelCall,
      {
        ...await recoveryActionArgs(
          revoked.principal,
          successfulCallRef,
          'cancel-isolated',
          'cancel:cancel-isolated',
        ),
        idempotencyKey: 'cancel-isolated',
      },
    )).resolves.toMatchObject({
      kind: 'refused',
      callRef: successfulCallRef,
      code: 'invocation_not_found',
    })
    await expect(backend.action(
      api.capabilityCalls.reconcileCall,
      {
        ...await recoveryActionArgs(
          revoked.principal,
          successfulCallRef,
          'reconcile-isolated',
          'reconcile:reconcile-isolated',
        ),
        idempotencyKey: 'reconcile-isolated',
        evidence: {
          kind: 'action_invocation_reconciliation',
          version: 1,
          evidenceRef: 'test:call-workpool:reconcile-isolated',
          source: 'test',
          invocationRef: successfulCallRef,
          attemptRef: completed.attempt?.attemptRef ?? 'attempt:missing',
          effectGeneration: 1,
          resolution: 'not_released',
          observedAt: new Date().toISOString(),
          digest: canonicalDigest({ invocationRef: successfulCallRef, isolated: true }),
        },
      },
    )).resolves.toMatchObject({
      kind: 'refused',
      callRef: successfulCallRef,
      code: 'invocation_not_found',
    })
    const statusVariants = await backend.run(async (ctx) => {
      const source = await ctx.db.query('capabilityCalls')
        .withIndex('by_callRef', (query) => query.eq('callRef', successfulCallRef))
        .unique()
      if (source === null) throw new Error('call_workpool_status_source_missing')
      const {
        _id: _sourceId,
        _creationTime: _sourceCreationTime,
        attemptRef: sourceAttemptRef,
        ...material
      } = source
      const variants = [
        {
          suffix: 'paid-settled',
          state: 'completed' as const,
          dispatchState: 'completed' as const,
          receipt: publicReceipt('settled', 'paid-settled'),
        },
        {
          suffix: 'refunded',
          state: 'refused' as const,
          dispatchState: 'failed' as const,
          receipt: publicReceipt('refunded', 'refunded'),
        },
        {
          suffix: 'reconciliation-required',
          state: 'reconciliation_required' as const,
          dispatchState: 'reconciliation_required' as const,
          receipt: publicReceipt('reconciliation_required', 'reconciliation-required'),
        },
      ]
      const refs: Array<{ callRef: string; receiptState: typeof variants[number]['receipt']['state'] }> = []
      for (const variant of variants) {
        const variantCallRef = `${successfulCallRef}:${variant.suffix}`
        const usage = {
          usageRef: `usage:call-workpool:${variant.suffix}`,
          observedAt: Date.now(),
          chargeState: variant.suffix === 'refunded' ? 'refunded' as const : 'paid' as const,
          amount: variant.receipt.totalBuyerCharge,
          priceDigest: variant.receipt.priceDigest,
          transactionRef: variant.receipt.transactionRef,
        }
        const result = variant.state === 'completed'
          ? {
              kind: 'completed' as const,
              callRef: variantCallRef,
              toolRef,
              output: { result: variant.suffix },
              evidenceHash: variant.receipt.evidenceHash,
              usage,
              receipt: variant.receipt,
            }
          : variant.state === 'refused'
            ? {
                kind: 'refused' as const,
                toolRef,
                code: 'provider_output_invalid',
                retryable: false,
                receipt: variant.receipt,
              }
            : {
                kind: 'reconciliation_required' as const,
                callRef: variantCallRef,
                toolRef,
                evidence: {
                  attemptRef: `attempt:call-workpool:${variant.suffix}`,
                  effectGeneration: 1,
                  requiredAt: variant.receipt.issuedAt,
                  retry: 'reconcile_before_retry' as const,
                  evidenceSource: 'test:call-workpool',
                },
                receipt: variant.receipt,
              }
        await ctx.db.insert('capabilityCalls', {
          ...material,
          callRef: variantCallRef,
          idempotencyKey: `idempotency:call-workpool:${variant.suffix}`,
          state: variant.state,
          dispatchState: variant.dispatchState,
          result,
          usage,
          evidenceHash: variant.receipt.evidenceHash,
          ...(variant.state === 'reconciliation_required'
            ? { attemptRef: `attempt:call-workpool:${variant.suffix}` }
            : sourceAttemptRef === undefined
              ? {}
              : { attemptRef: sourceAttemptRef }),
        })
        refs.push({ callRef: variantCallRef, receiptState: variant.receipt.state })
      }
      return refs
    })
    for (const variant of statusVariants) {
      const status = await backend.action(
        api.capabilityCalls.readCallStatus,
        await recoveryActionArgs(
          first.principal,
          variant.callRef,
          `status-${variant.receiptState}`,
          `status:${variant.callRef}`,
        ),
      )
      expect(status).toMatchObject({
        kind: 'found',
        callRef: variant.callRef,
        toolRef,
        receipt: { state: variant.receiptState },
        result: { receipt: { state: variant.receiptState } },
      })
    }
    const canonicalCommandJson = JSON.stringify({
      control: completed.control,
      attempt: completed.attempt,
      history: completed.history,
    })
    expect(canonicalCommandJson).not.toContain(JSON.stringify(providerOutput))
    expect(canonicalCommandJson).not.toContain(signingSecretSentinel)
    expect(completed.projection).toMatchObject({
      callRef: successfulCallRef,
      accountRef: first.principal.ownerId,
      principalRef: first.principal.principalId,
      state: 'completed',
      deliveryState: 'delivered',
      paymentState: 'not_applicable',
    })
    expect(historyObservedDuringProvider).toEqual([
      'claim_before_effect',
      'release_fence_before_network',
    ])
    expect(providerFetch).toHaveBeenCalledTimes(1)
    const workId = completed.call?.workId

    const replay = await invokeCall(backend, first.principal, toolRef, 'call-workpool-success', 'replay')
    expect(replay).toEqual(completedResult)
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    const replayed = await readEvidence(backend, successfulCallRef)
    expect(replayed.call?.workId).toBe(workId)
    expect(replayed.history).toHaveLength(3)
    expect(replayed.call).toEqual(completed.call)
    expect(providerFetch).toHaveBeenCalledTimes(1)

    await backend.run(async (ctx) => {
      await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 })
    })
    const revokedPending = await invokeCall(backend, revoked.principal, toolRef, 'call-workpool-revoked', 'revoked')
    expect(revokedPending.kind).toBe('pending')
    if (revokedPending.kind !== 'pending') throw new Error('revoked Call did not enqueue')
    const revokedGrant = await backend.mutation(internal.agentAccessPolicy.revokeGrant, {
      grantRef: revoked.grantRef,
      ownerId: revoked.principal.ownerId,
      credentialId: revoked.principal.credentialId,
      principalId: revoked.principal.principalId,
      updatedAt: Date.now(),
    })
    expect(revokedGrant.kind).toBe('revoked')
    await backend.run(async (ctx) => {
      await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 })
    })
    vi.advanceTimersByTime(120_000)
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))

    const refused = await readEvidence(backend, revokedPending.callRef)
    expect(refused.call).toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: {
        kind: 'refused',
        toolRef,
        code: 'grant_not_found',
      },
    })
    expect(refused.control).toBeNull()
    expect(refused.attempt).toBeNull()
    expect(refused.projection).toBeNull()
    expect(providerFetch).toHaveBeenCalledTimes(1)
  }, 15_000)

  it('runs the installed CLI through served routes and one real durable backend receipt', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-12T00:00:00Z'))
    installTestSourceWriteSecret()
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', 'served-cli-route-signing-secret-material-32')
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:served-cli')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])

    const backend = convexTestWithWorkers()
    await seedCommercialPolicies(backend, Date.now())
    const toolRef = await seedKeylessLookup(backend, 'workpool-lookup-primary')
    const alternativeToolRef = await seedKeylessLookup(backend, 'workpool-lookup-alternative')
    const scopes = [CUSTOMER_REQUEST_SPENDING_POLICY_SCOPE, MARKET_TOOLS_CALL_SCOPE] as const
    const seeded = await seedPrincipal(backend, 'served-cli', Date.now(), toolRef, scopes)
    const principal = seeded.principal
    const apiKeyId = principal.credentialId
    const apiKeySubject = 'user_served_cli'

    const providerOutput = { result: 'served-cli-ok' }
    providerFetch.mockResolvedValue(new UndiciResponse(JSON.stringify(providerOutput), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    providerFetch.mockClear()

    const queryBackend = backend.query as ConvexSourceTransport['query']
    const mutationBackend = backend.mutation as ConvexSourceTransport['mutation']
    const actionBackend = backend.action as ConvexSourceTransport['action']
    const transport: ConvexSourceTransport = {
      query: queryBackend,
      mutation: mutationBackend,
      action: async <Action extends FunctionReference<'action'>>(
        reference: Action,
        args: FunctionArgs<Action>,
      ): Promise<FunctionReturnType<Action>> => {
        const result = await actionBackend(reference, args)
        if (getFunctionName(reference) === 'capabilityCalls:call') {
          await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
        }
        return result
      },
    }
    const restoreTransport = setPublicSourceTransportForTests(transport)
    const served = await serveCallRoutes({ apiKeyId, apiKeySubject, scopes, principal })
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'ae-served-cli-'))
    const cliHome = join(temporaryRoot, 'home')
    const cliDist = resolve('packages/cli/dist')
    const cliDistWasPresent = await access(cliDist).then(() => true, () => false)
    await mkdir(cliHome)
    try {
      const cli = await installPackagedCli(temporaryRoot)
      const runCli = async (args: readonly string[]): Promise<unknown> => {
        const executed = await execFileAsync(cli, [...args, '--base-url', served.origin, '--json'], {
          env: {
            ...process.env,
            AE_API_KEY: apiKeyId,
            AE_API_KEY_ORIGIN: served.origin,
            XDG_CONFIG_HOME: cliHome,
          },
          maxBuffer: 4 * 1024 * 1024,
        })
        return JSON.parse(executed.stdout) as unknown
      }

      const search = await runCli(['search', 'lookup']) as {
        kind: string
        items: Array<{ toolRef: string }>
        nextCommand: string
      }
      const comparedToolRefs = search.items.map((item) => item.toolRef)
      expect(search.kind).toBe('ok')
      expect(comparedToolRefs).toEqual(expect.arrayContaining([
        toolRef,
        alternativeToolRef,
      ]))
      expect(search.nextCommand).toBe(`ae compare ${comparedToolRefs.slice(0, 4).join(' ')} --base-url ${served.origin} --json`)
      await expect(runCli(['describe', toolRef])).resolves.toMatchObject({
        kind: 'found',
        tool: { toolRef },
      })
      await expect(runCli(['compare', ...comparedToolRefs])).resolves.toMatchObject({
        kind: 'ok',
        tools: expect.arrayContaining([
          expect.objectContaining({ toolRef }),
          expect.objectContaining({ toolRef: alternativeToolRef }),
        ]),
      })
      const idempotencyKey = 'served-cli-golden-replay'
      const completed = await runCli([
        'call',
        toolRef,
        '--input',
        JSON.stringify(INPUT),
        '--idempotency-key',
        idempotencyKey,
        '--wait',
      ]) as { kind: string; callRef: string; toolRef: string; output: unknown }
      expect(completed).toMatchObject({
        kind: 'completed',
        toolRef,
        output: providerOutput,
      })
      expect(completed).not.toHaveProperty('idempotencyKey')
      const status = callStatusResultSchema.parse(await runCli(['status', completed.callRef]))
      expect(status).toMatchObject({
        kind: 'found',
        callRef: completed.callRef,
        toolRef,
        state: 'terminal',
        usage: { chargeState: 'free_tier' },
        result: { kind: 'completed', output: providerOutput },
      })
      expect(projectCallReceipt(status)).toMatchObject({
        version: 'ae.public-invocation-receipt:v1',
        callRef: completed.callRef,
        toolRef,
        complete: true,
        resultKind: 'completed',
        usage: { chargeState: 'free_tier' },
        evidenceHash: expect.any(String),
      })
      await expect(runCli([
        'call',
        toolRef,
        '--input',
        JSON.stringify(INPUT),
        '--idempotency-key',
        idempotencyKey,
        '--wait',
      ])).resolves.toEqual(completed)
      expect(providerFetch).toHaveBeenCalledTimes(1)
    } finally {
      await served.close()
      restoreTransport()
      await rm(temporaryRoot, { recursive: true, force: true })
      if (!cliDistWasPresent) await rm(cliDist, { recursive: true, force: true })
    }
  }, 120_000)
})
