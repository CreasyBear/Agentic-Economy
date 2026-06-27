import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { VisibilityTargetTypeValues } from '@/modules/business/public'
import { literalUnion } from '@/modules/common/convex-literals'
import {
  AbuseBucketStateValues,
  AdminMembershipAuditEventTypeValues,
  AdminMembershipStateValues,
  AdminRoleValues,
  ClaimFingerprintStatusValues,
  DisputeStatusValues,
  SuppressionRuleStatusValues,
} from '@/modules/security/public'

export const securityTables = {
  disputes: defineTable({
    businessId: v.id('businesses'),
    status: literalUnion(DisputeStatusValues),
    openedByContactHash: v.string(),
    targetType: literalUnion(VisibilityTargetTypeValues),
    targetRef: v.string(),
    reasonCode: v.string(),
    evidenceHash: v.string(),
    evidenceRefs: v.array(v.string()),
    publicMessageHash: v.string(),
    operationKey: v.string(),
    operationKeys: v.array(v.string()),
    correlationId: v.string(),
    requestCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_business_status', ['businessId', 'status'])
    .index('by_operation_key', ['operationKey'])
    .index('by_target_status', ['targetType', 'targetRef', 'status']),

  suppressionRules: defineTable({
    targetType: literalUnion(VisibilityTargetTypeValues),
    targetRef: v.string(),
    status: literalUnion(SuppressionRuleStatusValues),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    createdByAdminRef: v.string(),
    createdAt: v.number(),
    liftedAt: v.optional(v.number()),
  }).index('by_target_status', ['targetType', 'targetRef', 'status']),

  adminMemberships: defineTable({
    clerkUserId: v.string(),
    role: literalUnion(AdminRoleValues),
    state: literalUnion(AdminMembershipStateValues),
    grantedBy: v.string(),
    grantedAt: v.number(),
    revokedBy: v.optional(v.string()),
    revokedAt: v.optional(v.number()),
    evidenceRef: v.optional(v.string()),
  }).index('by_clerkUserId_state', ['clerkUserId', 'state']),

  adminMembershipAuditEvents: defineTable({
    auditEventId: v.string(),
    eventType: literalUnion(AdminMembershipAuditEventTypeValues),
    actorRef: v.string(),
    targetRef: v.string(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
    createdAt: v.number(),
  }),

  abuseRateLimitBuckets: defineTable({
    scope: v.string(),
    key: v.string(),
    window: v.string(),
    count: v.number(),
    state: literalUnion(AbuseBucketStateValues),
    resetAt: v.number(),
    updatedAt: v.number(),
  }).index('by_scope_key_window', ['scope', 'key', 'window']),

  claimFingerprints: defineTable({
    fingerprint: v.string(),
    status: literalUnion(ClaimFingerprintStatusValues),
    businessSlug: v.string(),
    ownerRef: v.optional(v.string()),
    claimId: v.optional(v.id('claims')),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_fingerprint_status', ['fingerprint', 'status']),
} as const
