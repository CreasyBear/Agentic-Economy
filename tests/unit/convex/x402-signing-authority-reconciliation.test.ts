/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agentAccessPolicyDigest, type AgentAccessPolicy } from '@/modules/agent-access/policy'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import {
  cdpX402CustodyBudgetRef, cdpX402CustodyConfigurationFromEnvironment,
  cdpX402PolicyRulesDigest, cdpX402RequestFingerprint, createCdpEvmX402PaymentSignature,
  type CdpX402PaymentSigningIntent,
} from '@/modules/capability-supply/server'
import { admitManagedX402Signing } from '@/modules/capability-execution/call-worker/x402SigningAdmission'
import { x402SpendReservationRef } from '@/modules/money/x402-spend-admission'
import schema from '../../../convex/schema'
import type { Doc } from '../../../convex/_generated/dataModel'
import type { ActionCtx } from '../../../convex/_generated/server'

const external = vi.hoisted(() => ({ screen: vi.fn() }))
vi.mock('@/modules/money/x402-payee-screening.server', () => ({ screenX402Payee: external.screen }))
const modules = Object.fromEntries(Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
  .map(([path, load]) => [path.replace('../../../convex/', './'), load]))
const NOW = Date.UTC(2026, 8, 30, 12)
const EXPIRES = NOW + 3_600_000
const PRINCIPAL = `prn_${'1'.repeat(32)}`
const ACCOUNT = `acc_${'2'.repeat(32)}`
const OWNERSHIP = `own_${'3'.repeat(32)}`
const OLD_GRANT = `grt_${'4'.repeat(32)}`
const CURRENT_GRANT = `grt_${'5'.repeat(32)}`
const PARENT_GRANT = `grt_${'6'.repeat(32)}`
const TOOL = `operation:v1:${'7'.repeat(64)}`
const CALL = 'call:accepted-authority'
const CREDENTIAL = 'ak_authority_locator'
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
const originalPolicy: AgentAccessPolicy = {
  format: 'ae.agent-access-policy:v2', toolAccess: 'all_admitted', toolRefs: [], environment: 'sandbox',
  budget: { budgetPolicyRef: 'budget:authority', generation: 1, currency: 'AUD', exponent: 6,
    maximumSpendPerCall: { currency: 'AUD', units: '1000', exponent: 6 },
    maximumDailySpend: { currency: 'AUD', units: '10000', exponent: 6 },
    maximumMonthlySpend: { currency: 'AUD', units: '100000', exponent: 6 }, maximumConcurrentCalls: 10 },
  rate: { ratePolicyRef: 'rate:authority', generation: 1, maximumCallsPerMinute: 100, maximumCallsPerHour: 1000 },
}
const originalDigest = agentAccessPolicyDigest(originalPolicy)
const updatedPolicy: AgentAccessPolicy = { ...originalPolicy, budget: { ...originalPolicy.budget, generation: 2,
  maximumSpendPerCall: { currency: 'AUD', units: '2000', exponent: 6 },
  maximumDailySpend: { currency: 'AUD', units: '20000', exponent: 6 },
  maximumMonthlySpend: { currency: 'AUD', units: '200000', exponent: 6 } } }
const action = { actorPrincipalRef: PRINCIPAL, activeAccountRef: ACCOUNT,
  correlationRef: 'correlation:authority', idempotencyRef: 'idempotency:authority' }

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  vi.spyOn(console, 'info').mockImplementation(() => {})
  const environment = {
    AE_DEPLOYMENT_ENVIRONMENT: 'development', AE_X402_CUSTODY_ENABLED: 'true',
    AE_X402_CUSTODY_MAX_ATOMIC: '10000', AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '100000',
    AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC: '100000', AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC: '10000',
    CDP_API_KEY_ID: 'fixture-key', CDP_API_KEY_SECRET: 'fixture-secret', CDP_WALLET_SECRET: 'fixture-secret',
    AE_X402_CDP_ACCOUNT_NAME: 'fixture-wallet', AE_X402_CDP_EXPECTED_EVM_ADDRESS: PAYER,
    AE_X402_CDP_ACCOUNT_POLICY_ID: ACCOUNT_POLICY, AE_X402_CDP_PROJECT_POLICY_ID: PROJECT_POLICY,
    AE_X402_CDP_POLICY_RULES_DIGEST: cdpX402PolicyRulesDigest(accountPolicy, projectPolicy),
    AE_X402_CDP_CREDENTIAL_GENERATION: '1',
  }
  for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value)
  external.screen.mockReset().mockImplementation(async request => ({ ...request,
    provider: 'trm-wallet-screening', outcome: 'clear', startedAt: NOW - 100, checkedAt: NOW, reason: 'fixture_clear' }))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

/**
 * Requires an accepted unresolved Call, consumed Quote and exact persisted unsigned intent.
 * Ensures a monetary-only successor permits the original intent; live revocation still refuses.
 * Invariant: the original Call authority, intent UUID/material and liability never migrate.
 * On violation: durable refusal precedes external signing and leaves existing liability intact.
 * Seam: DB rows model already-accepted history. The actual registered admission transaction,
 * canonical identity/delegation readers, screening adapter and normal signing leaf execute.
 * Only TRM screening and the external CDP SDK are fixtures; no internal authority decisions mock.
 */
async function fixture() {
  const backend = convexTest(schema, modules)
  const custody = cdpX402CustodyConfigurationFromEnvironment()!
  const accepted = { scheme: 'exact', network: 'eip155:84532' as const, amount: '1000', asset: ASSET,
    payTo: PAYEE, maxTimeoutSeconds: 60, extra: { assetTransferMethod: 'eip3009', name: 'USDC', version: '2' } }
  const challenge = { x402Version: 2 as const, resource: { url: 'https://provider.example/authority' }, accepts: [accepted] }
  const request = { challenge, selectedRequirement: accepted, credential: CREDENTIAL, paymentIdentifier: 'payment:authority' }
  const authorization = { from: PAYER, to: PAYEE, value: '1000', validAfter: '0',
    validBefore: String((NOW + 60_000) / 1000), nonce: `0x${'8'.repeat(64)}` }
  const typedData = { domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: ASSET },
    primaryType: 'TransferWithAuthorization', types: TYPES, message: authorization }
  const unsigned = { x402Version: 2, resource: challenge.resource, accepted, authorization, typedData }
  const intent: CdpX402PaymentSigningIntent = {
    paymentUnsignedMaterialJson: stableStringify(unsigned), paymentUnsignedMaterialDigest: canonicalDigest(unsigned),
    paymentSigningIdempotencyKey: '33333333-3333-4333-8333-333333333333', paymentPayer: PAYER,
    paymentNonce: authorization.nonce, paymentAuthorizationValidBefore: authorization.validBefore,
    paymentAuthorizationExpiresAt: NOW + 60_000,
    requestFingerprint: cdpX402RequestFingerprint(request, { method: 'GET', toolRef: TOOL, aeEnvironment: 'sandbox' }),
  }
  const payment: Omit<Doc<'moneyX402PaymentAttempts'>, '_id' | '_creationTime'> = {
    dispatchRef: CALL, attemptRef: 'attempt:authority', effectGeneration: 1, toolRef: TOOL, inputDigest: canonicalDigest('input'),
    paymentIdentifier: request.paymentIdentifier, operationKeyDigest: canonicalDigest('operation'),
    challengeDigest: canonicalDigest(challenge), challengeJson: JSON.stringify(challenge),
    selectedRequirementJson: JSON.stringify(accepted), providerEndpoint: challenge.resource.url, credentialRef: CREDENTIAL,
    scheme: 'exact', network: accepted.network, asset: ASSET, payTo: PAYEE, amountUnits: '1000', currency: 'USDC', exponent: 6,
    custodyRef: 'custody:authority', custodyBudgetRef: cdpX402CustodyBudgetRef(custody, 'sandbox'), custodyGeneration: 1,
    custodyDailyMaximumUnits: '100000', authorizationDigest: canonicalDigest('authorization'),
    paymentIdentityDigest: canonicalDigest('payment-identity'), spendReservationRef: x402SpendReservationRef({
      custodyRef: 'custody:authority', attemptRef: 'attempt:authority', effectGeneration: 1, paymentIdentityDigest: canonicalDigest('payment-identity'),
    }),
    ...intent, paymentSigningClaimedAt: NOW - 1000, state: 'prepared', preparedAt: NOW - 1000, evidenceRefs: [],
  }
  const ids = await backend.run(async ctx => {
    await ctx.db.insert('principals', { principalRef: PRINCIPAL, kind: 'agent', displayName: 'Agent', lifecycle: 'active', revision: 1, createdAt: NOW - 3000, updatedAt: NOW - 3000 })
    await ctx.db.insert('accounts', { accountRef: ACCOUNT, displayName: 'Account', lifecycle: 'active', recoveryPolicy: { kind: 'no_transfer', revision: 1 }, creationActorPrincipalRef: PRINCIPAL, creationIdempotencyRef: action.idempotencyRef, initialOwnershipRef: OWNERSHIP, currentOwnershipRef: OWNERSHIP, revision: 1, createdAt: NOW - 3000, updatedAt: NOW - 3000, lastAction: action })
    await ctx.db.insert('accountOwnerships', { ownershipRef: OWNERSHIP, accountRef: ACCOUNT, ownerPrincipalRef: PRINCIPAL, lifecycle: 'active', changeKind: 'creation', revision: 1, createdAt: NOW - 3000, createdBy: action })
    const binding = await ctx.db.insert('externalIdentityBindings', { bindingRef: 'binding:authority', principalRef: PRINCIPAL, providerNamespace: 'clerk/api-key', providerIdentifier: CREDENTIAL, providerState: { kind: 'known', value: 'active' }, lifecycle: 'active', credentialGeneration: 1, bindIdempotencyRef: 'bind:authority', revision: 1, createdAt: NOW - 3000, updatedAt: NOW - 3000 })
    const credential = await ctx.db.insert('credentials', { credentialRef: 'credential:stored', bindingRef: 'binding:authority', principalRef: PRINCIPAL, type: 'api_key', lifecycle: 'active', generation: 1, issueIdempotencyRef: 'issue:authority', revision: 1, issuedAt: NOW - 3000, expiresAt: EXPIRES + 1000, updatedAt: NOW - 3000 })
    const agent = await ctx.db.insert('agentAccessPrincipals', { principalId: PRINCIPAL, ownerId: ACCOUNT, credentialId: CREDENTIAL, applicationRef: 'application:authority', environment: 'sandbox', scopes: ['market_tools:call'], authorityMode: 'spending_policy', grantGeneration: 2, spendingPolicyDigest: agentAccessPolicyDigest(updatedPolicy), lifecycle: 'active', expiresAt: EXPIRES, recordedAt: NOW - 2000, lastSeenAt: NOW - 1000 })
    const grant = async (grantRef: string, generation: number, lifecycle: 'active' | 'revoked', spendingPolicy: AgentAccessPolicy) => await ctx.db.insert('agentAccessGrants', {
      format: 'ae.agent-access-grant:v2', grantRef, principalId: PRINCIPAL, ownerId: ACCOUNT, credentialId: CREDENTIAL,
      applicationRef: 'application:authority', environment: 'sandbox', toolAccess: spendingPolicy.toolAccess, toolRefs: spendingPolicy.toolRefs,
      authorityMode: 'spending_policy', budgetPolicyRef: 'budget:authority', ratePolicyRef: 'rate:authority', lifecycle,
      generation, spendingPolicyDigest: agentAccessPolicyDigest(spendingPolicy), spendingPolicy, createdAt: NOW - 2000, updatedAt: NOW - 1000, expiresAt: EXPIRES,
    })
    await grant(OLD_GRANT, 1, 'revoked', originalPolicy)
    const currentGrant = await grant(CURRENT_GRANT, 2, 'active', updatedPolicy)
    const delegation = { accountRef: ACCOUNT, actorPrincipalRef: PRINCIPAL, subjectPrincipalRef: PRINCIPAL,
      budgetLimit: 1000, budgetUsed: 0, lifecycle: 'active' as const, createdBy: action }
    const parent = await ctx.db.insert('authorityDelegationGrants', { ...delegation, grantRef: PARENT_GRANT,
      scopes: ['market_tools:call', 'market_tools:inspect'], resourceRefs: ['*'], expiresAt: EXPIRES + 1000,
      generation: 1, revision: 1, createdAt: NOW - 3000 })
    const leaf = { ...delegation, scopes: ['market_tools:call'], resourceRefs: ['*'], expiresAt: EXPIRES,
      parentGrantRef: PARENT_GRANT, parentGeneration: 1, createdAt: NOW - 2000 }
    const originalDelegation = await ctx.db.insert('authorityDelegationGrants', { ...leaf, grantRef: OLD_GRANT, generation: 1, revision: 1 })
    const currentDelegation = await ctx.db.insert('authorityDelegationGrants', { ...leaf, grantRef: CURRENT_GRANT, generation: 2, revision: 2 })
    const call = await ctx.db.insert('capabilityCalls', {
      callRef: CALL, quoteRef: 'quote:authority', principalId: PRINCIPAL, ownerId: ACCOUNT, credentialId: CREDENTIAL,
      applicationRef: 'application:authority', environment: 'sandbox', toolRef: TOOL, inputDigest: payment.inputDigest!,
      requestDigest: intent.requestFingerprint, idempotencyKey: 'idempotency:call', grantRef: OLD_GRANT,
      grantGeneration: 1, policyDigest: originalDigest, grantExpiresAt: EXPIRES, state: 'pending',
      dispatchState: 'running', attemptRef: payment.attemptRef, createdAt: NOW - 2000, updatedAt: NOW - 2000,
    })
    const quote = await ctx.db.insert('capabilityQuotes', {
      quoteRef: 'quote:authority', principalId: PRINCIPAL, accountRef: ACCOUNT, credentialId: CREDENTIAL,
      applicationRef: 'application:authority', environment: 'sandbox', grantRef: OLD_GRANT, grantGeneration: 1,
      grantPolicyDigest: originalDigest, grantExpiresAt: EXPIRES, toolRef: TOOL, toolVersion: 1,
      toolMaterialDigest: canonicalDigest('tool'), currentToolDigest: canonicalDigest('tool'), toolJson: '{}',
      normalizedInputJson: '{}', inputDigest: payment.inputDigest!, pricingJson: '{}', pricingDigest: canonicalDigest('pricing'),
      decisionAudUnits: '1000', budgetPolicyRef: 'budget:authority', budgetGeneration: 1, maximumSpendPerCallUnits: '1000',
      formanceSchemaVersion: 'v1.5.0', policyGeneration: 1, legalCustomerRef: PRINCIPAL, legalCustomerGeneration: 1,
      buyerRevenueUnits: '1000', buyerTaxUnits: '0', accountAvailableUnits: '10000', budgetAvailableUnits: '10000',
      legalExposureAvailableUnits: '10000', balanceUnits: '10000', commercialPolicyRefs: [],
      commercialPolicyDigest: canonicalDigest('commercial'), evidenceDigest: canonicalDigest('quote'),
      state: 'consumed', consumedCallRef: CALL, expiresAt: NOW - 1, createdAt: NOW - 2000, updatedAt: NOW - 2000,
    })
    const attempt = await ctx.db.insert('moneyX402PaymentAttempts', payment)
    return { binding, credential, agent, currentGrant, parent, originalDelegation, currentDelegation, call, quote, attempt }
  })
  const sign = vi.fn().mockResolvedValue({ signature: `0x${'44'.repeat(65)}` })
  const client = { policies: { getPolicyById: async ({ id }: { id: string }) => id === ACCOUNT_POLICY ? accountPolicy : projectPolicy },
    evm: { getAccount: async () => ({ address: PAYER, policies: [ACCOUNT_POLICY, PROJECT_POLICY] }), signTypedData: sign } }
  const ctx: Pick<ActionCtx, 'runMutation'> = { runMutation: backend.mutation.bind(backend) as ActionCtx['runMutation'] }
  const signing = () => createCdpEvmX402PaymentSignature(request, { persistedIntent: intent, authorityExpiresAt: EXPIRES,
    aeEnvironment: 'sandbox', requestFingerprintContext: { method: 'GET', toolRef: TOOL, aeEnvironment: 'sandbox' },
    createClient: () => client, admitSigning: async exact => await admitManagedX402Signing(ctx,
      { custodyRef: payment.custodyRef, authorizationDigest: payment.authorizationDigest, custodyGeneration: 1 }, exact) })
  const durable = () => backend.run(async ctx => ({ call: await ctx.db.get(ids.call), payment: await ctx.db.get(ids.attempt),
    reservations: await ctx.db.query('moneyX402SpendReservations').collect(), checks: await ctx.db.query('moneyX402PayeeScreeningChecks').collect() }))
  const policy = async (next: AgentAccessPolicy) => await backend.run(async ctx => {
    const digest = agentAccessPolicyDigest(next)
    await ctx.db.patch(ids.currentGrant, { spendingPolicy: next, spendingPolicyDigest: digest, toolAccess: next.toolAccess, toolRefs: next.toolRefs })
    await ctx.db.patch(ids.agent, { spendingPolicyDigest: digest })
  })
  return { backend, ids, intent, typedData, sign, signing, durable, policy }
}

type Fixture = Awaited<ReturnType<typeof fixture>>
const invalidate: ReadonlyArray<readonly [string, (f: Fixture) => Promise<void>]> = [
  ['current access grant revoked', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.currentGrant, { lifecycle: 'revoked' }) })],
  ['current delegation revoked', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.currentDelegation, { lifecycle: 'revoked', generation: 3, revision: 3, revokedAt: NOW, revokedBy: action }) })],
  ['original delegation revoked', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.originalDelegation, { lifecycle: 'revoked', generation: 2, revision: 2, revokedAt: NOW, revokedBy: action }) })],
  ['ancestor revoked', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.parent, { lifecycle: 'revoked', generation: 2, revision: 2, revokedAt: NOW, revokedBy: action }) })],
  ['credential disconnected at provider', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.binding, { providerState: { kind: 'known', value: 'revoked' } }) })],
  ['credential revoked', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.credential, { lifecycle: 'revoked' }) })],
  ['identity binding revoked', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.binding, { lifecycle: 'revoked' }) })],
  // Selected Tools still include this Tool, so the nonmonetary equivalence check must reject.
  ['tool selection changed but still permits this Tool', async f => await f.policy({ ...updatedPolicy, toolAccess: 'selected_tools', toolRefs: [TOOL] })],
  // Widening preserves required scope; equality with original canonical scope must reject.
  ['scope widened', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.currentDelegation, { scopes: ['market_tools:call', 'market_tools:inspect'] }) })],
  ['authority mode changed', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.agent, { authorityMode: 'approval_required' }); await ctx.db.patch(f.ids.currentGrant, { authorityMode: 'approval_required' }) })],
  ['rate changed', async f => await f.policy({ ...updatedPolicy, rate: { ...updatedPolicy.rate, generation: 2, maximumCallsPerMinute: 50 } })],
  ['concurrency changed', async f => await f.policy({ ...updatedPolicy, budget: { ...updatedPolicy.budget, maximumConcurrentCalls: 5 } })],
  ['consumed Quote belongs to another Call', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.quote, { consumedCallRef: 'call:other' }) })],
  ['Call became terminal', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.call, { state: 'completed' }) })],
  ['Call reference no longer resolves', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.attempt, { dispatchRef: 'call:missing' }) })],
  ['Tool differs from immutable Call', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.attempt, { toolRef: `operation:v1:${'9'.repeat(64)}` }) })],
  ['input differs from immutable Call', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.attempt, { inputDigest: canonicalDigest('other-input') }) })],
  ['attempt differs from immutable Call', async f => await f.backend.run(async ctx => { await ctx.db.patch(f.ids.call, { attemptRef: 'attempt:other' }) })],
]

describe('accepted Call signing under a monetary-only policy successor', () => {
  it.each(['pending', 'reconciliation_required'] as const)('reserves and signs the original frozen intent while Call is %s', async state => {
    const f = await fixture()
    await f.backend.run(async ctx => { await ctx.db.patch(f.ids.call, { state }) })
    const before = await f.durable()
    expect(await f.signing()).toEqual(expect.any(String))
    expect(await f.signing()).toEqual(expect.any(String))
    expect(f.sign).toHaveBeenCalledTimes(2)
    const expectedRequest = { address: PAYER, ...f.typedData, idempotencyKey: f.intent.paymentSigningIdempotencyKey }
    expect(f.sign.mock.calls.map(call => call[0])).toEqual([expectedRequest, expectedRequest])
    const after = await f.durable()
    expect(after.call).toEqual(before.call)
    expect(after.payment).toEqual(before.payment)
    expect(after.reservations).toHaveLength(1)
    expect(after.reservations[0]).toMatchObject({ state: 'liability', dispatchRef: CALL, attemptRef: 'attempt:authority',
      paymentUnsignedMaterialDigest: f.intent.paymentUnsignedMaterialDigest, paymentSigningIdempotencyKey: f.intent.paymentSigningIdempotencyKey })
    expect(after.checks.map(check => check.admission)).toEqual(['admitted', 'admitted'])
  })

  it.each(invalidate)('refuses %s before external signing and preserves existing liability', async (_name, change) => {
    const f = await fixture()
    expect(await f.signing()).toEqual(expect.any(String))
    const liability = (await f.durable()).reservations
    f.sign.mockClear()
    await change(f)
    expect(await f.signing()).toBeUndefined()
    expect(f.sign).not.toHaveBeenCalled()
    const after = await f.durable()
    expect(after.reservations).toEqual(liability)
    expect(after.checks.at(-1)).toMatchObject({ admission: 'refused', refusalCode: 'spend_authority_invalid' })
  })
})
