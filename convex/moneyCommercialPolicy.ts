import { v, type Infer } from 'convex/values'
import type { GenericDatabaseReader } from 'convex/server'

import type { DataModel } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { env, mutation } from './_generated/server'
import { resolveAdminAuthority, resolveBusinessActor } from './authz'
import { clerkConsequenceProofValue } from './lib/consequenceProof'
import { admitInteractiveOwnerConsequence } from './lib/ownerConsequence'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { commercialPolicyControlValue } from '../src/modules/money/schema'
import {
  COMMERCIAL_POLICY_FAMILIES,
  evaluateCommercialPolicyGate,
  validCommercialPolicyControl,
  type CommercialPolicyApproval,
  type CommercialPolicyEnvironment,
  type CommercialPolicyGateResult,
  type CommercialPolicySandboxFixture,
  type Package4SandboxDeploymentProfile,
} from '../src/modules/money/public'

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
const commercialPolicyChangeKindValue = v.union(
  v.literal('activate'),
  v.literal('replace'),
  v.literal('suspend'),
)

const commercialPolicyChangeArgsValue = v.object({
  changeKind: commercialPolicyChangeKindValue,
  family: commercialPolicyFamilyValue,
  environment: commercialPolicyEnvironmentValue,
  policyRef: v.string(),
  expectedCurrentPolicyRef: v.optional(v.string()),
  revision: v.number(),
  effectiveAt: v.number(),
  expiresAt: v.number(),
  evidenceRef: v.string(),
  evidenceDigest: v.string(),
  control: commercialPolicyControlValue,
  operationKey: v.string(),
  correlationId: v.string(),
  proof: v.optional(clerkConsequenceProofValue),
  ...sourceWriteArgs,
})
export const commercialPolicyChangeArgs = commercialPolicyChangeArgsValue.fields

const commercialPolicyChangeResultValue = v.union(
  v.object({
    kind: v.literal('changed'),
    change: v.union(v.literal('activated'), v.literal('replaced'), v.literal('suspended')),
    policyRef: v.string(),
  }),
  v.object({ kind: v.literal('replayed'), policyRef: v.string() }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
)

type CommercialPolicyChangeArgs = Infer<typeof commercialPolicyChangeArgsValue>
type CommercialPolicyChangeResult = Infer<typeof commercialPolicyChangeResultValue>

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u

function validChange(args: CommercialPolicyChangeArgs): boolean {
  return OPAQUE_REF_PATTERN.test(args.policyRef)
    && (args.expectedCurrentPolicyRef === undefined
      || OPAQUE_REF_PATTERN.test(args.expectedCurrentPolicyRef))
    && OPAQUE_REF_PATTERN.test(args.evidenceRef)
    && SHA256_PATTERN.test(args.evidenceDigest)
    && OPAQUE_REF_PATTERN.test(args.operationKey)
    && OPAQUE_REF_PATTERN.test(args.correlationId)
    && Number.isSafeInteger(args.revision)
    && args.revision >= 1
    && Number.isSafeInteger(args.effectiveAt)
    && Number.isSafeInteger(args.expiresAt)
    && args.effectiveAt < args.expiresAt
    && args.control.family === args.family
    && validCommercialPolicyControl(args.control)
}

function policyAction(changeKind: CommercialPolicyChangeArgs['changeKind']) {
  switch (changeKind) {
    case 'activate': return 'commercial_policy.activate' as const
    case 'replace': return 'commercial_policy.replace' as const
    case 'suspend': return 'commercial_policy.suspend' as const
  }
}

function policyCommand(args: CommercialPolicyChangeArgs) {
  return Object.freeze({
    version: 'ae.commercial-policy-change:v1',
    changeKind: args.changeKind,
    family: args.family,
    environment: args.environment,
    policyRef: args.policyRef,
    ...(args.expectedCurrentPolicyRef === undefined
      ? {}
      : { expectedCurrentPolicyRef: args.expectedCurrentPolicyRef }),
    revision: args.revision,
    effectiveAt: args.effectiveAt,
    expiresAt: args.expiresAt,
    evidenceRef: args.evidenceRef,
    evidenceDigest: args.evidenceDigest,
    control: args.control,
  })
}

export async function readCommercialPolicyGate(
  db: GenericDatabaseReader<DataModel>,
  input: Readonly<{
    environment: CommercialPolicyEnvironment
    now: number
    sandboxFixture?: CommercialPolicySandboxFixture
  }>,
): Promise<CommercialPolicyGateResult> {
  if (input.environment === 'sandbox') {
    const configuredProfile = (env as typeof env & {
      AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE?: string
    }).AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE?.trim()
    const sandboxDeploymentProfile: Package4SandboxDeploymentProfile | undefined =
      configuredProfile === undefined || configuredProfile === '' || configuredProfile === 'local_ci'
        ? 'local_ci'
        : configuredProfile === 'synthetic_vps_fixture'
          ? 'synthetic_vps_fixture'
          : undefined
    if (sandboxDeploymentProfile === undefined) {
      return { kind: 'refused', code: 'commercial_policy_deployment_profile_invalid' }
    }
    return evaluateCommercialPolicyGate({
      environment: input.environment,
      now: input.now,
      approvals: [],
      ...(input.sandboxFixture === undefined ? {} : { sandboxFixture: input.sandboxFixture }),
      sandboxDeploymentProfile,
    })
  }

  const approvals: CommercialPolicyApproval[] = []
  for (const family of COMMERCIAL_POLICY_FAMILIES) {
    const rows = (await Promise.all([
      db.query('moneyCommercialPolicies')
        .withIndex('by_environment_and_family_and_lifecycle', (query) => query
          .eq('environment', input.environment)
          .eq('family', family)
          .eq('lifecycle', 'active'))
        .take(2),
      db.query('moneyCommercialPolicies')
        .withIndex('by_environment_and_family_and_lifecycle', (query) => query
          .eq('environment', input.environment)
          .eq('family', family)
          .eq('lifecycle', 'superseded'))
        .order('desc')
        .take(1),
      db.query('moneyCommercialPolicies')
        .withIndex('by_environment_and_family_and_lifecycle', (query) => query
          .eq('environment', input.environment)
          .eq('family', family)
          .eq('lifecycle', 'suspended'))
        .order('desc')
        .take(1),
    ])).flat()
    if (rows.length === 0) {
      const sandbox = await db.query('moneyCommercialPolicies')
        .withIndex('by_environment_and_family_and_lifecycle', (query) => query
          .eq('environment', 'sandbox')
          .eq('family', family)
          .eq('lifecycle', 'active'))
        .take(1)
      rows.push(...sandbox)
    }
    approvals.push(...rows.map((row) => ({
      policyRef: row.policyRef,
      family: row.family,
      environment: row.environment,
      revision: row.revision,
      lifecycle: row.lifecycle,
      effectiveAt: row.effectiveAt,
      expiresAt: row.expiresAt,
      evidenceRef: row.evidenceRef,
      evidenceDigest: row.evidenceDigest,
      control: row.control,
      approvedByPrincipalRef: row.approvedByPrincipalRef,
      activatedAt: row.activatedAt,
      ...(row.supersededByPolicyRef === undefined
        ? {}
        : { supersededByPolicyRef: row.supersededByPolicyRef }),
      ...(row.suspendedAt === undefined ? {} : { suspendedAt: row.suspendedAt }),
    })))
  }
  return evaluateCommercialPolicyGate({
    environment: input.environment,
    now: input.now,
    approvals,
  })
}

async function changeCommercialPolicyHandler(
  ctx: MutationCtx,
  args: CommercialPolicyChangeArgs,
): Promise<CommercialPolicyChangeResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'admin_operator')
  if (sourceWrite.kind === 'rejected') {
    return { kind: 'refused', code: 'source_write_denied' }
  }
  if (!validChange(args)) return { kind: 'refused', code: 'commercial_policy_invalid' }

  const [admin, actor] = await Promise.all([
    resolveAdminAuthority(ctx, 'manage_commercial_policy'),
    resolveBusinessActor(ctx),
  ])
  if (admin.kind !== 'allowed') {
    return { kind: 'refused', code: 'admin_authority_required' }
  }
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'refused', code: 'authentication_required' }
  }

  const now = Date.now()
  const consequence = await admitInteractiveOwnerConsequence(ctx, {
    actor,
    action: policyAction(args.changeKind),
    target: {
      targetType: 'commercial_policy',
      targetRef: args.policyRef,
      targetRevision: args.revision,
    },
    requiredScopes: ['money:commercial_policy'],
    resourceRefs: [`commercial-policy:${args.environment}:${args.family}`],
    budgetAmount: 0,
    consequenceSummary: `${args.changeKind} the ${args.family} policy for ${args.environment}.`,
    statusReadbackRef: '/operator/commercial-policy',
    command: policyCommand(args),
    correlationRef: args.correlationId,
    idempotencyRef: args.operationKey,
    ...(args.proof === undefined ? {} : { proof: args.proof }),
    now,
  })
  if (consequence.kind === 'refused') {
    return { kind: 'refused', code: consequence.code }
  }

  const existingByRef = await ctx.db.query('moneyCommercialPolicies')
    .withIndex('by_policyRef', (query) => query.eq('policyRef', args.policyRef))
    .unique()
  if (existingByRef !== null) {
    const expectedLifecycle = args.changeKind === 'suspend' ? 'suspended' : 'active'
    if (existingByRef.family === args.family
      && existingByRef.environment === args.environment
      && existingByRef.revision === args.revision
      && existingByRef.lifecycle === expectedLifecycle) {
      return { kind: 'replayed', policyRef: args.policyRef }
    }
    const isCurrentSuspend = args.changeKind === 'suspend'
      && existingByRef.family === args.family
      && existingByRef.environment === args.environment
      && existingByRef.revision === args.revision
      && existingByRef.lifecycle === 'active'
    if (!isCurrentSuspend) {
      return { kind: 'refused', code: 'commercial_policy_ref_conflict' }
    }
  }

  const current = await ctx.db.query('moneyCommercialPolicies')
    .withIndex('by_environment_and_family_and_lifecycle', (query) => query
      .eq('environment', args.environment)
      .eq('family', args.family)
      .eq('lifecycle', 'active'))
    .take(2)
  if (current.length > 1) {
    return { kind: 'refused', code: 'commercial_policy_conflict' }
  }
  const active = current[0]

  if (args.changeKind === 'activate') {
    if (active !== undefined) return { kind: 'refused', code: 'commercial_policy_already_active' }
    if (args.expectedCurrentPolicyRef !== undefined || args.revision !== 1) {
      return { kind: 'refused', code: 'commercial_policy_revision_invalid' }
    }
  } else if (active === undefined
    || args.expectedCurrentPolicyRef !== active.policyRef
    || (args.changeKind === 'replace' && args.revision !== active.revision + 1)
    || (args.changeKind === 'suspend'
      && (args.policyRef !== active.policyRef || args.revision !== active.revision))) {
    return { kind: 'refused', code: 'commercial_policy_current_changed' }
  }

  if (args.changeKind === 'suspend') {
    await ctx.db.patch(active!._id, {
      lifecycle: 'suspended',
      suspendedAt: now,
      correlationRef: consequence.admission.correlationRef,
      idempotencyRef: consequence.admission.idempotencyRef,
      commandDigest: consequence.admission.descriptor!.commandDigest,
      updatedAt: now,
    })
    return { kind: 'changed', change: 'suspended', policyRef: args.policyRef }
  }

  if (active !== undefined) {
    await ctx.db.patch(active._id, {
      lifecycle: 'superseded',
      supersededByPolicyRef: args.policyRef,
      updatedAt: now,
    })
  }
  await ctx.db.insert('moneyCommercialPolicies', {
    policyRef: args.policyRef,
    family: args.family,
    environment: args.environment,
    revision: args.revision,
    lifecycle: 'active',
    effectiveAt: args.effectiveAt,
    expiresAt: args.expiresAt,
    evidenceRef: args.evidenceRef,
    evidenceDigest: args.evidenceDigest,
    control: args.control,
    approvedByPrincipalRef: consequence.admission.actorPrincipalRef,
    activeAccountRef: consequence.admission.activeAccountRef,
    authorityGeneration: consequence.admission.accountRevision,
    correlationRef: consequence.admission.correlationRef,
    idempotencyRef: consequence.admission.idempotencyRef,
    commandDigest: consequence.admission.descriptor!.commandDigest,
    activatedAt: now,
    updatedAt: now,
  })
  return {
    kind: 'changed',
    change: args.changeKind === 'activate' ? 'activated' : 'replaced',
    policyRef: args.policyRef,
  }
}

export const change = mutation({
  args: commercialPolicyChangeArgs,
  returns: commercialPolicyChangeResultValue,
  handler: changeCommercialPolicyHandler,
})
