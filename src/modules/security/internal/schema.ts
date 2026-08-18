import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { VisibilityTargetTypeValues } from '@/modules/business/public'
import { literalUnion } from '@/modules/common/convex-literals'
import {
  DisputeStatusValues,
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
  // Replay ledger rows are retained only until `expiresAt`; schedule/batch purge uses
  // `by_expiresAt` so replay storage stays bounded without weakening first-use checks.

  sourceWriteNonces: defineTable({
    keyId: v.string(),
    nonce: v.string(),
    family: v.string(),
    scope: literalUnion(SourceWriteAdmissionScopeValues),
    operationKey: v.string(),
    correlationId: v.string(),
    commandDigest: v.optional(v.string()),
    bodyDigest: v.string(),
    issuedAt: v.number(),
    consumedAt: v.number(),
    expiresAt: v.number(),
  })
    .index('by_keyId_and_nonce', ['keyId', 'nonce'])
    .index('by_expiresAt', ['expiresAt']),
} as const
