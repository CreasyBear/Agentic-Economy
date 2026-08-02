import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import { externalRunEvidenceClassValues, externalRunEvidenceSignalValues } from './contract'

export const externalRunTables = {
  externalRunManifests: defineTable({
    runId: v.string(),
    manifestDigest: v.string(),
    manifestJson: v.string(),
    state: v.literal('frozen'),
    operationKey: v.string(),
    actorRef: v.string(),
    createdAt: v.number(),
    frozenAt: v.number(),
  }).index('by_runId', ['runId']),
  externalRunStarts: defineTable({
    runId: v.string(),
    startRef: v.string(),
    startDigest: v.string(),
    startJson: v.string(),
    providerRef: v.string(),
    independentProviderRef: v.string(),
    startedAt: v.number(),
    operationKey: v.string(),
    admittedAt: v.number(),
  })
    .index('by_runId_and_startRef', ['runId', 'startRef'])
    .index('by_runId_and_independentProviderRef', ['runId', 'independentProviderRef'])
    .index('by_runId_and_startedAt', ['runId', 'startedAt']),
  externalRunEvidence: defineTable({
    runId: v.string(),
    startRef: v.string(),
    evidenceRef: v.string(),
    evidenceDigest: v.string(),
    evidenceJson: v.string(),
    evidenceClass: literalUnion(externalRunEvidenceClassValues),
    signal: literalUnion(externalRunEvidenceSignalValues),
    observedAt: v.number(),
    operationKey: v.string(),
  })
    .index('by_runId_and_startRef', ['runId', 'startRef'])
    .index('by_runId_and_startRef_and_evidenceRef', ['runId', 'startRef', 'evidenceRef'])
    .index('by_runId_and_evidenceRef', ['runId', 'evidenceRef']),
  externalRunGateDecisions: defineTable({
    runId: v.string(),
    manifestDigest: v.string(),
    reportDigest: v.string(),
    decision: v.union(v.literal('PASS'), v.literal('FAIL/KILL')),
    failedGatesJson: v.string(),
    operationKey: v.string(),
    actorRef: v.string(),
    finalizedAt: v.number(),
  }).index('by_runId', ['runId']),
} as const
