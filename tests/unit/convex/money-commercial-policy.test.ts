/// <reference types="vite/client" />
import { makeFunctionReference } from 'convex/server'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import { readCommercialPolicyGate } from '../../../convex/moneyCommercialPolicy'
import {
  COMMERCIAL_POLICY_FAMILIES,
  SANDBOX_COMMERCIAL_POLICY_CONTROLS,
} from '../../../src/modules/money/public'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../../helpers/commercial-policy-fixtures'
import { ownerAdmin } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

type PolicyChangeResult =
  | Readonly<{ kind: 'changed'; change: 'activated' | 'replaced' | 'suspended'; policyRef: string }>
  | Readonly<{ kind: 'replayed'; policyRef: string }>
  | Readonly<{ kind: 'refused'; code: string }>

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

function command(overrides: Record<string, unknown> = {}) {
  const now = Date.now()
  return {
    changeKind: 'activate',
    family: 'commercial_perimeter',
    environment: 'production',
    policyRef: 'commercial-policy:commercial-perimeter:1',
    revision: 1,
    effectiveAt: now - 60_000,
    expiresAt: now + 86_400_000,
    evidenceRef: 'legal-approval:commercial-perimeter:1',
    evidenceDigest: `sha256:${'a'.repeat(64)}`,
    control: SANDBOX_COMMERCIAL_POLICY_CONTROLS.commercial_perimeter,
    operationKey: 'moneyCommercialPolicy:change:commercial-perimeter:1',
    correlationId: 'commercial-policy:commercial-perimeter:1',
    ...overrides,
  }
}

describe('commercial policy persistence', () => {
  it('projects the authenticated sandbox funding limits without exposing approval records', async () => {
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

  it('requires owner-admin authority and one-command strict proof before activation', async () => {
    const backend = convexTest(schema, convexModules)
    const admin = await ownerAdmin(backend, 'user_commercial-policy-admin')
    const base = command()

    await expect(admin.mutation(
      changeCommercialPolicy,
      await withSourceWrite('admin_operator', base),
    )).resolves.toEqual({ kind: 'refused', code: 'reauthentication_required' })

    await expect(backend.run(async (ctx) =>
      await ctx.db.query('moneyCommercialPolicies').collect(),
    )).resolves.toEqual([])

    const proof = {
      reverificationId: 'reverification:commercial-policy:one',
      firstFactorAgeMinutes: 0,
      secondFactorAgeMinutes: -1,
    }
    const admitted = await withSourceWrite('admin_operator', { ...base, proof })
    await expect(admin.mutation(changeCommercialPolicy, admitted)).resolves.toEqual({
      kind: 'changed',
      change: 'activated',
      policyRef: base.policyRef,
    })

    await expect(admin.mutation(
      changeCommercialPolicy,
      await withSourceWrite('admin_operator', { ...base, proof }),
    )).resolves.toEqual({ kind: 'replayed', policyRef: base.policyRef })

    await expect(admin.mutation(
      changeCommercialPolicy,
      await withSourceWrite('admin_operator', {
        ...base,
        policyRef: 'commercial-policy:commercial-perimeter:changed',
        operationKey: 'moneyCommercialPolicy:change:commercial-perimeter:changed',
        correlationId: 'commercial-policy:commercial-perimeter:changed',
        proof,
      }),
    )).resolves.toEqual({ kind: 'refused', code: 'command_changed' })
  })

  it('replaces and suspends the current row without leaving two active policies', async () => {
    const backend = convexTest(schema, convexModules)
    const admin = await ownerAdmin(backend, 'user_commercial-policy-lifecycle')
    const first = command()
    await admin.mutation(changeCommercialPolicy, await withSourceWrite('admin_operator', {
      ...first,
      proof: {
        reverificationId: 'reverification:commercial-policy:activate',
        firstFactorAgeMinutes: 0,
        secondFactorAgeMinutes: -1,
      },
    }))

    const second = command({
      changeKind: 'replace',
      expectedCurrentPolicyRef: first.policyRef,
      policyRef: 'commercial-policy:commercial-perimeter:2',
      revision: 2,
      operationKey: 'moneyCommercialPolicy:change:commercial-perimeter:2',
      correlationId: 'commercial-policy:commercial-perimeter:2',
      proof: {
        reverificationId: 'reverification:commercial-policy:replace',
        firstFactorAgeMinutes: 0,
        secondFactorAgeMinutes: -1,
      },
    })
    await expect(admin.mutation(
      changeCommercialPolicy,
      await withSourceWrite('admin_operator', second),
    )).resolves.toEqual({
      kind: 'changed',
      change: 'replaced',
      policyRef: second.policyRef,
    })

    const suspend = command({
      changeKind: 'suspend',
      expectedCurrentPolicyRef: second.policyRef,
      policyRef: second.policyRef,
      revision: 2,
      operationKey: 'moneyCommercialPolicy:suspend:commercial-perimeter:2',
      correlationId: 'commercial-policy:suspend:commercial-perimeter:2',
      proof: {
        reverificationId: 'reverification:commercial-policy:suspend',
        firstFactorAgeMinutes: 0,
        secondFactorAgeMinutes: -1,
      },
    })
    await expect(admin.mutation(
      changeCommercialPolicy,
      await withSourceWrite('admin_operator', suspend),
    )).resolves.toEqual({
      kind: 'changed',
      change: 'suspended',
      policyRef: second.policyRef,
    })

    await expect(backend.run(async (ctx) => {
      const rows = await ctx.db.query('moneyCommercialPolicies')
        .withIndex('by_environment_and_family_and_lifecycle', (query) => query
          .eq('environment', 'production')
          .eq('family', 'commercial_perimeter'))
        .collect()
      return rows.map(({ policyRef, lifecycle, supersededByPolicyRef }) => ({
        policyRef,
        lifecycle,
        supersededByPolicyRef,
      }))
    })).resolves.toEqual([
      {
        policyRef: first.policyRef,
        lifecycle: 'superseded',
        supersededByPolicyRef: second.policyRef,
      },
      {
        policyRef: second.policyRef,
        lifecycle: 'suspended',
        supersededByPolicyRef: undefined,
      },
    ])
  })
})
