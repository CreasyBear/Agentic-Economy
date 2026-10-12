/// <reference types="vite/client" />
import { makeFunctionReference } from 'convex/server'
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import schema from '../../../convex/schema'
import { api } from '../../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { AdminCommandArgs, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import { readCommercialPolicyGate } from '../../../convex/moneyCommercialPolicy'
import {
  COMMERCIAL_POLICY_FAMILIES,
  SANDBOX_COMMERCIAL_POLICY_CONTROLS,
  PACKAGE4_FORMANCE_REQUIREMENTS,
  type CommercialPolicyControl,
} from '../../../src/modules/money/public'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../../helpers/commercial-policy-fixtures'
import { seedCommercialPolicies } from '../../helpers/quote-fixtures'
import { ownerAdmin, reviewerAdmin, supportAdmin, testMfaConsequenceProof } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'
import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { handleFundingConstraintsRequest } from '@/routes/api.v1.funding.constraints'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

beforeEach(() => vi.stubEnv('AE_X402_CUSTODY_MAX_ATOMIC', '500000'))
afterEach(() => vi.unstubAllEnvs())

type PolicyChangeResult = AdminCommandReceipt<'change_commercial_policy'>

const changeCommercialPolicy = makeFunctionReference<
  'mutation',
  Record<string, unknown>,
  PolicyChangeResult
>('moneyCommercialPolicy:change')

const readOwnerFundingConstraints = makeFunctionReference<
  'query',
  { environment: 'sandbox' | 'production'; now: number },
  Record<string, unknown>
>('moneyCommercialPolicy:readOwnerFundingConstraints')

const readPlatformFundingConstraints = makeFunctionReference<
  'query',
  { environment: 'sandbox' | 'production'; now: number },
  Record<string, unknown>
>('moneyCommercialPolicy:readPlatformFundingConstraints')

function command(
  subject: string,
  operationKey: string,
  changeKind: 'activate' | 'replace' | 'suspend',
  policyRef: string,
  revision: number,
  expectedCurrentPolicyRef?: string,
): AdminCommandArgs<'change_commercial_policy'> {
  const now = Date.now()
  const input: AdminCommandArgs<'change_commercial_policy'>['input'] = {
    changeKind, family: 'commercial_perimeter', environment: 'production',
    policyRef, revision, effectiveAt: now - 60_000, expiresAt: now + 86_400_000,
    control: SANDBOX_COMMERCIAL_POLICY_CONTROLS.commercial_perimeter,
    ...(expectedCurrentPolicyRef === undefined ? {} : { expectedCurrentPolicyRef }),
  }
  const evidenceRefs = ['legal-approval:commercial-perimeter:1']
  const reasonCode = 'pricing_update'
  const action = 'change_commercial_policy'
  const digest = canonicalDigest({ scope: 'admin_operator', action, input, reasonCode, evidenceRefs })
  return {
    input, evidenceRefs, reasonCode, action,
    operationKey, correlationId: operationKey,
    approval: { kind: 'execute' },
    proof: testMfaConsequenceProof({ subject }, digest),
  }
}

describe('commercial policy persistence', () => {
  it('projects the authenticated sandbox funding limits without exposing approval records', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const backend = convexTest(schema, convexModules)
    const owner = await ownerAdmin(backend, 'user_funding-constraints')

    await expect(owner.query(readOwnerFundingConstraints, {
      environment: 'sandbox',
      now: Date.now(),
    })).resolves.toMatchObject({
      kind: 'available',
      environment: 'sandbox',
      currency: 'AUD',
      exponent: 6,
      minimumPrincipalUnits: '5000000',
      maximumPrincipalUnits: '25000000000',
      incrementUnits: '10000',
      serviceFeeBps: 500,
      taxOnServiceFeeBps: 1000,
      legalCustomerMaximumAccessibleUnits: '4999999999',
      policyDigest: expect.stringMatching(/^sha256:/u),
    })
  })

  it('projects public funding numbers without the owner digest or legal max', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const backend = convexTest(schema, convexModules)
    const projected = await backend.query(readPlatformFundingConstraints, {
      environment: 'sandbox',
      now: Date.now(),
    })
    expect(projected).toMatchObject({
      kind: 'available',
      environment: 'sandbox',
      currency: 'AUD',
      exponent: 6,
      minimumPrincipalUnits: '5000000',
      maximumPrincipalUnits: '25000000000',
      incrementUnits: '10000',
      serviceFeeBps: 500,
      taxOnServiceFeeBps: 1000,
    })
    expect(projected).not.toHaveProperty('policyDigest')
    expect(projected).not.toHaveProperty('legalCustomerMaximumAccessibleUnits')
  })

  it.each([
    [undefined, 'payments_admins_only'],
    ['admins', 'payments_admins_only'],
    ['none', 'payments_paused'],
  ] as const)('refuses public funding for the %s production audience before requiring policy or Stripe setup', async (audience, code) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTest(schema, convexModules)
    if (audience !== undefined) await backend.run(async (ctx) => {
      await ctx.db.insert('platformLaunch', {
        environment: 'production', paymentsOpenTo: audience, resumePaymentsOpenTo: 'admins', revision: 1, updatedAt: 1,
      })
    })
    await expect(backend.query(readPlatformFundingConstraints, {
      environment: 'production', now: Date.now(),
    })).resolves.toEqual({ kind: 'refused', code, retryable: false })
  })

  it('returns HTTP 409 through the actual Convex query when public funding is closed and Stripe is absent', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    const backend = convexTest(schema, convexModules)
    const restoreSource = setPublicSourceTransportForTests({
      query: (reference: Parameters<typeof backend.query>[0], args: Record<string, unknown>) => backend.query(reference, args),
    } as never)
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    try {
      const response = await handleFundingConstraintsRequest(new Request('https://ae.example/api/v1/funding/constraints'))
      expect(response.status).toBe(409)
      expect(response.headers.get('cache-control')).toBe('no-store')
      await expect(response.json()).resolves.toMatchObject({ code: 'payments_not_open', retryable: false })
    } finally {
      restoreSource()
      setHttpRateLimitAdmissionForTests(undefined)
    }
  })

  it('refuses the owner funding projection without an authenticated owner', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const backend = convexTest(schema, convexModules)
    const refused = await backend.query(readOwnerFundingConstraints, {
      environment: 'sandbox',
      now: Date.now(),
    })
    expect(refused).toEqual({
      kind: 'refused',
      code: 'billing_identity_missing',
      retryable: false,
    })
    expect(refused).not.toHaveProperty('policyDigest')
    expect(refused).not.toHaveProperty('legalCustomerMaximumAccessibleUnits')
  })

  it('ignores caller now on the public funding projection', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTest(schema, convexModules)
    const wallNow = Date.now()
    const twoDays = 2 * 86_400_000
    await backend.run(async (ctx) => {
      await ctx.db.insert('platformLaunch', {
        environment: 'production', paymentsOpenTo: 'everyone', resumePaymentsOpenTo: 'everyone', revision: 1, updatedAt: wallNow,
      })
      for (const [index, family] of COMMERCIAL_POLICY_FAMILIES.entries()) {
        await ctx.db.insert('moneyCommercialPolicies', {
          policyRef: `commercial-policy:${family}:1`,
          family,
          environment: 'production',
          revision: 1,
          lifecycle: 'active',
          effectiveAt: wallNow - 1,
          expiresAt: wallNow + twoDays,
          evidenceRef: `approval:${family}:1`,
          evidenceDigest: `sha256:${String(index).repeat(64)}`,
          control: PRODUCTION_COMMERCIAL_POLICY_CONTROLS[family],
          approvedByPrincipalRef: 'prn_00000000000040008000000000000021',
          activeAccountRef: 'acc_00000000000040008000000000000021',
          authorityGeneration: 1,
          correlationRef: `correlation:${family}:1`,
          idempotencyRef: `idempotency:${family}:1`,
          commandDigest: `sha256:${String(index + 1).repeat(64)}`,
          activatedAt: wallNow - 1,
          updatedAt: wallNow - 1,
        })
      }
    })

    const projected = await backend.query(readPlatformFundingConstraints, {
      environment: 'production',
      now: wallNow + twoDays,
    })
    expect(projected).toMatchObject({
      kind: 'available',
      environment: 'production',
      serviceFeeBps: PRODUCTION_COMMERCIAL_POLICY_CONTROLS.operations.fundingServiceFeeBps,
    })
    expect(projected).not.toHaveProperty('policyDigest')
  })

  it('reads one bounded canonical production decision across all six families', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTest(schema, convexModules)
    const now = Date.now()
    await backend.run(async (ctx) => {
      for (const [index, family] of COMMERCIAL_POLICY_FAMILIES.entries()) {
        await ctx.db.insert('moneyCommercialPolicies', {
          policyRef: `commercial-policy:${family}:1`,
          family,
          environment: 'production',
          revision: 1,
          lifecycle: 'active',
          effectiveAt: now - 1,
          expiresAt: now + 60_000,
          evidenceRef: `approval:${family}:1`,
          evidenceDigest: `sha256:${String(index).repeat(64)}`,
          control: PRODUCTION_COMMERCIAL_POLICY_CONTROLS[family],
          approvedByPrincipalRef: 'prn_00000000000040008000000000000021',
          activeAccountRef: 'acc_00000000000040008000000000000021',
          authorityGeneration: 1,
          correlationRef: `correlation:${family}:1`,
          idempotencyRef: `idempotency:${family}:1`,
          commandDigest: `sha256:${String(index + 1).repeat(64)}`,
          activatedAt: now - 1,
          updatedAt: now - 1,
        })
      }
    })

    await expect(backend.query(async (ctx) =>
      await readCommercialPolicyGate(ctx.db, { environment: 'production', now }),
    )).resolves.toMatchObject({
      kind: 'admitted',
      environment: 'production',
      policyRefs: COMMERCIAL_POLICY_FAMILIES.map((family) => `commercial-policy:${family}:1`),
      policyDigest: expect.stringMatching(/^sha256:/u),
      controls: PRODUCTION_COMMERCIAL_POLICY_CONTROLS,
    })
  })

  it.each([
    [undefined, 'sandbox'],
    ['', 'sandbox'],
    [' development ', 'sandbox'],
    ['production', 'sandbox'],
    ['development', 'production'],
  ] as const)('refuses declaration %j for requested %s policy', async (declaration, requested) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', declaration)
    const backend = convexTest(schema, convexModules)
    const result = await backend.query(async (ctx) => readCommercialPolicyGate(ctx.db, {
      environment: requested, now: Date.now(),
      sandboxFixture: 'managed_x402_deterministic_v1',
    }))
    expect(result).toEqual({ kind: 'refused', code: 'commercial_policy_environment_mismatch' })
  })

  it('replaces and suspends the current row without leaving two active policies', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTest(schema, convexModules)
    const subject = 'user_commercial-policy-lifecycle'
    const admin = await ownerAdmin(backend, subject)
    const firstRef = 'commercial-policy:commercial-perimeter:1'
    const secondRef = 'commercial-policy:commercial-perimeter:2'
    const first = command(subject, 'policy:activate:1', 'activate', firstRef, 1)
    await expect(admin.mutation(changeCommercialPolicy, await withSourceWrite('admin_operator', first)))
      .resolves.toMatchObject({ kind: 'completed', code: 'commercial_policy_changed' })
    const second = command(subject, 'policy:replace:2', 'replace', secondRef, 2, firstRef)
    await expect(admin.mutation(changeCommercialPolicy, await withSourceWrite('admin_operator', second)))
      .resolves.toMatchObject({ kind: 'completed', code: 'commercial_policy_changed' })
    const suspend = proofFor(subject, { ...command(subject, 'policy:suspend:2', 'suspend', secondRef, 2, secondRef), input: { ...second.input, changeKind: 'suspend', expectedCurrentPolicyRef: secondRef } })
    await expect(admin.mutation(changeCommercialPolicy, await withSourceWrite('admin_operator', suspend)))
      .resolves.toMatchObject({ kind: 'completed', code: 'commercial_policy_changed' })
    const rows = await backend.run((ctx) => ctx.db.query('moneyCommercialPolicies')
      .withIndex('by_environment_and_family_and_lifecycle', (query) => query
        .eq('environment', 'production').eq('family', 'commercial_perimeter'))
      .collect())
    expect(rows.map(({ policyRef, lifecycle, supersededByPolicyRef }) => ({
      policyRef, lifecycle, supersededByPolicyRef,
    }))).toEqual([
      { policyRef: firstRef, lifecycle: 'superseded', supersededByPolicyRef: secondRef },
      { policyRef: secondRef, lifecycle: 'suspended', supersededByPolicyRef: undefined },
    ])
  })
})

function proofFor(subject: string, input: AdminCommandArgs<'change_commercial_policy'>): AdminCommandArgs<'change_commercial_policy'> {
  const digest = canonicalDigest({ scope: 'admin_operator', action: input.action, input: input.input, reasonCode: input.reasonCode, evidenceRefs: input.evidenceRefs, ...(input.expectedStateDigest === undefined ? {} : { expectedStateDigest: input.expectedStateDigest }) })
  return { ...input, proof: testMfaConsequenceProof({ subject }, digest) }
}
describe('protected commercial policy preparation and write requirements', () => {
  it('requires owner-admin preparation and returns only fixed requirements when no policy exists', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTest(schema, convexModules)
    const args = { environment: 'production' as const, family: 'operations' as const }
    expect(await backend.query(api.moneyCommercialPolicy.prepareChange, args)).toMatchObject({ kind: 'refused' })
    for (const create of [reviewerAdmin, supportAdmin]) {
      const caller = await create(backend, `user_prepare-${create.name}`)
      expect(await caller.query(api.moneyCommercialPolicy.prepareChange, args)).toMatchObject({ kind: 'refused', code: 'action_not_allowed' })
    }
    const owner = await ownerAdmin(backend, 'user_prepare-owner')
    expect(await owner.query(api.moneyCommercialPolicy.prepareChange, args)).toEqual({ ...args, kind: 'ready', current: null, conflict: false, requiresSecondApproval: false, requirements: PACKAGE4_FORMANCE_REQUIREMENTS })
    await ownerAdmin(backend, 'user_prepare-second')
    expect(await owner.query(api.moneyCommercialPolicy.prepareChange, args)).toMatchObject({ requiresSecondApproval: true })
    expect(await owner.query(api.moneyCommercialPolicy.prepareChange, { ...args, environment: 'sandbox' })).toEqual({ kind: 'refused', code: 'commercial_policy_environment_mismatch' })
    expect(await backend.run(ctx => ctx.db.query('moneyCommercialPolicies').collect())).toEqual([])
  })

  it.each(['activate', 'replace', 'suspend'] as const)('refuses a %s in an undeclared environment without policy effects', async changeKind => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const backend = convexTest(schema, convexModules)
    const subject = 'user_policy-env'
    const owner = await ownerAdmin(backend, subject)
    const request = command(subject, `policy:env:${changeKind}`, changeKind, 'policy:env', 1, changeKind === 'activate' ? undefined : 'policy:env')
    expect(await owner.mutation(changeCommercialPolicy, await withSourceWrite('admin_operator', request))).toMatchObject({ kind: 'refused', code: 'authority_mismatch' })
    expect(await backend.run(ctx => ctx.db.query('moneyCommercialPolicies').collect())).toEqual([])
  })

  it.each([
    { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.treasury_custody, formanceLedgerVersion: 'v99.0.0' },
    { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.treasury_custody, formanceGatewayVersion: 'v99.0.0' },
    { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.treasury_custody, formanceSchemaVersion: 'v99.0.0' },
    { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.treasury_custody, maximumSdkIntegerUnits: '1' },
    { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.treasury_custody, architectureReviewCumulativeUnits: '1' },
    { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.operations, formanceSdkVersion: '99.0.0' },
    { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.operations, formanceSdkArtifactDigest: `sha256:${'0'.repeat(64)}` },
    SANDBOX_COMMERCIAL_POLICY_CONTROLS.operations,
    SANDBOX_COMMERCIAL_POLICY_CONTROLS.treasury_custody,
  ] satisfies CommercialPolicyControl[])('refuses changed technical requirements or fixture attestations %#', async control => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTest(schema, convexModules)
    const subject = 'user_policy-pins'
    const owner = await ownerAdmin(backend, subject)
    const base = command(subject, 'policy:pin-drift', 'activate', 'policy:pins', 1)
    const request = { ...base, input: { ...base.input, family: control.family, control } }
    expect(await owner.mutation(changeCommercialPolicy, await withSourceWrite('admin_operator', proofFor(subject, request)))).toMatchObject({ kind: 'refused', code: 'authority_mismatch' })
    expect(await backend.run(ctx => ctx.db.query('moneyCommercialPolicies').collect())).toEqual([])
  })

  it('reads and suspends historical pins while refusing their replacement, preserving the old row', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTest(schema, convexModules)
    const subject = 'user_policy-history'
    const owner = await ownerAdmin(backend, subject)
    const base = command(subject, 'policy:history:activate', 'activate', 'policy:history', 1)
    const initial = { ...base, input: { ...base.input, family: 'treasury_custody' as const, control: PRODUCTION_COMMERCIAL_POLICY_CONTROLS.treasury_custody } }
    expect(await owner.mutation(changeCommercialPolicy, await withSourceWrite('admin_operator', proofFor(subject, initial)))).toMatchObject({ kind: 'completed' })
    const historical = { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.treasury_custody, formanceLedgerVersion: 'v1.0.0' }
    await backend.run(async ctx => {
      const row = await ctx.db.query('moneyCommercialPolicies').unique()
      if (row === null) throw new Error('policy_missing')
      await ctx.db.patch(row._id, { control: historical })
    })
    const prepared = await owner.query(api.moneyCommercialPolicy.prepareChange, { environment: 'production', family: 'treasury_custody' })
    expect(prepared).toMatchObject({ kind: 'ready', current: { control: historical }, requirements: PACKAGE4_FORMANCE_REQUIREMENTS })
    if (prepared.kind !== 'ready' || prepared.current === null) throw new Error('preparation_missing')
    const replacement = { ...initial, operationKey: 'policy:history:replace', correlationId: 'policy:history:replace', expectedStateDigest: prepared.current.stateDigest, input: { ...initial.input, control: historical, changeKind: 'replace' as const, revision: 2, policyRef: 'policy:history:new', expectedCurrentPolicyRef: 'policy:history' } }
    const before = await backend.run(ctx => ctx.db.query('moneyCommercialPolicies').collect())
    expect(await owner.mutation(changeCommercialPolicy, await withSourceWrite('admin_operator', proofFor(subject, replacement)))).toMatchObject({ kind: 'refused', code: 'authority_mismatch' })
    expect(await backend.run(ctx => ctx.db.query('moneyCommercialPolicies').collect())).toEqual(before)
    const suspend = { ...initial, operationKey: 'policy:history:suspend', correlationId: 'policy:history:suspend', expectedStateDigest: prepared.current.stateDigest, input: { ...initial.input, control: historical, changeKind: 'suspend' as const, expectedCurrentPolicyRef: 'policy:history' } }
    for (const [key, differentTerms] of Object.entries({
      effective: { ...suspend.input, effectiveAt: suspend.input.effectiveAt - 1 },
      expiry: { ...suspend.input, expiresAt: suspend.input.expiresAt + 1 },
      control: { ...suspend.input, control: { ...historical, minimumBufferUnits: '123' } },
    })) {
      const dishonest = { ...suspend, input: differentTerms, operationKey: `policy:history:different:${key}`, correlationId: `policy:history:different:${key}` }
      expect(await owner.mutation(changeCommercialPolicy, await withSourceWrite('admin_operator', proofFor(subject, dishonest)))).toMatchObject({ kind: 'refused', code: 'authority_mismatch' })
      expect(await backend.run(ctx => ctx.db.query('moneyCommercialPolicies').collect())).toEqual(before)
    }
    const signed = await withSourceWrite('admin_operator', proofFor(subject, suspend))
    vi.stubEnv('AE_X402_CUSTODY_MAX_ATOMIC', undefined)
    const receipt = await owner.mutation(changeCommercialPolicy, signed)
    expect(receipt).toMatchObject({ kind: 'completed' })
    expect(await owner.mutation(changeCommercialPolicy, signed)).toEqual(receipt)
    expect(await owner.query(api.moneyCommercialPolicy.prepareChange, { environment: 'production', family: 'treasury_custody' })).toMatchObject({ kind: 'ready', current: { lifecycle: 'suspended', control: historical } })
  })

  it('admits one concurrent activation and refuses a replacement using stale preparation', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTest(schema, convexModules)
    const subject = 'user_policy-race'
    const owner = await ownerAdmin(backend, subject)
    const requests = await Promise.all(['one', 'two'].map(key => withSourceWrite('admin_operator', command(subject, `policy:race:${key}`, 'activate', `policy:race:${key}`, 1))))
    const results = await Promise.all(requests.map(request => owner.mutation(changeCommercialPolicy, request)))
    expect(results.filter(result => result.kind === 'completed')).toHaveLength(1)
    const preparation = await owner.query(api.moneyCommercialPolicy.prepareChange, { environment: 'production', family: 'commercial_perimeter' })
    if (preparation.kind !== 'ready' || preparation.current === null) throw new Error('preparation_missing')
    const current = preparation.current
    const first = { ...command(subject, 'policy:race:replace', 'replace', 'policy:race:three', 2, current.policyRef), expectedStateDigest: current.stateDigest }
    const other = { ...first, operationKey: 'policy:race:other', correlationId: 'policy:race:other', input: { ...first.input, policyRef: 'policy:race:four' } }
    expect(await owner.mutation(changeCommercialPolicy, await withSourceWrite('admin_operator', proofFor(subject, first)))).toMatchObject({ kind: 'completed' })
    expect(await owner.mutation(changeCommercialPolicy, await withSourceWrite('admin_operator', proofFor(subject, other)))).toMatchObject({ kind: 'refused', code: 'target_changed' })
    const rows = await backend.run(ctx => ctx.db.query('moneyCommercialPolicies').collect())
    expect(rows.filter(row => row.lifecycle === 'active').map(row => row.policyRef)).toEqual(['policy:race:three'])
  })
})

describe('production policy terms backed by current implementation', () => {
  it.each([
    { family: 'tax' as const, control: { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.tax, callTaxBps: 100 } },
    { family: 'operations' as const, control: { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.operations, buyerPricingMarginBps: 100 } },
  ])('refuses unsupported $family terms without storing an approval', async ({ family, control }) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTest(schema, convexModules)
    const subject = `user_policy-unsupported-${family}`
    const owner = await ownerAdmin(backend, subject)
    const base = command(subject, `policy:unsupported:${family}`, 'activate', `policy:unsupported:${family}`, 1)
    const request = { ...base, input: { ...base.input, family, control } }
    expect(await owner.mutation(changeCommercialPolicy, await withSourceWrite('admin_operator', proofFor(subject, request))))
      .toMatchObject({ kind: 'refused', code: 'authority_mismatch' })
    expect(await backend.run(ctx => ctx.db.query('moneyCommercialPolicies').collect())).toEqual([])
  })

  it.each([
    [undefined, 'missing'],
    ['invalid', 'malformed'],
    ['499999', 'below floor'],
  ] as const)('refuses treasury activation when custody cap is %s (%s)', async (cap, label) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    vi.stubEnv('AE_X402_CUSTODY_MAX_ATOMIC', cap)
    const backend = convexTest(schema, convexModules)
    const key = label.replaceAll(' ', '-')
    const subject = `user_policy-cap-${key}`
    const owner = await ownerAdmin(backend, subject)
    const base = command(subject, `policy:cap:${key}`, 'activate', `policy:cap:${key}`, 1)
    const request = { ...base, input: { ...base.input, family: 'treasury_custody' as const,
      control: { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.treasury_custody, minimumBufferUnits: '500000' } } }
    const signed = await withSourceWrite('admin_operator', proofFor(subject, request))
    const receipt = await owner.mutation(api.moneyCommercialPolicy.change,
      { ...signed, evidenceRefs: [...signed.evidenceRefs] })
    expect(receipt).toMatchObject({ kind: 'refused', code: 'commercial_policy_deployment_profile_invalid' })
    expect(await backend.run(ctx => ctx.db.query('moneyCommercialPolicies').collect())).toEqual([])
  })

  it.each(['500000', '600000'] as const)('admits treasury floor 500000 with enforced cap %s', async cap => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    vi.stubEnv('AE_X402_CUSTODY_MAX_ATOMIC', cap)
    const backend = convexTest(schema, convexModules)
    const subject = `user_policy-cap-allowed-${cap}`
    const owner = await ownerAdmin(backend, subject)
    const base = command(subject, `policy:cap:allowed:${cap}`, 'activate', `policy:cap:allowed:${cap}`, 1)
    const request = { ...base, input: { ...base.input, family: 'treasury_custody' as const,
      control: { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.treasury_custody, minimumBufferUnits: '500000' } } }
    expect(await owner.mutation(changeCommercialPolicy, await withSourceWrite('admin_operator', proofFor(subject, request))))
      .toMatchObject({ kind: 'completed', code: 'commercial_policy_changed' })
  })

  it('closes an approved gate after custody cap drift without altering approvals', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const backend = convexTest(schema, convexModules)
    const now = Date.now()
    await seedCommercialPolicies(backend, 'buffer-drift', now)
    await backend.run(async ctx => {
      const row = await ctx.db.query('moneyCommercialPolicies')
        .withIndex('by_policyRef', q => q.eq('policyRef', 'commercial-policy:quote:buffer-drift:treasury_custody:1')).unique()
      if (row === null || row.control.family !== 'treasury_custody') throw new Error('treasury_policy_missing')
      await ctx.db.patch(row._id, { control: { ...row.control, minimumBufferUnits: '500000' } })
    })
    expect(await backend.query(ctx => readCommercialPolicyGate(ctx.db, { environment: 'production', now })))
      .toMatchObject({ kind: 'admitted' })
    const before = await backend.run(ctx => ctx.db.query('moneyCommercialPolicies').collect())
    vi.stubEnv('AE_X402_CUSTODY_MAX_ATOMIC', '600000')
    expect(await backend.query(ctx => readCommercialPolicyGate(ctx.db, { environment: 'production', now })))
      .toMatchObject({ kind: 'admitted' })
    for (const cap of ['499999', 'malformed', undefined]) {
      vi.stubEnv('AE_X402_CUSTODY_MAX_ATOMIC', cap)
      expect(await backend.query(ctx => readCommercialPolicyGate(ctx.db, { environment: 'production', now })))
        .toEqual({ kind: 'refused', code: 'commercial_policy_deployment_profile_invalid', family: 'treasury_custody' })
    }
    expect(await backend.run(ctx => ctx.db.query('moneyCommercialPolicies').collect())).toEqual(before)
  })
})
