import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'

const deniedAdminMembershipResult = v.object({
  kind: v.literal('error'),
  code: v.literal('admin_action_denied'),
  retryable: v.boolean(),
  reason: v.string(),
})

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

export type {
  AdminAction,
  AdminAuthorityState,
  AdminDecisionAudit,
  AdminMembership,
  AdminRole,
} from '../src/modules/security/public'
