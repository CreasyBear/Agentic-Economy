import { v, type Infer } from 'convex/values'
import type { GenericDatabaseReader } from 'convex/server'

import type { DataModel } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import { resolveBusinessActor } from './authz'
import { adminCommandArgsValue, adminCommandReceiptValue } from './lib/adminConsole/commands/contracts'
import { runAdminCommand } from './lib/adminConsole/commands/commandEnvelope'
import {
  commercialPolicySpec,
  readCommercialPolicyGate,
  prepareCommercialPolicyChange,
  readCommercialPolicySummary,
} from './lib/adminConsole/actions/commercialPolicy'
import { defineAdminQuery } from './lib/adminConsole/reads/registrars'
import { commercialPolicyControlValue } from '../src/modules/money/schema'
import { AUD_EXPONENT, audFundingPolicyFromCommercialControls, type CommercialPolicyEnvironment } from '../src/modules/money/public'
export { readCommercialPolicyGate } from './lib/adminConsole/actions/commercialPolicy'

const commercialPolicyFamilyValue = v.union(
  v.literal('commercial_perimeter'),
  v.literal('tax'),
  v.literal('accounting_client_money'),
  v.literal('privacy_retention'),
  v.literal('treasury_custody'),
  v.literal('operations'),
)
const commercialPolicyEnvironmentValue = v.union(
  v.literal('sandbox'),
  v.literal('production'),
)
const currentPolicyValue = v.union(v.null(), v.object({
  policyRef: v.string(), revision: v.number(),
  lifecycle: v.union(v.literal('active'), v.literal('superseded'), v.literal('suspended')),
  effectiveAt: v.number(), expiresAt: v.number(), control: commercialPolicyControlValue,
  evidenceRef: v.string(), approvedByPrincipalRef: v.string(), stateDigest: v.string(),
}))
export const prepareChange = defineAdminQuery({
  action: 'manage_commercial_policy',
  args: { environment: commercialPolicyEnvironmentValue, family: commercialPolicyFamilyValue },
  returns: v.union(v.object({ kind: v.literal('refused'), code: v.string() }), v.object({
    kind: v.literal('ready'), environment: commercialPolicyEnvironmentValue, family: commercialPolicyFamilyValue,
    conflict: v.boolean(), requiresSecondApproval: v.boolean(),
    requirements: v.object({
      ledgerVersion: v.string(), gatewayVersion: v.string(), schemaVersion: v.string(), sdkVersion: v.string(),
      sdkArtifactDigest: v.string(), maximumSdkIntegerUnits: v.string(), architectureReviewCumulativeUnits: v.string(),
    }),
    current: currentPolicyValue,
  })),
  handler: prepareCommercialPolicyChange,
})
export const readSummary = defineAdminQuery({
  action: 'manage_commercial_policy',
  args: { environment: commercialPolicyEnvironmentValue, refreshAt: v.number() },
  returns: v.union(v.object({ kind: v.literal('refused'), code: v.string() }), v.object({
    kind: v.literal('ready'), environment: commercialPolicyEnvironmentValue, observedAt: v.number(),
    rows: v.array(v.object({
      family: commercialPolicyFamilyValue, conflict: v.boolean(), current: currentPolicyValue,
      deploymentProfileValid: v.boolean(),
      pending: v.array(v.object({
        family: commercialPolicyFamilyValue, proposalRef: v.string(), proposerRef: v.string(), expiresAt: v.number(),
      })),
    })),
  })),
  handler: readCommercialPolicySummary,
})
const fundingConstraintsRefusalValue = v.object({
  kind: v.literal('refused'),
  code: v.string(),
  retryable: v.boolean(),
})
const publicFundingNumbersValue = {
  kind: v.literal('available'),
  environment: commercialPolicyEnvironmentValue,
  currency: v.literal('AUD'),
  exponent: v.literal(AUD_EXPONENT),
  minimumPrincipalUnits: v.string(),
  maximumPrincipalUnits: v.string(),
  incrementUnits: v.string(),
  serviceFeeBps: v.number(),
  taxOnServiceFeeBps: v.number(),
} as const
const ownerFundingConstraintsValue = v.union(
  v.object({
    ...publicFundingNumbersValue,
    legalCustomerMaximumAccessibleUnits: v.string(),
    policyDigest: v.string(),
  }),
  fundingConstraintsRefusalValue,
)
const platformFundingConstraintsValue = v.union(
  v.object(publicFundingNumbersValue),
  fundingConstraintsRefusalValue,
)
const commercialPolicyChangeKindValue = v.union(
  v.literal('activate'),
  v.literal('replace'),
  v.literal('suspend'),
)

const commercialPolicyChangeArgs = adminCommandArgsValue(
  v.literal('change_commercial_policy'),
  v.object({
    changeKind: commercialPolicyChangeKindValue,
    family: commercialPolicyFamilyValue,
    environment: commercialPolicyEnvironmentValue,
    policyRef: v.string(),
    expectedCurrentPolicyRef: v.optional(v.string()),
    revision: v.number(),
    effectiveAt: v.number(),
    expiresAt: v.number(),
    control: commercialPolicyControlValue,
  }),
  v.union(v.literal('pricing_update'), v.literal('correction')),
).fields





async function projectFundingConstraints(
  db: GenericDatabaseReader<DataModel>,
  args: Readonly<{ environment: CommercialPolicyEnvironment; now: number }>,
): Promise<Infer<typeof ownerFundingConstraintsValue>> {
  const policy = await readCommercialPolicyGate(db, {
    environment: args.environment,
    now: args.now,
    ...(args.environment === 'sandbox'
      ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
      : {}),
  })
  if (policy.kind === 'refused') {
    return { kind: 'refused' as const, code: 'commercial_policy_required', retryable: false }
  }
  const funding = audFundingPolicyFromCommercialControls(policy.controls)
  return {
    kind: 'available' as const,
    environment: args.environment,
    currency: 'AUD' as const,
    exponent: AUD_EXPONENT,
    minimumPrincipalUnits: funding.minimumPrincipalUnits.toString(),
    maximumPrincipalUnits: funding.maximumPrincipalUnits.toString(),
    incrementUnits: funding.incrementUnits.toString(),
    serviceFeeBps: funding.serviceFeeBps,
    taxOnServiceFeeBps: funding.taxOnServiceFeeBps,
    legalCustomerMaximumAccessibleUnits: funding.legalCustomerMaximumAccessibleUnits.toString(),
    policyDigest: policy.policyDigest,
  }
}
/**
 * Read-only owner projection of the exact funding controls used by
 * `moneyAccountFunding:reserve`. It intentionally returns no approval records
 * or internal policy evidence.
 */
export const readOwnerFundingConstraints = query({
  args: {
    environment: commercialPolicyEnvironmentValue,
    now: v.number(),
  },
  returns: ownerFundingConstraintsValue,
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') {
      return { kind: 'refused' as const, code: 'billing_identity_missing', retryable: false }
    }
    return await projectFundingConstraints(ctx.db, args)
  },
})

async function projectPublicFundingConstraints(
  db: GenericDatabaseReader<DataModel>,
  args: Readonly<{ environment: CommercialPolicyEnvironment; now: number }>,
): Promise<Infer<typeof platformFundingConstraintsValue>> {
  const projected = await projectFundingConstraints(db, args)
  if (projected.kind !== 'available') return projected
  return {
    kind: 'available' as const,
    environment: projected.environment,
    currency: projected.currency,
    exponent: projected.exponent,
    minimumPrincipalUnits: projected.minimumPrincipalUnits,
    maximumPrincipalUnits: projected.maximumPrincipalUnits,
    incrementUnits: projected.incrementUnits,
    serviceFeeBps: projected.serviceFeeBps,
    taxOnServiceFeeBps: projected.taxOnServiceFeeBps,
  }
}

/**
 * Unauthenticated projection of the same funding numbers used by owner
 * reserve. Public constraints/quote and agent handoff config read this; they
 * must not call the owner query, and must not receive policyDigest or the
 * legal customer maximum.
 */
export const readPlatformFundingConstraints = query({
  args: {
    environment: commercialPolicyEnvironmentValue,
    now: v.number(),
  },
  returns: platformFundingConstraintsValue,
  handler: async (ctx, { environment }) => await projectPublicFundingConstraints(ctx.db, {
    environment,
    now: Date.now(),
  }),
})


export const change = mutation({
  args: commercialPolicyChangeArgs,
  returns: adminCommandReceiptValue(
    v.literal('change_commercial_policy'),
    v.literal('commercial_policy_changed'),
    v.union(v.literal('policy_not_found'), v.literal('proof_stale'),
      v.literal('proof_replayed'), v.literal('authority_mismatch'),
      v.literal('commercial_policy_deployment_profile_invalid'), v.string()),
  ),
  handler: (ctx, args) => runAdminCommand(ctx, args, commercialPolicySpec(ctx, args)),
})
