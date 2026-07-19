import {
  buildDynamicPublishedInput,
  materialDigest,
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
  const parity = compareHostSemantics(hostReads)
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
  return Object.freeze({
    ...material,
    packetDigest: canonicalDigest(material as unknown as StableHashValue),
  })
}

export function verifyHostSnapshots(packet: DevelopmentHostParityEvidence): void {
  for (const host of packet.hosts) {
    for (const [scenarioName, scenario] of Object.entries({
      success: host.success,
      preflightRefusal: host.preflightRefusal,
      sourceRefusal: host.sourceRefusal,
      uncertainty: host.uncertainty,
      coldResume: host.coldResume,
    })) {
      const source = scenario.snapshot.sourceRows[0]
      const expectedStatus = scenario.state === 'reconciliation_required' ? 'uncertain' : 'completed'
      const effectWasAdmitted = scenarioName === 'success'
        || scenarioName === 'uncertainty'
        || scenarioName === 'coldResume'
      try {
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
        throw new Error(`host_snapshot_invalid:${host.host}:${scenarioName}`, { cause: error })
      }
    }
  }
}

export function evaluateHostMatrix(
  hosts: readonly [DevelopmentHostScenarioRecord, DevelopmentHostScenarioRecord],
) {
  const checks = [
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
      passed: hosts[1].completedResultReuse.kind === 'attached'
        && hosts[1].completedResultReuse.noEffect
        && !hosts[1].completedResultReuse.authorityInherited
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
  })
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
