import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const legacyReleaseATables = {
  answerThreads: defineTable({
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_threadId', ['threadId'])
    .index('by_session_updatedAt', ['pseudonymousSessionId', 'updatedAt']),

  answerTurns: defineTable({
    turnId: v.string(),
    threadId: v.string(),
    seq: v.number(),
    query: v.string(),
    intent: v.union(
      v.literal('refine_search'),
      v.literal('filter_known'),
      v.literal('compare_known'),
      v.literal('explain_boundary'),
      v.literal('unsupported'),
    ),
    evidenceJson: v.string(),
    snapshotHash: v.string(),
    proseJson: v.string(),
    artifactKindsJson: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('complete'),
      v.literal('stopped'),
      v.literal('error'),
    ),
    errorCopyId: v.optional(v.string()),
    errorProblemJson: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_turnId', ['turnId'])
    .index('by_thread_seq', ['threadId', 'seq']),

  answerTurnReservations: defineTable({
    reservationKey: v.string(),
    sessionId: v.string(),
    requestedThreadScope: v.string(),
    requestDigest: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    seq: v.number(),
    query: v.string(),
    searchContextJson: v.optional(v.string()),
    generation: v.number(),
    checkpointGeneration: v.optional(v.number()),
    checkpointStep: v.optional(v.number()),
    checkpointDigest: v.optional(v.string()),
    checkpointJson: v.optional(v.string()),
    state: v.union(
      v.literal('reserved'),
      v.literal('finalized'),
      v.literal('stopped'),
    ),
    finalStatus: v.optional(v.union(v.literal('complete'), v.literal('error'))),
    answerDigest: v.optional(v.string()),
    harnessFinalizationDigest: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_reservationKey', ['reservationKey'])
    .index('by_turnId', ['turnId'])
    .index('by_thread_seq', ['threadId', 'seq']),

  answerToolCalls: defineTable({
    toolCallId: v.string(),
    turnId: v.string(),
    seq: v.number(),
    toolId: v.union(
      v.literal('registry.search'),
      v.literal('registry.detail'),
      v.literal('registry.operations.search'),
      v.literal('registry.operations.detail'),
      v.literal('registry.operations.compare'),
      v.literal('registry.operations.inspectPlan'),
      v.literal('operation.execute'),
      v.literal('operation.invoke'),
    ),
    inputJson: v.string(),
    resultSummaryJson: v.string(),
    resultJson: v.optional(v.string()),
    resultHash: v.string(),
    status: v.union(
      v.literal('complete'),
      v.literal('error'),
      v.literal('refused'),
    ),
    createdAt: v.number(),
  })
    .index('by_toolCallId', ['toolCallId'])
    .index('by_turn_seq', ['turnId', 'seq']),

  answerThreadShares: defineTable({
    threadId: v.string(),
    accessId: v.string(),
    generation: v.number(),
    verifier: v.string(),
    keyId: v.string(),
    status: v.union(v.literal('active'), v.literal('revoked')),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index('by_threadId', ['threadId'])
    .index('by_accessId', ['accessId'])
    .index('by_thread_status', ['threadId', 'status']),

  harnessSessions: defineTable({
    sessionId: v.string(),
    ownerKey: v.string(),
    entryCount: v.number(),
    activeLeafEntryId: v.optional(v.string()),
    lastRunId: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal('ok'),
      v.literal('error'),
      v.literal('refused'),
      v.literal('blocked'),
      v.literal('timeout'),
      v.literal('aborted'),
      v.literal('skipped'),
    )),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_sessionId', ['sessionId'])
    .index('by_ownerKey_updatedAt', ['ownerKey', 'updatedAt'])
    .index('by_lastRunId', ['lastRunId']),

  harnessSessionEntries: defineTable({
    entryId: v.string(),
    sessionId: v.string(),
    ownerKey: v.string(),
    runId: v.string(),
    turnId: v.optional(v.string()),
    seq: v.number(),
    parentEntryId: v.optional(v.string()),
    kind: v.union(
      v.literal('session.created'),
      v.literal('session.resumed'),
      v.literal('turn.started'),
      v.literal('intent.routed'),
      v.literal('context.loaded'),
      v.literal('tool.started'),
      v.literal('tool.completed'),
      v.literal('tool.failed'),
      v.literal('model.started'),
      v.literal('model.completed'),
      v.literal('model.failed'),
      v.literal('gate.evaluated'),
      v.literal('turn.persisted'),
      v.literal('turn.completed'),
      v.literal('turn.error'),
      v.literal('run.reported'),
      v.literal('projection.updated'),
      v.literal('replay.started'),
      v.literal('replay.completed'),
      v.literal('replay.failed'),
      v.literal('branch.created'),
      v.literal('compaction.summarized'),
    ),
    status: v.optional(v.union(
      v.literal('ok'),
      v.literal('error'),
      v.literal('refused'),
      v.literal('blocked'),
      v.literal('timeout'),
      v.literal('aborted'),
      v.literal('skipped'),
    )),
    idempotencyKey: v.string(),
    requestHash: v.string(),
    createdAt: v.number(),
    payloadJson: v.string(),
    publicSummaryJson: v.optional(v.string()),
    privatePayloadJson: v.optional(v.string()),
    schemaVersion: v.number(),
    toolContractHash: v.optional(v.string()),
    sourceSnapshotHash: v.optional(v.string()),
  })
    .index('by_entryId', ['entryId'])
    .index('by_sessionId_seq', ['sessionId', 'seq'])
    .index('by_sessionId_entryId', ['sessionId', 'entryId'])
    .index('by_sessionId_idempotencyKey', ['sessionId', 'idempotencyKey'])
    .index('by_sessionId_parentEntryId', ['sessionId', 'parentEntryId'])
    .index('by_idempotencyKey', ['idempotencyKey'])
    .index('by_ownerKey_createdAt', ['ownerKey', 'createdAt'])
    .index('by_runId_seq', ['runId', 'seq'])
    .index('by_turnId_seq', ['turnId', 'seq']),

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
    evidenceClass: v.union(
      v.literal('sandbox'),
      v.literal('hosted'),
      v.literal('provider'),
      v.literal('customer'),
      v.literal('payment'),
    ),
    signal: v.union(
      v.literal('decision_ready_within_24h'),
      v.literal('blind_preference'),
      v.literal('provider_backed_completion'),
      v.literal('customer_accepted_next_step'),
      v.literal('refusal_unknown'),
      v.literal('false_success_claim'),
      v.literal('false_fulfilment_claim'),
      v.literal('false_payment_claim'),
      v.literal('operator_touch_count'),
      v.literal('signed_paid_pilot'),
      v.literal('settled_real_payment'),
      v.literal('contribution_margin_minor'),
    ),
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
