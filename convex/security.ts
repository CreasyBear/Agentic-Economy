import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

const deniedAdminMembershipResult = v.object({
  kind: v.literal('error'),
  code: v.literal('admin_action_denied'),
  retryable: v.boolean(),
  reason: v.string(),
})

const adminReadbackSurface = v.union(
  v.literal('claims_queue'),
  v.literal('audit_events'),
  v.literal('index_health')
)

const adminReadbackDeniedResult = v.object({
  kind: v.literal('denied'),
  httpStatus: v.union(v.literal(401), v.literal(403)),
  reason: v.union(
    v.literal('missing_membership'),
    v.literal('inactive_membership'),
    v.literal('action_not_allowed')
  ),
  surface: adminReadbackSurface,
  generatedAt: v.number(),
  publicMessage: v.string(),
  rows: v.array(
    v.object({
      rowId: v.string(),
      rowType: v.union(v.literal('claim'), v.literal('audit_event'), v.literal('index_surface')),
      objectRef: v.string(),
      rowState: v.union(
        v.literal('pending_review'),
        v.literal('no_source_rows'),
        v.literal('guarded'),
        v.literal('queued'),
        v.literal('degraded'),
        v.literal('stale'),
        v.literal('suppressed')
      ),
      surface: adminReadbackSurface,
      readbackState: v.union(
        v.literal('not_queued'),
        v.literal('available'),
        v.literal('guarded'),
        v.literal('unavailable')
      ),
      repairAction: v.union(
        v.literal('review_claim'),
        v.literal('inspect_audit'),
        v.literal('regenerate_projection'),
        v.literal('source_auth_required'),
        v.literal('no_repair_available')
      ),
      correlationId: v.optional(v.string()),
      attemptRef: v.optional(v.string()),
      updatedAt: v.number(),
    })
  ),
})

function deniedReadback(surface: 'claims_queue' | 'audit_events' | 'index_health') {
  return {
    kind: 'denied' as const,
    httpStatus: 401 as const,
    reason: 'missing_membership' as const,
    surface,
    generatedAt: 0,
    publicMessage: 'Admin readback requires active source-owned membership.',
    rows: [],
  }
}

export const bootstrapOwnerAdmin = mutationGeneric({
  args: {
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: v.object({
    kind: v.literal('error'),
    code: v.literal('admin_bootstrap_denied'),
    retryable: v.boolean(),
    reason: v.string(),
  }),
  handler: async () => ({
    kind: 'error' as const,
    code: 'admin_bootstrap_denied' as const,
    retryable: false,
    reason: 'Admin bootstrap requires source-owned preauthorization and generated Convex auth wiring.',
  }),
})

export const grantAdminMembership = mutationGeneric({
  args: {
    targetClerkUserId: v.string(),
    role: v.union(v.literal('owner_admin'), v.literal('support'), v.literal('reviewer')),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: deniedAdminMembershipResult,
  handler: async () => ({
    kind: 'error' as const,
    code: 'admin_action_denied' as const,
    retryable: false,
    reason: 'Admin membership changes require source-owned owner_admin authority in the deployment boundary.',
  }),
})

export const revokeAdminMembership = mutationGeneric({
  args: {
    targetClerkUserId: v.string(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
  },
  returns: deniedAdminMembershipResult,
  handler: async () => ({
    kind: 'error' as const,
    code: 'admin_action_denied' as const,
    retryable: false,
    reason: 'Admin membership changes require source-owned owner_admin authority in the deployment boundary.',
  }),
})

export const readAdminClaims = queryGeneric({
  args: {},
  returns: adminReadbackDeniedResult,
  handler: async () => deniedReadback('claims_queue'),
})

export const readAdminAuditEvents = queryGeneric({
  args: {},
  returns: adminReadbackDeniedResult,
  handler: async () => deniedReadback('audit_events'),
})

export const readAdminIndexHealth = queryGeneric({
  args: {},
  returns: adminReadbackDeniedResult,
  handler: async () => deniedReadback('index_health'),
})

export type {
  AdminAction,
  AdminAuthorityState,
  AdminDecisionAudit,
  AdminMembership,
  AdminRole,
} from '../src/modules/security/public'
