import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { z } from 'zod'

export const PAID_OPERATION_HOSTED_PROOF_SCHEMA =
  'agentic-paid-operation-hosted-proof:v1' as const
export const PAID_OPERATION_HOSTED_EVIDENCE_CLASS =
  'authenticated_exact_revision_hosted_sandbox' as const
export const PAID_OPERATION_PACKET_INTEGRITY_CLASS =
  'local_packet_integrity_only' as const

const EXPECTED_SCENARIO_ORDER = [
  'shared_human_agent_provider_a_golden',
  'agent_provider_a_golden',
  'provider_b_response_lost_uncertainty_goblin',
] as const
const EXPECTED_AUTOMATED_INSTRUMENT_DIGEST =
  'sha256:526b009ddbf476758a06abf5768fe8459a1a5c29411c98ebfd5d131084452719' as const
const EXPECTED_RESIDUAL_REVIEW_DATE = '2026-08-21' as const
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

type JsonValue =
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

const sourceSchema = z.strictObject({
  expectedRevision: revisionSchema,
  expectedTree: z.string().regex(/^[0-9a-f]{40}$/u),
  observedRevision: revisionSchema,
  observedTree: z.string().regex(/^[0-9a-f]{40}$/u),
  clean: z.boolean(),
})
const deploymentSchema = z.strictObject({
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
const environmentSchema = z.strictObject({
  name: z.literal('hosted-labelled-mock-sandbox-candidate'),
  evidenceClass: z.literal('hosted_labelled_mock_candidate'),
  claimCeiling: z.literal('pending_authenticated_exact_revision_readback'),
})
const projectionSchema = z.strictObject({
  schema: z.literal('agentic-paid-operation:v1'),
  semantics: jsonValueSchema,
  semanticDigest: digestSchema,
  observedVersion: z.number().int().positive(),
  evidenceClass: z.literal('hosted_labelled_mock_candidate'),
})
const transitionSchema = z.strictObject({
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
  attemptCount: z.number().int().nonnegative(),
  effectCount: z.number().int().nonnegative(),
  effectGenerationCount: z.number().int().nonnegative(),
  reservationState: z.enum(['active', 'released']),
  continuations: z.array(z.string().min(1)).max(3),
  reconciliationInput: z.strictObject({
    command: z.literal('reconcile'),
    commandId: z.string().min(1),
    expectedInvocationVersion: z.number().int().positive(),
  }).optional(),
})
const scenarioSchema = z.strictObject({
  scenario: z.enum(EXPECTED_SCENARIO_ORDER),
  actorClass: z.enum(['shared_human_agent', 'agent', 'agent_goblin']),
  invocationRef: z.string().min(1),
  providerId: z.enum(['provider:a', 'provider:b']),
  operationKey: z.enum(['btc-usd-a', 'btc-usd-b']),
  operationRevision: z.string().min(1),
  transitions: z.array(transitionSchema).min(4).max(5),
  projections: z.strictObject({
    humanWarm: projectionSchema,
    humanCold: projectionSchema,
    agentWarm: projectionSchema,
    agentCold: projectionSchema,
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
const sourceObservationSchema = z.strictObject({
  kind: z.literal('observed'),
  schema: z.literal('phase3c-paid-operation-proof-observation:v1'),
  policy: z.strictObject({
    policyRef: z.literal('phase-3c-hosted-paid-operation-trial'),
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
const packetContentSchema = z.strictObject({
  schema: z.literal(PAID_OPERATION_HOSTED_PROOF_SCHEMA),
  collectedAs: z.literal('hosted_candidate'),
  source: sourceSchema,
  deployment: deploymentSchema,
  convex: z.strictObject({
    deploymentIdentity: z.string().url(),
    sourceRevision: revisionSchema,
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
const packetSchema = packetContentSchema.extend({
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
  | 'live_admission_context_required'
  | 'live_source_mismatch'
  | 'live_vercel_control_plane_mismatch'
  | 'live_convex_observation_mismatch'
  | 'live_human_readback_mismatch'
  | 'live_agent_readback_mismatch'
  | 'live_collection_failed'

const authoritativeEvidenceSchema = z.strictObject({
  source: sourceSchema,
  vercel: deploymentSchema,
  convex: z.strictObject({
    deploymentIdentity: z.string().url(),
    sourceRevision: revisionSchema,
    observation: sourceObservationSchema,
  }),
  human: z.strictObject({
    actor: packetContentSchema.shape.actors.shape.human,
    projections: z.array(z.strictObject({
      invocationRef: z.string().min(1),
      warm: projectionSchema,
      cold: projectionSchema,
    })).length(3),
  }),
  agent: z.strictObject({
    actor: packetContentSchema.shape.actors.shape.agent,
    projections: z.array(z.strictObject({
      invocationRef: z.string().min(1),
      warm: projectionSchema,
      cold: projectionSchema,
    })).length(3),
  }),
})
const liveAdmissionContextSchema = z.strictObject({
  repositoryRoot: z.string().min(1),
  baseUrl: z.string().url().refine((value) => new URL(value).protocol === 'https:'),
  deploymentProtectionBypass: z.string().min(1).optional(),
  vercel: z.strictObject({
    apiToken: z.string().min(1),
    teamId: z.string().min(1).optional(),
    deploymentId: z.string().regex(/^dpl_[A-Za-z0-9]+$/u),
  }),
  human: z.strictObject({
    sessionToken: z.string().min(1),
  }),
  agent: z.strictObject({
    apiKey: z.string().min(1),
    credentialId: z.string().min(1),
    subject: z.string().min(1),
  }),
  convex: z.strictObject({
    deploymentIdentity: z.string().url(),
    adminKey: z.string().min(1),
  }),
})
const liveCollectionTargetSchema = z.strictObject({
  source: z.strictObject({
    expectedRevision: revisionSchema,
    expectedTree: z.string().regex(/^[0-9a-f]{40}$/u),
  }),
  deployment: z.strictObject({
    id: z.string().regex(/^dpl_[A-Za-z0-9]+$/u),
    productionUrl: z.string().min(1),
  }),
  scenarios: z.tuple([
    z.strictObject({
      scenario: z.literal(EXPECTED_SCENARIO_ORDER[0]),
      invocationRef: z.string().min(1),
      finalVersion: z.literal(5),
    }),
    z.strictObject({
      scenario: z.literal(EXPECTED_SCENARIO_ORDER[1]),
      invocationRef: z.string().min(1),
      finalVersion: z.literal(5),
    }),
    z.strictObject({
      scenario: z.literal(EXPECTED_SCENARIO_ORDER[2]),
      invocationRef: z.string().min(1),
      finalVersion: z.literal(6),
      reconciliationCommandId: z.string().min(1),
    }),
  ]),
  automatedInstrumentDigest: z.literal(EXPECTED_AUTOMATED_INSTRUMENT_DIGEST),
  residualReviewDate: z.literal(EXPECTED_RESIDUAL_REVIEW_DATE),
})
const vercelControlPlaneSchema = z.looseObject({
  id: z.string().min(1),
  url: z.string().min(1),
  readyState: z.string().min(1),
  target: z.string().min(1),
  alias: z.array(z.string().min(1)).optional(),
  meta: z.record(z.string(), z.unknown()),
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
    || packet.deployment.gitRef !== 'codex/phase3c-execution'
    || packet.deployment.repository !== 'renoz/agentic-economy'
    || packet.deployment.url === packet.deployment.productionUrl
      && packet.deployment.id.trim() === '') {
    return refused('deployment_assertion_mismatch')
  }
  if (packet.convex.sourceRevision !== packet.source.observedRevision) {
    return refused('convex_identity_mismatch')
  }
  if (packet.actors.human.principalDigest !== packet.actors.agent.principalDigest
    || packet.actors.human.callerDigest === packet.actors.agent.callerDigest
    || packet.actors.agent.requiredScopes.length !== 1
    || packet.actors.agent.requiredScopes[0] !== 'paid_operation:invoke') {
    return refused('actor_identity_mismatch')
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
    || packet.sourceObservation.counters.admittedInWindow !== 3) {
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
    if (index === 2 && !sameJson(
      readPath(scenario.projections.agentCold.semantics, ['continuations']),
      [{ kind: 'inspect' }],
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
      || observed.commands.some((command) =>
        command.principalDigest !== packet.actors.human.principalDigest
        || command.callerDigest !== expectedCallerDigest)
      || observed.attempts.some((attempt) =>
        attempt.actorPrincipalDigest !== packet.actors.human.principalDigest
        || attempt.actorCallerDigest !== expectedCallerDigest)) {
      return refused('actor_identity_mismatch')
    }
    if (observed.counts.attempts !== 1
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
      || effect.providerId !== scenario.providerId
      || effect.operationKey !== scenario.operationKey
      || effect.operationRevision !== scenario.operationRevision
      || effect.effect !== 'released'
      || effect.payment !== 'settled'
      || effect.delivery !== (index === 2 ? 'response_lost' : 'returned')) {
      return refused('effect_count_mismatch')
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
          'command-id',
          reconciliationInput.commandId,
        )) {
        return refused('transition_invariant_mismatch')
      }
    }
    const semantics = scenario.projections.agentCold.semantics
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
  if (packet.convex.deploymentIdentity !== evidence.convex.deploymentIdentity
    || packet.convex.sourceRevision !== evidence.convex.sourceRevision
    || !sameJson(packet.sourceObservation, evidence.convex.observation)) {
    return refused('live_convex_observation_mismatch')
  }
  if (!sameJson(packet.actors.human, evidence.human.actor)
    || !evidence.human.projections.every((projection, index) => {
      const scenario = packet.scenarios[index]
      return scenario !== undefined
        && projection.invocationRef === scenario.invocationRef
        && sameJson(projection.warm, scenario.projections.humanWarm)
        && sameJson(projection.cold, scenario.projections.humanCold)
    })) {
    return refused('live_human_readback_mismatch')
  }
  if (!sameJson(packet.actors.agent, evidence.agent.actor)
    || !evidence.agent.projections.every((projection, index) => {
      const scenario = packet.scenarios[index]
      return scenario !== undefined
        && projection.invocationRef === scenario.invocationRef
        && sameJson(projection.warm, scenario.projections.agentWarm)
        && sameJson(projection.cold, scenario.projections.agentCold)
    })) {
    return refused('live_agent_readback_mismatch')
  }
  return { kind: 'live_evidence_matches' }
}

export async function collectAndAdmitLivePaidOperationHostedEvidence(
  targetInput: unknown,
  contextInput: unknown,
): Promise<
  | Readonly<{
      kind: 'admitted'
      evidenceClass: typeof PAID_OPERATION_HOSTED_EVIDENCE_CLASS
      packet: PaidOperationHostedProofPacket
    }>
  | Readonly<{ kind: 'refused'; code: PaidOperationHostedProofFailureCode }>
> {
  const targetResult = liveCollectionTargetSchema.safeParse(targetInput)
  const contextResult = liveAdmissionContextSchema.safeParse(contextInput)
  if (!targetResult.success || !contextResult.success) {
    return refused('live_admission_context_required')
  }
  const target = targetResult.data
  const context = contextResult.data
  if (!liveContextMatchesTarget(target, context)) {
    return refused('live_admission_context_required')
  }
  const collected = await collectEvidenceForTarget(target, context)
  if (collected.kind === 'refused') return collected
  let packet: PaidOperationHostedProofPacket
  try {
    packet = buildPacketFromLiveEvidence(target, collected.evidence)
  } catch {
    return refused('live_collection_failed')
  }
  const integrity = verifyPacketIntegrity(packet)
  if (integrity.kind === 'refused') return integrity
  const matched = compareAuthoritativeLiveEvidence(packet, collected.evidence)
  if (matched.kind === 'refused') return matched
  return {
    kind: 'admitted',
    evidenceClass: PAID_OPERATION_HOSTED_EVIDENCE_CLASS,
    packet,
  }
}

export async function admitLivePaidOperationHostedEvidence(
  packetInput: unknown,
  contextInput: unknown,
): Promise<
  | Readonly<{
      kind: 'admitted'
      evidenceClass: typeof PAID_OPERATION_HOSTED_EVIDENCE_CLASS
      packetDigest: string
    }>
  | Readonly<{ kind: 'refused'; code: PaidOperationHostedProofFailureCode }>
> {
  const integrity = verifyPacketIntegrity(packetInput)
  if (integrity.kind === 'refused') return integrity
  if (!isRecord(contextInput)) return refused('live_admission_context_required')

  // The concrete live collector is added below and is the only path permitted
  // to call compareAuthoritativeLiveEvidence before minting the final class.
  const collected = await collectAuthoritativeLiveEvidence(packetInput, contextInput)
  if (collected.kind === 'refused') return collected
  const matched = compareAuthoritativeLiveEvidence(packetInput, collected.evidence)
  if (matched.kind === 'refused') return matched
  return {
    kind: 'admitted',
    evidenceClass: PAID_OPERATION_HOSTED_EVIDENCE_CLASS,
    packetDigest: integrity.packetDigest,
  }
}

async function collectAuthoritativeLiveEvidence(
  packetInput: unknown,
  contextInput: Record<string, unknown>,
): Promise<
  | Readonly<{ kind: 'collected'; evidence: AuthoritativePaidOperationLiveEvidence }>
  | Readonly<{ kind: 'refused'; code: PaidOperationHostedProofFailureCode }>
> {
  const packetResult = packetSchema.safeParse(packetInput)
  const contextResult = liveAdmissionContextSchema.safeParse(contextInput)
  if (!packetResult.success || !contextResult.success) {
    return refused('live_admission_context_required')
  }
  const packet = packetResult.data
  const context = contextResult.data
  const target = collectionTargetFromPacket(packet)
  if (!liveContextMatchesTarget(target, context)
    || normalizeUrl(context.baseUrl) !== normalizeUrl(`https://${packet.deployment.url}`)
      && normalizeUrl(context.baseUrl)
        !== normalizeUrl(`https://${packet.deployment.productionUrl}`)) {
    return refused('live_admission_context_required')
  }
  return await collectEvidenceForTarget(target, context)
}

async function collectEvidenceForTarget(
  target: PaidOperationHostedLiveCollectionTarget,
  context: z.infer<typeof liveAdmissionContextSchema>,
): Promise<
  | Readonly<{ kind: 'collected'; evidence: AuthoritativePaidOperationLiveEvidence }>
  | Readonly<{ kind: 'refused'; code: PaidOperationHostedProofFailureCode }>
> {
  try {
    const source = await collectLiveSource(target, context.repositoryRoot)
    const vercel = await collectVercelControlPlane(target, context)
    const agent = await collectAgentReadbacks(target, context)
    const human = await collectHumanReadbacks(target, context, agent.projections)
    const observation = await collectRawConvexObservation(target, context)
    const actorRefs = liveActorRefs(context)
    const evidence = authoritativeEvidenceSchema.parse({
      source,
      vercel,
      convex: {
        deploymentIdentity: context.convex.deploymentIdentity,
        sourceRevision: observation.policy.sourceRevision,
        observation,
      },
      human: {
        actor: {
          callerClass: 'authenticated_human_session',
          principalDigest: proofReferenceDigest('principal', actorRefs.humanPrincipalRef),
          callerDigest: proofReferenceDigest('caller', actorRefs.humanCallerRef),
        },
        projections: human.projections,
      },
      agent: {
        actor: {
          callerClass: 'authenticated_agent_api_key',
          principalDigest: proofReferenceDigest('principal', actorRefs.agentPrincipalRef),
          callerDigest: proofReferenceDigest('caller', actorRefs.agentCallerRef),
          requiredScopes: ['paid_operation:invoke'],
        },
        projections: agent.projections,
      },
    })
    return { kind: 'collected', evidence }
  } catch {
    return refused('live_collection_failed')
  }
}

function collectionTargetFromPacket(
  packet: PaidOperationHostedProofPacket,
): PaidOperationHostedLiveCollectionTarget {
  const reconciliationCommandId = packet.scenarios[2].transitions
    .find((transition) => transition.stage === 'reconciled')
    ?.reconciliationInput?.commandId
  if (reconciliationCommandId === undefined) {
    throw new Error('reconciliation_command_id_missing')
  }
  return liveCollectionTargetSchema.parse({
    source: {
      expectedRevision: packet.source.expectedRevision,
      expectedTree: packet.source.expectedTree,
    },
    deployment: {
      id: packet.deployment.id,
      productionUrl: packet.deployment.productionUrl,
    },
    scenarios: packet.scenarios.map((scenario, index) => ({
      scenario: scenario.scenario,
      invocationRef: scenario.invocationRef,
      finalVersion: index === 2 ? 6 : 5,
      ...(index === 2 ? { reconciliationCommandId } : {}),
    })),
    automatedInstrumentDigest: packet.comprehension.automated.instrumentDigest,
    residualReviewDate: packet.residualRecords.reviewDate,
  })
}

function liveContextMatchesTarget(
  target: PaidOperationHostedLiveCollectionTarget,
  context: z.infer<typeof liveAdmissionContextSchema>,
): boolean {
  return context.vercel.deploymentId === target.deployment.id
    && context.convex.deploymentIdentity.trim() !== ''
    && normalizeUrl(context.baseUrl)
      === normalizeUrl(`https://${target.deployment.productionUrl}`)
}

function buildPacketFromLiveEvidence(
  target: PaidOperationHostedLiveCollectionTarget,
  evidence: AuthoritativePaidOperationLiveEvidence,
): PaidOperationHostedProofPacket {
  const scenarios = target.scenarios.map((targetScenario, index) => {
    const observed = evidence.convex.observation.invocations[index]
    const humanProjection = evidence.human.projections[index]
    const agentProjection = evidence.agent.projections[index]
    if (observed === undefined
      || humanProjection === undefined
      || agentProjection === undefined
      || observed.invocationRef !== targetScenario.invocationRef
      || humanProjection.invocationRef !== targetScenario.invocationRef
      || agentProjection.invocationRef !== targetScenario.invocationRef) {
      throw new Error('live_scenario_observation_missing')
    }
    return {
      scenario: targetScenario.scenario,
      actorClass: index === 0
        ? 'shared_human_agent'
        : index === 1
          ? 'agent'
          : 'agent_goblin',
      invocationRef: targetScenario.invocationRef,
      providerId: observed.providerId,
      operationKey: observed.operationKey,
      operationRevision: observed.operationRevision,
      transitions: transitionsFromObservation(
        observed,
        index,
        index === 2 ? target.scenarios[2].reconciliationCommandId : undefined,
      ),
      projections: {
        humanWarm: humanProjection.warm,
        humanCold: humanProjection.cold,
        agentWarm: agentProjection.warm,
        agentCold: agentProjection.cold,
      },
    }
  })
  const providerA = evidence.convex.observation.invocations[0]
  const providerB = evidence.convex.observation.invocations[2]
  if (providerA === undefined || providerB === undefined) {
    throw new Error('live_provider_observation_missing')
  }
  const content = {
    schema: PAID_OPERATION_HOSTED_PROOF_SCHEMA,
    collectedAs: 'hosted_candidate',
    source: evidence.source,
    deployment: evidence.vercel,
    convex: {
      deploymentIdentity: evidence.convex.deploymentIdentity,
      sourceRevision: evidence.convex.sourceRevision,
    },
    actors: {
      human: evidence.human.actor,
      agent: evidence.agent.actor,
    },
    providers: [
      {
        providerKey: 'A',
        providerId: providerA.providerId,
        operationKey: providerA.operationKey,
        operationRevision: providerA.operationRevision,
        evidenceClass: 'labelled_mock',
      },
      {
        providerKey: 'B',
        providerId: providerB.providerId,
        operationKey: providerB.operationKey,
        operationRevision: providerB.operationRevision,
        evidenceClass: 'labelled_mock',
      },
    ],
    scenarioOrder: [...EXPECTED_SCENARIO_ORDER],
    scenarios,
    sourceObservation: evidence.convex.observation,
    comprehension: {
      human: {
        status: 'NOT_RUN',
        evidenceClass: 'declared_human_comprehension_session',
      },
      automated: {
        status: 'PASS',
        evidenceClass: 'automated_model_comprehension_adjunct',
        instrumentDigest: target.automatedInstrumentDigest,
      },
    },
    residualRecords: {
      posture: 'retain_until_review_then_retire',
      reviewDate: target.residualReviewDate,
      killSwitchOwnerDigest:
        evidence.convex.observation.policy.killSwitchOwnerDigest,
      expectedRecordClasses: [
        'policy',
        'counter',
        'reservation',
        'aggregate',
        'command',
        'attempt',
        'mock_effect',
      ],
    },
    claimCeiling: 'pending_live_evidence_admission',
  }
  return packetSchema.parse(collectPaidOperationHostedProofPacket(content))
}

function transitionsFromObservation(
  observed: z.infer<typeof invocationObservationSchema>,
  scenarioIndex: number,
  reconciliationCommandId: string | undefined,
): z.infer<typeof transitionSchema>[] {
  const expected = expectedScenario(scenarioIndex).transitions
  return expected.map((transition) => {
    const commands = observed.commands.filter(
      (command) => command.invocationVersion === transition.invocationVersion,
    )
    if (commands.length !== 1) throw new Error('live_command_version_not_exact')
    return transitionSchema.parse({
      ...transition,
      commandIdentityDigest: commands[0]!.commandIdentityDigest,
      ...(transition.stage !== 'reconciled'
        ? {}
        : {
            reconciliationInput: {
              command: 'reconcile',
              commandId: reconciliationCommandId,
              expectedInvocationVersion: 5,
            },
          }),
    })
  })
}

async function collectLiveSource(
  target: PaidOperationHostedLiveCollectionTarget,
  repositoryRoot: string,
): Promise<z.infer<typeof sourceSchema>> {
  const [revision, tree, status] = await Promise.all([
    execFileUtf8('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD']),
    execFileUtf8('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD^{tree}']),
    execFileUtf8('git', ['-C', repositoryRoot, 'status', '--porcelain=v1']),
  ])
  return sourceSchema.parse({
    expectedRevision: target.source.expectedRevision,
    expectedTree: target.source.expectedTree,
    observedRevision: revision.trim(),
    observedTree: tree.trim(),
    clean: status.trim() === '',
  })
}

async function collectVercelControlPlane(
  target: PaidOperationHostedLiveCollectionTarget,
  context: z.infer<typeof liveAdmissionContextSchema>,
): Promise<z.infer<typeof deploymentSchema>> {
  const endpoint = new URL(
    `/v13/deployments/${encodeURIComponent(context.vercel.deploymentId)}`,
    'https://api.vercel.com',
  )
  if (context.vercel.teamId !== undefined) {
    endpoint.searchParams.set('teamId', context.vercel.teamId)
  }
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${context.vercel.apiToken}`,
    },
    redirect: 'error',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('vercel_control_plane_unavailable')
  const value = vercelControlPlaneSchema.parse(await response.json())
  const gitSha = stringMetadata(value.meta, 'githubCommitSha')
  const gitRef = stringMetadata(value.meta, 'githubCommitRef')
  const repository = `${stringMetadata(value.meta, 'githubCommitOrg')}/${
    stringMetadata(value.meta, 'githubCommitRepo')
  }`
  const aliases = value.alias ?? []
  if (!aliases.includes(target.deployment.productionUrl)) {
    throw new Error('vercel_production_alias_not_bound')
  }
  const deployment = deploymentSchema.parse({
    provider: 'vercel',
    id: value.id,
    url: value.url,
    productionUrl: target.deployment.productionUrl,
    gitSha,
    gitRef,
    repository,
    readyState: value.readyState,
    target: value.target,
  })
  const served = await fetch(context.baseUrl, {
    method: 'GET',
    headers: deploymentHeaders(context),
    redirect: 'error',
    cache: 'no-store',
  })
  if (!served.ok) throw new Error('vercel_bound_alias_unreachable')
  return deployment
}

async function collectAgentReadbacks(
  target: PaidOperationHostedLiveCollectionTarget,
  context: z.infer<typeof liveAdmissionContextSchema>,
) {
  const passes: Array<Array<z.infer<typeof projectionSchema>>> = []
  for (let pass = 0; pass < 2; pass += 1) {
    const projections: Array<z.infer<typeof projectionSchema>> = []
    for (const scenario of target.scenarios) {
      const finalVersion = scenario.finalVersion
      const endpoint = new URL(
        `/api/v1/paid-operations/${encodeURIComponent(scenario.invocationRef)}`,
        context.baseUrl,
      )
      endpoint.searchParams.set('expectedInvocationVersion', String(finalVersion))
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          ...deploymentHeaders(context),
          Accept: 'application/json',
          Authorization: `Bearer ${context.agent.apiKey}`,
        },
        redirect: 'error',
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('agent_readback_unavailable')
      projections.push(normalizeAgentProjection(await response.json()))
    }
    passes.push(projections)
  }
  return {
    projections: target.scenarios.map((scenario, index) => ({
      invocationRef: scenario.invocationRef,
      warm: passes[0]![index]!,
      cold: passes[1]![index]!,
    })),
  }
}

async function collectHumanReadbacks(
  target: PaidOperationHostedLiveCollectionTarget,
  context: z.infer<typeof liveAdmissionContextSchema>,
  agentProjections: readonly Readonly<{
    invocationRef: string
    warm: z.infer<typeof projectionSchema>
    cold: z.infer<typeof projectionSchema>
  }>[],
) {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({ headless: true })
  try {
    const passes: Array<Array<Readonly<{
      semanticDigest: string
      observedVersion: number
      evidenceClass: string
    }>>> = []
    for (let pass = 0; pass < 2; pass += 1) {
      const browserContext = await browser.newContext({
        extraHTTPHeaders: {
          ...deploymentHeaders(context),
          Authorization: `Bearer ${context.human.sessionToken}`,
        },
        serviceWorkers: 'block',
      })
      try {
        const page = await browserContext.newPage()
        const observations = []
        for (const scenario of target.scenarios) {
          const finalVersion = scenario.finalVersion
          const url = new URL(
            `/actions/paid/${encodeURIComponent(scenario.invocationRef)}`,
            context.baseUrl,
          )
          url.searchParams.set('expectedInvocationVersion', String(finalVersion))
          const response = await page.goto(url.href, { waitUntil: 'networkidle' })
          if (response === null || !response.ok()) throw new Error('human_readback_unavailable')
          const card = page.locator(
            '[data-semantic-digest][data-invocation-version][data-evidence-class]',
          )
          await card.waitFor({ state: 'visible' })
          const body = await card.innerText()
          const requiredTruth = [
            'Payment request',
            'Observed by provider',
            'Settlement',
            '$0.01 settled in recorded sandbox evidence',
            'Result',
            scenario.scenario === EXPECTED_SCENARIO_ORDER[2] ? 'Not received' : 'Validated',
          ]
          if (requiredTruth.some((value) => !body.includes(value))) {
            throw new Error('human_truth_sections_missing')
          }
          observations.push({
            semanticDigest: await card.getAttribute('data-semantic-digest') ?? '',
            observedVersion: Number(await card.getAttribute('data-invocation-version')),
            evidenceClass: await card.getAttribute('data-evidence-class') ?? '',
          })
        }
        passes.push(observations)
      } finally {
        await browserContext.close()
      }
    }
    return {
      projections: target.scenarios.map((scenario, index) => {
        const warmAgent = agentProjections[index]?.warm
        const coldAgent = agentProjections[index]?.cold
        const warmDom = passes[0]?.[index]
        const coldDom = passes[1]?.[index]
        if (warmAgent === undefined || coldAgent === undefined
          || warmDom === undefined || coldDom === undefined
          || warmDom.semanticDigest !== warmAgent.semanticDigest
          || coldDom.semanticDigest !== coldAgent.semanticDigest
          || warmDom.observedVersion !== warmAgent.observedVersion
          || coldDom.observedVersion !== coldAgent.observedVersion
          || warmDom.evidenceClass !== 'hosted_labelled_mock_candidate'
          || coldDom.evidenceClass !== 'hosted_labelled_mock_candidate') {
          throw new Error('human_agent_semantics_diverged')
        }
        return {
          invocationRef: scenario.invocationRef,
          warm: warmAgent,
          cold: coldAgent,
        }
      }),
    }
  } finally {
    await browser.close()
  }
}

async function collectRawConvexObservation(
  target: PaidOperationHostedLiveCollectionTarget,
  context: z.infer<typeof liveAdmissionContextSchema>,
): Promise<z.infer<typeof sourceObservationSchema>> {
  const cli = resolve(context.repositoryRoot, 'node_modules/convex/bin/main.js')
  const stdout = await execFileUtf8(process.execPath, [
    cli,
    'run',
    'hostedPaidOperation:phase3CHostedProofObservation',
    JSON.stringify({
      invocationRefs: target.scenarios.map((scenario) => scenario.invocationRef),
    }),
    '--url',
    context.convex.deploymentIdentity,
    '--admin-key',
    context.convex.adminKey,
  ], context.repositoryRoot)
  return sourceObservationSchema.parse(JSON.parse(stdout))
}

function normalizeAgentProjection(value: unknown): z.infer<typeof projectionSchema> {
  if (!isRecord(value)
    || value.kind !== 'accepted'
    || value.schema !== 'agentic-paid-operation:v1'
    || !isRecord(value.projection)
    || !isRecord(value.environment)) {
    throw new Error('agent_projection_invalid')
  }
  const semantics = value.projection.semantics
  const semanticDigest = value.projection.semanticDigest
  if (typeof semanticDigest !== 'string'
    || semanticDigest !== canonicalProofDigest(semantics)) {
    throw new Error('agent_projection_digest_invalid')
  }
  return projectionSchema.parse({
    schema: value.schema,
    semantics,
    semanticDigest,
    observedVersion: value.expectedInvocationVersion,
    evidenceClass: value.environment.evidenceClass,
  })
}

function liveActorRefs(context: z.infer<typeof liveAdmissionContextSchema>) {
  const payload = decodeJwtPayload(context.human.sessionToken)
  if (typeof payload.sub !== 'string'
    || typeof payload.sid !== 'string'
    || payload.sub !== context.agent.subject) {
    throw new Error('live_actor_identity_mismatch')
  }
  return {
    humanPrincipalRef: payload.sub,
    humanCallerRef: payload.sid,
    agentPrincipalRef: context.agent.subject,
    agentCallerRef: `clerk_api_key:${context.agent.credentialId}`,
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  if (payload === undefined) throw new Error('human_session_token_invalid')
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
}

function proofReferenceDigest(kind: string, value: string): string {
  return canonicalProofDigest({ kind, value })
}

function stringMetadata(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('vercel_git_metadata_missing')
  }
  return value
}

function deploymentHeaders(
  context: z.infer<typeof liveAdmissionContextSchema>,
): Record<string, string> {
  return context.deploymentProtectionBypass === undefined
    ? {}
    : { 'x-vercel-protection-bypass': context.deploymentProtectionBypass }
}

function normalizeUrl(value: string): string {
  const url = new URL(value)
  url.hash = ''
  url.search = ''
  return url.href.replace(/\/$/u, '')
}

function execFileUtf8(
  file: string,
  args: readonly string[],
  cwd?: string,
): Promise<string> {
  return new Promise((resolveOutput, rejectOutput) => {
    execFileCallback(file, args, {
      ...(cwd === undefined ? {} : { cwd }),
      encoding: 'utf8',
      timeout: 45_000,
      maxBuffer: 2 * 1024 * 1024,
    }, (error, stdout) => {
      if (error !== null) rejectOutput(error)
      else resolveOutput(stdout)
    })
  })
}

function verifyScenarioProjections(
  scenario: PaidOperationHostedProofPacket['scenarios'][number],
): 'projection_semantics_mismatch' | undefined {
  const projections = Object.values(scenario.projections)
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
    effectGeneration: transition.effectGenerationCount === 0 ? null : 1,
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
    actorClass: 'shared_human_agent',
    providerId: 'provider:a',
    operationKey: 'btc-usd-a',
    transitions: [
      expectedTransition('created', 1, 0, 0, 0, 'active', ['authorize']),
      expectedTransition('authorized', 2, 0, 0, 0, 'active', ['execute']),
      expectedTransition('release_started', 4, 1, 0, 1, 'active', []),
      expectedTransition('completed', 5, 1, 1, 1, 'released', ['inspect']),
    ],
  } as const
  if (index === 1) return {
    actorClass: 'agent',
    providerId: 'provider:a',
    operationKey: 'btc-usd-a',
    transitions: [
      expectedTransition('created', 1, 0, 0, 0, 'active', ['authorize']),
      expectedTransition('authorized', 2, 0, 0, 0, 'active', ['execute']),
      expectedTransition('release_started', 4, 1, 0, 1, 'active', []),
      expectedTransition('completed', 5, 1, 1, 1, 'released', ['inspect']),
    ],
  } as const
  return {
    actorClass: 'agent_goblin',
    providerId: 'provider:b',
    operationKey: 'btc-usd-b',
    transitions: [
      expectedTransition('created', 1, 0, 0, 0, 'active', ['authorize']),
      expectedTransition('authorized', 2, 0, 0, 0, 'active', ['execute']),
      expectedTransition('release_started', 4, 1, 0, 1, 'active', []),
      expectedTransition('response_lost', 5, 1, 1, 1, 'active', ['reconcile']),
      {
        ...expectedTransition('reconciled', 6, 1, 1, 1, 'released', ['inspect']),
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
  attemptCount: number,
  effectCount: number,
  effectGenerationCount: number,
  reservationState: string,
  continuations: readonly string[],
) {
  return {
    stage,
    invocationVersion,
    attemptCount,
    effectCount,
    effectGenerationCount,
    reservationState,
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
      && transition.attemptCount === target.attemptCount
      && transition.effectCount === target.effectCount
      && transition.effectGenerationCount === target.effectGenerationCount
      && transition.reservationState === target.reservationState
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

function refused(
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

function readPath(value: JsonValue, path: readonly string[]): JsonValue | undefined {
  let current: JsonValue | undefined = value
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key] as JsonValue | undefined
  }
  return current
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function main(): Promise<void> {
  if (process.argv[2] !== '--verify-packet-integrity') {
    throw new Error('usage: --verify-packet-integrity')
  }
  const packetJson = process.env.AE_PAID_OPERATION_HOSTED_PACKET_JSON
  if (packetJson === undefined || packetJson.trim() === '') {
    throw new Error('AE_PAID_OPERATION_HOSTED_PACKET_JSON is required')
  }
  const result = verifyPacketIntegrity(JSON.parse(packetJson))
  if (result.kind === 'refused') throw new Error(result.code)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? `FAIL ${error.message}` : 'FAIL unexpected_error')
    process.exitCode = 1
  })
}
