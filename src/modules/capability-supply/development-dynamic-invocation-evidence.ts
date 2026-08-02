import {
  createDevelopmentDynamicPublishedSource,
  createDynamicPublishedActionInvocationAdapter,
  buildDynamicPublishedInput,
  loadDynamicPublishedAdapterSnapshot,
  materialDigest,
  verifyDynamicPublishedSnapshot,
  type ActionInvocationOrigin,
  type DynamicPublishedAdapterSnapshot,
  type InvocationActor,
  type DynamicPublishedSnapshotAnchors,
} from '@/modules/action-invocation'
import type {
  RouteTransportFetch,
  RouteTransportRuntime,
  X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  encodeX402PaymentRequiredHeader,
  type X402PaymentRequired,
} from './server'

import {
  buildDevelopmentPublishedOperationEvidence,
  projectDevelopmentPublishedOperationEvidence,
  verifyDevelopmentPublishedOperationEvidence,
} from './development-published-operation-evidence'
import {
  materializePublishedOperation,
  materializeRuntimePublishedOperation,
} from './published-operation'

function requireDynamicFixture<T>(value: T | undefined, errorCode: string): T {
  if (value === undefined) throw new Error(errorCode)
  return value
}

const actor: InvocationActor = {
  callerRef: 'agent:standalone-dynamic-published-development',
  principalRef: 'principal:dynamic-published-development',
}
const requestActor: InvocationActor = {
  callerRef: 'human:request-owned-dynamic-published-development',
  principalRef: actor.principalRef,
}

const developmentOrigins: readonly ActionInvocationOrigin[] = [
  { kind: 'request_owned', requestRef: 'request:dynamic-development', revision: 2 },
  { kind: 'standalone', callerRef: actor.callerRef, principalRef: actor.principalRef },
]

function developmentOriginAt(index: number): ActionInvocationOrigin {
  const origin = developmentOrigins[index]
  if (origin === undefined) throw new Error('dynamic_published_origin_missing')
  return origin
}

function snapshotAnchors(
  operation: ReturnType<typeof materializePublishedOperation>,
  descriptor: ReturnType<typeof materializeRuntimePublishedOperation>,
  origin: ActionInvocationOrigin,
  authorityRef: string,
  expectedEffectCount: number,
  expectedChallengeDigest?: string,
  expectedSemanticClaim?: DynamicPublishedSnapshotAnchors['expectedSemanticClaim'],
  anchoredActor: InvocationActor = actor,
): DynamicPublishedSnapshotAnchors {
  const prepared = buildDynamicPublishedInput({
    operation,
    descriptor,
    value: { symbol: 'BTC', convert: 'USD' },
  })
  return {
    operation,
    descriptor,
    actor: anchoredActor,
    origin,
    issuedAuthority: {
      reference: authorityRef,
      accepted: { kind: 'approve_each', authorityRef },
      materialInputDigest: materialDigest(
        prepared,
        ['operationKey', 'inputDigest', 'sourceSnapshotDigest', 'target'],
      ),
    },
    expectedEffectCount,
    ...(expectedSemanticClaim === undefined ? {} : { expectedSemanticClaim }),
    ...(expectedChallengeDigest === undefined ? {} : { expectedChallengeDigest }),
  }
}

export type DevelopmentDynamicInvocationEvidence = Readonly<{
  format: 'dynamic-published-action-invocation-evidence:v1'
  environment: 'MOCK/DEVELOPMENT ONLY'
  fixture: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>
  cases: readonly Readonly<{
    origin: ActionInvocationOrigin
    invocationRef: string
    actionId: string
    actionVersion: string
    authority: Readonly<{
      amountMinor: 1
      currency: 'USD'
      network: string
      asset: string
      payTo: string
      inputDigest: string
      sourceSnapshotDigest: string
    }>
    terminal: string
    coldResume: string
    paymentEffects: number
    providerEffects: number
    duplicateSuppressed: boolean
    unsupportedCancellationRefused: boolean
    snapshot: DynamicPublishedAdapterSnapshot
  }>[]
  recovery: Readonly<{
    uncertainty: 'reconciliation_required'
    retryBeforeReconcile: 'refused'
    cancellation: 'unsupported'
    staleWorker: 'refused'
    reconciled: 'terminal'
    paymentEffects: 1
    providerEffects: 1
    snapshot: DynamicPublishedAdapterSnapshot
  }>
  semanticReuse: Readonly<{
    policy: 'same_principal_exact_reuse_cross_principal_isolated'
    sharedOutcomeRef: string
    paymentEffects: 1
    providerEffects: 1
    invocations: readonly Readonly<{
      invocationRef: string
      authorityRef: string
      attemptRef: string
      effectGeneration: 1
      snapshot: DynamicPublishedAdapterSnapshot
    }>[]
  }>
  processKill: Readonly<{
    invocationRef: string
    authorityRef: string
    attemptRef: string
    status: 'pending'
    snapshot: DynamicPublishedAdapterSnapshot
  }>
  sourceDigest: string
  evidenceContract: Readonly<{
    anchored: 'semantic_identity_authority_material_effect_reconstruction'
    reconstructionMetadataOnly: 'timestamps_and_order_without_external_root'
  }>
  packetDigest: string
  verdict: 'PASS_FOR_DECLARED_CLASS'
  claimCeiling: string
}>

export async function buildDevelopmentDynamicInvocationEvidence(): Promise<DevelopmentDynamicInvocationEvidence> {
  const fixture = buildDevelopmentPublishedOperationEvidence()
  const now = fixture.operation.readiness.observedAt + 1_000
  const originalNow = Date.now
  Date.now = () => now
  try {
    const origins = developmentOrigins
    const cases = []
    for (const origin of origins) {
      const hostActor = origin.kind === 'request_owned' ? requestActor : actor
      const effects = { payment: 0, provider: 0 }
      const source = createDevelopmentDynamicPublishedSource([fixture.operation])
      let invocationSequence = 0
      let authoritySequence = 0
      let attemptSequence = 0
      const adapter = createDynamicPublishedActionInvocationAdapter({
        operation: fixture.operation,
        source,
        runtime: successRuntime(fixture.operation.binding.endpointUrl, effects),
        now: () => now,
        nextInvocationRef: () => `dynamic:invocation:${origin.kind}:${++invocationSequence}`,
        nextAuthorityRef: () => `dynamic:authority:${++authoritySequence}`,
        nextAttemptRef: () => `dynamic:attempt:${++attemptSequence}`,
      })
      const prepared = adapter.prepare({
        origin, actor: hostActor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
      })
      const preparedAuthority = requireDynamicFixture(
        prepared.authority,
        'dynamic_published_authority_missing',
      )
      const sourceRow = source.list()[0]
      if (sourceRow === undefined) throw new Error('dynamic_published_source_missing')
      const decided = adapter.decide({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: prepared.invocationVersion,
        authorityRef: preparedAuthority.reference,
        actor: hostActor, origin, accept: true,
      })
      if (decided.kind !== 'accepted') throw new Error(decided.code)
      const acquired = adapter.acquire({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: decided.view.invocationVersion,
        authorityRef: preparedAuthority.reference,
        actor: hostActor, origin, leaseOwner: `worker:${origin.kind}`, leaseMs: 30_000,
      })
      if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
        throw new Error('dynamic_published_evidence_not_leased')
      }
      const completed = await adapter.executeAcquired({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: acquired.view.invocationVersion,
        attemptRef: acquired.view.control.attemptRef,
        leaseOwner: acquired.view.control.leaseOwner,
        effectGeneration: acquired.view.control.effectGeneration,
      })
      if (completed.kind !== 'accepted') throw new Error(completed.code)
      const duplicate = await adapter.executeAcquired({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: acquired.view.invocationVersion,
        attemptRef: acquired.view.control.attemptRef,
        leaseOwner: acquired.view.control.leaseOwner,
        effectGeneration: acquired.view.control.effectGeneration,
      })
      const cancellation = adapter.cancel({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: completed.view.invocationVersion,
        actor,
        origin,
      })
      const snapshot = adapter.exportSnapshot()
      const loaded = loadDynamicPublishedAdapterSnapshot(
        structuredClone(snapshot),
        snapshotAnchors(
          fixture.operation,
          fixture.descriptor,
          origin,
          'dynamic:authority:1',
          1,
          canonicalDigest(developmentChallenge(fixture.operation.binding.endpointUrl)),
          {
            ownerInvocationRef: prepared.invocationRef,
            status: 'completed',
            outcomeResultRef: `published-result:${sourceRow.semanticIdentityDigest}`,
          },
          hostActor,
        ),
      )
      const coldSource = createDevelopmentDynamicPublishedSource(
        [fixture.operation],
        loaded.sourceRows,
        loaded.semanticClaims,
      )
      const cold = createDynamicPublishedActionInvocationAdapter({
        operation: fixture.operation,
        source: coldSource,
        runtime: successRuntime(fixture.operation.binding.endpointUrl, effects),
        now: () => now + 1,
        nextInvocationRef: () => 'unused',
        nextAuthorityRef: () => 'unused',
        nextAttemptRef: () => 'unused',
        durableState: loaded.durableState,
        paymentAttempts: loaded.paymentAttempts,
        paymentAuthorizationEvents: loaded.paymentAuthorizationEvents,
      })
      cases.push({
        origin,
        invocationRef: prepared.invocationRef,
        actionId: completed.view.action.id,
        actionVersion: completed.view.action.contractVersion,
        authority: {
          amountMinor: 1 as const,
          currency: 'USD' as const,
          network: fixture.operation.identity.payment.kind === 'x402'
            ? fixture.operation.identity.payment.network : 'none',
          asset: fixture.operation.identity.payment.kind === 'x402'
            ? fixture.operation.identity.payment.asset : 'none',
          payTo: fixture.operation.identity.payment.kind === 'x402'
            ? fixture.operation.identity.payment.payTo : 'none',
          inputDigest: sourceRow.input.inputDigest,
          sourceSnapshotDigest: sourceRow.input.sourceSnapshotDigest,
        },
        terminal: completed.view.control.state,
        coldResume: cold.inspect(prepared.invocationRef)?.control.state ?? 'missing',
        paymentEffects: effects.payment,
        providerEffects: effects.provider,
        duplicateSuppressed: duplicate.kind === 'refused' && effects.payment === 1 && effects.provider === 1,
        unsupportedCancellationRefused:
          cancellation.kind === 'refused' && cancellation.code === 'invalid_control_state',
        snapshot,
      })
    }
    const recoveryEffects = { payment: 0, provider: 0 }
    const recoverySource = createDevelopmentDynamicPublishedSource([fixture.operation])
    const recoveryOrigin = developmentOriginAt(1)
    const recoveryAdapter = createDynamicPublishedActionInvocationAdapter({
      operation: fixture.operation,
      source: recoverySource,
      runtime: lostResponseRuntime(fixture.operation.binding.endpointUrl, recoveryEffects),
      now: () => now,
      nextInvocationRef: () => 'dynamic:invocation:recovery',
      nextAuthorityRef: () => 'dynamic:authority:recovery',
      nextAttemptRef: () => 'dynamic:attempt:recovery',
    })
    const recoveryPrepared = recoveryAdapter.prepare({
      origin: recoveryOrigin,
      actor,
      value: { symbol: 'BTC', convert: 'USD' },
      freshnessMs: 60_000,
    })
    const recoveryAuthority = requireDynamicFixture(
      recoveryPrepared.authority,
      'dynamic_published_recovery_authority_missing',
    )
    const recoveryDecided = recoveryAdapter.decide({
      invocationRef: recoveryPrepared.invocationRef,
      expectedInvocationVersion: recoveryPrepared.invocationVersion,
      authorityRef: recoveryAuthority.reference,
      actor, origin: recoveryOrigin, accept: true,
    })
    if (recoveryDecided.kind !== 'accepted') throw new Error(recoveryDecided.code)
    const recoveryAcquired = recoveryAdapter.acquire({
      invocationRef: recoveryPrepared.invocationRef,
      expectedInvocationVersion: recoveryDecided.view.invocationVersion,
      authorityRef: recoveryAuthority.reference,
      actor, origin: recoveryOrigin, leaseOwner: 'worker:recovery', leaseMs: 30_000,
    })
    if (recoveryAcquired.kind !== 'accepted' || recoveryAcquired.view.control.state !== 'leased') {
      throw new Error('dynamic_published_recovery_not_leased')
    }
    const uncertain = await recoveryAdapter.executeAcquired({
      invocationRef: recoveryPrepared.invocationRef,
      expectedInvocationVersion: recoveryAcquired.view.invocationVersion,
      attemptRef: recoveryAcquired.view.control.attemptRef,
      leaseOwner: recoveryAcquired.view.control.leaseOwner,
      effectGeneration: recoveryAcquired.view.control.effectGeneration,
    })
    if (uncertain.kind !== 'accepted' || uncertain.view.control.state !== 'reconciliation_required') {
      throw new Error('dynamic_published_recovery_not_uncertain')
    }
    const staleWorker = await recoveryAdapter.executeAcquired({
      invocationRef: recoveryPrepared.invocationRef,
      expectedInvocationVersion: recoveryAcquired.view.invocationVersion,
      attemptRef: recoveryAcquired.view.control.attemptRef,
      leaseOwner: recoveryAcquired.view.control.leaseOwner,
      effectGeneration: recoveryAcquired.view.control.effectGeneration,
    })
    const retry = recoveryAdapter.acquire({
      invocationRef: recoveryPrepared.invocationRef,
      expectedInvocationVersion: uncertain.view.invocationVersion,
      authorityRef: recoveryAuthority.reference,
      actor, origin: recoveryOrigin, leaseOwner: 'worker:retry', leaseMs: 30_000,
    })
    const cancellation = recoveryAdapter.cancel({
      invocationRef: recoveryPrepared.invocationRef,
      expectedInvocationVersion: uncertain.view.invocationVersion,
      actor, origin: recoveryOrigin,
    })
    if (retry.kind !== 'refused' || staleWorker.kind !== 'refused' || cancellation.kind !== 'refused') {
      throw new Error('dynamic_published_recovery_fence_failed')
    }
    const recoverySnapshot = recoveryAdapter.exportSnapshot()
    const recoveryAttempt = uncertain.view.attempts[0]
    if (recoveryAttempt === undefined) throw new Error('dynamic_published_recovery_attempt_missing')
    const evidenceMaterial = {
      kind: 'action_invocation_reconciliation' as const,
      version: 1 as const,
      evidenceRef: 'published:reconciliation:development',
      source: `published-operation:${fixture.operation.operationId}`,
      invocationRef: uncertain.view.invocationRef,
      attemptRef: recoveryAttempt.attemptRef,
      effectGeneration: recoveryAttempt.effectGeneration,
      resolution: 'released' as const,
      observedAt: new Date(now).toISOString(),
    }
    const reconciled = recoveryAdapter.reconcile({
      invocationRef: uncertain.view.invocationRef,
      expectedInvocationVersion: uncertain.view.invocationVersion,
      attemptRef: recoveryAttempt.attemptRef,
      actor,
      origin: recoveryOrigin,
      evidence: { ...evidenceMaterial, digest: canonicalDigest(evidenceMaterial) },
    })
    if (reconciled.kind !== 'accepted' || reconciled.view.control.state !== 'terminal') {
      throw new Error('dynamic_published_reconciliation_failed')
    }
    if (recoveryEffects.payment !== 1 || recoveryEffects.provider !== 1) {
      throw new Error('dynamic_published_effect_count_invalid')
    }
    const recovery = {
      uncertainty: uncertain.view.control.state,
      retryBeforeReconcile: 'refused' as const,
      cancellation: 'unsupported' as const,
      staleWorker: 'refused' as const,
      reconciled: 'terminal' as const,
      paymentEffects: 1 as const,
      providerEffects: 1 as const,
      snapshot: recoverySnapshot,
    }
    const semanticEffects = { payment: 0, provider: 0 }
    const semanticSource = createDevelopmentDynamicPublishedSource([fixture.operation])
    let semanticInvocationSequence = 0
    let semanticAuthoritySequence = 0
    let semanticAttemptSequence = 0
    const semanticAdapter = createDynamicPublishedActionInvocationAdapter({
      operation: fixture.operation,
      source: semanticSource,
      runtime: successRuntime(fixture.operation.binding.endpointUrl, semanticEffects),
      now: () => now,
      nextInvocationRef: () => `semantic:invocation:${++semanticInvocationSequence}`,
      nextAuthorityRef: () => `semantic:authority:${++semanticAuthoritySequence}`,
      nextAttemptRef: () => `semantic:attempt:${++semanticAttemptSequence}`,
    })
    const executeSemantic = async () => {
      const prepared = semanticAdapter.prepare({
        origin: developmentOriginAt(1),
        actor,
        value: { symbol: 'BTC', convert: 'USD' },
        freshnessMs: 60_000,
      })
      const semanticAuthority = requireDynamicFixture(
        prepared.authority,
        'dynamic_published_semantic_authority_missing',
      )
      const decided = semanticAdapter.decide({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: prepared.invocationVersion,
        authorityRef: semanticAuthority.reference,
        actor,
        origin: developmentOriginAt(1),
        accept: true,
      })
      if (decided.kind !== 'accepted') throw new Error(decided.code)
      const acquired = semanticAdapter.acquire({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: decided.view.invocationVersion,
        authorityRef: semanticAuthority.reference,
        actor,
        origin: developmentOriginAt(1),
        leaseOwner: `worker:${prepared.invocationRef}`,
        leaseMs: 30_000,
      })
      if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
        throw new Error('semantic_reuse_not_leased')
      }
      const completed = await semanticAdapter.executeAcquired({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: acquired.view.invocationVersion,
        attemptRef: acquired.view.control.attemptRef,
        leaseOwner: acquired.view.control.leaseOwner,
        effectGeneration: acquired.view.control.effectGeneration,
      })
      if (completed.kind !== 'accepted') throw new Error(completed.code)
      return {
        invocationRef: prepared.invocationRef,
        authorityRef: semanticAuthority.reference,
        attemptRef: acquired.view.control.attemptRef,
        effectGeneration: 1 as const,
      }
    }
    const semanticFirst = await executeSemantic()
    const semanticSecond = await executeSemantic()
    const semanticSnapshot = semanticAdapter.exportSnapshot()
    const sharedOutcomeRef = semanticSource.read(semanticFirst.invocationRef)?.resultIdentity?.sourceResultRef
    if (sharedOutcomeRef === undefined
      || semanticSource.read(semanticSecond.invocationRef)?.resultIdentity?.sourceResultRef !== sharedOutcomeRef
      || semanticEffects.payment !== 1
      || semanticEffects.provider !== 1) {
      throw new Error('semantic_reuse_evidence_invalid')
    }
    const semanticReuse = {
      policy: 'same_principal_exact_reuse_cross_principal_isolated' as const,
      sharedOutcomeRef,
      paymentEffects: 1 as const,
      providerEffects: 1 as const,
      invocations: [semanticFirst, semanticSecond].map((entry) => ({
        ...entry,
        snapshot: invocationSnapshot(semanticSnapshot, entry.invocationRef),
      })),
    }
    const killSource = createDevelopmentDynamicPublishedSource([fixture.operation])
    const killAdapter = createDynamicPublishedActionInvocationAdapter({
      operation: fixture.operation,
      source: killSource,
      runtime: successRuntime(fixture.operation.binding.endpointUrl, { payment: 0, provider: 0 }),
      now: () => now,
      nextInvocationRef: () => 'process-kill:invocation:1',
      nextAuthorityRef: () => 'process-kill:authority:1',
      nextAttemptRef: () => 'process-kill:attempt:1',
    })
    const killPrepared = killAdapter.prepare({
      origin: developmentOriginAt(1),
      actor,
      value: { symbol: 'BTC', convert: 'USD' },
      freshnessMs: 60_000,
    })
    const killAuthority = requireDynamicFixture(
      killPrepared.authority,
      'dynamic_published_process_kill_authority_missing',
    )
    const killDecided = killAdapter.decide({
      invocationRef: killPrepared.invocationRef,
      expectedInvocationVersion: killPrepared.invocationVersion,
      authorityRef: killAuthority.reference,
      actor,
      origin: developmentOriginAt(1),
      accept: true,
    })
    if (killDecided.kind !== 'accepted') throw new Error(killDecided.code)
    const killAcquired = killAdapter.acquire({
      invocationRef: killPrepared.invocationRef,
      expectedInvocationVersion: killDecided.view.invocationVersion,
      authorityRef: killAuthority.reference,
      actor,
      origin: developmentOriginAt(1),
      leaseOwner: 'worker:process-kill',
      leaseMs: 30_000,
    })
    if (killAcquired.kind !== 'accepted' || killAcquired.view.control.state !== 'leased') {
      throw new Error('process_kill_not_leased')
    }
    const killRow = killSource.read(killPrepared.invocationRef)
    if (killRow === undefined) throw new Error('dynamic_published_process_kill_source_missing')
    const killClaim = killSource.claimSemanticEffect({
      semanticBaseKey: killRow.semanticBaseKey,
      semanticIdentityDigest: killRow.semanticIdentityDigest,
      principalRef: actor.principalRef,
      invocationRef: killPrepared.invocationRef,
    })
    if (killClaim.kind !== 'owner') throw new Error('process_kill_claim_failed')
    const processKill = {
      invocationRef: killPrepared.invocationRef,
      authorityRef: killAuthority.reference,
      attemptRef: killAcquired.view.control.attemptRef,
      status: 'pending' as const,
      snapshot: killAdapter.exportSnapshot(),
    }
    const sourceDigest = canonicalDigest({
      operation: fixture.operation,
      descriptor: {
        id: fixture.descriptor.id,
        version: fixture.descriptor.version,
        target: fixture.descriptor.target,
        inputSchema: fixture.descriptor.inputSchema,
        outputSchema: fixture.descriptor.outputSchema,
      },
    })
    const material = {
      format: 'dynamic-published-action-invocation-evidence:v1' as const,
      environment: 'MOCK/DEVELOPMENT ONLY' as const,
      fixture,
      cases,
      recovery,
      semanticReuse,
      processKill,
      sourceDigest,
      evidenceContract: {
        anchored: 'semantic_identity_authority_material_effect_reconstruction' as const,
        reconstructionMetadataOnly: 'timestamps_and_order_without_external_root' as const,
      },
      verdict: 'PASS_FOR_DECLARED_CLASS' as const,
      claimCeiling:
        'Labelled fixture/local development proof of anchored semantic identity, authority, material, effect, and reconstruction behavior only. Timestamps and order metadata have no independent provenance without an external signed/root anchor. No host parity, deployment, independent provider, settlement, fulfilment, production safety, or customer value.',
    }
    const serializable = structuredClone({
      ...material,
      fixture: projectDevelopmentPublishedOperationEvidence(fixture),
    })
    const validationCandidate: unknown = serializable
    if (!isBoundedJsonValue(validationCandidate)) {
      throw new Error('dynamic_published_evidence_not_json_safe')
    }
    return {
      ...serializable,
      fixture: {
        ...serializable.fixture,
        descriptor: materializeRuntimePublishedOperation(serializable.fixture.operation),
      },
      packetDigest: canonicalDigest(serializable),
    }
  } finally {
    Date.now = originalNow
  }
}

export function verifyDevelopmentDynamicInvocationEvidence(
  packet: DevelopmentDynamicInvocationEvidence,
): void {
  const rebuiltOperation = materializePublishedOperation(packet.fixture.sourceMaterial)
  const rebuiltDescriptor = materializeRuntimePublishedOperation(rebuiltOperation)
  verifyDevelopmentPublishedOperationEvidence({
    ...packet.fixture,
    operation: rebuiltOperation,
    descriptor: rebuiltDescriptor,
  })
  const { packetDigest, ...material } = packet
  const digestMaterial = {
    ...material,
    fixture: projectDevelopmentPublishedOperationEvidence(packet.fixture),
  }
  const recomputedSource = canonicalDigest({
    operation: packet.fixture.operation,
    descriptor: {
      id: packet.fixture.descriptor.id,
      version: packet.fixture.descriptor.version,
      target: packet.fixture.descriptor.target,
      inputSchema: packet.fixture.descriptor.inputSchema,
      outputSchema: packet.fixture.descriptor.outputSchema,
    },
  })
  const separatelyResumed = packet.cases.every((entry, index) => {
    const expectedOrigin = developmentOrigins[index]
    if (expectedOrigin === undefined) return false
    const caseSourceRow = requireDynamicFixture(
      entry.snapshot.sourceRows[0],
      'dynamic_published_case_source_missing',
    )
    const caseResultIdentity = requireDynamicFixture(
      caseSourceRow.resultIdentity,
      'dynamic_published_case_result_missing',
    )
    const anchors = snapshotAnchors(
      rebuiltOperation,
      rebuiltDescriptor,
      expectedOrigin,
      'dynamic:authority:1',
      1,
      canonicalDigest(developmentChallenge(rebuiltOperation.binding.endpointUrl)),
      {
        ownerInvocationRef: entry.invocationRef,
        status: 'completed',
        outcomeResultRef: caseResultIdentity.sourceResultRef,
      },
      expectedOrigin.kind === 'request_owned' ? requestActor : actor,
    )
    verifyDynamicPublishedSnapshot({
      snapshot: entry.snapshot,
      anchors,
    })
    const loaded = loadDynamicPublishedAdapterSnapshot(entry.snapshot, anchors)
    const source = createDevelopmentDynamicPublishedSource(
      [rebuiltOperation],
      loaded.sourceRows,
      loaded.semanticClaims,
    )
    const adapter = createDynamicPublishedActionInvocationAdapter({
      operation: rebuiltOperation,
      source,
      runtime: verifierRuntime(),
      now: () => rebuiltOperation.readiness.observedAt + 2_000,
      nextInvocationRef: () => 'verifier:unused',
      nextAuthorityRef: () => 'verifier:unused',
      nextAttemptRef: () => 'verifier:unused',
      durableState: loaded.durableState,
      paymentAttempts: loaded.paymentAttempts,
      paymentAuthorizationEvents: loaded.paymentAuthorizationEvents,
    })
    const view = adapter.inspect(entry.invocationRef)
    return view?.control.state === 'terminal'
      && view.origin.kind === entry.origin.kind
      && view.action.id === rebuiltOperation.operationId
      && view.action.contractVersion === rebuiltDescriptor.version
  })
  const recoveryControl = requireDynamicFixture(
    packet.recovery.snapshot.controls[0],
    'dynamic_published_recovery_control_missing',
  )
  verifyDynamicPublishedSnapshot({
    snapshot: packet.recovery.snapshot,
    anchors: snapshotAnchors(
      rebuiltOperation,
      rebuiltDescriptor,
      developmentOriginAt(1),
      'dynamic:authority:recovery',
      1,
      undefined,
      {
        ownerInvocationRef: recoveryControl.invocationRef,
        status: 'uncertain',
      },
    ),
  })
  const semanticFirst = requireDynamicFixture(
    packet.semanticReuse.invocations[0],
    'dynamic_published_semantic_first_missing',
  )
  const semanticSecond = requireDynamicFixture(
    packet.semanticReuse.invocations[1],
    'dynamic_published_semantic_second_missing',
  )
  const semanticInvocationsValid = packet.semanticReuse.invocations.length === 2
    && packet.semanticReuse.invocations.every((entry, index) => {
      verifyDynamicPublishedSnapshot({
        snapshot: entry.snapshot,
        anchors: snapshotAnchors(
          rebuiltOperation,
          rebuiltDescriptor,
          developmentOriginAt(1),
          `semantic:authority:${index + 1}`,
          1,
          canonicalDigest(developmentChallenge(rebuiltOperation.binding.endpointUrl)),
          {
            ownerInvocationRef: semanticFirst.invocationRef,
            status: 'completed',
            outcomeResultRef: packet.semanticReuse.sharedOutcomeRef,
          },
        ),
      })
      const source = entry.snapshot.sourceRows[0]
      const control = entry.snapshot.controls[0]
      const attempt = entry.snapshot.attempts[0]?.rows[0]
      return source?.invocationRef === entry.invocationRef
        && control?.invocationRef === entry.invocationRef
        && control.control.authority?.reference === entry.authorityRef
        && attempt?.attemptRef === entry.attemptRef
        && attempt.effectGeneration === entry.effectGeneration
        && source.resultIdentity?.sourceResultRef === packet.semanticReuse.sharedOutcomeRef
        && control.sourceResultRef === packet.semanticReuse.sharedOutcomeRef
    })
  const semanticRows = packet.semanticReuse.invocations.map((entry) => {
    const row = entry.snapshot.sourceRows[0]
    if (row === undefined) throw new Error('dynamic_published_semantic_source_missing')
    return row
  })
  const processKillAnchors = snapshotAnchors(
    rebuiltOperation,
    rebuiltDescriptor,
    developmentOriginAt(1),
    packet.processKill.authorityRef,
    1,
    undefined,
    {
      ownerInvocationRef: packet.processKill.invocationRef,
      status: 'pending',
    },
  )
  verifyDynamicPublishedSnapshot({
    snapshot: packet.processKill.snapshot,
    anchors: processKillAnchors,
  })
  const loadedProcessKill = loadDynamicPublishedAdapterSnapshot(
    packet.processKill.snapshot,
    processKillAnchors,
  )
  const processKillSource = createDevelopmentDynamicPublishedSource(
    [rebuiltOperation],
    loadedProcessKill.sourceRows,
    loadedProcessKill.semanticClaims,
  )
  const processKillAdapter = createDynamicPublishedActionInvocationAdapter({
    operation: rebuiltOperation,
    source: processKillSource,
    runtime: verifierRuntime(),
    now: () => rebuiltOperation.readiness.observedAt + 2_000,
    nextInvocationRef: () => 'verifier:unused',
    nextAuthorityRef: () => 'verifier:unused',
    nextAttemptRef: () => 'verifier:unused',
    durableState: loadedProcessKill.durableState,
    paymentAttempts: loadedProcessKill.paymentAttempts,
    paymentAuthorizationEvents: loadedProcessKill.paymentAuthorizationEvents,
  })
  const processKillView = processKillAdapter.inspect(packet.processKill.invocationRef)
  if (
    canonicalDigest(digestMaterial) !== packetDigest
    || packet.cases.length !== 2
    || packet.cases[0]?.origin.kind !== 'request_owned'
    || packet.cases[1]?.origin.kind !== 'standalone'
    || !separatelyResumed
    || packet.recovery.uncertainty !== 'reconciliation_required'
    || packet.recovery.retryBeforeReconcile !== 'refused'
    || packet.recovery.cancellation !== 'unsupported'
    || packet.recovery.staleWorker !== 'refused'
    || packet.recovery.reconciled !== 'terminal'
    || packet.recovery.paymentEffects !== 1
    || packet.recovery.providerEffects !== 1
    || packet.semanticReuse.policy !== 'same_principal_exact_reuse_cross_principal_isolated'
    || packet.semanticReuse.paymentEffects !== 1
    || packet.semanticReuse.providerEffects !== 1
    || !semanticInvocationsValid
    || semanticFirst?.invocationRef === semanticSecond?.invocationRef
    || semanticFirst?.authorityRef === semanticSecond?.authorityRef
    || semanticFirst?.attemptRef === semanticSecond?.attemptRef
    || semanticRows[0]?.semanticBaseKey !== semanticRows[1]?.semanticBaseKey
    || semanticRows[0]?.semanticIdentityDigest !== semanticRows[1]?.semanticIdentityDigest
    || packet.processKill.status !== 'pending'
    || processKillView?.control.state !== 'leased'
    || processKillView.control.attemptRef !== packet.processKill.attemptRef
    || processKillView.authority?.reference !== packet.processKill.authorityRef
    || packet.evidenceContract.anchored
      !== 'semantic_identity_authority_material_effect_reconstruction'
    || packet.evidenceContract.reconstructionMetadataOnly
      !== 'timestamps_and_order_without_external_root'
    || !packet.claimCeiling.includes(
      'Timestamps and order metadata have no independent provenance',
    )
    || packet.cases.some((entry) => (
      entry.actionId !== packet.fixture.operation.operationId
      || entry.actionVersion !== packet.fixture.descriptor.version
      || entry.authority.amountMinor !== 1
      || entry.authority.currency !== 'USD'
      || entry.authority.network !== 'eip155:8453'
      || entry.authority.asset !== '0xmock-usdc'
      || entry.authority.payTo !== '0xmock-provider-recipient'
      || entry.terminal !== 'terminal'
      || entry.coldResume !== 'terminal'
      || entry.paymentEffects !== 1
      || entry.providerEffects !== 1
      || !entry.duplicateSuppressed
      || !entry.unsupportedCancellationRefused
      || entry.snapshot.sourceRows[0]?.input.inputDigest !== entry.authority.inputDigest
      || entry.snapshot.sourceRows[0]?.input.sourceSnapshotDigest !== entry.authority.sourceSnapshotDigest
    ))
  ) throw new Error('dynamic_published_invocation_evidence_invalid')
}

function verifierRuntime(): RouteTransportRuntime {
  return {
    send: async () => { throw new Error('verifier_must_not_execute_effect') },
    resolveCredential: () => undefined,
  }
}

function invocationSnapshot(
  snapshot: DynamicPublishedAdapterSnapshot,
  invocationRef: string,
): DynamicPublishedAdapterSnapshot {
  const history = snapshot.history.filter((group) => group.invocationRef === invocationRef)
  const commandIds = new Set(history.flatMap((group) => group.rows.map(({ commandId }) => commandId)))
  const sourceRows = snapshot.sourceRows.filter((row) => row.invocationRef === invocationRef)
  return {
    ...snapshot,
    sourceRows,
    semanticClaims: snapshot.semanticClaims.filter(
      (claim) => claim.semanticBaseKey === sourceRows[0]?.semanticBaseKey,
    ),
    controls: snapshot.controls.filter((row) => row.invocationRef === invocationRef),
    attempts: snapshot.attempts.filter((group) => group.invocationRef === invocationRef),
    history,
    commands: snapshot.commands.filter(({ commandId }) => commandIds.has(commandId)),
    paymentAttempts: snapshot.paymentAttempts.filter(
      (attempt) => attempt.invocationRef === invocationRef,
    ),
    paymentAuthorizationEvents: snapshot.paymentAuthorizationEvents.filter(
      (event) => event.invocationRef === invocationRef,
    ),
  }
}

function successRuntime(endpoint: string, effects: { payment: number; provider: number }): X402RouteTransportRuntime {
  const challenge = developmentChallenge(endpoint)
  const custody = new Map<string, Readonly<{
    custodyRef: string
    authorizationDigest: string
  }>>()
  const paymentSignature = 'mock:payment-signature'
  const send: RouteTransportFetch = async (_url, init) => {
    if (init?.headers?.['Payment-Signature'] === undefined) {
      return new Response('', {
        status: 402,
        headers: { 'payment-required': encodeX402PaymentRequiredHeader(challenge) },
      })
    }
    effects.provider += 1
    return new Response(JSON.stringify({
      data: {
        BTC: {
          symbol: 'BTC',
          quote: {
            USD: {
              price: 118_245.12,
              last_updated: '2026-07-19T08:00:00.000Z',
            },
          },
        },
      },
    }), {
      status: 200,
      headers: {
        'payment-response': 'mock:payment-proof',
        'provider-receipt': 'mock:provider-receipt',
      },
    })
  }
  return {
    send,
    resolveCredential: () => 'mock:server-held-credential',
    x402PaymentSigningAvailable: () => true,
    prepareX402PaymentAuthorization: async (request) => {
      const identity = canonicalDigest({
        paymentIdentifier: request.paymentIdentifier,
        challengeDigest: request.challengeDigest,
        attemptRef: request.attemptRef,
        effectGeneration: request.effectGeneration,
      })
      const existing = custody.get(identity)
      if (existing !== undefined) return existing
      effects.payment += 1
      const authorization = {
        custodyRef: canonicalDigest({
          kind: 'development-x402-custody:v1',
          identity,
        } as StableHashValue),
        authorizationDigest: canonicalDigest(paymentSignature),
      }
      custody.set(identity, authorization)
      return authorization
    },
    readX402PaymentAuthorization: async ({ custodyRef, authorizationDigest }) =>
      [...custody.values()].some((value) =>
        value.custodyRef === custodyRef && value.authorizationDigest === authorizationDigest)
        ? paymentSignature
        : undefined,
    readX402PaymentAuthorizationByDigest: async ({ authorizationDigest }) =>
      authorizationDigest === canonicalDigest(paymentSignature) ? paymentSignature : undefined,
  }
}


function developmentChallenge(endpoint: string): X402PaymentRequired {
  return {
    x402Version: 2,
    resource: { url: `${endpoint}?symbol=BTC&convert=USD` },
    accepts: [{
      scheme: 'exact', network: 'eip155:8453', amount: '10000', asset: '0xmock-usdc',
      payTo: '0xmock-provider-recipient', maxTimeoutSeconds: 30, extra: {},
    }],
  }
}

function lostResponseRuntime(
  endpoint: string,
  effects: { payment: number; provider: number },
): RouteTransportRuntime {
  const base = successRuntime(endpoint, effects)
  let calls = 0
  return {
    ...base,
    send: async (url, init) => {
      calls += 1
      if (calls === 2) {
        effects.provider += 1
        throw new Error('lost_x402_response')
      }
      return await base.send(url, init)
    },
  }
}
