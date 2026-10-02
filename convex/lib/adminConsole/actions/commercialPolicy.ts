import type { GenericDatabaseReader } from 'convex/server'
import type { DataModel } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { env } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import type { AdminCommandSpec } from '../commands/commandEnvelope'
import { ADMIN_OPAQUE_REF_PATTERN, type AdminCommandWireArgs } from '../commands/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import {
  COMMERCIAL_POLICY_FAMILIES,
  evaluateCommercialPolicyGate,
  validCommercialPolicyControl,
  type CommercialPolicyApproval,
  type CommercialPolicyEnvironment,
  type CommercialPolicyGateResult,
  type CommercialPolicySandboxFixture,
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
  return evaluateCommercialPolicyGate({
    environment: input.environment,
    now: input.now,
    approvals,
  })
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
      return active === undefined ? null : canonicalDigest({
        policyRef: active.policyRef, revision: active.revision, lifecycle: active.lifecycle,
        effectiveAt: active.effectiveAt, expiresAt: active.expiresAt,
        evidenceRef: active.evidenceRef, evidenceDigest: active.evidenceDigest,
        control: active.control, updatedAt: active.updatedAt,
      })
    },
    apply: async () => {
      if (!validChange(args)) return { kind: 'refused', code: 'authority_mismatch' }
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
