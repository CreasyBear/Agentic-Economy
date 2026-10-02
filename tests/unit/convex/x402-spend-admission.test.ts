/// <reference types="vite/client" />
import { randomUUID } from 'node:crypto'
import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import { agentAccessPolicyDigest, agentAccessPolicySchema } from '@/modules/agent-access/policy'
import { cdpX402CustodyBudgetRef, cdpX402CustodyConfigurationFromEnvironment } from '@/modules/capability-supply/convex'
import { x402SpendPolicyFromEnvironment, x402SpendReservationRef, X402_SPEND_HISTORY_LIMIT, X402_SPEND_WINDOW_MS } from '@/modules/money/x402-spend-admission'
import schema from '../../../convex/schema'
import { internal } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import type { RecordScreeningAndReserveSigningArgs } from '../../../convex/lib/money/x402PaymentAttempt/spendAdmission'
import { recordScreeningAndReserveSigningHandler } from '../../../convex/lib/money/x402PaymentAttempt/spendAdmission'
import type { MutationCtx } from '../../../convex/_generated/server'
import { resolveX402SpendReservation } from '../../../convex/lib/money/x402PaymentAttempt/spendResolution'

const modules = Object.fromEntries(Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
  .map(([path, load]) => [path.replace('../../../convex/', './'), load]))
const NOW = Date.UTC(2026, 8, 30, 23, 59, 59)
const PAYER = '0x1111111111111111111111111111111111111111'
const PAYEE = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const ASSET = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const NETWORK = 'eip155:84532'
const inputDigest = canonicalDigest({ input: 'weather' })
const sourceEnvironment = {
  AE_DEPLOYMENT_ENVIRONMENT: 'development',
  AE_X402_CUSTODY_ENABLED: 'true', AE_X402_CUSTODY_MAX_ATOMIC: '100', AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '100',
  AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC: '100', AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC: '100',
  CDP_API_KEY_ID: 'fixture-key', CDP_API_KEY_SECRET: 'fixture-secret', CDP_WALLET_SECRET: 'fixture-wallet-secret',
  AE_X402_CDP_ACCOUNT_NAME: 'fixture-wallet', AE_X402_CDP_EXPECTED_EVM_ADDRESS: PAYER,
  AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-4111-8111-111111111111',
  AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-4222-8222-222222222222',
  AE_X402_CDP_POLICY_RULES_DIGEST: canonicalDigest({ policy: 'fixture' }), AE_X402_CDP_CREDENTIAL_GENERATION: '1',
}
const spendPolicy = x402SpendPolicyFromEnvironment(sourceEnvironment, { environment: 'sandbox', network: NETWORK, asset: ASSET })!
const accessPolicy = agentAccessPolicySchema.parse({
  format: 'ae.agent-access-policy:v2' as const, toolAccess: 'all_admitted' as const, toolRefs: [], environment: 'sandbox' as const,
  budget: { budgetPolicyRef: 'budget:fixture', generation: 1, currency: 'AUD', exponent: 6,
    maximumSpendPerCall: { currency: 'AUD', units: '1000', exponent: 6 },
    maximumDailySpend: { currency: 'AUD', units: '10000', exponent: 6 },
    maximumMonthlySpend: { currency: 'AUD', units: '100000', exponent: 6 }, maximumConcurrentCalls: 10 },
  rate: { ratePolicyRef: 'rate:fixture', generation: 1, maximumCallsPerMinute: 100, maximumCallsPerHour: 1000 },
})
const policyDigest = agentAccessPolicyDigest(accessPolicy)
const expiresAt = NOW + 10 * X402_SPEND_WINDOW_MS
type Backend = TestConvex<typeof schema>
type Payment = Omit<Doc<'moneyX402PaymentAttempts'>, '_id' | '_creationTime'>

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  for (const [key, value] of Object.entries(sourceEnvironment)) vi.stubEnv(key, value)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

async function fixture(): Promise<Backend> {
  const backend = convexTest(schema, modules)
  await backend.run(async ctx => {
    const action = { actorPrincipalRef: 'prn_22222222222222222222222222222222', activeAccountRef: 'acc_33333333333333333333333333333333', correlationRef: 'correlation:fixture', idempotencyRef: 'idempotency:fixture' }
    await ctx.db.insert('principals', { principalRef: 'prn_22222222222222222222222222222222', kind: 'human', displayName: 'Owner', lifecycle: 'active', revision: 1, createdAt: NOW - 1000, updatedAt: NOW - 1000 })
    await ctx.db.insert('principals', { principalRef: 'prn_11111111111111111111111111111111', kind: 'agent', displayName: 'Agent', lifecycle: 'active', revision: 1, createdAt: NOW - 1000, updatedAt: NOW - 1000 })
    await ctx.db.insert('accounts', { accountRef: 'acc_33333333333333333333333333333333', displayName: 'Account', lifecycle: 'active', recoveryPolicy: { kind: 'no_transfer', revision: 1 }, creationActorPrincipalRef: action.actorPrincipalRef, creationIdempotencyRef: action.idempotencyRef, initialOwnershipRef: 'ownership:fixture', currentOwnershipRef: 'ownership:fixture', revision: 1, createdAt: NOW - 1000, updatedAt: NOW - 1000, lastAction: action })
    await ctx.db.insert('memberships', { membershipRef: 'membership:fixture', accountRef: 'acc_33333333333333333333333333333333', memberPrincipalRef: 'prn_11111111111111111111111111111111', lifecycle: 'active', revision: 1, createdAt: NOW - 1000, createdBy: action })
    await ctx.db.insert('accountOwnerships', { ownershipRef: 'ownership:fixture', accountRef: 'acc_33333333333333333333333333333333', ownerPrincipalRef: 'prn_22222222222222222222222222222222', lifecycle: 'active', changeKind: 'creation', revision: 1, createdAt: NOW - 1000, createdBy: action })
    await ctx.db.insert('externalIdentityBindings', { bindingRef: 'binding:fixture', principalRef: 'prn_11111111111111111111111111111111', providerNamespace: 'clerk/api-key', providerIdentifier: 'credential:fixture', providerState: { kind: 'known', value: 'active' }, lifecycle: 'active', credentialGeneration: 1, bindIdempotencyRef: 'bind:fixture', revision: 1, createdAt: NOW - 1000, updatedAt: NOW - 1000 })
    await ctx.db.insert('credentials', { credentialRef: 'credential:stored', bindingRef: 'binding:fixture', principalRef: 'prn_11111111111111111111111111111111', type: 'api_key', lifecycle: 'active', generation: 1, issueIdempotencyRef: 'issue:fixture', revision: 1, issuedAt: NOW - 1000, expiresAt, updatedAt: NOW - 1000 })
    await ctx.db.insert('agentAccessPrincipals', { principalId: 'prn_11111111111111111111111111111111', ownerId: 'acc_33333333333333333333333333333333', credentialId: 'credential:fixture', applicationRef: 'application:fixture', environment: 'sandbox', scopes: ['market_tools:call'], authorityMode: 'spending_policy', grantGeneration: 1, spendingPolicyDigest: policyDigest, lifecycle: 'active', expiresAt, recordedAt: NOW - 1000, lastSeenAt: NOW - 1000 })
    await ctx.db.insert('agentAccessGrants', { format: 'ae.agent-access-grant:v2', grantRef: 'grt_44444444444444444444444444444444', principalId: 'prn_11111111111111111111111111111111', ownerId: 'acc_33333333333333333333333333333333', credentialId: 'credential:fixture', applicationRef: 'application:fixture', environment: 'sandbox', toolAccess: 'all_admitted', toolRefs: [], authorityMode: 'spending_policy', budgetPolicyRef: 'budget:fixture', ratePolicyRef: 'rate:fixture', lifecycle: 'active', generation: 1, spendingPolicyDigest: policyDigest, spendingPolicy: accessPolicy, createdAt: NOW - 1000, updatedAt: NOW - 1000, expiresAt })
    await ctx.db.insert('authorityDelegationGrants', { grantRef: 'grt_44444444444444444444444444444444', accountRef: 'acc_33333333333333333333333333333333', actorPrincipalRef: 'prn_22222222222222222222222222222222', subjectPrincipalRef: 'prn_11111111111111111111111111111111', scopes: ['market_tools:call'], resourceRefs: ['*'], budgetLimit: 1000, budgetUsed: 0, expiresAt, generation: 1, revision: 1, lifecycle: 'active', createdAt: NOW - 1000, createdBy: action })
  })
  return backend
}

function payment(suffix: string, amountUnits = '60', payTo = PAYEE, options: Partial<Payment> = {}): Payment {
  const currentEnvironment = { ...sourceEnvironment,
    AE_X402_CDP_EXPECTED_EVM_ADDRESS: process.env.AE_X402_CDP_EXPECTED_EVM_ADDRESS!,
    AE_X402_CDP_CREDENTIAL_GENERATION: process.env.AE_X402_CDP_CREDENTIAL_GENERATION! }
  const custody = cdpX402CustodyConfigurationFromEnvironment(currentEnvironment)!
  const authorization = { from: custody.expectedEvmAddress, to: payTo, value: amountUnits, validAfter: '0', validBefore: String(Math.floor((Date.now() + 2 * X402_SPEND_WINDOW_MS) / 1000)), nonce: canonicalDigest(suffix).replace('sha256:', '0x') }
  const accepted = { scheme: 'exact', network: NETWORK, asset: ASSET, payTo, amount: amountUnits, maxTimeoutSeconds: 60, extra: { assetTransferMethod: 'eip3009' } }
  const typedData = { domain: { chainId: 84532, verifyingContract: ASSET }, primaryType: 'TransferWithAuthorization', types: { TransferWithAuthorization: [{ name: 'value', type: 'uint256' }] }, message: authorization }
  const material = { x402Version: 2, resource: { url: 'https://provider.example/pay' }, accepted, authorization, typedData }
  const custodyRef = canonicalDigest({ custody: suffix })
  const paymentIdentityDigest = canonicalDigest({ payment: suffix })
  return {
    dispatchRef: `call:${suffix}`, attemptRef: `attempt:${suffix}`, effectGeneration: 1, toolRef: `tool:${suffix}`, inputDigest,
    paymentIdentifier: `payment:${suffix}`, operationKeyDigest: canonicalDigest(suffix), challengeDigest: canonicalDigest(accepted), challengeJson: '{}',
    selectedRequirementJson: JSON.stringify(accepted), providerEndpoint: 'https://provider.example/pay', credentialRef: 'credential:fixture',
    scheme: 'exact', network: NETWORK, asset: ASSET, payTo, amountUnits, currency: 'USDC', exponent: 6,
    custodyRef, custodyBudgetRef: cdpX402CustodyBudgetRef(custody, 'sandbox'), custodyGeneration: custody.credentialGeneration,
    custodyDailyMaximumUnits: '100', authorizationDigest: canonicalDigest({ authorization: suffix }), paymentIdentityDigest,
    spendReservationRef: x402SpendReservationRef({ custodyRef, attemptRef: `attempt:${suffix}`, effectGeneration: 1, paymentIdentityDigest }),
    paymentUnsignedMaterialJson: stableStringify(material), paymentUnsignedMaterialDigest: canonicalDigest(material),
    paymentSigningIdempotencyKey: randomUUID(), paymentPayer: custody.expectedEvmAddress, paymentNonce: authorization.nonce,
    paymentAuthorizationValidBefore: authorization.validBefore, paymentAuthorizationExpiresAt: Number(authorization.validBefore) * 1000,
    paymentSigningClaimedAt: NOW - 1000, requestFingerprint: canonicalDigest({ request: suffix }),
    state: 'prepared', preparedAt: NOW - 1000, evidenceRefs: [], ...options,
  }
}

async function seed(backend: Backend, row: Payment): Promise<void> {
  await backend.run(async ctx => {
    await ctx.db.insert('moneyX402PaymentAttempts', row)
    await ctx.db.insert('capabilityCalls', {
      callRef: row.dispatchRef, toolRef: row.toolRef!, inputDigest: row.inputDigest!, attemptRef: row.attemptRef,
      principalId: 'prn_11111111111111111111111111111111', ownerId: 'acc_33333333333333333333333333333333', credentialId: 'credential:fixture', applicationRef: 'application:fixture',
      environment: 'sandbox', idempotencyKey: row.dispatchRef, grantRef: 'grt_44444444444444444444444444444444', grantGeneration: 1, policyDigest,
      grantExpiresAt: expiresAt, requestDigest: row.requestFingerprint!, state: 'pending', dispatchState: 'running', createdAt: NOW - 1000, updatedAt: NOW - 1000,
    })
  })
}

/** Fixture at the external screening boundary; no TRM report or network request. */
function clear(row: Payment): RecordScreeningAndReserveSigningArgs {
  const material = JSON.parse(row.paymentUnsignedMaterialJson!) as { typedData: unknown }
  return {
    purpose: 'sign', custodyRef: row.custodyRef, authorizationDigest: row.authorizationDigest,
    custodyGeneration: row.custodyGeneration!, paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest!,
    paymentSigningIdempotencyKey: row.paymentSigningIdempotencyKey!, screeningInvocationRef: randomUUID(),
    screening: { provider: 'trm-wallet-screening', outcome: 'clear', network: row.network, normalizedPayTo: row.payTo.toLowerCase(),
      paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest!, typedDataDigest: canonicalDigest(material.typedData),
      startedAt: Date.now() - 100, checkedAt: Date.now(), reason: 'fixture_explicit_clear' },
  }
}

const admit = (backend: Backend, args: RecordScreeningAndReserveSigningArgs) => backend.mutation(internal.moneyX402PaymentAttempts.recordScreeningAndReserveSigning, args)
const rows = (backend: Backend) => backend.run(async ctx => ({ checks: await ctx.db.query('moneyX402PayeeScreeningChecks').collect(), reservations: await ctx.db.query('moneyX402SpendReservations').collect() }))

describe('atomic managed x402 screening and exposure admission', () => {
  it.each([
    ['platform', 'AE_X402_CUSTODY_DAILY_MAX_ATOMIC', 'spend_platform_cap_exceeded'],
    ['payee', 'AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC', 'spend_payee_cap_exceeded'],
    ['new payee', 'AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC', 'spend_new_payee_cap_exceeded'],
  ])('admits only one concurrent %s cap crossing across different Tools and address case', async (_name, limitedEnv, code) => {
    for (const name of ['AE_X402_CUSTODY_MAX_ATOMIC', 'AE_X402_CUSTODY_DAILY_MAX_ATOMIC', 'AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC', 'AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC']) vi.stubEnv(name, name === limitedEnv || name === 'AE_X402_CUSTODY_MAX_ATOMIC' ? '100' : '1000')
    const backend = await fixture()
    const a = payment('a'); const b = payment('b', '60', `0x${PAYEE.slice(2).toUpperCase()}`)
    await seed(backend, a); await seed(backend, b)
    const decisions = await Promise.all([admit(backend, clear(a)), admit(backend, clear(b))])
    expect(decisions.filter(value => value.kind === 'admitted')).toHaveLength(1)
    expect(decisions.filter(value => value.kind === 'refused')).toMatchObject([{ code }])
    expect((await rows(backend)).reservations).toHaveLength(1)
    expect((await rows(backend)).checks).toHaveLength(2)
  })

  it('keeps exposure across wallet and credential rotation and different payees', async () => {
    const backend = await fixture()
    const first = payment('first')
    await seed(backend, first); expect(await admit(backend, clear(first))).toMatchObject({ kind: 'admitted' })
    vi.stubEnv('AE_X402_CDP_EXPECTED_EVM_ADDRESS', '0x2222222222222222222222222222222222222222')
    vi.stubEnv('AE_X402_CDP_CREDENTIAL_GENERATION', '2')
    const second = payment('second', '60', '0x3333333333333333333333333333333333333333')
    await seed(backend, second)
    expect(second.custodyBudgetRef).not.toBe(first.custodyBudgetRef)
    expect(await admit(backend, clear(second))).toMatchObject({ kind: 'refused', code: 'spend_platform_cap_exceeded' })
  })

  it('starts the new-payee day on first admission, preserves it on retry, and expires it exactly at 24 hours', async () => {
    vi.stubEnv('AE_X402_CUSTODY_DAILY_MAX_ATOMIC', '1000')
    vi.stubEnv('AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC', '1000')
    const backend = await fixture(); const first = payment('new-payee-clock'); await seed(backend, first)
    const hit = clear(first); hit.screening.outcome = 'hit'
    expect(await admit(backend, hit)).toMatchObject({ code: 'screening_not_clear' })
    const admittedAt = NOW + X402_SPEND_WINDOW_MS
    vi.mocked(Date.now).mockReturnValue(admittedAt)
    expect(await admit(backend, clear(first))).toMatchObject({ kind: 'admitted' })
    vi.mocked(Date.now).mockReturnValue(admittedAt + X402_SPEND_WINDOW_MS - 60_000)
    expect(await admit(backend, clear(first))).toMatchObject({ kind: 'admitted' })
    expect((await rows(backend)).reservations[0]?.reservedAt).toBe(admittedAt)
    const second = payment('new-payee-clock-next'); await seed(backend, second)
    vi.mocked(Date.now).mockReturnValue(admittedAt + X402_SPEND_WINDOW_MS - 1)
    expect(await admit(backend, clear(second))).toMatchObject({ code: 'spend_new_payee_cap_exceeded' })
    vi.mocked(Date.now).mockReturnValue(admittedAt + X402_SPEND_WINDOW_MS)
    expect(await admit(backend, clear(second))).toMatchObject({ kind: 'admitted' })
  })

  it('requires a fresh invocation on retry while reserving immutable exposure once', async () => {
    const backend = await fixture(); const row = payment('retry'); await seed(backend, row)
    const first = clear(row)
    expect(await admit(backend, first)).toMatchObject({ kind: 'admitted' })
    expect(await admit(backend, first)).toMatchObject({ kind: 'refused', code: 'screening_replayed' })
    expect(await admit(backend, clear(row))).toMatchObject({ kind: 'admitted' })
    const durable = await rows(backend)
    expect(durable.reservations).toHaveLength(1); expect(durable.checks).toHaveLength(2)
    expect(durable.reservations[0]?.initialScreeningCheckRef).toBe(durable.checks[0]?.screeningCheckRef)
  })

  it.each([undefined, 'expired_unused', 'authorization_cancelled'] as const)(
    'resolves not-settled exposure only with conclusive proof: %s', async (paymentUnusedProof) => {
      const backend = await fixture()
      const row = payment('resolution', '60', PAYEE, { reservationRef: 'reserve:resolution' })
      await seed(backend, row)
      expect(await admit(backend, clear(row))).toMatchObject({ kind: 'admitted' })
      const observation = {
        dispatchRef: row.dispatchRef, attemptRef: row.attemptRef, effectGeneration: row.effectGeneration,
        paymentIdentifier: row.paymentIdentifier, toolRef: row.toolRef!, inputDigest: row.inputDigest!,
        transportObservationDigest: canonicalDigest('transport'), transportRequestDigest: canonicalDigest('request'),
        paymentObservationDigest: canonicalDigest('payment'), settlementStatus: 'not_settled' as const,
        paymentResponseDigest: canonicalDigest('response'), observedAt: NOW,
      }
      await backend.mutation(internal.moneyX402PaymentAttempts.recordX402PaymentObservation, observation)
      expect((await rows(backend)).reservations[0]?.state).toBe('liability')
      const args = {
        ...observation, evidenceRef: 'evidence:resolution', evidenceDigest: canonicalDigest('resolution'),
        reservationRef: row.reservationRef!, challengeDigest: row.challengeDigest,
        amountUnits: row.amountUnits, currency: row.currency, exponent: row.exponent,
        ...(paymentUnusedProof === undefined ? {} : { paymentUnusedProof }),
      }
      expect(await backend.mutation(internal.moneyX402PaymentAttempts.reconcileX402PaymentAttempt, args))
        .toMatchObject({ kind: 'settled', settlementStatus: 'not_settled' })
      const reservation = (await rows(backend)).reservations[0]
      expect(reservation?.state).toBe(paymentUnusedProof === undefined ? 'liability' : 'unused')
      if (paymentUnusedProof !== undefined) expect(reservation).toMatchObject({ unusedProof: paymentUnusedProof,
        resolvedAt: NOW, resolutionEvidenceDigest: args.evidenceDigest })
    },
  )

  it('retains unresolved liability after 24 hours and across midnight', async () => {
    const backend = await fixture(); const first = payment('old'); await seed(backend, first)
    await admit(backend, clear(first))
    vi.spyOn(Date, 'now').mockReturnValue(NOW + X402_SPEND_WINDOW_MS + 1)
    const second = payment('next'); await seed(backend, second)
    expect(await admit(backend, clear(second))).toMatchObject({ code: 'spend_platform_cap_exceeded' })
    expect((await rows(backend)).reservations[0]?.state).toBe('liability')
  })

  it('uses conclusive settlement time for rolling spend and preserves it on replay', async () => {
    const backend = await fixture(); const first = payment('settled'); await seed(backend, first); await admit(backend, clear(first))
    const settleAt = NOW + X402_SPEND_WINDOW_MS + 1000
    vi.spyOn(Date, 'now').mockReturnValue(settleAt)
    const settle = () => backend.run(async ctx => {
      const attempt = await ctx.db.query('moneyX402PaymentAttempts').withIndex('by_custodyRef', q => q.eq('custodyRef', first.custodyRef)).unique()
      if (!attempt) throw new Error('fixture_missing')
      await resolveX402SpendReservation(ctx, attempt, { kind: 'settled', evidenceDigest: canonicalDigest('settled-proof') })
    })
    await settle()
    const second = payment('post-settlement'); await seed(backend, second)
    expect(await admit(backend, clear(second))).toMatchObject({ code: 'spend_platform_cap_exceeded' })
    vi.spyOn(Date, 'now').mockReturnValue(settleAt + X402_SPEND_WINDOW_MS)
    await settle(); expect((await rows(backend)).reservations[0]).toMatchObject({ settledAt: settleAt })
    // Exactly 24h is still counted; only older conclusive settlements age out.
    expect(await admit(backend, clear(second))).toMatchObject({ code: 'spend_platform_cap_exceeded' })
    vi.spyOn(Date, 'now').mockReturnValue(settleAt + X402_SPEND_WINDOW_MS + 1)
    const third = payment('after-cutoff')
    await seed(backend, third)
    expect(await admit(backend, clear(third))).toMatchObject({ kind: 'admitted' })
  })

  it('enforces lifetime non-unused Call exposure after old settlements age out', async () => {
    const backend = await fixture(); const first = payment('callcap'); await seed(backend, first); await admit(backend, clear(first))
    await backend.run(async ctx => {
      const reservation = await ctx.db.query('moneyX402SpendReservations').first()
      if (!reservation) throw new Error('fixture_missing')
      await ctx.db.patch(reservation._id, { state: 'settled', settledAt: NOW, resolutionEvidenceDigest: canonicalDigest('proof') })
    })
    vi.spyOn(Date, 'now').mockReturnValue(NOW + X402_SPEND_WINDOW_MS + 1)
    const second = payment('callcap-next', '60', PAYEE, { dispatchRef: first.dispatchRef })
    await backend.run(async ctx => {
      await ctx.db.insert('moneyX402PaymentAttempts', second)
      const call = await ctx.db.query('capabilityCalls').first()
      if (!call) throw new Error('fixture_missing')
      await ctx.db.patch(call._id, { attemptRef: second.attemptRef, toolRef: second.toolRef! })
    })
    expect(await admit(backend, clear(second))).toMatchObject({ code: 'spend_call_cap_exceeded' })
  })

  it.each(['hit', 'unavailable'] as const)('commits %s screening refusal without exposure', async outcome => {
    const backend = await fixture(); const row = payment(outcome); await seed(backend, row)
    const args = clear(row); args.screening.outcome = outcome
    expect(await admit(backend, args)).toMatchObject({ code: 'screening_not_clear' })
    expect((await rows(backend)).checks).toMatchObject([{ admission: 'refused', decision: { outcome } }])
    expect((await rows(backend)).reservations).toHaveLength(0)
  })

  it.each(['missing', 'zero', 'leading-zero', 'whitespace'])('fails closed for %s trusted cap configuration', async kind => {
    const backend = await fixture(); const row = payment(kind); await seed(backend, row)
    vi.stubEnv('AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC', kind === 'missing' ? undefined : kind === 'zero' ? '0' : kind === 'leading-zero' ? '0100' : ' 100 ')
    expect(await admit(backend, clear(row))).toMatchObject({ code: 'spend_configuration_invalid' })
    expect((await rows(backend)).checks).toHaveLength(1); expect((await rows(backend)).reservations).toHaveLength(0)
  })

  it.each(['stale', 'future', 'payee', 'material', 'typedData', 'generation'] as const)('audits invalid %s without exposure', async kind => {
    const backend = await fixture(); const row = payment(kind); await seed(backend, row); const args = clear(row)
    if (kind === 'stale') args.screening.startedAt = NOW - 5001
    if (kind === 'future') args.screening.checkedAt = NOW + 1
    if (kind === 'payee') args.screening.normalizedPayTo = PAYER
    if (kind === 'material') args.screening.paymentUnsignedMaterialDigest = canonicalDigest('other')
    if (kind === 'typedData') args.screening.typedDataDigest = canonicalDigest('other')
    if (kind === 'generation') args.custodyGeneration = 2
    expect(await admit(backend, args)).toMatchObject({ kind: 'refused' })
    expect((await rows(backend)).checks).toHaveLength(1); expect((await rows(backend)).reservations).toHaveLength(0)
  })

  it('rechecks revoked durable authority after screening', async () => {
    const backend = await fixture(); const row = payment('revoked'); await seed(backend, row); const args = clear(row)
    await backend.run(async ctx => { const grant = await ctx.db.query('authorityDelegationGrants').first(); if (grant) await ctx.db.patch(grant._id, { lifecycle: 'revoked' }) })
    expect(await admit(backend, args)).toMatchObject({ code: 'spend_authority_invalid' })
    expect((await rows(backend)).checks).toHaveLength(1); expect((await rows(backend)).reservations).toHaveLength(0)
  })

  it('refuses an unallocated legacy candidate and another potentially signed legacy attempt', async () => {
    const backend = await fixture(); const row = payment('legacy'); delete row.spendReservationRef; await seed(backend, row)
    expect(await admit(backend, clear(row))).toMatchObject({ code: 'spend_history_incomplete' })
    const current = payment('current'); await seed(backend, current)
    expect(await admit(backend, clear(current))).toMatchObject({ code: 'spend_history_incomplete' })
    expect((await rows(backend)).reservations).toHaveLength(0)
  })

  it('commits refusal before variable-size legacy history exhausts transaction headroom', async () => {
    const backend = await fixture()
    const legacy = payment('unclaimed-history', '1')
    delete legacy.spendReservationRef
    delete legacy.paymentSigningClaimedAt
    delete legacy.paymentUnsignedMaterialJson
    delete legacy.paymentUnsignedMaterialDigest
    delete legacy.paymentSigningIdempotencyKey
    delete legacy.paymentPayer
    delete legacy.paymentNonce
    delete legacy.paymentAuthorizationValidBefore
    delete legacy.paymentAuthorizationExpiresAt
    await seed(backend, legacy)
    const current = payment('byte-budget'); await seed(backend, current)
    const metric = { used: 0, remaining: 100_000 }
    const getTransactionMetrics = vi.fn(async () => ({
      bytesRead: { used: 13 * 1024 * 1024, remaining: 3 * 1024 * 1024 },
      bytesWritten: metric, databaseQueries: metric, documentsRead: metric, documentsWritten: metric,
      functionsScheduled: metric, scheduledFunctionArgsBytes: metric,
    }))
    const result = await backend.run(async ctx => await recordScreeningAndReserveSigningHandler({
      ...ctx, meta: { ...ctx.meta, getTransactionMetrics },
    } as MutationCtx, clear(current)))
    expect(result).toMatchObject({ code: 'spend_history_incomplete' })
    expect(getTransactionMetrics).toHaveBeenCalledOnce()
    expect((await rows(backend)).checks).toMatchObject([{ admission: 'refused', refusalCode: 'spend_history_incomplete' }])
    expect((await rows(backend)).reservations).toHaveLength(0)
  })

  it('refuses saturated complete exposure history instead of admitting from a truncated sum', async () => {
    for (const name of ['AE_X402_CUSTODY_MAX_ATOMIC', 'AE_X402_CUSTODY_DAILY_MAX_ATOMIC', 'AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC', 'AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC']) vi.stubEnv(name, '100000')
    const backend = await fixture(); const row = payment('saturation', '1'); await seed(backend, row); await admit(backend, clear(row))
    await backend.run(async ctx => {
      const original = await ctx.db.query('moneyX402SpendReservations').first(); if (!original) throw new Error('fixture_missing')
      const { _id, _creationTime, ...fields } = original
      for (let index = 0; index < X402_SPEND_HISTORY_LIMIT; index++) await ctx.db.insert('moneyX402SpendReservations', { ...fields, reservationRef: `reservation:${index}`, attemptRef: `other:${index}`, dispatchRef: `other-call:${index}` })
    })
    const next = payment('saturation-next', '1'); await seed(backend, next)
    expect(await admit(backend, clear(next))).toMatchObject({ code: 'spend_history_saturated' })
    expect((await rows(backend)).reservations).toHaveLength(X402_SPEND_HISTORY_LIMIT + 1)
  })

  it('requires expired forensic replay state and fresh screening, and rejects terminal exposure', async () => {
    const backend = await fixture(); const row = payment('forensic'); await seed(backend, row); await admit(backend, clear(row))
    vi.spyOn(Date, 'now').mockReturnValue(row.paymentAuthorizationExpiresAt! + 1)
    await backend.run(async ctx => { const attempt = await ctx.db.query('moneyX402PaymentAttempts').first(); if (attempt) await ctx.db.patch(attempt._id, { state: 'reconciliation_required', settlementStatus: 'unknown' }) })
    const args = { ...clear(row), purpose: 'forensic_replay' as const }
    expect(await admit(backend, args)).toMatchObject({ kind: 'admitted' })
    expect((await rows(backend)).reservations).toHaveLength(1)
    await backend.run(async ctx => { const reservation = await ctx.db.query('moneyX402SpendReservations').first(); if (reservation) await ctx.db.patch(reservation._id, { state: 'unused', resolvedAt: Date.now(), resolutionEvidenceDigest: canonicalDigest('expired-unused'), unusedProof: 'expired_unused' }) })
    expect(await admit(backend, { ...clear(row), purpose: 'forensic_replay' })).toMatchObject({ code: 'spend_reservation_terminal' })
  })

  it('calculates caps exactly above Number.MAX_SAFE_INTEGER', async () => {
    for (const name of ['AE_X402_CUSTODY_MAX_ATOMIC', 'AE_X402_CUSTODY_DAILY_MAX_ATOMIC', 'AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC', 'AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC']) vi.stubEnv(name, '9007199254740993')
    const backend = await fixture(); const row = payment('exact', '9007199254740993'); await seed(backend, row)
    expect(await admit(backend, clear(row))).toMatchObject({ kind: 'admitted', policyRevision: expect.any(String) })
    const next = payment('one-unit', '1'); await seed(backend, next)
    expect(await admit(backend, clear(next))).toMatchObject({ code: 'spend_platform_cap_exceeded' })
    expect((await rows(backend)).reservations[0]?.amountUnits).toBe('9007199254740993')
    expect((await rows(backend)).reservations[0]?.platformBudgetRef).toBe(spendPolicy.platformBudgetRef)
  })
})
