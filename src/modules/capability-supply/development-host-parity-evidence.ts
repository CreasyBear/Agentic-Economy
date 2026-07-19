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
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  buildDevelopmentPublishedOperationEvidence,
} from './development-published-operation-evidence'
import {
  runDevelopmentHostScenarioMatrix,
  type DevelopmentHostScenarioRecord,
} from './development-host-scenarios'

export const developmentHostParityClaimCeiling =
  'Labelled local adapter/caller parity over mock transport, payment, and provider effects only; no hosted reachability, real-human usability, independent signing or root provenance, settlement, provider fulfilment, production safety, or customer value.'
export const developmentHostParitySourceBaseCommit =
  'ebe35bdbd3b4707b356607e8dc615d3e29babe8d'

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
      snapshot: JSON.parse(JSON.stringify(hosts[0].success.snapshot)),
    }),
    readDevelopmentHostSnapshot({
      host: 'standalone_external_agent',
      snapshot: JSON.parse(JSON.stringify(hosts[1].success.snapshot)),
    }),
  ] as const
  const parity = compareHostSemantics(hostReads, hosts)
  const evals = evaluateHostMatrix(hosts)
  if (evals.some((entry) => !entry.passed)) {
    throw new Error(`host_matrix_failed:${evals.filter((entry) => !entry.passed).map((entry) => entry.name).join(',')}:${hosts.map((host) => host.sourceRefusal.execution).join('|')}`)
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
  const serializable = JSON.parse(JSON.stringify(material)) as typeof material
  return Object.freeze({
    ...serializable,
    packetDigest: canonicalDigest(serializable as unknown as StableHashValue),
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
      const source = scenario.snapshot.sourceRows[0]
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
          anchors: {
          operation: packet.fixture.operation,
          descriptor: packet.fixture.descriptor,
          actor: host.actor,
          origin: host.host === 'request_owned_human'
            ? { kind: 'request_owned', requestRef: 'request:host-parity-existing', revision: 7 }
            : {
                kind: 'standalone',
                callerRef: host.actor.callerRef,
                principalRef: host.actor.principalRef,
              },
          issuedAuthority: {
            reference: scenario.authorityRef,
            accepted: { kind: 'approve_each', authorityRef: scenario.authorityRef },
            materialInputDigest: materialDigest(
              buildDynamicPublishedInput({
                operation: packet.fixture.operation,
                descriptor: packet.fixture.descriptor,
                value: { symbol: 'BTC', convert: 'USD' },
              }),
              ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
            ),
          },
          expectedEffectCount: 1,
          ...(effectWasAdmitted ? {
            expectedSemanticClaim: {
              ownerInvocationRef: scenario.invocationRef,
              status: expectedStatus,
              ...(source?.resultIdentity === undefined
                ? {}
                : { outcomeResultRef: source.resultIdentity.sourceResultRef }),
            },
          } : {}),
          },
        })
      } catch (error) {
        throw new Error(
          `host_snapshot_invalid:${host.host}:${scenarioName}:${error instanceof Error ? error.message : 'unknown'}`,
          { cause: error },
        )
      }
    }
    const correctionSource = host.correction.snapshot.sourceRows[0]
    const correctionControl = host.correction.snapshot.controls[0]
    const correctionAttempt = host.correction.snapshot.attempts[0]?.rows[0]
    const correctedMaterial = buildDynamicPublishedInput({
      operation: packet.fixture.operation,
      descriptor: packet.fixture.descriptor,
      value: { symbol: 'ETH', convert: 'USD' },
    })
    const correctedDigest = materialDigest(
      correctedMaterial,
      ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
    )
    if (canonicalDigest(correctionSource?.operation as unknown as StableHashValue)
        !== canonicalDigest(packet.fixture.operation as unknown as StableHashValue)
      || canonicalDigest(correctionSource?.input as unknown as StableHashValue)
        !== canonicalDigest(correctedMaterial as unknown as StableHashValue)
      || correctionControl?.authorityBinding?.reference !== host.correction.newAuthorityRef
      || correctionControl.authorityBinding.digest !== correctedDigest
      || correctionControl.control.acceptedAuthority?.kind !== 'approve_each'
      || correctionControl.control.acceptedAuthority.authorityRef !== host.correction.newAuthorityRef
      || correctionAttempt?.idempotency.materialInputDigest !== correctedDigest
      || correctionAttempt.release.state !== 'possibly_released'
      || host.correction.snapshot.semanticClaims[0]?.ownerInvocationRef
        !== host.correction.invocationRef
      || host.correction.snapshot.semanticClaims[0]?.status !== 'completed') {
      throw new Error('host_correction_snapshot_invalid')
    }
    const gathering = host.clarification.gatheringSnapshot
    const gatheringWork = gathering.inputWork?.[0]
    const gatheringControl = gathering.controls[0]
    if (canonicalDigest(gathering.operations?.[0] as unknown as StableHashValue)
        !== canonicalDigest(packet.fixture.operation as unknown as StableHashValue)
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

function verifyReleasedRefusalSnapshot(
  packet: DevelopmentHostParityEvidence,
  host: DevelopmentHostScenarioRecord,
  scenario: DevelopmentHostScenarioRecord['releasedRefusal'],
): void {
  assertDynamicPublishedSnapshotShape(scenario.snapshot)
  const source = scenario.snapshot.sourceRows[0]!
  const control = scenario.snapshot.controls[0]!
  const attempt = scenario.snapshot.attempts[0]!.rows[0]!
  const claim = scenario.snapshot.semanticClaims[0]
  const result = source.observedResolution.state === 'returned'
    ? source.observedResolution.result
    : undefined
  if (canonicalDigest(source.operation as unknown as StableHashValue)
      !== canonicalDigest(packet.fixture.operation as unknown as StableHashValue)
    || control.control.owner.callerRef !== host.actor.callerRef
    || control.control.owner.principalRef !== host.actor.principalRef
    || control.authorityBinding?.reference !== scenario.authorityRef
    || control.control.acceptedAuthority?.kind !== 'approve_each'
    || control.control.control.state !== 'terminal'
    || control.terminalResultReferenceable !== false
    || attempt.release.state !== 'possibly_released'
    || attempt.outcome.state !== 'returned'
    || attempt.outcome.businessOutcome !== 'published_operation_invalid_evidence'
    || result?.kind !== 'published_operation_invalid_evidence'
    || result.failureCode !== 'output_schema_invalid'
    || result.providerReceipt !== 'mock:provider-refusal-receipt'
    || result.paymentProof !== 'mock:payment-proof'
    || source.resultIdentity === undefined
    || source.resultIdentity.resultDigest
      !== canonicalDigest(result as unknown as StableHashValue)
    || claim?.status !== 'completed'
    || claim.ownerInvocationRef !== scenario.invocationRef
    || claim.outcome?.observedResolution.state !== 'returned'
    || canonicalDigest(claim.outcome.observedResolution.result as unknown as StableHashValue)
      !== canonicalDigest(result as unknown as StableHashValue)
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
          resolver: {
            resolve: () => JSON.parse(JSON.stringify(host.clarification.gatheringSnapshot)),
          },
        })
        return host.clarification.missing.join(',') === 'convert'
          && host.clarification.sameLineage
          && host.clarification.preparedVersion > host.clarification.gatheringVersion
          && host.clarification.rich.semanticDigest === host.clarification.structured.semanticDigest
          && rich.semanticDigest === host.clarification.rich.semanticDigest
          && canonicalDigest(rich.semantics as unknown as StableHashValue)
            === canonicalDigest(host.clarification.structured.semantics as unknown as StableHashValue)
      }),
      evidence: hosts.map((host) => host.clarification),
    },
    {
      name: 'material_correction_real_authority_fence',
      passed: hosts.every((host) => {
        const rich = projectRichInvocationTask({
          invocationRef: host.correction.invocationRef,
          expectedInvocationVersion: host.correction.newVersion,
          resolver: { resolve: () => JSON.parse(JSON.stringify(host.correction.projectionSnapshot)) },
        })
        const structured = projectStructuredInvocationTask({
          invocationRef: host.correction.invocationRef,
          expectedInvocationVersion: host.correction.newVersion,
          resolver: { resolve: () => JSON.parse(JSON.stringify(host.correction.projectionSnapshot)) },
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
      passed: hosts.every((host) => host.releasedRefusal.failureCode === 'output_schema_invalid'
        && host.releasedRefusal.state === 'terminal'
        && host.releasedRefusal.effects.payment === 1
        && host.releasedRefusal.effects.provider === 1
        && host.releasedRefusal.retryPosture === 'invalid_control_state'
        && host.releasedRefusal.snapshot.attempts[0]?.rows[0]?.release.state === 'possibly_released'
        && host.releasedRefusal.snapshot.attempts[0]?.rows[0]?.outcome.state === 'returned'),
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
    evidenceDigest: canonicalDigest(evidence as unknown as StableHashValue),
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
    canonicalDigest(request.identity.origin as unknown as StableHashValue)
      !== canonicalDigest(standalone.identity.origin as unknown as StableHashValue),
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
    requestDigest: canonicalDigest(request as unknown as StableHashValue),
    standaloneDigest: canonicalDigest(standalone as unknown as StableHashValue),
    normalizedScenarioDigests,
  })
}

export function normalizedOutcomeEvidenceResult(
  snapshot: DevelopmentHostScenarioRecord['success']['snapshot'],
): StableHashValue {
  const source = snapshot.sourceRows[0]!
  const control = snapshot.controls[0]!
  const attempt = snapshot.attempts[0]!.rows[0]!
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
      normalizedResultDigest: canonicalDigest(normalizedObserved as unknown as StableHashValue),
    },
    normalizedResultDigest: canonicalDigest(normalizedObserved as unknown as StableHashValue),
    releaseEvidence: snapshot.history[0]!.rows.flatMap(
      (row) => row.observation === undefined ? [] : [{
        release: row.observation.release,
      }],
    ),
  } as unknown as StableHashValue
}

function normalizeObservedResolution(
  resolution: Extract<
    DevelopmentHostScenarioRecord['success']['snapshot']['sourceRows'][number]['observedResolution'],
    { state: 'returned' }
  >,
): StableHashValue {
  const { requestDigest: _hostBoundRequestDigest, ...result } = resolution.result
  return {
    state: resolution.state,
    execution: resolution.execution,
    result,
  } as unknown as StableHashValue
}

function sharedSemantics(read: DevelopmentHostSemanticRead): StableHashValue {
  const idempotency = read.attempt?.idempotency as Record<string, StableHashValue> | undefined
  const release = read.resolution.release as Record<string, StableHashValue> | null
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
