import {
  buildDynamicPublishedInput,
  assertDynamicPublishedSnapshotShape,
  materialDigest,
  projectRichInvocationTask,
  projectStructuredInvocationTask,
  readDevelopmentHostSnapshot,
  verifyDynamicPublishedSnapshot,
  type DevelopmentHostReadReceipt,
  type DevelopmentHostSemanticRead,
  type DynamicPublishedAdapterSnapshot,
  type DynamicPublishedSnapshotAnchors,
} from '@/modules/action-invocation'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  buildDevelopmentPublishedOperationEvidence,
  projectDevelopmentPublishedOperationEvidence,
} from './development-published-operation-evidence'
import { materializeRuntimePublishedOperation } from './published-operation'
import {
  runDevelopmentHostScenarioMatrix,
  type DevelopmentHostScenarioRecord,
} from './development-host-scenarios'

export const developmentHostParityClaimCeiling =
  'Labelled local adapter/caller parity over mock transport, payment, and provider effects only; no hosted reachability, real-human usability, independent signing or root provenance, settlement, provider fulfilment, production safety, or customer value.'
export const developmentHostParitySourceBaseCommit =
  'ebe35bdbd3b4707b356607e8dc615d3e29babe8d'
function requireFirst<T>(values: readonly T[], error: string): T {
  const value = values[0]
  if (value === undefined) throw new Error(error)
  return value
}

type CanonicalValueRecord = { readonly [key: string]: StableHashValue }

function isCanonicalValueRecord(value: StableHashValue): value is CanonicalValueRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function canonicalValueRecord(value: StableHashValue | undefined): CanonicalValueRecord | undefined {
  if (value === undefined || !isCanonicalValueRecord(value)) return undefined
  return value
}


export type DevelopmentHostParityEvidence = Readonly<{
  format: 'action-invocation-host-parity:development:v2'
  environment: 'MOCK/DEVELOPMENT ONLY'
  provenance: Readonly<{
    sourceBaseCommit: string
    evidenceCommit: string
    evidenceTreeDigest: string
  }>
  fixture: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>
  hosts: readonly [DevelopmentHostScenarioRecord, DevelopmentHostScenarioRecord]
  hostReads: readonly [DevelopmentHostReadReceipt, DevelopmentHostReadReceipt]
  parity: Readonly<{
    sameFields: readonly string[]
    differentFields: readonly string[]
    sharedDigest: string
    requestDigest: string
    standaloneDigest: string
    normalizedScenarioDigests: readonly Readonly<{
      scenario: 'success' | 'released_refusal'
      requestDigest: string
      standaloneDigest: string
      matchedDigest: string
    }>[]
  }>
  evals: readonly Readonly<{ name: string; passed: boolean; evidenceDigest: string }>[]
  verdict: 'PASS_FOR_DECLARED_CLASS'
  claimCeiling: string
  packetDigest: string
}>
type DevelopmentHostParityEvidenceMaterial = Omit<DevelopmentHostParityEvidence, 'packetDigest'>

export function digestDevelopmentHostParityMaterial(
  material: DevelopmentHostParityEvidenceMaterial,
): string {
  const {
    format,
    environment,
    provenance,
    fixture,
    hosts,
    hostReads,
    parity,
    evals,
    verdict,
    claimCeiling,
  } = material
  return canonicalDigest({
    format,
    environment,
    provenance,
    fixtureDigest: canonicalDigest(projectDevelopmentPublishedOperationEvidence(fixture)),
    hosts: hosts.map((host) => ({
      host: host.host,
      actor: host.actor,
      clarificationDigest: canonicalDigest(host.clarification),
      correctionDigest: canonicalDigest(host.correction),
      successDigest: canonicalDigest(host.success),
      preflightRefusalDigest: canonicalDigest(host.preflightRefusal),
      sourceRefusalDigest: canonicalDigest(host.sourceRefusal),
      releasedRefusalDigest: canonicalDigest(host.releasedRefusal),
      uncertaintyDigest: canonicalDigest(host.uncertainty),
      timeoutDigest: canonicalDigest(host.timeout),
      staleFencesDigest: canonicalDigest(host.staleFences),
      coldResumeDigest: canonicalDigest(host.coldResume),
      completedResultReuseDigest: canonicalDigest(host.completedResultReuse),
    })),
    hostReadsDigest: canonicalDigest(hostReads),
    parityDigest: canonicalDigest(parity),
    evalsDigest: canonicalDigest(evals),
    verdict,
    claimCeiling,
  })
}

function assertDevelopmentHostParityEvidenceComponents(value: Readonly<{
  fixture: unknown
  provenance: unknown
  hosts: readonly DevelopmentHostScenarioRecord[]
  hostReads: unknown
  parity: unknown
  evals: unknown
}>): void {
  const components: readonly unknown[] = [
    value.fixture,
    value.provenance,
    value.hostReads,
    value.parity,
    value.evals,
    ...value.hosts.flatMap((host) => [
      host.actor,
      host.clarification,
      host.correction,
      host.success,
      host.preflightRefusal,
      host.sourceRefusal,
      host.releasedRefusal,
      host.uncertainty,
      host.timeout,
      host.staleFences,
      host.coldResume,
      host.completedResultReuse,
    ]),
  ]
  if (components.some((component) => !isBoundedJsonValue(component))) {
    throw new Error('host_parity_evidence_not_json_safe')
  }
}


export async function buildDevelopmentHostParityEvidence(provenance: Readonly<{
  sourceBaseCommit: string
  evidenceCommit: string
  evidenceTreeDigest: string
}>): Promise<DevelopmentHostParityEvidence> {
  assertHostParityProvenance(provenance)
  const fixture = buildDevelopmentPublishedOperationEvidence()
  const hosts = await runDevelopmentHostScenarioMatrix(fixture)
  const hostReads = [
    readDevelopmentHostSnapshot({
      host: 'request_owned_human',
      snapshot: hosts[0].success.snapshot,
    }),
    readDevelopmentHostSnapshot({
      host: 'standalone_external_agent',
      snapshot: hosts[1].success.snapshot,
    }),
  ] as const
  const parity = compareHostSemantics(hostReads, hosts)
  const evals = evaluateHostMatrix(hosts)
  if (evals.some((entry) => !entry.passed)) {
    throw new Error(
      `host_matrix_failed:${evals.filter((entry) => !entry.passed).map((entry) => entry.name).join(',')}`,
    )
  }
  const material = {
    format: 'action-invocation-host-parity:development:v2' as const,
    environment: 'MOCK/DEVELOPMENT ONLY' as const,
    provenance,
    fixture,
    hosts,
    hostReads,
    parity,
    evals,
    verdict: 'PASS_FOR_DECLARED_CLASS' as const,
    claimCeiling: developmentHostParityClaimCeiling,
  }
  const serializable = structuredClone({
    ...material,
    fixture: projectDevelopmentPublishedOperationEvidence(fixture),
  })
  assertDevelopmentHostParityEvidenceComponents(serializable)
  return Object.freeze({
    ...serializable,
    fixture: {
      ...serializable.fixture,
      descriptor: materializeRuntimePublishedOperation(serializable.fixture.operation),
    },
    packetDigest: digestDevelopmentHostParityMaterial(material),
  })
}

export function verifyHostSnapshots(packet: DevelopmentHostParityEvidence): void {
  for (const host of packet.hosts) {
    for (const [scenarioName, scenario] of Object.entries({
      success: host.success,
      preflightRefusal: host.preflightRefusal,
      sourceRefusal: host.sourceRefusal,
      releasedRefusal: host.releasedRefusal,
      uncertainty: host.uncertainty,
      timeout: host.timeout,
      coldResume: host.coldResume,
    })) {
      const expectedStatus = scenario.state === 'reconciliation_required' ? 'uncertain' : 'completed'
      const effectWasAdmitted = scenarioName === 'success'
        || scenarioName === 'releasedRefusal'
        || scenarioName === 'uncertainty'
        || scenarioName === 'timeout'
        || scenarioName === 'coldResume'
      try {
        if (scenarioName === 'releasedRefusal') {
          verifyReleasedRefusalSnapshot(
            packet,
            host,
            scenario as DevelopmentHostScenarioRecord['releasedRefusal'],
          )
          continue
        }
        verifyDynamicPublishedSnapshot({
          snapshot: scenario.snapshot,
          anchors: buildParitySnapshotAnchors({
            packet,
            host,
            snapshot: scenario.snapshot,
            invocationRef: scenario.invocationRef,
            authorityRef: scenario.authorityRef,
            expectedStatus,
            effectWasAdmitted,
          }),
        })
      } catch (error) {
        throw new Error(
          `host_snapshot_invalid:${host.host}:${scenarioName}:${error instanceof Error ? error.message : 'unknown'}`,
          { cause: error },
        )
      }
    }
    verifyDynamicPublishedSnapshot({
      snapshot: host.correction.snapshot,
      anchors: buildParitySnapshotAnchors({
        packet,
        host,
        snapshot: host.correction.snapshot,
        invocationRef: host.correction.invocationRef,
        authorityRef: host.correction.newAuthorityRef,
        expectedStatus: 'completed',
        effectWasAdmitted: true,
      }),
    })
    const gathering = host.clarification.gatheringSnapshot
    const gatheringWork = gathering.inputWork?.[0]
    const gatheringControl = gathering.controls[0]
    if (canonicalDigest(gathering.operations?.[0])
        !== canonicalDigest(packet.fixture.operation)
      || gatheringWork?.invocationRef !== host.clarification.invocationRef
      || gatheringWork.missingFields.join(',') !== 'convert'
      || gatheringWork.knownInput.symbol !== 'BTC'
      || gatheringControl?.control.control.state !== 'gathering_information'
      || gatheringControl.authorityBinding !== undefined
      || gathering.attempts.some(({ rows }) => rows.length > 0)) {
      throw new Error('host_clarification_snapshot_invalid')
    }
  }
}

function buildParitySnapshotAnchors(input: Readonly<{
  packet: DevelopmentHostParityEvidence
  host: DevelopmentHostScenarioRecord
  snapshot: DynamicPublishedAdapterSnapshot
  invocationRef: string
  authorityRef: string
  expectedStatus: 'completed' | 'uncertain'
  effectWasAdmitted: boolean
}>): DynamicPublishedSnapshotAnchors {
  const source = input.snapshot.sourceRows[0]
  const materialInput = buildDynamicPublishedInput({
    operation: input.packet.fixture.operation,
    descriptor: input.packet.fixture.descriptor,
    value: { symbol: 'BTC', convert: 'USD' },
  })
  return {
    operation: input.packet.fixture.operation,
    descriptor: input.packet.fixture.descriptor,
    actor: input.host.actor,
    origin: input.host.host === 'request_owned_human'
      ? { kind: 'request_owned', requestRef: 'request:host-parity-existing', revision: 7 }
      : {
          kind: 'standalone',
          callerRef: input.host.actor.callerRef,
          principalRef: input.host.actor.principalRef,
        },
    issuedAuthority: {
      reference: input.authorityRef,
      accepted: { kind: 'approve_each', authorityRef: input.authorityRef },
      materialInputDigest: materialDigest(
        materialInput,
        ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
      ),
    },
    expectedEffectCount: 1,
    ...(input.effectWasAdmitted && input.snapshot.paymentAttempts[0] !== undefined
      ? { expectedChallengeDigest: input.snapshot.paymentAttempts[0].challengeDigest }
      : {}),
    ...(input.effectWasAdmitted ? {
      expectedSemanticClaim: {
        ownerInvocationRef: input.invocationRef,
        status: input.expectedStatus,
        ...(source?.resultIdentity === undefined
          ? {}
          : { outcomeResultRef: source.resultIdentity.sourceResultRef }),
      },
    } : {}),
  }
}

function verifyReleasedRefusalSnapshot(
  packet: DevelopmentHostParityEvidence,
  host: DevelopmentHostScenarioRecord,
  scenario: DevelopmentHostScenarioRecord['releasedRefusal'],
): void {
  assertDynamicPublishedSnapshotShape(scenario.snapshot)
  const source = requireFirst(scenario.snapshot.sourceRows, 'released_refusal_source_missing')
  const control = requireFirst(scenario.snapshot.controls, 'released_refusal_control_missing')
  const attemptRecord = requireFirst(scenario.snapshot.attempts, 'released_refusal_attempt_missing')
  const attempt = requireFirst(attemptRecord.rows, 'released_refusal_attempt_row_missing')
  const claim = scenario.snapshot.semanticClaims[0]
  if (canonicalDigest(source.operation)
      !== canonicalDigest(packet.fixture.operation)
    || control.control.owner.callerRef !== host.actor.callerRef
    || control.control.owner.principalRef !== host.actor.principalRef
    || control.authorityBinding?.reference !== scenario.authorityRef
    || control.control.acceptedAuthority?.kind !== 'approve_each'
    || control.control.control.state !== 'reconciliation_required'
    || control.terminalResultReferenceable === true
    || attempt.release.state !== 'possibly_released'
    || attempt.outcome.state !== 'uncertain'
    || source.observedResolution.state === 'returned'
    || source.resultIdentity !== undefined
    || claim?.status !== 'uncertain'
    || claim.ownerInvocationRef !== scenario.invocationRef
    || claim.outcome?.observedResolution.state !== 'threw'
    || claim.outcome.observedResolution.message
      !== 'published_operation_payment_reconciliation_required:output_schema_invalid'
    || scenario.snapshot.paymentAttempts[0]?.state !== 'reconciliation_required'
    || scenario.effects.payment !== 1
    || scenario.effects.provider !== 1) {
    throw new Error('released_refusal_snapshot_semantics_invalid')
  }
}

export function evaluateHostMatrix(
  hosts: readonly [DevelopmentHostScenarioRecord, DevelopmentHostScenarioRecord],
) {
  const checks = [
    {
      name: 'authoritative_clarification_and_projection',
      passed: hosts.every((host) => {
        const rich = projectRichInvocationTask({
          invocationRef: host.clarification.invocationRef,
          expectedInvocationVersion: host.clarification.gatheringVersion,
          snapshot: host.clarification.gatheringSnapshot,
        })
        return host.clarification.missing.join(',') === 'convert'
          && host.clarification.sameLineage
          && host.clarification.preparedVersion > host.clarification.gatheringVersion
          && host.clarification.rich.semanticDigest === host.clarification.structured.semanticDigest
          && rich.semanticDigest === host.clarification.rich.semanticDigest
          && canonicalDigest(rich.semantics)
            === canonicalDigest(host.clarification.structured.semantics)
      }),
      evidence: hosts.map((host) => host.clarification),
    },
    {
      name: 'material_correction_real_authority_fence',
      passed: hosts.every((host) => {
        const rich = projectRichInvocationTask({
          invocationRef: host.correction.invocationRef,
          expectedInvocationVersion: host.correction.newVersion,
          snapshot: host.correction.projectionSnapshot,
        })
        const structured = projectStructuredInvocationTask({
          invocationRef: host.correction.invocationRef,
          expectedInvocationVersion: host.correction.newVersion,
          snapshot: host.correction.projectionSnapshot,
        })
        return host.correction.newVersion > host.correction.oldVersion
          && host.correction.oldAuthorityRef !== host.correction.newAuthorityRef
          && host.correction.staleAuthorityDecision === 'stale_invocation_version'
          && host.correction.staleExecution === 'stale_invocation_version'
          && host.correction.staleProjection === 'invocation_projection_stale_or_missing'
          && host.correction.presentationStateUnchanged
          && host.correction.effects.payment === 1
          && host.correction.effects.provider === 1
          && host.correction.terminalCorrection === 'invalid_control_state'
          && host.correction.releasedCorrection.state === 'reconciliation_required'
          && host.correction.releasedCorrection.refusal === 'invalid_control_state'
          && host.correction.releasedCorrection.snapshotUnchanged
          && host.correction.releasedCorrection.authorityUnchanged
          && host.correction.releasedCorrection.historyUnchanged
          && host.correction.releasedCorrection.effectsUnchanged
          && rich.semanticDigest === structured.semanticDigest
          && rich.semanticDigest === host.correction.rich.semanticDigest
          && structured.semanticDigest === host.correction.structured.semanticDigest
      }),
      evidence: hosts.map((host) => host.correction),
    },
    {
      name: 'success',
      passed: hosts.every((host) => host.success.state === 'terminal'
        && host.success.execution.includes('published_operation_succeeded')
        && host.success.effects.payment === 1
        && host.success.effects.provider === 1),
      evidence: hosts.map((host) => host.success),
    },
    {
      name: 'zero_effect_preflight_refusal',
      passed: hosts.every((host) => host.preflightRefusal.execution.includes('pre_release_refused')
        && host.preflightRefusal.effects.payment === 0
        && host.preflightRefusal.effects.provider === 0),
      evidence: hosts.map((host) => host.preflightRefusal),
    },
    {
      name: 'source_refusal',
      passed: hosts.every((host) => host.sourceRefusal.failureCode === 'operation_material_changed'
        && host.sourceRefusal.effects.payment === 0
        && host.sourceRefusal.effects.provider === 0),
      evidence: hosts.map((host) => host.sourceRefusal),
    },
    {
      name: 'post_release_source_refusal',
      passed: hosts.every((host) => host.releasedRefusal.state === 'reconciliation_required'
        && host.releasedRefusal.effects.payment === 1
        && host.releasedRefusal.effects.provider === 1
        && host.releasedRefusal.retryPosture === 'reconcile_before_retry'
        && host.releasedRefusal.snapshot.attempts[0]?.rows[0]?.release.state === 'possibly_released'
        && host.releasedRefusal.snapshot.paymentAttempts[0]?.state === 'reconciliation_required'),
      evidence: hosts.map((host) => host.releasedRefusal),
    },
    {
      name: 'provider_timeout_parity',
      passed: hosts.every((host) =>
        host.timeout.state === 'reconciliation_required'
        && host.timeout.execution === 'timed_out'
        && host.timeout.retryBeforeReconcile === 'reconcile_before_retry'
        && host.timeout.releaseClassification === 'possibly_released'
        && host.timeout.effects.payment === 1
        && host.timeout.effects.provider === 1),
      evidence: hosts.map((host) => host.timeout),
    },
    {
      name: 'uncertainty_reconcile_before_retry',
      passed: hosts.every((host) => host.uncertainty.state === 'reconciliation_required'
        && host.uncertainty.retryBeforeReconcile === 'reconcile_before_retry'
        && host.uncertainty.reconciledState === 'terminal'
        && host.uncertainty.effects.payment === 1
        && host.uncertainty.effects.provider === 1),
      evidence: hosts.map((host) => host.uncertainty),
    },
    {
      name: 'duplicate_stale_and_cancellation_fences',
      passed: hosts.every((host) => host.staleFences.duplicate === 'invalid_control_state'
        && host.staleFences.staleVersion === 'stale_invocation_version'
        && host.staleFences.staleGeneration === 'lease_not_current'
        && host.staleFences.unsupportedCancellation === 'invalid_control_state'
        && host.staleFences.effects.payment === 1
        && host.staleFences.effects.provider === 1),
      evidence: hosts.map((host) => host.staleFences),
    },
    {
      name: 'process_cold_resume_without_transcript_cache',
      passed: hosts.every((host) => host.coldResume.interruptedState === 'leased'
        && host.coldResume.resumedState === 'terminal'
        && host.coldResume.transcriptCache === 'deleted'
        && host.coldResume.effects.payment === 1
        && host.coldResume.effects.provider === 1),
      evidence: hosts.map((host) => host.coldResume),
    },
    {
      name: 'standalone_result_request_reference_only',
      passed: hosts[1].completedResultReuse.firstKind === 'attached'
        && hosts[1].completedResultReuse.secondKind === 'replayed'
        && hosts[1].completedResultReuse.bothNoEffect
        && hosts[1].completedResultReuse.referencePayloadAuthorityFree
        && hosts[1].completedResultReuse.controlSnapshotUnchanged
        && hosts[1].completedResultReuse.authorityRecordCountBefore
          === hosts[1].completedResultReuse.authorityRecordCountAfter
        && hosts[1].completedResultReuse.crossPrincipal === 'cross_principal_refused'
        && canonicalDigest(hosts[1].completedResultReuse.effectsBefore)
          === canonicalDigest(hosts[1].completedResultReuse.effectsAfter),
      evidence: hosts[1].completedResultReuse,
    },
  ]
  return checks.map(({ name, passed, evidence }) => Object.freeze({
    name,
    passed,
    evidenceDigest: canonicalDigest(evidence),
  }))
}

export function compareHostSemantics(
  reads: readonly [DevelopmentHostReadReceipt, DevelopmentHostReadReceipt],
  hosts: readonly [DevelopmentHostScenarioRecord, DevelopmentHostScenarioRecord],
): DevelopmentHostParityEvidence['parity'] {
  const request = reads[0].semanticRead
  const standalone = reads[1].semanticRead
  const shared = sharedSemantics(request)
  if (canonicalDigest(shared) !== canonicalDigest(sharedSemantics(standalone))) {
    throw new Error('host_shared_semantics_not_equal')
  }
  const differences = [
    request.identity.callerRef !== standalone.identity.callerRef,
    canonicalDigest(request.identity.origin)
      !== canonicalDigest(standalone.identity.origin),
    request.identity.invocationRef !== standalone.identity.invocationRef,
    request.authority.reference !== standalone.authority.reference,
    request.attempt?.attemptRef !== standalone.attempt?.attemptRef,
    request.attempt?.leaseOwner !== standalone.attempt?.leaseOwner,
    request.resolution.semanticOwnerRef !== standalone.resolution.semanticOwnerRef,
    request.resolution.resultIdentity !== standalone.resolution.resultIdentity,
  ]
  if (request.identity.principalRef !== standalone.identity.principalRef
    || differences.some((different) => !different)) {
    throw new Error('host_required_identity_difference_missing')
  }
  const normalizedScenarioDigests = ([
    ['success', hosts[0].success, hosts[1].success],
    ['released_refusal', hosts[0].releasedRefusal, hosts[1].releasedRefusal],
  ] as const).map(([scenario, requestScenario, standaloneScenario]) => {
    const requestDigest = canonicalDigest(normalizedOutcomeEvidenceResult(requestScenario.snapshot))
    const standaloneDigest = canonicalDigest(normalizedOutcomeEvidenceResult(standaloneScenario.snapshot))
    if (requestDigest !== standaloneDigest) {
      throw new Error(`host_normalized_${scenario}_semantics_not_equal`)
    }
    return { scenario, requestDigest, standaloneDigest, matchedDigest: requestDigest }
  })
  return Object.freeze({
    sameFields: [
      'action.id', 'action.version', 'operation.id', 'operation.publicationSlot',
      'operation.publicationRevision', 'operation.materialDigest',
      'operation.transportConfigDigest', 'operation.paymentIdentity', 'operation.price',
      'prepared.inputDigest', 'prepared.materialDigest', 'prepared.targetDigest',
      'identity.principalRef', 'authority.kind', 'authority.generation', 'authority.bounds',
      'attempt.effectGeneration', 'attempt.idempotency.operationKey',
      'attempt.idempotency.materialInputDigest', 'resolution.controlState',
      'resolution.semanticStatus', 'resolution.release.state',
    ],
    differentFields: [
      'identity.callerRef', 'identity.origin', 'identity.invocationRef',
      'authority.reference', 'attempt.attemptRef', 'attempt.leaseOwner',
      'attempt.idempotency.effectIdentity', 'resolution.semanticOwnerRef',
      'resolution.semanticOutcomeDigest', 'resolution.evidenceDigest',
      'resolution.resultIdentity', 'resolution.sourceResultDigest',
    ],
    sharedDigest: canonicalDigest(shared),
    requestDigest: canonicalDigest(request),
    standaloneDigest: canonicalDigest(standalone),
    normalizedScenarioDigests,
  })
}

export function normalizedOutcomeEvidenceResult(
  snapshot: DevelopmentHostScenarioRecord['success']['snapshot'],
): unknown {
  const source = requireFirst(snapshot.sourceRows, 'normalized_outcome_source_missing')
  const control = requireFirst(snapshot.controls, 'normalized_outcome_control_missing')
  const attemptRecord = requireFirst(snapshot.attempts, 'normalized_outcome_attempt_missing')
  const attempt = requireFirst(attemptRecord.rows, 'normalized_outcome_attempt_row_missing')
  const claim = snapshot.semanticClaims[0]
  const returned = source.observedResolution.state === 'returned'
    ? source.observedResolution
    : null
  const normalizedObserved = returned === null
    ? source.observedResolution
    : normalizeObservedResolution(returned)
  const normalizedSemanticObserved = claim?.outcome?.observedResolution.state === 'returned'
    ? normalizeObservedResolution(claim.outcome.observedResolution)
    : claim?.outcome?.observedResolution ?? null
  return {
    terminalBusinessOutcome: control.terminalBusinessOutcome ?? null,
    controlState: control.control.control.state,
    observedResolution: normalizedObserved,
    attempt: {
      release: attempt.release,
      outcome: attempt.outcome,
      idempotency: {
        operationKey: attempt.idempotency.operationKey,
        materialInputDigest: attempt.idempotency.materialInputDigest,
      },
    },
    semantic: {
      status: claim?.status ?? null,
      observedResolution: normalizedSemanticObserved,
      normalizedResultDigest: canonicalDigest(normalizedObserved),
    },
    normalizedResultDigest: canonicalDigest(normalizedObserved),
    releaseEvidence: requireFirst(snapshot.history, 'normalized_outcome_history_missing').rows.flatMap(
      (row) => row.observation === undefined ? [] : [{
        release: row.observation.release,
      }],
    ),
  }
}

function normalizeObservedResolution(
  resolution: Extract<
    DevelopmentHostScenarioRecord['success']['snapshot']['sourceRows'][number]['observedResolution'],
    { state: 'returned' }
  >,
): unknown {
  const { requestDigest: _hostBoundRequestDigest, ...result } = resolution.result
  return {
    state: resolution.state,
    execution: resolution.execution,
    result,
  }
}

function sharedSemantics(read: DevelopmentHostSemanticRead): StableHashValue {
  const idempotency = canonicalValueRecord(read.attempt?.idempotency)
  const release = canonicalValueRecord(read.resolution.release)
  return {
    action: read.action,
    operation: read.operation,
    prepared: read.prepared,
    principalRef: read.identity.principalRef,
    authority: {
      kind: read.authority.kind,
      generation: read.authority.generation,
      bounds: read.authority.bounds,
    },
    attempt: {
      effectGeneration: read.attempt?.effectGeneration ?? null,
      operationKey: idempotency?.operationKey ?? null,
      materialInputDigest: idempotency?.materialInputDigest ?? null,
    },
    resolution: {
      controlState: read.resolution.controlState,
      semanticStatus: read.resolution.semanticStatus,
      releaseState: release?.state ?? null,
    },
  }
}

export function assertHostParityProvenance(provenance: Readonly<{
  sourceBaseCommit: string
  evidenceCommit: string
  evidenceTreeDigest: string
}>): void {
  if (![provenance.sourceBaseCommit, provenance.evidenceCommit].every(
    (value) => /^[0-9a-f]{40}$/u.test(value),
  ) || !/^[0-9a-f]{40}$/u.test(provenance.evidenceTreeDigest)) {
    throw new Error('host_parity_provenance_invalid')
  }
}
