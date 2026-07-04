import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'

import {
  ClearanceActionClassValues,
  ClearanceGatewayCheckStatusValues,
  ClearanceIsolationStateStatusValues,
  ClearanceSignaturePostureValues,
  ClearanceSignedRecordKindValues,
} from './clearance-schema'
import { ClearanceProtocolRecordStatusValues } from './convex-protocol-store'
import { ClearanceMandateStatusValues, ClearanceMandateVersion } from './mandate'
import {
  AgentPrincipalReputationTierValues,
  AgentPrincipalSourceVersion,
  AgentPrincipalStatusValues,
} from './principal-schema'

export const clearanceTables = {
  agentPrincipals: defineTable({
    principalId: v.string(),
    signatureAgent: v.string(),
    keyid: v.string(),
    operatorRef: v.optional(v.string()),
    status: literalUnion(AgentPrincipalStatusValues),
    reputationTier: literalUnion(AgentPrincipalReputationTierValues),
    sourceVersion: v.literal(AgentPrincipalSourceVersion),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    lastVerifiedAt: v.number(),
    requestCount: v.number(),
  })
    .index('by_principalId', ['principalId'])
    .index('by_signatureAgent_keyid', ['signatureAgent', 'keyid'])
    .index('by_status', ['status']),
  clearanceMandates: defineTable({
    mandateId: v.string(),
    principalId: v.string(),
    actionClass: literalUnion(ClearanceActionClassValues),
    actionRef: v.string(),
    allowedScopes: v.array(v.string()),
    status: literalUnion(ClearanceMandateStatusValues),
    sourceVersion: v.literal(ClearanceMandateVersion),
    createdAt: v.number(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    maxAmountCents: v.optional(v.number()),
    sourceHash: v.string(),
  })
    .index('by_mandateId', ['mandateId'])
    .index('by_principalId_and_actionClass_and_actionRef', ['principalId', 'actionClass', 'actionRef'])
    .index('by_status', ['status']),
  handshakeRecords: defineTable({
    storeVersion: v.string(),
    recordId: v.string(),
    recordKind: literalUnion(ClearanceSignedRecordKindValues),
    principalId: v.string(),
    actionClass: literalUnion(ClearanceActionClassValues),
    actionRef: v.string(),
    mandateId: v.optional(v.string()),
    requestRef: v.optional(v.string()),
    greenlightRef: v.optional(v.string()),
    idempotencyKey: v.string(),
    payloadHash: v.string(),
    signaturePosture: literalUnion(ClearanceSignaturePostureValues),
    keyIdentityRef: v.string(),
    status: literalUnion(ClearanceProtocolRecordStatusValues),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    signature: v.optional(v.string()),
    signedAt: v.optional(v.string()),
    proofGapReason: v.optional(v.string()),
    consumedAt: v.optional(v.number()),
    consumedByRef: v.optional(v.string()),
  })
    .index('by_recordId', ['recordId'])
    .index('by_principalId_and_actionClass_and_actionRef', ['principalId', 'actionClass', 'actionRef'])
    .index('by_status', ['status'])
    .index('by_idempotencyKey', ['idempotencyKey']),
  handshakeIdempotencyLedger: defineTable({
    ledgerKey: v.string(),
    recordId: v.string(),
    principalId: v.string(),
    actionClass: literalUnion(ClearanceActionClassValues),
    actionRef: v.string(),
    idempotencyKey: v.string(),
    payloadHash: v.string(),
    status: literalUnion(ClearanceProtocolRecordStatusValues),
    createdAt: v.number(),
  })
    .index('by_ledgerKey', ['ledgerKey'])
    .index('by_principalId_and_actionClass_and_actionRef', ['principalId', 'actionClass', 'actionRef'])
    .index('by_idempotencyKey', ['idempotencyKey']),
  handshakeStreamEvents: defineTable({
    eventId: v.string(),
    streamId: v.string(),
    recordId: v.string(),
    sequence: v.number(),
    eventKind: v.string(),
    payloadHash: v.string(),
    createdAt: v.number(),
  })
    .index('by_streamId_and_sequence', ['streamId', 'sequence'])
    .index('by_recordId', ['recordId']),
  handshakeGatewayChecks: defineTable({
    checkId: v.string(),
    principalId: v.string(),
    actionClass: literalUnion(ClearanceActionClassValues),
    actionRef: v.string(),
    status: literalUnion(ClearanceGatewayCheckStatusValues),
    sourceHash: v.string(),
    checkedAt: v.number(),
  })
    .index('by_checkId', ['checkId'])
    .index('by_principalId_and_actionClass_and_actionRef', ['principalId', 'actionClass', 'actionRef'])
    .index('by_status', ['status']),
  handshakeIsolationStates: defineTable({
    isolationId: v.string(),
    principalId: v.string(),
    status: literalUnion(ClearanceIsolationStateStatusValues),
    reasonCode: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_isolationId', ['isolationId'])
    .index('by_principalId', ['principalId'])
    .index('by_status', ['status']),
} as const
