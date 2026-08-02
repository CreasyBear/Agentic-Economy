// Durable tables are registered by convex/schema.ts; this module owns their validators.
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'

const StudyStatusValues = ['scanning', 'qualifying', 'quoting', 'scored', 'completed', 'failed'] as const
const StudyEventKindValues = [
  'study_created',
  'study_result_recorded',
  'scan_started',
  'candidate_observed',
  'candidate_quarantined',
  'quote_requested',
  'quote_received',
  'quote_refused',
  'quote_unknown',
  'quote_expired',
  'scoring_completed',
  'recommended',
  'refused',
] as const
const StudyEvidenceClassValues = ['ae_sandbox_provider', 'published_price', 'business_quote', 'web_discovery'] as const

/** Durable study projection plus append-only event truth. Artifact internals stay domain-validated JSON. */
export const studyTables = {
  studies: defineTable({
    studyId: v.string(),
    projectId: v.string(),
    treeId: v.optional(v.string()),
    nodeId: v.string(),
    ownerSessionId: v.optional(v.string()),
    generation: v.number(),
    revision: v.number(),
    treeRevision: v.optional(v.number()),
    status: literalUnion(StudyStatusValues),
    artifactJson: v.string(),
    artifactDigest: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_studyId', ['studyId'])
    .index('by_projectId', ['projectId'])
    .index('by_projectId_and_updatedAt', ['projectId', 'updatedAt']),

  studyEvents: defineTable({
    studyId: v.string(),
    projectId: v.string(),
    treeId: v.optional(v.string()),
    nodeId: v.string(),
    generation: v.number(),
    revision: v.number(),
    treeRevision: v.optional(v.number()),
    seq: v.number(),
    kind: literalUnion(StudyEventKindValues),
    operationKey: v.string(),
    payloadJson: v.string(),
    payloadDigest: v.string(),
    digest: v.optional(v.string()),
    evidenceClass: v.optional(literalUnion(StudyEvidenceClassValues)),
    at: v.number(),
    timestamp: v.optional(v.number()),
  })
    .index('by_operationKey', ['operationKey'])
    .index('by_studyId_and_seq', ['studyId', 'seq'])
    .index('by_projectId_and_seq', ['projectId', 'seq']),
} as const
