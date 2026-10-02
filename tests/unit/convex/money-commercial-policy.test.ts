/// <reference types="vite/client" />
import { makeFunctionReference } from 'convex/server'
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import schema from '../../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { AdminCommandArgs, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import { readCommercialPolicyGate } from '../../../convex/moneyCommercialPolicy'
import {
  COMMERCIAL_POLICY_FAMILIES,
  SANDBOX_COMMERCIAL_POLICY_CONTROLS,
} from '../../../src/modules/money/public'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../../helpers/commercial-policy-fixtures'
import { ownerAdmin, testMfaConsequenceProof } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

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
    const suspend = command(subject, 'policy:suspend:2', 'suspend', secondRef, 2, secondRef)
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
