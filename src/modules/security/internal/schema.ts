import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { ClaimStatusValues, PublicStatusValues, VisibilityTargetTypeValues } from '@/modules/business/public'
import { literalUnion } from '@/modules/common/convex-literals'
import {
  AdminMembershipAuditEventTypeValues,
  AdminMembershipStateValues,
  AdminRoleValues,
  ClaimFingerprintStatusValues,
  DisputeStatusValues,
  SuppressionRuleStatusValues,
} from '@/modules/security/public'
import { SourceWriteAdmissionScopeValues } from '@/modules/security/source-write-admission'

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
    beforePublicStatus: literalUnion(PublicStatusValues),
    beforeClaimStatus: literalUnion(ClaimStatusValues),
    liftedByAdminRef: v.optional(v.string()),
    liftedReasonCode: v.optional(v.string()),
    liftedEvidenceRefs: v.optional(v.array(v.string())),
    liftedAt: v.optional(v.number()),
  }).index('by_target_status', ['targetType', 'targetRef', 'status']),

  adminMemberships: defineTable({
    clerkUserId: v.string(),
    tokenIdentifier: v.optional(v.string()),
    role: literalUnion(AdminRoleValues),
    state: literalUnion(AdminMembershipStateValues),
    grantedBy: v.string(),
    grantedAt: v.number(),
    revokedBy: v.optional(v.string()),
    revokedAt: v.optional(v.number()),
    evidenceRef: v.optional(v.string()),
  })
    .index('by_clerkUserId_state', ['clerkUserId', 'state'])
    .index('by_tokenIdentifier_state', ['tokenIdentifier', 'state'])
    .index('by_state_and_role', ['state', 'role']),

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
  }).index('by_auditEventId', ['auditEventId']),


  claimFingerprints: defineTable({
    fingerprint: v.string(),
    status: literalUnion(ClaimFingerprintStatusValues),
    businessSlug: v.string(),
    ownerRef: v.optional(v.string()),
    claimId: v.optional(v.id('claims')),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_fingerprint_status', ['fingerprint', 'status']),
  // Replay ledger rows are retained only until `expiresAt`; schedule/batch purge uses
  // `by_expiresAt` so replay storage stays bounded without weakening first-use checks.

  sourceWriteNonces: defineTable({
    keyId: v.string(),
    nonce: v.string(),
    family: v.string(),
    scope: literalUnion(SourceWriteAdmissionScopeValues),
    operationKey: v.string(),
    correlationId: v.string(),
    bodyDigest: v.string(),
    issuedAt: v.number(),
    consumedAt: v.number(),
    expiresAt: v.number(),
  })
    .index('by_keyId_and_nonce', ['keyId', 'nonce'])
    .index('by_expiresAt', ['expiresAt']),
} as const
