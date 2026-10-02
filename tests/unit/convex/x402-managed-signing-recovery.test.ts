/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import {
  cdpX402CustodyBudgetRef, cdpX402CustodyConfigurationFromEnvironment,
  cdpX402PolicyRulesDigest, cdpX402RequestFingerprint,
} from '@/modules/capability-supply/server'
import { reconcileManagedSigningRecovery } from '@/modules/capability-execution/call-worker/recovery/managedSigning'
import type { RecoveryWorkContext } from '@/modules/capability-execution/call-worker/recovery/loading'
import type { ReconciliationEvidence } from '@/modules/action-execution/runtime'
import schema from '../../../convex/schema'
import { internal } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import type { ActionCtx } from '../../../convex/_generated/server'
import type { Infer } from 'convex/values'
import type { recordDefinitiveSigningRejectionArgs } from '../../../convex/lib/money/x402PaymentAttempt/spendResolution'
import type { validateX402ReleaseProofArgs } from '../../../convex/lib/money/managedCall/x402Proof'

const ports = vi.hoisted(() => ({ load: vi.fn(), control: vi.fn(), screen: vi.fn(), client: vi.fn() }))
vi.mock('@/modules/capability-execution/call-worker/recovery/loading', () => ({ loadReadyRecoveryWork: ports.load }))
vi.mock('@/modules/action-execution/runtime', async original => ({
  ...(await original<typeof import('@/modules/action-execution/runtime')>()),
  reconcilePublicExecution: ports.control,
}))
vi.mock('@/modules/money/x402-payee-screening.server', () => ({ screenX402Payee: ports.screen }))
vi.mock('@coinbase/cdp-sdk', () => ({ CdpClient: class { constructor() { return ports.client() } } }))

const modules = Object.fromEntries(Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
  .map(([path, load]) => [path.replace('../../../convex/', './'), load]))
const NOW = Date.UTC(2026, 8, 30, 12)
const EXPIRED = NOW - 60_000
const PAYER = `0x${'1'.repeat(40)}`
const PAYEE = `0x${'2'.repeat(40)}`
const ASSET = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const ACCOUNT_POLICY = '11111111-1111-4111-8111-111111111111'
const PROJECT_POLICY = '22222222-2222-4222-8222-222222222222'
const TYPES = { TransferWithAuthorization: [
  { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
] }
const accountPolicy = { id: ACCOUNT_POLICY, scope: 'account' as const, rules: [{
  action: 'accept', operation: 'signEvmTypedData', criteria: [
    { type: 'evmTypedDataVerifyingContract', addresses: [ASSET], operator: 'in' },
    { type: 'evmTypedDataField', types: { primaryType: 'TransferWithAuthorization', types: TYPES },
      conditions: [{ path: 'from', operator: 'in', addresses: [PAYER] }, { path: 'value', operator: '<=', value: '10000' }] },
  ],
}] }
const projectPolicy = { id: PROJECT_POLICY, scope: 'project' as const, rules: [
  { action: 'reject', operation: 'signEvmTypedData', criteria: [
    { type: 'evmTypedDataVerifyingContract', operator: 'not in', addresses: [ASSET] },
  ] },
  { action: 'reject', operation: 'signEvmTypedData', criteria: [
    { type: 'evmTypedDataField', types: { primaryType: 'TransferWithAuthorization', types: TYPES },
      conditions: [{ path: 'value', operator: '>', value: '10000' }] },
  ] },
] }
type Payment = Omit<Doc<'moneyX402PaymentAttempts'>, '_id' | '_creationTime'>
type RejectionArgs = Infer<typeof recordDefinitiveSigningRejectionArgs>
type ReleaseProofArgs = Infer<typeof validateX402ReleaseProofArgs>
const identity = { callRef: 'call:recovery', principalId: 'principal:recovery', credentialId: 'credential:recovery' }

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  vi.spyOn(console, 'info').mockImplementation(() => {})
  const environment = {
    AE_DEPLOYMENT_ENVIRONMENT: 'development', AE_X402_CUSTODY_ENABLED: 'true',
    AE_X402_CUSTODY_MAX_ATOMIC: '10000', AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '100000',
    CDP_API_KEY_ID: 'fixture-key', CDP_API_KEY_SECRET: 'fixture-secret', CDP_WALLET_SECRET: 'fixture-secret',
    AE_X402_CDP_ACCOUNT_NAME: 'fixture-wallet', AE_X402_CDP_EXPECTED_EVM_ADDRESS: PAYER,
    AE_X402_CDP_ACCOUNT_POLICY_ID: ACCOUNT_POLICY, AE_X402_CDP_PROJECT_POLICY_ID: PROJECT_POLICY,
    AE_X402_CDP_POLICY_RULES_DIGEST: cdpX402PolicyRulesDigest(accountPolicy, projectPolicy),
    AE_X402_CDP_CREDENTIAL_GENERATION: '1',
  }
  for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value)
  for (const port of Object.values(ports)) port.mockReset()
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

/**
 * Requires expired exact unsigned material, an uncertain canonical attempt, and no transport.
 * Ensures only conclusive CDP no-sign evidence releases exposure; saved evidence resumes recovery.
 * Invariant: one immutable proof/timestamp and no further screening/signing after proof commits.
 * On violation: identity conflicts or ambiguous/admission failures cannot reach financial release.
 * Seam: loader/control/financial ledger and atomic admission decisions are bounded ports. The
 * controller, replay validation/classification, signing leaf, screening adapter, and registered
 * Convex rejection read/write, release-proof query and release-finalization transactions execute
 * unchanged. Only the external ledger acknowledgement is simulated; no network or money movement.
 */
async function fixture() {
  const backend = convexTest(schema, modules)
  const configuration = cdpX402CustodyConfigurationFromEnvironment()!
  const accepted = { scheme: 'exact', network: 'eip155:84532' as const, amount: '1000', asset: ASSET,
    payTo: PAYEE, maxTimeoutSeconds: 60, extra: { assetTransferMethod: 'eip3009', name: 'USDC', version: '2' } }
  const challenge = { x402Version: 2 as const, resource: { url: 'https://provider.example/paid' }, accepts: [accepted] }
  const authorization = { from: PAYER, to: PAYEE, value: '1000', validAfter: '0',
    validBefore: String(EXPIRED / 1000), nonce: `0x${'3'.repeat(64)}` }
  const unsigned = { x402Version: 2, resource: challenge.resource, accepted, authorization,
    typedData: { domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: ASSET },
      primaryType: 'TransferWithAuthorization', types: TYPES, message: authorization } }
  const row: Payment = {
    dispatchRef: identity.callRef, attemptRef: 'attempt:recovery', effectGeneration: 1,
    toolRef: 'tool:recovery', inputDigest: canonicalDigest('input'), paymentIdentifier: 'payment:recovery',
    operationKeyDigest: canonicalDigest('operation'), challengeDigest: canonicalDigest(challenge),
    challengeJson: JSON.stringify(challenge), selectedRequirementJson: JSON.stringify(accepted),
    providerEndpoint: challenge.resource.url, credentialRef: identity.credentialId,
    scheme: 'exact', network: accepted.network, asset: ASSET, payTo: PAYEE, amountUnits: '1000', currency: 'USDC', exponent: 6,
    custodyRef: 'custody:recovery', custodyBudgetRef: cdpX402CustodyBudgetRef(configuration, 'sandbox'),
    custodyGeneration: 1, custodyDailyMaximumUnits: '100000', authorizationDigest: canonicalDigest('authorization'),
    paymentIdentityDigest: canonicalDigest('payment-identity'), spendReservationRef: 'spend:recovery', reservationRef: 'reserve:recovery',
    paymentUnsignedMaterialJson: stableStringify(unsigned), paymentUnsignedMaterialDigest: canonicalDigest(unsigned),
    paymentSigningIdempotencyKey: '33333333-3333-4333-8333-333333333333', paymentPayer: PAYER,
    paymentNonce: authorization.nonce, paymentAuthorizationValidBefore: authorization.validBefore,
    paymentAuthorizationExpiresAt: EXPIRED, paymentSigningClaimedAt: EXPIRED - 1000,
    requestFingerprint: cdpX402RequestFingerprint({ challenge, selectedRequirement: accepted,
      credential: identity.credentialId, paymentIdentifier: 'payment:recovery' },
    { method: 'GET', toolRef: 'tool:recovery', aeEnvironment: 'sandbox' }),
    state: 'reconciliation_required', settlementStatus: 'unknown', preparedAt: EXPIRED - 1000, evidenceRefs: [],
    transportObservationDigest: canonicalDigest('transport-observation'), transportRequestDigest: canonicalDigest('transport-request'),
    paymentObservationDigest: canonicalDigest('payment-observation'),
  }
  await backend.run(async ctx => {
    await ctx.db.insert('moneyX402PaymentAttempts', row)
    await ctx.db.insert('capabilityCalls', {
      ...identity, ownerId: 'account:recovery', applicationRef: 'application:recovery',
      toolRef: row.toolRef!, inputDigest: row.inputDigest!, requestDigest: row.requestFingerprint!,
      environment: 'sandbox', idempotencyKey: 'idempotency:recovery',
      grantRef: 'grant:recovery', grantGeneration: 1, policyDigest: canonicalDigest('policy'),
      grantExpiresAt: NOW + 60_000, state: 'reconciliation_required', attemptRef: row.attemptRef,
      createdAt: EXPIRED - 1000, updatedAt: EXPIRED,
      formanceFinancialState: 'reserved', formanceReservationRefs: [row.reservationRef!],
    })
    await ctx.db.insert('moneyX402SpendReservations', {
      reservationRef: row.spendReservationRef!, platformBudgetRef: 'platform:recovery', custodyBudgetRef: row.custodyBudgetRef!,
      custodyRef: row.custodyRef, custodyGeneration: 1, environment: 'sandbox', network: row.network,
      asset: ASSET, currency: 'USDC', exponent: 6, dispatchRef: row.dispatchRef, attemptRef: row.attemptRef,
      effectGeneration: 1, authorizationDigest: row.authorizationDigest, paymentIdentityDigest: row.paymentIdentityDigest!,
      paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest!, paymentSigningIdempotencyKey: row.paymentSigningIdempotencyKey!,
      typedDataDigest: canonicalDigest(unsigned.typedData), normalizedPayTo: PAYEE, amountUnits: '1000',
      reservedAt: EXPIRED - 1000, policyRevision: 'policy:recovery', initialScreeningCheckRef: 'screening:initial', state: 'liability',
    })
  })
  const work = {
    recovered: { ...identity, toolRef: row.toolRef, inputDigest: row.inputDigest, requestDigest: row.requestFingerprint,
      environment: 'sandbox', state: 'reconciliation_required', updatedAt: EXPIRED, attemptRef: row.attemptRef,
      result: { kind: 'reconciliation_required', evidence: { attemptRef: row.attemptRef, effectGeneration: 1 } } },
    operation: { operationId: row.toolRef, transport: { configJson: '{"method":"GET"}' },
      binding: { authority: { kind: 'provider_connection', providerRef: 'provider:recovery' } } },
    x402Attempt: { ...row }, managedReservation: { reservationRef: row.reservationRef },
    control: { currentAttemptRef: row.attemptRef, currentEffectGeneration: 1,
      control: { control: { state: 'reconciliation_required', attemptRef: row.attemptRef } } },
    attemptRows: [{ attemptRef: row.attemptRef, effectGeneration: 1,
      release: { state: 'possibly_released' }, outcome: { state: 'uncertain' } }],
    trustedReconciliationEvidenceDigest: {}, tracer: {},
  } as unknown as RecoveryWorkContext
  ports.load.mockImplementation(async () => ({ kind: 'ready', work }))
  ports.control.mockResolvedValue({ kind: 'reconciled', status: { control: 'retryable' } })
  const sign = vi.fn().mockRejectedValue({ statusCode: 403, errorType: 'policy_violation' })
  ports.client.mockReturnValue({ policies: { getPolicyById: async ({ id }: { id: string }) =>
    id === ACCOUNT_POLICY ? accountPolicy : projectPolicy },
  evm: { getAccount: async () => ({ address: PAYER, policies: [ACCOUNT_POLICY, PROJECT_POLICY] }), signTypedData: sign } })
  ports.screen.mockImplementation(async request => ({ ...request, provider: 'trm-wallet-screening', outcome: 'clear',
    startedAt: NOW - 100, checkedAt: NOW, reason: 'fixture_explicit_clear' }))
  const releases: Record<string, unknown>[] = []
  const controls: ReconciliationEvidence[] = []
  let released = false
  let releaseMode: 'accepted' | 'unavailable' | 'throws' = 'accepted'
  const ctx = {
    runQuery: async (ref: unknown, args: Omit<RejectionArgs, 'statusCode' | 'errorType' | 'evidenceDigest'>) => {
      if (getFunctionName(ref as never) !== 'moneyX402PaymentAttempts:readDefinitiveSigningRejection') throw new Error('unexpected_query')
      return await backend.query(internal.moneyX402PaymentAttempts.readDefinitiveSigningRejection, args)
    },
    runMutation: async (ref: unknown, args: RejectionArgs & { screening?: { outcome: string } }) => {
      const name = getFunctionName(ref as never)
      if (name === 'moneyX402PaymentAttempts:recordDefinitiveSigningRejection') {
        return await backend.mutation(internal.moneyX402PaymentAttempts.recordDefinitiveSigningRejection, args)
      }
      if (name === 'moneyX402PaymentAttempts:recordScreeningAndReserveSigning') {
        return args.screening?.outcome === 'clear' ? { kind: 'admitted' } : { kind: 'refused', code: 'screening_not_clear' }
      }
      if (name === 'capabilityCalls:projectRecovery') return null
      throw new Error(`unexpected_mutation:${name}`)
    },
    runAction: async (ref: unknown, args: ReleaseProofArgs) => {
      if (getFunctionName(ref as never) !== 'moneyManagedCallLifecycle:releaseBeforeSubmissionWithX402Proof') throw new Error('unexpected_action')
      releases.push(args)
      const valid = await backend.query(internal.moneyManagedCallLifecycle.validateX402ReleaseProof, args)
      if (!valid) return { kind: 'refused', code: 'managed_call_recovery_identity_mismatch' }
      if (releaseMode === 'throws') throw new Error('financial_release_unavailable')
      if (releaseMode === 'unavailable') return { kind: 'unavailable' }
      const financial = await backend.mutation(internal.moneyManagedCallLifecycle.finalizeRelease,
        { callRef: args.callRef, transactionRefs: ['release:aud', 'release:usdc'], now: args.observedAt })
      if (financial.kind !== 'accepted') return financial
      released = true
      Object.assign(work.x402Attempt!, { state: 'observed', settlementStatus: 'not_settled',
        paymentResponseDigest: args.paymentResponseDigest, reconciliationEvidenceRef: args.evidenceRef,
        reconciliationEvidenceDigest: args.evidenceDigest })
      return financial
    },
  } as unknown as ActionCtx
  const recover = () => reconcileManagedSigningRecovery(ctx, identity)
  const durable = () => backend.run(async ctx => await ctx.db.query('moneyX402SpendReservations').unique())
  const financial = () => backend.run(async ctx => await ctx.db.query('capabilityCalls').unique())
  const rejectionIdentity = { custodyRef: row.custodyRef, authorizationDigest: row.authorizationDigest,
    paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest!, paymentSigningIdempotencyKey: row.paymentSigningIdempotencyKey! }
  const rejection = { ...rejectionIdentity, statusCode: 403 as const, errorType: 'policy_violation' as const,
    evidenceDigest: canonicalDigest({ format: 'ae.x402-managed-signing-replay:v1', outcome: 'definitive_rejection',
      statusCode: 403, errorType: 'policy_violation', paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest!,
      requestFingerprint: row.requestFingerprint! }) }
  ports.control.mockImplementation(async ({ evidence }: { evidence: ReconciliationEvidence }) => {
    controls.push(evidence)
    return { kind: 'reconciled', status: { control: 'retryable' } }
  })
  return { backend, work, sign, recover, durable, financial, releases, controls, rejection, rejectionIdentity,
    isReleased: () => released, setReleaseMode: (mode: typeof releaseMode) => { releaseMode = mode } }
}

describe('managed signing recovery survives interrupted consequences', () => {
  it.each(['unavailable', 'throws'] as const)('resumes saved definitive rejection after financial release %s without screening or signing again', async mode => {
    const f = await fixture()
    f.setReleaseMode(mode)
    if (mode === 'throws') await expect(f.recover()).rejects.toThrow('financial_release_unavailable')
    else expect(await f.recover()).toMatchObject({ kind: 'found', state: 'reconciliation_required' })
    const first = await f.durable()
    expect(first).toMatchObject({ state: 'unused', unusedProof: 'definitively_not_signed', resolvedAt: NOW,
      resolutionEvidenceDigest: f.rejection.evidenceDigest })
    expect(f.isReleased()).toBe(false)
    expect(await f.financial()).toMatchObject({ formanceFinancialState: 'reserved' })
    expect(f.sign).toHaveBeenCalledOnce()
    expect(ports.screen).toHaveBeenCalledOnce()
    expect(ports.control).not.toHaveBeenCalled()
    expect(await f.backend.query(internal.moneyX402PaymentAttempts.readDefinitiveSigningRejection, f.rejectionIdentity))
      .toEqual({ kind: 'definitive_rejection', statusCode: 403, errorType: 'policy_violation', evidenceDigest: f.rejection.evidenceDigest })
    vi.mocked(Date.now).mockReturnValue(NOW + 10_000)
    f.setReleaseMode('accepted')
    expect(await f.recover()).toMatchObject({ kind: 'found', state: 'retryable' })
    expect(f.isReleased()).toBe(true)
    expect(await f.financial()).toMatchObject({ formanceFinancialState: 'released',
      formanceReleaseRefs: ['release:aud', 'release:usdc'] })
    expect(f.releases).toHaveLength(2)
    expect(f.releases[1]).toEqual(f.releases[0])
    expect(await f.durable()).toEqual(first)
    expect(f.sign).toHaveBeenCalledOnce()
    expect(ports.screen).toHaveBeenCalledOnce()
  })

  it('converges with identical saved proof after financial release commits and control is unavailable', async () => {
    const f = await fixture()
    ports.control.mockRejectedValueOnce(new Error('control_unavailable'))
    await expect(f.recover()).rejects.toThrow('control_unavailable')
    expect(f.isReleased()).toBe(true)
    const financial = await f.financial()
    expect(financial).toMatchObject({ formanceFinancialState: 'released',
      formanceReleaseRefs: ['release:aud', 'release:usdc'] })
    expect(f.work.x402Attempt).toMatchObject({ state: 'observed', settlementStatus: 'not_settled' })
    const first = await f.durable()
    vi.mocked(Date.now).mockReturnValue(NOW + 10_000)
    expect(await f.recover()).toMatchObject({ kind: 'found', state: 'retryable' })
    expect(f.releases).toHaveLength(2)
    expect(f.releases[1]).toEqual(f.releases[0])
    expect(f.controls[0]?.evidenceRef).toBe(f.releases[0]?.evidenceRef)
    expect(await f.durable()).toEqual(first)
    expect(await f.financial()).toEqual(financial)
    expect(f.sign).toHaveBeenCalledOnce()
    expect(ports.screen).toHaveBeenCalledOnce()
  })

  it.each(['paymentSigningIdempotencyKey', 'paymentUnsignedMaterialDigest'] as const)(
    'cannot reuse saved rejection with a different %s', async field => {
      const f = await fixture()
      expect(await f.backend.mutation(internal.moneyX402PaymentAttempts.recordDefinitiveSigningRejection, f.rejection)).toBe(true)
      const changed = field === 'paymentSigningIdempotencyKey' ? '44444444-4444-4444-8444-444444444444' : canonicalDigest('other-material')
      expect(await f.backend.query(internal.moneyX402PaymentAttempts.readDefinitiveSigningRejection,
        { ...f.rejectionIdentity, [field]: changed })).toBeNull()
      expect(await f.backend.mutation(internal.moneyX402PaymentAttempts.recordDefinitiveSigningRejection,
        { ...f.rejection, [field]: changed })).toBe(false)
      Object.assign(f.work.x402Attempt!, { [field]: changed })
      ports.screen.mockImplementation(async request => ({ ...request, provider: 'trm-wallet-screening', outcome: 'hit',
        startedAt: NOW, checkedAt: NOW, reason: 'fixture_hit' }))
      expect(await f.recover()).toMatchObject({ kind: 'found', state: 'reconciliation_required' })
      expect(f.isReleased()).toBe(false)
      expect(f.releases).toHaveLength(0)
      expect(f.sign).not.toHaveBeenCalled()
      expect(ports.control).not.toHaveBeenCalled()
    },
  )

  it.each(['denied', 'provider_403'] as const)('retains unresolved liability when screening is %s', async failure => {
    const f = await fixture()
    if (failure === 'provider_403') ports.screen.mockRejectedValue({ statusCode: 403, errorType: 'policy_violation' })
    else ports.screen.mockImplementation(async request => ({ ...request, provider: 'trm-wallet-screening', outcome: 'hit',
      startedAt: NOW, checkedAt: NOW, reason: 'fixture_hit' }))
    expect(await f.recover()).toMatchObject({ kind: 'found', state: 'reconciliation_required' })
    expect(await f.durable()).toMatchObject({ state: 'liability' })
    expect(await f.backend.query(internal.moneyX402PaymentAttempts.readDefinitiveSigningRejection, f.rejectionIdentity)).toBeNull()
    expect(f.isReleased()).toBe(false)
    expect(f.releases).toHaveLength(0)
    expect(f.sign).not.toHaveBeenCalled()
    expect(ports.screen).toHaveBeenCalledOnce()
    expect(ports.control).not.toHaveBeenCalled()
  })
})
