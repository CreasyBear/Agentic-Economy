import type { GenericDatabaseReader } from 'convex/server'
import type { DataModel, Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { env } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import type { AdminCommandSpec } from '../commands/commandEnvelope'
import { ADMIN_OPAQUE_REF_PATTERN, type AdminCommandWireArgs } from '../commands/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import {
  COMMERCIAL_POLICY_FAMILIES,
  evaluateCommercialPolicyGate,
  validCommercialPolicyControl,
  validProductionCommercialPolicyControl,
  PACKAGE4_FORMANCE_REQUIREMENTS,
  productionTreasuryBufferSupported,
  type CommercialPolicyApproval,
  type CommercialPolicyEnvironment,
  type CommercialPolicyGateResult,
  type CommercialPolicySandboxFixture,
  type CommercialPolicyFamily,
} from '@/modules/money/public'


function validChange(args: AdminCommandWireArgs<'change_commercial_policy'>): boolean {
  const input = args.input
  return ADMIN_OPAQUE_REF_PATTERN.test(input.policyRef)
    && (input.expectedCurrentPolicyRef === undefined
      || ADMIN_OPAQUE_REF_PATTERN.test(input.expectedCurrentPolicyRef))
    && ADMIN_OPAQUE_REF_PATTERN.test(args.operationKey)
    && ADMIN_OPAQUE_REF_PATTERN.test(args.correlationId)
    && Number.isSafeInteger(input.revision)
    && input.revision >= 1
    && Number.isSafeInteger(input.effectiveAt)
    && Number.isSafeInteger(input.expiresAt)
    && input.effectiveAt < input.expiresAt
    && input.control.family === input.family
    && validCommercialPolicyControl(input.control)
}

function policyStateDigest(row: Doc<'moneyCommercialPolicies'>): string {
  return canonicalDigest({
    policyRef: row.policyRef, revision: row.revision, lifecycle: row.lifecycle,
    effectiveAt: row.effectiveAt, expiresAt: row.expiresAt,
    evidenceRef: row.evidenceRef, evidenceDigest: row.evidenceDigest,
    control: row.control, updatedAt: row.updatedAt,
  })
}

/** Requires owner-admin authorization at the registration and the declared environment.
 * Ensures a bounded current/historical read and canonical technical requirements, never business defaults.
 * Invariant: historical controls remain readable even after a technical pin changes; this query has no effects.
 * On violation: refuse the mismatched environment; report conflicting active records without choosing one. */
export async function prepareCommercialPolicyChange(
  ctx: QueryCtx,
  args: { environment: CommercialPolicyEnvironment; family: CommercialPolicyFamily },
) {
  if (deploymentPaymentEnvironment(env) !== args.environment) {
    return { kind: 'refused' as const, code: 'commercial_policy_environment_mismatch' }
  }
  const [active, suspended, superseded, owners] = await Promise.all([
    ctx.db.query('moneyCommercialPolicies').withIndex('by_environment_and_family_and_lifecycle', q => q
      .eq('environment', args.environment).eq('family', args.family).eq('lifecycle', 'active')).take(2),
    ctx.db.query('moneyCommercialPolicies').withIndex('by_environment_and_family_and_lifecycle', q => q
      .eq('environment', args.environment).eq('family', args.family).eq('lifecycle', 'suspended')).order('desc').take(1),
    ctx.db.query('moneyCommercialPolicies').withIndex('by_environment_and_family_and_lifecycle', q => q
      .eq('environment', args.environment).eq('family', args.family).eq('lifecycle', 'superseded')).order('desc').take(1),
    ctx.db.query('adminMemberships').withIndex('by_state_and_role', q => q.eq('state', 'active').eq('role', 'owner_admin')).take(2),
  ])
  const latest = [...active, ...suspended, ...superseded].sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const current = active[0] ?? latest
  return {
    kind: 'ready' as const, environment: args.environment, family: args.family,
    conflict: active.length > 1, requiresSecondApproval: owners.length >= 2,
    requirements: PACKAGE4_FORMANCE_REQUIREMENTS,
    current: current === undefined ? null : {
      policyRef: current.policyRef, revision: current.revision, lifecycle: current.lifecycle,
      effectiveAt: current.effectiveAt, expiresAt: current.expiresAt, control: current.control,
      evidenceRef: current.evidenceRef, approvedByPrincipalRef: current.approvedByPrincipalRef,
      stateDigest: policyStateDigest(current),
    },
  }
}

/** Read existing policy and proposal records for one authorised operator view.
 * A saturated proposal read is unavailable rather than reporting a false absence. */
export async function readCommercialPolicySummary(
  ctx: QueryCtx,
  args: { environment: CommercialPolicyEnvironment; refreshAt: number },
) {
  if (!Number.isSafeInteger(args.refreshAt) || args.refreshAt < 0) {
    return { kind: 'refused' as const, code: 'commercial_policy_refresh_invalid' }
  }
  if (deploymentPaymentEnvironment(env) !== args.environment) {
    return { kind: 'refused' as const, code: 'commercial_policy_environment_mismatch' }
  }
  // The refresh argument changes the query cache key; the server clock decides expiry.
  const observedAt = Date.now()
  const proposals = await ctx.db.query('adminApprovalProposals')
    .withIndex('by_status_and_expiresAt', query => query
      .eq('status', 'awaiting_second_approval').gt('expiresAt', observedAt))
    .order('asc').take(101)
  if (proposals.length > 100) {
    return { kind: 'refused' as const, code: 'commercial_policy_proposals_unavailable' }
  }
  const pending: { family: CommercialPolicyFamily; proposalRef: string; proposerRef: string; expiresAt: number }[] = []
  for (const proposal of proposals) {
    if (proposal.action !== 'change_commercial_policy') continue
    let parsed: unknown
    try { parsed = JSON.parse(proposal.commandJson) } catch {
      return { kind: 'refused' as const, code: 'commercial_policy_proposal_invalid' }
    }
    if (!isRecord(parsed) || !isRecord(parsed.input)) {
      return { kind: 'refused' as const, code: 'commercial_policy_proposal_invalid' }
    }
    const input = parsed.input
    if (input.environment !== 'sandbox' && input.environment !== 'production') {
      return { kind: 'refused' as const, code: 'commercial_policy_proposal_invalid' }
    }
    if (input.environment !== args.environment) continue
    if (!COMMERCIAL_POLICY_FAMILIES.some(family => family === input.family)) {
      return { kind: 'refused' as const, code: 'commercial_policy_proposal_invalid' }
    }
    pending.push({ family: input.family as CommercialPolicyFamily, proposalRef: proposal.proposalRef,
      proposerRef: proposal.proposerRef, expiresAt: proposal.expiresAt })
  }
  const rows = await Promise.all(COMMERCIAL_POLICY_FAMILIES.map(async family => {
    const prepared = await prepareCommercialPolicyChange(ctx, { environment: args.environment, family })
    if (prepared.kind !== 'ready') return null
    return {
      family, conflict: prepared.conflict, current: prepared.current,
      deploymentProfileValid: args.environment === 'production'
        && prepared.current?.control.family === 'treasury_custody'
        ? productionTreasuryBufferSupported(prepared.current.control, env.AE_X402_CUSTODY_MAX_ATOMIC)
        : true,
      pending: pending.filter(proposal => proposal.family === family),
    }
  }))
  if (rows.some(row => row === null)) {
    return { kind: 'refused' as const, code: 'commercial_policy_summary_unavailable' }
  }
  return { kind: 'ready' as const, environment: args.environment, observedAt, rows: rows.filter(row => row !== null) }
}
export async function readCommercialPolicyGate(
  db: GenericDatabaseReader<DataModel>,
  input: Readonly<{
    environment: CommercialPolicyEnvironment
    now: number
    sandboxFixture?: CommercialPolicySandboxFixture
  }>,
): Promise<CommercialPolicyGateResult> {
  if (deploymentPaymentEnvironment(env) !== input.environment) {
    return { kind: 'refused', code: 'commercial_policy_environment_mismatch' }
  }
  if (input.environment === 'sandbox') {
    return evaluateCommercialPolicyGate({
      environment: input.environment,
      now: input.now,
      approvals: [],
      ...(input.sandboxFixture === undefined ? {} : { sandboxFixture: input.sandboxFixture }),
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
  const decision = evaluateCommercialPolicyGate({
    environment: input.environment,
    now: input.now,
    approvals,
  })
  if (decision.kind === 'admitted'
    && !productionTreasuryBufferSupported(decision.controls.treasury_custody, env.AE_X402_CUSTODY_MAX_ATOMIC)) {
    return { kind: 'refused', code: 'commercial_policy_deployment_profile_invalid', family: 'treasury_custody' }
  }
  return decision
}
export function commercialPolicySpec(
  ctx: MutationCtx,
  args: AdminCommandWireArgs<'change_commercial_policy'>,
): AdminCommandSpec<'change_commercial_policy'> {
  const input = args.input
  const currentPolicy = () => ctx.db.query('moneyCommercialPolicies')
    .withIndex('by_environment_and_family_and_lifecycle', (query) => query
      .eq('environment', input.environment)
      .eq('family', input.family)
      .eq('lifecycle', 'active'))
    .take(2)
  return {
    targetType: 'billing',
    targetRef: input.policyRef,
    auditEventType: 'protected_action.attempt_succeeded',
    currentStateDigest: async () => {
      const [active] = await currentPolicy()
      return active === undefined ? null : policyStateDigest(active)
    },
    apply: async () => {
      if (!validChange(args)) return { kind: 'refused', code: 'authority_mismatch' }
      // Compare before effects; never repair a reviewed command or obstruct retirement of historical controls.
      if (deploymentPaymentEnvironment(env) !== input.environment
        || (input.changeKind !== 'suspend' && input.environment === 'production'
          && !validProductionCommercialPolicyControl(input.control))) {
        return { kind: 'refused', code: 'authority_mismatch' }
      }
      if (input.changeKind !== 'suspend' && input.environment === 'production'
        && input.control.family === 'treasury_custody'
        && !productionTreasuryBufferSupported(input.control, env.AE_X402_CUSTODY_MAX_ATOMIC)) {
        return { kind: 'refused', code: 'commercial_policy_deployment_profile_invalid' }
      }
      const actor = await resolveBusinessActor(ctx)
      if (actor.kind !== 'authenticated_owner') return { kind: 'refused', code: 'authority_mismatch' }
      const existingByRef = await ctx.db.query('moneyCommercialPolicies')
        .withIndex('by_policyRef', (query) => query.eq('policyRef', input.policyRef))
        .unique()
      const [active, otherActive] = await currentPolicy()
      if (otherActive !== undefined) return { kind: 'refused', code: 'authority_mismatch' }
      if (input.changeKind === 'activate') {
        if (active !== undefined || existingByRef !== null
          || input.expectedCurrentPolicyRef !== undefined || input.revision !== 1) {
          return { kind: 'refused', code: 'authority_mismatch' }
        }
      } else {
        if (active === undefined) return { kind: 'refused', code: 'policy_not_found' }
        if (input.expectedCurrentPolicyRef !== active.policyRef
          || (input.changeKind === 'replace'
            && (input.revision !== active.revision + 1 || existingByRef !== null))
          || (input.changeKind === 'suspend'
            && (input.policyRef !== active.policyRef || input.revision !== active.revision))) {
          return { kind: 'refused', code: 'authority_mismatch' }
        }
      }
      const now = Date.now()
      const commandDigest = canonicalDigest({
        scope: 'admin_operator', action: args.action, input,
        reasonCode: args.reasonCode, evidenceRefs: args.evidenceRefs,
        ...(args.expectedStateDigest === undefined
          ? {} : { expectedStateDigest: args.expectedStateDigest }),
      })
      if (input.changeKind === 'suspend') {
        if (active === undefined) return { kind: 'refused', code: 'policy_not_found' }
        if (input.effectiveAt !== active.effectiveAt || input.expiresAt !== active.expiresAt
          || canonicalDigest(input.control) !== canonicalDigest(active.control)) {
          return { kind: 'refused', code: 'authority_mismatch' }
        }
        await ctx.db.patch(active._id, {
          lifecycle: 'suspended', suspendedAt: now, updatedAt: now,
          correlationRef: args.correlationId, idempotencyRef: args.operationKey, commandDigest,
        })
      } else {
        if (active !== undefined) {
          await ctx.db.patch(active._id, {
            lifecycle: 'superseded', supersededByPolicyRef: input.policyRef, updatedAt: now,
          })
        }
        // The admin envelope owns evidence; persist its first ref and digest the complete set.
        const evidenceRef = args.evidenceRefs[0]
        if (evidenceRef === undefined) return { kind: 'refused', code: 'authority_mismatch' }
        await ctx.db.insert('moneyCommercialPolicies', {
          policyRef: input.policyRef, family: input.family, environment: input.environment,
          revision: input.revision, lifecycle: 'active',
          effectiveAt: input.effectiveAt, expiresAt: input.expiresAt,
          evidenceRef, evidenceDigest: canonicalDigest(args.evidenceRefs), control: input.control,
          approvedByPrincipalRef: actor.canonicalPrincipalRef,
          activeAccountRef: actor.canonicalAccountRef, authorityGeneration: actor.authorityRevision.account,
          correlationRef: args.correlationId, idempotencyRef: args.operationKey, commandDigest,
          activatedAt: now, updatedAt: now,
        })
      }
      return {
        kind: 'applied', code: 'commercial_policy_changed',
        effectRefs: [input.policyRef],
        beforeState: active?.policyRef ?? 'none',
        afterState: input.changeKind === 'suspend' ? 'suspended' : input.policyRef,
      }
    },
  }
}
