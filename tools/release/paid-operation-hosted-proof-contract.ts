import { createHash } from 'node:crypto'

import { z } from 'zod'

export const PAID_OPERATION_HOSTED_PROOF_SCHEMA =
  'agentic-paid-operation-hosted-proof:v1' as const
export const PAID_OPERATION_HOSTED_EVIDENCE_CLASS =
  'authenticated_exact_revision_hosted_sandbox' as const
export const PAID_OPERATION_PACKET_INTEGRITY_CLASS =
  'local_packet_integrity_only' as const

export const EXPECTED_SCENARIO_ORDER = [
  'human_provider_a_golden',
  'agent_provider_a_golden',
  'provider_b_response_lost_uncertainty_goblin',
] as const
export const EXPECTED_AUTOMATED_INSTRUMENT_DIGEST =
  'sha256:526b009ddbf476758a06abf5768fe8459a1a5c29411c98ebfd5d131084452719' as const
export const EXPECTED_RESIDUAL_REVIEW_DATE = '2026-08-21' as const
const EXPECTED_RESIDUAL_RECORD_CLASSES = [
  'policy',
  'counter',
  'reservation',
  'aggregate',
  'command',
  'attempt',
  'mock_effect',
] as const
const CHILD_CAP = 20
const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u)
const revisionSchema = z.string().regex(/^[0-9a-f]{40}$/u)

export type JsonValue =
  | null
  | string
  | number
  | boolean
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(),
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]))

export const sourceSchema = z.strictObject({
  expectedRevision: revisionSchema,
  expectedTree: z.string().regex(/^[0-9a-f]{40}$/u),
  observedRevision: revisionSchema,
  observedTree: z.string().regex(/^[0-9a-f]{40}$/u),
  clean: z.boolean(),
})
export const deploymentSchema = z.strictObject({
  provider: z.literal('vercel'),
  id: z.string().min(1),
  url: z.string().min(1),
  productionUrl: z.string().min(1),
  gitSha: revisionSchema,
  gitRef: z.string().min(1),
  repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/u),
  readyState: z.literal('READY'),
  target: z.literal('production'),
})
export const githubDeploymentSchema = z.strictObject({
  repository: z.literal('CreasyBear/Agentic-Economy'),
  ref: z.literal('main'),
  workflowPath: z.literal('.github/workflows/kernel-release-gate.yml'),
  runId: z.string().regex(/^[1-9][0-9]*$/u),
  runAttempt: z.number().int().positive(),
  headSha: revisionSchema,
  status: z.literal('completed'),
  conclusion: z.literal('success'),
  job: z.strictObject({
    name: z.literal('Phase 3C exact-revision Convex deployment'),
    status: z.literal('completed'),
    conclusion: z.literal('success'),
  }),
  step: z.strictObject({
    name: z.literal('Record Phase 3C Convex deployment receipt'),
    status: z.literal('completed'),
    conclusion: z.literal('success'),
  }),
})
export const environmentSchema = z.strictObject({
  name: z.literal('hosted-labelled-mock-sandbox-candidate'),
  evidenceClass: z.literal('hosted_labelled_mock_candidate'),
  claimCeiling: z.literal('pending_authenticated_exact_revision_readback'),
})
export const projectionSchema = z.strictObject({
  schema: z.literal('agentic-paid-operation:v1'),
  semantics: jsonValueSchema,
  semanticDigest: digestSchema,
  observedVersion: z.number().int().positive(),
  evidenceClass: z.literal('hosted_labelled_mock_candidate'),
})
export const transitionSchema = z.strictObject({
  stage: z.enum([
    'created',
    'authorized',
    'release_started',
    'completed',
    'response_lost',
    'reconciled',
  ]),
  invocationVersion: z.number().int().positive(),
  commandIdentityDigest: digestSchema,
  attemptIdentityDigest: digestSchema.nullable(),
  effectObservationDigest: digestSchema.nullable(),
  effectGeneration: z.literal(1).nullable(),
  continuations: z.array(z.string().min(1)).max(3),
  reconciliationInput: z.strictObject({
    command: z.literal('reconcile'),
    commandId: z.string().min(1),
    expectedInvocationVersion: z.number().int().positive(),
  }).optional(),
})
const journeyCheckpointSchema = z.strictObject({
  stage: z.enum(['ready_for_permission', 'payment_prepared']),
  observedVersion: z.union([z.literal(1), z.literal(2)]),
  human: z.strictObject({
    semanticDigest: digestSchema,
    observedVersion: z.union([z.literal(1), z.literal(2)]),
    evidenceClass: z.literal('hosted_labelled_mock_candidate'),
    decisionLabel: z.enum(['Ready for permission', 'Payment prepared']),
    paymentSubmissionLabel: z.literal('Not submitted'),
    settlementLabel: z.literal('No settlement evidence'),
    resultLabel: z.literal('Not received'),
    nextCommand: z.enum(['authorize', 'execute']),
    projection: projectionSchema,
  }).nullable(),
  agent: projectionSchema.nullable(),
})
export const scenarioSchema = z.strictObject({
  scenario: z.enum(EXPECTED_SCENARIO_ORDER),
  actorClass: z.enum(['human', 'agent', 'agent_goblin']),
  invocationRef: z.string().min(1),
  providerId: z.enum(['provider:a', 'provider:b']),
  operationKey: z.enum(['btc-usd-a', 'btc-usd-b']),
  operationRevision: z.string().min(1),
  checkpoints: z.tuple([journeyCheckpointSchema, journeyCheckpointSchema]),
  transitions: z.array(transitionSchema).min(4).max(5),
  projections: z.strictObject({
    humanWarm: projectionSchema.nullable(),
    humanCold: projectionSchema.nullable(),
    agentWarm: projectionSchema.nullable(),
    agentCold: projectionSchema.nullable(),
  }),
})
const commandObservationSchema = z.strictObject({
  commandIdentityDigest: digestSchema,
  commandIdDigest: digestSchema,
  invocationVersion: z.number().int().nonnegative(),
  effectGeneration: z.number().int().nonnegative().optional(),
  principalDigest: digestSchema.nullable(),
  callerDigest: digestSchema.nullable(),
})
const attemptObservationSchema = z.strictObject({
  attemptIdentityDigest: digestSchema,
  attemptNumber: z.number().int().nonnegative(),
  effectGeneration: z.number().int().nonnegative(),
  actorPrincipalDigest: digestSchema,
  actorCallerDigest: digestSchema,
  release: z.string().min(1),
  outcome: z.string().min(1),
})
const effectObservationSchema = z.strictObject({
  observationDigest: digestSchema,
  attemptIdentityDigest: digestSchema,
  paymentIdentifierDigest: digestSchema,
  effectGeneration: z.number().int().nonnegative(),
  providerId: z.enum(['provider:a', 'provider:b']),
  operationKey: z.enum(['btc-usd-a', 'btc-usd-b']),
  operationRevision: z.string().min(1),
  effect: z.literal('released'),
  payment: z.literal('settled'),
  delivery: z.enum(['returned', 'response_lost']),
})
const invocationObservationSchema = z.strictObject({
  invocationRef: z.string().min(1),
  ownerPrincipalDigest: digestSchema,
  ownerCallerDigest: digestSchema,
  controlOwnerPrincipalDigest: digestSchema,
  controlOwnerCallerDigest: digestSchema,
  paymentIdentifierDigest: digestSchema,
  invocationVersion: z.number().int().positive(),
  providerId: z.enum(['provider:a', 'provider:b']),
  operationKey: z.enum(['btc-usd-a', 'btc-usd-b']),
  operationRevision: z.string().min(1),
  environment: environmentSchema,
  currentTruth: z.strictObject({
    control: z.string().min(1),
    payment: z.string().min(1),
    delivery: z.string().min(1),
    observedResolution: z.string().min(1),
  }),
  reservation: z.strictObject({
    state: z.enum(['active', 'released']),
    reservationDigest: digestSchema,
  }),
  counts: z.strictObject({
    headers: z.literal(1),
    sources: z.literal(1),
    payments: z.literal(1),
    reservations: z.literal(1),
    commands: z.number().int().nonnegative(),
    attempts: z.number().int().nonnegative(),
    effects: z.number().int().nonnegative(),
    evidenceReferences: z.number().int().nonnegative(),
    effectGenerations: z.number().int().nonnegative(),
  }),
  commands: z.array(commandObservationSchema).max(CHILD_CAP),
  attempts: z.array(attemptObservationSchema).max(CHILD_CAP),
  effects: z.array(effectObservationSchema).max(CHILD_CAP),
  observationDigest: digestSchema,
})
export const sourceObservationSchema = z.strictObject({
  kind: z.literal('observed'),
  schema: z.literal('phase3c-paid-operation-proof-observation:v1'),
  cohort: z.strictObject({
    cohortDigest: digestSchema,
    headers: z.literal(3),
    reservations: z.literal(3),
  }),
  deployment: z.strictObject({
    current: z.strictObject({
      name: z.string().min(1),
      region: z.string().min(1).nullable(),
      class: z.enum(['s16', 's256', 'd1024']),
    }),
    receipt: z.strictObject({
      receiptRef: z.literal('phase3c-paid-operation-exact-revision-deployment:g5'),
      sourceRevision: revisionSchema,
      sourceTree: z.string().regex(/^[0-9a-f]{40}$/u),
      githubRunId: z.string().regex(/^[1-9][0-9]*$/u),
      githubRunAttempt: z.number().int().positive(),
      githubRepository: z.literal('CreasyBear/Agentic-Economy'),
      githubRef: z.literal('main'),
      githubWorkflow: z.literal('.github/workflows/kernel-release-gate.yml'),
      githubJob: z.literal('Phase 3C exact-revision Convex deployment'),
      githubStep: z.literal('Record Phase 3C Convex deployment receipt'),
      sourceClockTimestamp: z.iso.datetime({ offset: true }),
      deploymentName: z.string().min(1),
      receiptDigest: digestSchema,
    }),
  }),
  policy: z.strictObject({
    policyRef: z.literal('phase-3c-hosted-paid-operation-trial:g5'),
    enabled: z.boolean(),
    policyDigest: digestSchema,
    sourceRevision: revisionSchema,
    principalDigest: digestSchema,
    bounds: z.strictObject({
      total: z.number().int().positive(),
      concurrency: z.number().int().positive(),
      rate: z.number().int().positive(),
    }),
    admissionEndsAt: z.iso.datetime({ offset: true }),
    retainThrough: z.iso.datetime({ offset: true }),
    killSwitchOwnerDigest: digestSchema,
  }),
  counters: z.strictObject({
    admittedTotal: z.number().int().nonnegative(),
    activeReservations: z.number().int().nonnegative(),
    admittedInWindow: z.number().int().nonnegative(),
  }),
  invocations: z.array(invocationObservationSchema).length(3),
  observationDigest: digestSchema,
})
export const packetContentSchema = z.strictObject({
  schema: z.literal(PAID_OPERATION_HOSTED_PROOF_SCHEMA),
  collectedAs: z.literal('hosted_candidate'),
  source: sourceSchema,
  deployment: deploymentSchema,
  githubDeployment: githubDeploymentSchema,
  convex: z.strictObject({
    queryMode: z.literal('authenticated_cli_configured_project_prod'),
    configuredDeployment: z.string().regex(/^(?:dev|prod):[A-Za-z0-9-]+$/u),
    queryUrl: z.string().url(),
    deploymentName: z.string().min(1),
    sourceRevision: revisionSchema,
    sourceTree: z.string().regex(/^[0-9a-f]{40}$/u),
    deploymentReceiptDigest: digestSchema,
  }),
  actors: z.strictObject({
    human: z.strictObject({
      callerClass: z.literal('authenticated_human_session'),
      principalDigest: digestSchema,
      callerDigest: digestSchema,
    }),
    agent: z.strictObject({
      callerClass: z.literal('authenticated_agent_api_key'),
      principalDigest: digestSchema,
      callerDigest: digestSchema,
      requiredScopes: z.tuple([z.literal('paid_operation:invoke')]),
    }),
  }),
  credentials: z.strictObject({
    subjectPrincipalDigest: digestSchema,
    humanSession: z.strictObject({
      callerDigest: digestSchema,
      sessionDigest: digestSchema,
      status: z.literal('revoked'),
    }),
    agentKey: z.strictObject({
      callerDigest: digestSchema,
      status: z.literal('revoked'),
      requiredScopes: z.tuple([z.literal('paid_operation:invoke')]),
      secondsUntilExpiration: z.literal(3_600),
    }),
  }),
  providers: z.tuple([
    z.strictObject({
      providerKey: z.literal('A'),
      providerId: z.literal('provider:a'),
      operationKey: z.literal('btc-usd-a'),
      operationRevision: z.string().min(1),
      evidenceClass: z.literal('labelled_mock'),
    }),
    z.strictObject({
      providerKey: z.literal('B'),
      providerId: z.literal('provider:b'),
      operationKey: z.literal('btc-usd-b'),
      operationRevision: z.string().min(1),
      evidenceClass: z.literal('labelled_mock'),
    }),
  ]),
  scenarioOrder: z.tuple([
    z.literal(EXPECTED_SCENARIO_ORDER[0]),
    z.literal(EXPECTED_SCENARIO_ORDER[1]),
    z.literal(EXPECTED_SCENARIO_ORDER[2]),
  ]),
  scenarios: z.tuple([scenarioSchema, scenarioSchema, scenarioSchema]),
  sourceObservation: sourceObservationSchema,
  comprehension: z.strictObject({
    human: z.strictObject({
      status: z.literal('NOT_RUN'),
      evidenceClass: z.literal('declared_human_comprehension_session'),
    }),
    automated: z.strictObject({
      status: z.literal('PASS'),
      evidenceClass: z.literal('automated_model_comprehension_adjunct'),
      instrumentDigest: z.literal(EXPECTED_AUTOMATED_INSTRUMENT_DIGEST),
    }),
  }),
  residualRecords: z.strictObject({
    posture: z.literal('retain_until_review_then_retire'),
    reviewDate: z.literal(EXPECTED_RESIDUAL_REVIEW_DATE),
    killSwitchOwnerDigest: digestSchema,
    expectedRecordClasses: z.tuple([
      z.literal(EXPECTED_RESIDUAL_RECORD_CLASSES[0]),
      z.literal(EXPECTED_RESIDUAL_RECORD_CLASSES[1]),
      z.literal(EXPECTED_RESIDUAL_RECORD_CLASSES[2]),
      z.literal(EXPECTED_RESIDUAL_RECORD_CLASSES[3]),
      z.literal(EXPECTED_RESIDUAL_RECORD_CLASSES[4]),
      z.literal(EXPECTED_RESIDUAL_RECORD_CLASSES[5]),
      z.literal(EXPECTED_RESIDUAL_RECORD_CLASSES[6]),
    ]),
  }),
  claimCeiling: z.literal('pending_live_evidence_admission'),
})
export const packetSchema = packetContentSchema.extend({
  checksum: z.strictObject({
    algorithm: z.literal('sha256'),
    digest: digestSchema,
  }),
})

export type PaidOperationHostedProofPacket = z.infer<typeof packetSchema>
export type PaidOperationPacketIntegrityResult =
  | Readonly<{
      kind: 'packet_integrity_verified'
      evidenceClass: typeof PAID_OPERATION_PACKET_INTEGRITY_CLASS
      packetDigest: string
    }>
  | Readonly<{ kind: 'refused'; code: PaidOperationHostedProofFailureCode }>

export type PaidOperationHostedProofFailureCode =
  | 'packet_schema_invalid'
  | 'packet_checksum_mismatch'
  | 'final_evidence_class_preclaimed'
  | 'raw_material_forbidden'
  | 'caller_reconciliation_truth_forbidden'
  | 'source_assertion_mismatch'
  | 'deployment_assertion_mismatch'
  | 'convex_identity_mismatch'
  | 'actor_identity_mismatch'
  | 'scenario_order_mismatch'
  | 'transition_invariant_mismatch'
  | 'projection_semantics_mismatch'
  | 'internal_observation_mismatch'
  | 'effect_count_mismatch'
  | 'active_reservation_mismatch'
  | 'unsafe_uncertainty_continuation'
  | 'journey_checkpoint_mismatch'
  | 'deployment_receipt_mismatch'
  | 'credential_revocation_mismatch'
  | 'live_admission_context_required'
  | 'live_source_mismatch'
  | 'live_source_torn'
  | 'live_vercel_control_plane_mismatch'
  | 'live_github_deployment_mismatch'
  | 'convex_cli_binding_mismatch'
  | 'live_convex_observation_mismatch'
  | 'live_human_readback_mismatch'
  | 'live_agent_readback_mismatch'
  | 'live_collection_failed'

export const authoritativeEvidenceSchema = z.strictObject({
  source: sourceSchema,
  vercel: deploymentSchema,
  githubDeployment: githubDeploymentSchema,
  convex: packetContentSchema.shape.convex.extend({
    observation: sourceObservationSchema,
  }),
  actors: packetContentSchema.shape.actors,
  credentials: packetContentSchema.shape.credentials,
  scenarios: z.tuple([scenarioSchema, scenarioSchema, scenarioSchema]),
})
export const liveCollectionTargetSchema = z.strictObject({
  source: z.strictObject({
    expectedRevision: revisionSchema,
    expectedTree: z.string().regex(/^[0-9a-f]{40}$/u),
  }),
  deployment: z.strictObject({
    id: z.string().regex(/^dpl_[A-Za-z0-9]+$/u),
    productionUrl: z.string().min(1),
  }),
  github: z.strictObject({
    runId: z.string().regex(/^[1-9][0-9]*$/u),
    runAttempt: z.number().int().positive(),
  }),
  automatedInstrumentDigest: z.literal(EXPECTED_AUTOMATED_INSTRUMENT_DIGEST),
  residualReviewDate: z.literal(EXPECTED_RESIDUAL_REVIEW_DATE),
})

export type AuthoritativePaidOperationLiveEvidence =
  z.infer<typeof authoritativeEvidenceSchema>
export type PaidOperationHostedLiveCollectionTarget =
  z.infer<typeof liveCollectionTargetSchema>

export function canonicalProofDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(value)).digest('hex')}`
}

export function collectPaidOperationHostedProofPacket<T extends Record<string, unknown>>(
  content: T,
): T & Readonly<{ checksum: Readonly<{ algorithm: 'sha256'; digest: string }> }> {
  const unsigned = structuredClone(content)
  if (!isRecord(unsigned)) throw new Error('paid_operation_hosted_packet_content_invalid')
  return {
    ...unsigned,
    checksum: {
      algorithm: 'sha256' as const,
      digest: canonicalProofDigest(unsigned),
    },
  } as T & Readonly<{ checksum: Readonly<{ algorithm: 'sha256'; digest: string }> }>
}

export function parsePaidOperationHostedProofPacket(
  input: unknown,
): PaidOperationHostedProofPacket {
  return packetSchema.parse(input)
}

export function verifyPacketIntegrity(input: unknown): PaidOperationPacketIntegrityResult {
  if (containsValue(input, PAID_OPERATION_HOSTED_EVIDENCE_CLASS)) {
    return refused('final_evidence_class_preclaimed')
  }
  if (containsForbiddenReconciliationTruth(input)) {
    return refused('caller_reconciliation_truth_forbidden')
  }
  if (containsRawMaterial(input)) return refused('raw_material_forbidden')
  if (declaredScenarioShapeInvalid(input)) return refused('scenario_order_mismatch')
  if (isRecord(input) && isRecord(input.checksum)
    && typeof input.checksum.digest === 'string') {
    const unsignedInput = structuredClone(input)
    delete unsignedInput.checksum
    if (input.checksum.digest !== canonicalProofDigest(unsignedInput)) {
      return refused('packet_checksum_mismatch')
    }
  }
  const parsed = packetSchema.safeParse(input)
  if (!parsed.success) return refused('packet_schema_invalid')
  const packet = parsed.data
  const { checksum, ...unsigned } = packet
  if (checksum.digest !== canonicalProofDigest(unsigned)) {
    return refused('packet_checksum_mismatch')
  }
  if (packet.source.expectedRevision !== packet.source.observedRevision
    || packet.source.expectedTree !== packet.source.observedTree
    || !packet.source.clean) {
    return refused('source_assertion_mismatch')
  }
  if (packet.deployment.gitSha !== packet.source.observedRevision
    || packet.deployment.gitRef !== 'main'
    || packet.deployment.repository !== 'CreasyBear/Agentic-Economy'
    || packet.deployment.url === packet.deployment.productionUrl
      && packet.deployment.id.trim() === '') {
    return refused('deployment_assertion_mismatch')
  }
  if (packet.githubDeployment.headSha !== packet.source.observedRevision
    || packet.githubDeployment.repository !== 'CreasyBear/Agentic-Economy'
    || packet.githubDeployment.ref !== 'main'
    || packet.githubDeployment.workflowPath
      !== '.github/workflows/kernel-release-gate.yml') {
    return refused('deployment_receipt_mismatch')
  }
  const receipt = packet.sourceObservation.deployment.receipt
  const { receiptDigest, ...unsignedReceipt } = receipt
  if (packet.convex.sourceRevision !== packet.source.observedRevision
    || packet.convex.sourceTree !== packet.source.observedTree
    || packet.convex.deploymentName !== packet.sourceObservation.deployment.current.name
    || packet.convex.deploymentName !== receipt.deploymentName
    || packet.convex.deploymentReceiptDigest !== receiptDigest
    || receiptDigest !== canonicalProofDigest(unsignedReceipt)
    || receipt.sourceRevision !== packet.source.observedRevision
    || receipt.sourceTree !== packet.source.observedTree
    || receipt.githubRunId !== packet.githubDeployment.runId
    || receipt.githubRunAttempt !== packet.githubDeployment.runAttempt
    || receipt.githubRepository !== packet.githubDeployment.repository
    || receipt.githubRef !== packet.githubDeployment.ref
    || receipt.githubWorkflow !== packet.githubDeployment.workflowPath
    || receipt.githubJob !== packet.githubDeployment.job.name
    || receipt.githubStep !== packet.githubDeployment.step.name
    || new URL(packet.convex.queryUrl).hostname
      !== `${packet.convex.deploymentName}.convex.cloud`) {
    return refused('convex_identity_mismatch')
  }
  if (packet.actors.human.principalDigest !== packet.actors.agent.principalDigest
    || packet.actors.human.callerDigest === packet.actors.agent.callerDigest
    || packet.actors.agent.requiredScopes.length !== 1
    || packet.actors.agent.requiredScopes[0] !== 'paid_operation:invoke') {
    return refused('actor_identity_mismatch')
  }
  if (packet.credentials.subjectPrincipalDigest !== packet.actors.human.principalDigest
    || packet.credentials.humanSession.callerDigest !== packet.actors.human.callerDigest
    || packet.credentials.humanSession.sessionDigest === packet.actors.human.callerDigest
    || packet.credentials.agentKey.callerDigest !== packet.actors.agent.callerDigest
    || packet.credentials.agentKey.requiredScopes[0] !== 'paid_operation:invoke'
    || packet.credentials.humanSession.status !== 'revoked'
    || packet.credentials.agentKey.status !== 'revoked') {
    return refused('credential_revocation_mismatch')
  }
  if (!sameJson(packet.scenarioOrder, EXPECTED_SCENARIO_ORDER)
    || packet.scenarios.some(
      (scenario, index) => scenario.scenario !== EXPECTED_SCENARIO_ORDER[index],
    )
    || new Set(packet.scenarios.map((scenario) => scenario.invocationRef)).size !== 3
    || new Set(
      packet.sourceObservation.invocations.map((invocation) => invocation.invocationRef),
    ).size !== 3) {
    return refused('scenario_order_mismatch')
  }
  const cohortDigest = canonicalProofDigest({
    schema: 'phase3c-paid-operation-proof-cohort:v1',
    invocationRefs: packet.scenarios.map((scenario) => scenario.invocationRef),
  })
  if (packet.sourceObservation.cohort.cohortDigest !== cohortDigest
    || packet.sourceObservation.cohort.headers !== 3
    || packet.sourceObservation.cohort.reservations !== 3) {
    return refused('internal_observation_mismatch')
  }
  if (packet.providers[0].operationRevision
      !== packet.scenarios[0].operationRevision
    || packet.providers[0].operationRevision
      !== packet.scenarios[1].operationRevision
    || packet.providers[1].operationRevision
      !== packet.scenarios[2].operationRevision) {
    return refused('internal_observation_mismatch')
  }
  if (packet.sourceObservation.kind !== 'observed'
    || packet.sourceObservation.policy.sourceRevision !== packet.source.observedRevision
    || !packet.sourceObservation.policy.enabled
    || !sameJson(packet.sourceObservation.policy.bounds, {
      total: 3,
      concurrency: 1,
      rate: 3,
    })
    || packet.sourceObservation.counters.admittedTotal !== 3
    || !Number.isSafeInteger(packet.sourceObservation.counters.admittedInWindow)
    || packet.sourceObservation.counters.admittedInWindow < 1
    || packet.sourceObservation.counters.admittedInWindow
      > packet.sourceObservation.policy.bounds.rate) {
    return refused('internal_observation_mismatch')
  }
  if (packet.sourceObservation.counters.activeReservations !== 0
    || packet.sourceObservation.invocations.some(
      (invocation) => invocation.reservation.state !== 'released',
    )) {
    return refused('active_reservation_mismatch')
  }
  if (packet.residualRecords.killSwitchOwnerDigest
      !== packet.sourceObservation.policy.killSwitchOwnerDigest
    || packet.residualRecords.reviewDate
      !== packet.sourceObservation.policy.retainThrough.slice(0, 10)) {
    return refused('internal_observation_mismatch')
  }
  if (!observationDigestsValid(packet.sourceObservation)) {
    return refused('internal_observation_mismatch')
  }

  for (const [index, scenario] of packet.scenarios.entries()) {
    const expected = expectedScenario(index)
    if (index === 2 && scenario.transitions.some(
      (transition) => transition.stage === 'response_lost'
        && !sameJson(transition.continuations, ['reconcile']),
    )) {
      return refused('unsafe_uncertainty_continuation')
    }
    if (scenario.actorClass !== expected.actorClass
      || scenario.providerId !== expected.providerId
      || scenario.operationKey !== expected.operationKey
      || !transitionsMatch(scenario.transitions, expected.transitions)) {
      return refused('transition_invariant_mismatch')
    }
    const projectionResult = verifyScenarioProjections(scenario)
    if (projectionResult !== undefined) return refused(projectionResult)
    if (!journeyCheckpointsValid(scenario)) {
      return refused('journey_checkpoint_mismatch')
    }
    const terminalProjection = terminalScenarioProjection(scenario)
    if (terminalProjection === undefined) {
      return refused('projection_semantics_mismatch')
    }
    if (index === 2 && !sameJson(
      continuationKinds(terminalProjection.semantics),
      ['inspect'],
    )) {
      return refused('unsafe_uncertainty_continuation')
    }
    const observed = packet.sourceObservation.invocations[index]
    if (observed === undefined
      || observed.invocationRef !== scenario.invocationRef
      || observed.providerId !== scenario.providerId
      || observed.operationKey !== scenario.operationKey
      || observed.operationRevision !== scenario.operationRevision) {
      return refused('internal_observation_mismatch')
    }
    const expectedCallerDigest = index === 0
      ? packet.actors.human.callerDigest
      : packet.actors.agent.callerDigest
    if (packet.sourceObservation.policy.principalDigest
        !== packet.actors.human.principalDigest
      || observed.ownerPrincipalDigest !== packet.actors.human.principalDigest
      || observed.ownerCallerDigest !== expectedCallerDigest
      || observed.controlOwnerPrincipalDigest !== observed.ownerPrincipalDigest
      || observed.controlOwnerCallerDigest !== observed.ownerCallerDigest
      || observed.commands.some((command) =>
        command.principalDigest !== packet.actors.human.principalDigest
        || command.callerDigest !== expectedCallerDigest)
      || observed.attempts.some((attempt) =>
        attempt.actorPrincipalDigest !== packet.actors.human.principalDigest
        || attempt.actorCallerDigest !== expectedCallerDigest)) {
      return refused('actor_identity_mismatch')
    }
    if (observed.counts.attempts !== 1
      || observed.counts.headers !== 1
      || observed.counts.sources !== 1
      || observed.counts.payments !== 1
      || observed.counts.reservations !== 1
      || observed.counts.effects !== 1
      || observed.counts.effectGenerations !== 1
      || observed.counts.evidenceReferences !== (index === 2 ? 2 : 1)
      || observed.attempts.length !== 1
      || observed.effects.length !== 1) {
      return refused('effect_count_mismatch')
    }
    const attempt = observed.attempts[0]!
    const effect = observed.effects[0]!
    if (attempt.attemptNumber !== 1
      || attempt.effectGeneration !== 1
      || attempt.attemptIdentityDigest !== effect.attemptIdentityDigest
      || attempt.release !== 'released'
      || attempt.outcome !== (index === 2 ? 'reconciled_released' : 'returned')
      || effect.effectGeneration !== 1
      || effect.paymentIdentifierDigest !== observed.paymentIdentifierDigest
      || effect.providerId !== scenario.providerId
      || effect.operationKey !== scenario.operationKey
      || effect.operationRevision !== scenario.operationRevision
      || effect.effect !== 'released'
      || effect.payment !== 'settled'
      || effect.delivery !== (index === 2 ? 'response_lost' : 'returned')) {
      return refused('effect_count_mismatch')
    }
    if (scenario.transitions.some((transition) =>
      transition.attemptIdentityDigest !== (
        transition.invocationVersion >= 4 ? attempt.attemptIdentityDigest : null
      )
      || transition.effectObservationDigest !== (
        transition.invocationVersion >= 5 ? effect.observationDigest : null
      ))) {
      return refused('transition_invariant_mismatch')
    }
    if (!rawCommandsMatchTransitions(observed.commands, scenario.transitions)
      || observed.counts.commands !== scenario.transitions.length
      || observed.commands.length !== scenario.transitions.length) {
      return refused('transition_invariant_mismatch')
    }
    if (index === 2) {
      const reconciliationInput = scenario.transitions[4]?.reconciliationInput
      const observedReconciliation = observed.commands.find(
        (command) => command.invocationVersion === 6,
      )
      if (reconciliationInput === undefined
        || observedReconciliation === undefined
        || observedReconciliation.commandIdDigest !== proofReferenceDigest(
          packet.sourceObservation.cohort.cohortDigest,
          'command-id',
          reconciliationInput.commandId,
        )) {
        return refused('transition_invariant_mismatch')
      }
    }
    const semantics = terminalProjection.semantics
    if (!semanticsMatchObservation(
      semantics,
      scenario,
      observed,
      index === 2,
    )) {
      return refused('internal_observation_mismatch')
    }
  }
  const totalEffects = packet.sourceObservation.invocations.reduce(
    (total, invocation) => total + invocation.counts.effects,
    0,
  )
  if (totalEffects !== 3) return refused('effect_count_mismatch')

  return {
    kind: 'packet_integrity_verified',
    evidenceClass: PAID_OPERATION_PACKET_INTEGRITY_CLASS,
    packetDigest: packet.checksum.digest,
  }
}

export function compareAuthoritativeLiveEvidence(
  packetInput: unknown,
  evidenceInput: unknown,
):
  | Readonly<{ kind: 'live_evidence_matches' }>
  | Readonly<{ kind: 'refused'; code: PaidOperationHostedProofFailureCode }> {
  const integrity = verifyPacketIntegrity(packetInput)
  if (integrity.kind === 'refused') return integrity
  const packetResult = packetSchema.safeParse(packetInput)
  const evidenceResult = authoritativeEvidenceSchema.safeParse(evidenceInput)
  if (!packetResult.success || !evidenceResult.success) {
    return refused('live_collection_failed')
  }
  const packet = packetResult.data
  const evidence = evidenceResult.data
  if (!sameJson(packet.source, evidence.source)) return refused('live_source_mismatch')
  if (!sameJson(packet.deployment, evidence.vercel)) {
    return refused('live_vercel_control_plane_mismatch')
  }
  if (!sameJson(packet.githubDeployment, evidence.githubDeployment)) {
    return refused('live_github_deployment_mismatch')
  }
  const { observation, ...convexIdentity } = evidence.convex
  if (!sameJson(packet.convex, convexIdentity)
    || !sameJson(packet.sourceObservation, observation)) {
    return refused('live_convex_observation_mismatch')
  }
  if (!sameJson(packet.actors, evidence.actors)
    || !sameJson(packet.credentials, evidence.credentials)) {
    return refused('credential_revocation_mismatch')
  }
  if (!sameJson(packet.scenarios, evidence.scenarios)) {
    return refused('live_human_readback_mismatch')
  }
  return { kind: 'live_evidence_matches' }
}

function verifyScenarioProjections(
  scenario: PaidOperationHostedProofPacket['scenarios'][number],
): 'projection_semantics_mismatch' | undefined {
  const humanProjections = [
    scenario.projections.humanWarm,
    scenario.projections.humanCold,
  ]
  const agentProjections = [
    scenario.projections.agentWarm,
    scenario.projections.agentCold,
  ]
  const expected = scenario.actorClass === 'human'
    ? humanProjections
    : agentProjections
  const forbidden = scenario.actorClass === 'human'
    ? agentProjections
    : humanProjections
  if (expected.some((projection) => projection === null)
    || forbidden.some((projection) => projection !== null)) {
    return 'projection_semantics_mismatch'
  }
  const projections = expected.filter(
    (projection): projection is NonNullable<typeof projection> => projection !== null,
  )
  if (projections.length !== 2) return 'projection_semantics_mismatch'
  for (const projection of projections) {
    if (projection.semanticDigest !== canonicalProofDigest(projection.semantics)
      || projection.observedVersion !== scenario.transitions.at(-1)?.invocationVersion
      || readPath(projection.semantics, ['schema']) !== projection.schema) {
      return 'projection_semantics_mismatch'
    }
  }
  const semanticDigest = projections[0]!.semanticDigest
  if (projections.some((projection) =>
    projection.semanticDigest !== semanticDigest
    || !sameJson(projection.semantics, projections[0]!.semantics))) {
    return 'projection_semantics_mismatch'
  }
  return undefined
}

function terminalScenarioProjection(
  scenario: PaidOperationHostedProofPacket['scenarios'][number],
): z.infer<typeof projectionSchema> | undefined {
  return scenario.actorClass === 'human'
    ? scenario.projections.humanCold ?? undefined
    : scenario.projections.agentCold ?? undefined
}

function journeyCheckpointsValid(
  scenario: PaidOperationHostedProofPacket['scenarios'][number],
): boolean {
  const [ready, prepared] = scenario.checkpoints
  const readyProjection = checkpointProjection(scenario, ready)
  const preparedProjection = checkpointProjection(scenario, prepared)
  if (readyProjection === undefined || preparedProjection === undefined) return false
  const humanLabelsValid = scenario.actorClass !== 'human'
    || (ready.human !== null
      && ready.human.semanticDigest === ready.human.projection.semanticDigest
      && ready.human.observedVersion === 1
      && ready.human.decisionLabel === 'Ready for permission'
      && ready.human.nextCommand === 'authorize'
      && prepared.human !== null
      && prepared.human.semanticDigest === prepared.human.projection.semanticDigest
      && prepared.human.observedVersion === 2
      && prepared.human.decisionLabel === 'Payment prepared'
      && prepared.human.nextCommand === 'execute')
  return ready.stage === 'ready_for_permission'
    && ready.observedVersion === 1
    && readyProjection.observedVersion === 1
    && readyProjection.semanticDigest === canonicalProofDigest(readyProjection.semantics)
    && readPath(readyProjection.semantics, ['paymentAuthorization', 'state']) === 'not_created'
    && readPath(readyProjection.semantics, ['paymentSubmission', 'state']) === 'not_submitted'
    && readPath(readyProjection.semantics, ['settlement', 'state']) === 'no_evidence'
    && readPath(readyProjection.semantics, ['resultDelivery', 'state']) === 'not_delivered'
    && continuationKinds(readyProjection.semantics).join(',') === 'authorize'
    && prepared.stage === 'payment_prepared'
    && prepared.observedVersion === 2
    && preparedProjection.observedVersion === 2
    && preparedProjection.semanticDigest === canonicalProofDigest(preparedProjection.semantics)
    && readPath(preparedProjection.semantics, ['paymentAuthorization', 'state']) === 'created'
    && readPath(preparedProjection.semantics, ['paymentSubmission', 'state']) === 'not_submitted'
    && readPath(preparedProjection.semantics, ['settlement', 'state']) === 'no_evidence'
    && readPath(preparedProjection.semantics, ['resultDelivery', 'state']) === 'not_delivered'
    && continuationKinds(preparedProjection.semantics).join(',') === 'execute'
    && humanLabelsValid
}

function checkpointProjection(
  scenario: PaidOperationHostedProofPacket['scenarios'][number],
  checkpoint: PaidOperationHostedProofPacket['scenarios'][number]['checkpoints'][number],
): z.infer<typeof projectionSchema> | undefined {
  if (scenario.actorClass === 'human') {
    return checkpoint.agent === null
      ? checkpoint.human?.projection
      : undefined
  }
  return checkpoint.human === null
    ? checkpoint.agent ?? undefined
    : undefined
}

function continuationKinds(semantics: JsonValue): readonly string[] {
  const values = readPath(semantics, ['continuations'])
  if (!Array.isArray(values)) return []
  return values.map((value) => isRecord(value) && typeof value.kind === 'string'
    ? value.kind
    : '')
}

function semanticsMatchObservation(
  semantics: JsonValue,
  scenario: PaidOperationHostedProofPacket['scenarios'][number],
  observed: z.infer<typeof invocationObservationSchema>,
  responseLost: boolean,
): boolean {
  return readPath(semantics, ['identity', 'invocationRef']) === scenario.invocationRef
    && readPath(semantics, ['identity', 'expectedInvocationVersion'])
      === observed.invocationVersion
    && readPath(semantics, ['operation', 'providerId']) === observed.providerId
    && readPath(semantics, ['operation', 'operationKey']) === observed.operationKey
    && readPath(semantics, ['operation', 'operationRevision'])
      === observed.operationRevision
    && readPath(semantics, ['environment', 'evidenceClass'])
      === 'hosted_labelled_mock_candidate'
    && readPath(semantics, ['queryRelease', 'state']) === 'released'
    && readPath(semantics, ['paymentAuthorization', 'state']) === 'created'
    && readPath(semantics, ['paymentSubmission', 'state']) === 'observed'
    && readPath(semantics, ['settlement', 'state']) === 'settled'
    && readPath(semantics, ['resultDelivery', 'state'])
      === (responseLost ? 'not_delivered' : 'valid')
    && observed.currentTruth.control === 'terminal'
    && observed.currentTruth.payment === 'settled'
    && observed.currentTruth.delivery === (responseLost ? 'not_delivered' : 'valid')
    && observed.currentTruth.observedResolution === (responseLost ? 'pending' : 'returned')
}

function observationDigestsValid(
  observation: z.infer<typeof sourceObservationSchema>,
): boolean {
  for (const invocation of observation.invocations) {
    const { observationDigest, ...unsignedInvocation } = invocation
    if (observationDigest !== canonicalProofDigest(unsignedInvocation)) return false
  }
  const {
    kind: _kind,
    observationDigest,
    ...unsignedObservation
  } = observation
  return observationDigest === canonicalProofDigest(unsignedObservation)
}

function rawCommandsMatchTransitions(
  commands: readonly z.infer<typeof commandObservationSchema>[],
  transitions: readonly z.infer<typeof transitionSchema>[],
): boolean {
  const observed = commands.map((command) => ({
    commandIdentityDigest: command.commandIdentityDigest,
    invocationVersion: command.invocationVersion,
    effectGeneration: command.effectGeneration ?? null,
  })).sort(commandSort)
  const declared = transitions.map((transition) => ({
    commandIdentityDigest: transition.commandIdentityDigest,
    invocationVersion: transition.invocationVersion,
    effectGeneration: transition.effectGeneration,
  })).sort(commandSort)
  return sameJson(observed, declared)
}

function commandSort(
  left: Readonly<{
    commandIdentityDigest: string
    invocationVersion: number
    effectGeneration: number | null
  }>,
  right: Readonly<{
    commandIdentityDigest: string
    invocationVersion: number
    effectGeneration: number | null
  }>,
): number {
  return left.invocationVersion - right.invocationVersion
    || left.commandIdentityDigest.localeCompare(right.commandIdentityDigest)
}

function expectedScenario(index: number) {
  if (index === 0) return {
    actorClass: 'human',
    providerId: 'provider:a',
    operationKey: 'btc-usd-a',
    transitions: [
      expectedTransition('created', 1, false, false, null, ['authorize']),
      expectedTransition('authorized', 2, false, false, null, ['execute']),
      expectedTransition('release_started', 4, true, false, 1, []),
      expectedTransition('completed', 5, true, true, 1, ['inspect']),
    ],
  } as const
  if (index === 1) return {
    actorClass: 'agent',
    providerId: 'provider:a',
    operationKey: 'btc-usd-a',
    transitions: [
      expectedTransition('created', 1, false, false, null, ['authorize']),
      expectedTransition('authorized', 2, false, false, null, ['execute']),
      expectedTransition('release_started', 4, true, false, 1, []),
      expectedTransition('completed', 5, true, true, 1, ['inspect']),
    ],
  } as const
  return {
    actorClass: 'agent_goblin',
    providerId: 'provider:b',
    operationKey: 'btc-usd-b',
    transitions: [
      expectedTransition('created', 1, false, false, null, ['authorize']),
      expectedTransition('authorized', 2, false, false, null, ['execute']),
      expectedTransition('release_started', 4, true, false, 1, []),
      expectedTransition('response_lost', 5, true, true, 1, ['reconcile']),
      {
        ...expectedTransition('reconciled', 6, true, true, 1, ['inspect']),
        reconciliationInput: {
          command: 'reconcile',
          expectedInvocationVersion: 5,
        },
      },
    ],
  } as const
}

function expectedTransition(
  stage: string,
  invocationVersion: number,
  requiresAttempt: boolean,
  requiresEffect: boolean,
  effectGeneration: 1 | null,
  continuations: readonly string[],
) {
  return {
    stage,
    invocationVersion,
    requiresAttempt,
    requiresEffect,
    effectGeneration,
    continuations,
  }
}

function transitionsMatch(
  actual: readonly z.infer<typeof transitionSchema>[],
  expected: ReturnType<typeof expectedScenario>['transitions'],
): boolean {
  if (actual.length !== expected.length) return false
  return actual.every((transition, index) => {
    const target = expected[index]
    if (target === undefined) return false
    const common = transition.stage === target.stage
      && transition.invocationVersion === target.invocationVersion
      && (transition.attemptIdentityDigest !== null) === target.requiresAttempt
      && (transition.effectObservationDigest !== null) === target.requiresEffect
      && transition.effectGeneration === target.effectGeneration
      && sameJson(transition.continuations, target.continuations)
    if (!common) return false
    if (transition.stage === 'reconciled') {
      return transition.reconciliationInput?.command === 'reconcile'
        && transition.reconciliationInput.expectedInvocationVersion === 5
        && Object.keys(transition.reconciliationInput).sort().join(',')
          === 'command,commandId,expectedInvocationVersion'
    }
    return transition.reconciliationInput === undefined
  })
}

export function refused(
  code: PaidOperationHostedProofFailureCode,
): Readonly<{ kind: 'refused'; code: PaidOperationHostedProofFailureCode }> {
  return { kind: 'refused', code }
}

function declaredScenarioShapeInvalid(value: unknown): boolean {
  if (!isRecord(value)) return false
  const order = value.scenarioOrder
  const scenarios = value.scenarios
  return Array.isArray(order) && !sameJson(order, EXPECTED_SCENARIO_ORDER)
    || Array.isArray(scenarios) && scenarios.length !== 3
}

function containsForbiddenReconciliationTruth(value: unknown): boolean {
  return containsKey(value, /^(?:reconciliationEvidence|reconciliationTruth|trustedObservation|observedEffect|observedPayment)$/u)
}

function containsRawMaterial(value: unknown): boolean {
  if (containsKey(
    value,
    /^(?:.*(?:apiKey|apiToken|adminKey|sessionToken|secretKey|authorizationHeader|authHeader|providerResponse|paymentPayload|evidencePreimage|custodyPreimage)|jwt|secret)$/iu,
  )) {
    return true
  }
  return containsString(
    value,
    /^(?:Bearer\s+\S+|sk_(?:live|test)_\S+|ak_\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/u,
  )
}

function containsKey(value: unknown, pattern: RegExp): boolean {
  if (Array.isArray(value)) return value.some((entry) => containsKey(entry, pattern))
  if (!isRecord(value)) return false
  return Object.entries(value).some(
    ([key, entry]) => pattern.test(key) || containsKey(entry, pattern),
  )
}

function containsValue(value: unknown, expected: string): boolean {
  if (value === expected) return true
  if (Array.isArray(value)) return value.some((entry) => containsValue(entry, expected))
  if (!isRecord(value)) return false
  return Object.values(value).some((entry) => containsValue(entry, expected))
}

function containsString(value: unknown, pattern: RegExp): boolean {
  if (typeof value === 'string') return pattern.test(value)
  if (Array.isArray(value)) return value.some((entry) => containsString(entry, pattern))
  if (!isRecord(value)) return false
  return Object.values(value).some((entry) => containsString(entry, pattern))
}

export function readPath(value: JsonValue, path: readonly string[]): JsonValue | undefined {
  let current: JsonValue | undefined = value
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key] as JsonValue | undefined
  }
  return current
}

export function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right)
}

export function proofReferenceDigest(
  cohortDigest: string,
  kind: string,
  value: JsonValue,
): string {
  return canonicalProofDigest({ cohortDigest, kind, value })
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non_finite_canonical_value')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (!isRecord(value)) throw new Error('unsupported_canonical_value')
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(
    (key) => `${JSON.stringify(key)}:${stableJson(record[key] ?? null)}`,
  ).join(',')}}`
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
