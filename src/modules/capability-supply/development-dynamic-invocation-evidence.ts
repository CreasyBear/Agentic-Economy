import {
  createDevelopmentDynamicPublishedSource,
  createDynamicPublishedActionInvocationAdapter,
  loadDynamicPublishedAdapterSnapshot,
  type ActionInvocationOrigin,
  type DynamicPublishedAdapterSnapshot,
  type InvocationActor,
} from '@/modules/action-invocation'
import type {
  RouteTransportFetch,
  RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  buildDevelopmentPublishedOperationEvidence,
  verifyDevelopmentPublishedOperationEvidence,
} from './development-published-operation-evidence'
import {
  materializePublishedOperation,
  materializeRuntimePublishedOperation,
} from './published-operation'

const actor: InvocationActor = {
  callerRef: 'agent:dynamic-published-development',
  principalRef: 'principal:dynamic-published-development',
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
  sourceDigest: string
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
    const origins: readonly ActionInvocationOrigin[] = [
      { kind: 'request_owned', requestRef: 'request:dynamic-development', revision: 2 },
      { kind: 'standalone', callerRef: actor.callerRef, principalRef: actor.principalRef },
    ]
    const cases = []
    for (const origin of origins) {
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
        origin, actor, value: { symbol: 'BTC', convert: 'USD' }, freshnessMs: 60_000,
      })
      const sourceRow = source.list()[0]!
      const decided = adapter.decide({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: prepared.invocationVersion,
        authorityRef: prepared.authority!.reference,
        actor, origin, accept: true,
      })
      if (decided.kind !== 'accepted') throw new Error(decided.code)
      const acquired = adapter.acquire({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: decided.view.invocationVersion,
        authorityRef: prepared.authority!.reference,
        actor, origin, leaseOwner: `worker:${origin.kind}`, leaseMs: 30_000,
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
      const loaded = loadDynamicPublishedAdapterSnapshot(JSON.parse(JSON.stringify(snapshot)))
      const coldSource = createDevelopmentDynamicPublishedSource([fixture.operation], loaded.sourceRows)
      const cold = createDynamicPublishedActionInvocationAdapter({
        operation: fixture.operation,
        source: coldSource,
        runtime: successRuntime(fixture.operation.binding.endpointUrl, effects),
        now: () => now + 1,
        nextInvocationRef: () => 'unused',
        nextAuthorityRef: () => 'unused',
        nextAttemptRef: () => 'unused',
        durableState: loaded.durableState,
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
    const recoveryOrigin = origins[1]!
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
    const recoveryDecided = recoveryAdapter.decide({
      invocationRef: recoveryPrepared.invocationRef,
      expectedInvocationVersion: recoveryPrepared.invocationVersion,
      authorityRef: recoveryPrepared.authority!.reference,
      actor, origin: recoveryOrigin, accept: true,
    })
    if (recoveryDecided.kind !== 'accepted') throw new Error(recoveryDecided.code)
    const recoveryAcquired = recoveryAdapter.acquire({
      invocationRef: recoveryPrepared.invocationRef,
      expectedInvocationVersion: recoveryDecided.view.invocationVersion,
      authorityRef: recoveryPrepared.authority!.reference,
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
      authorityRef: recoveryPrepared.authority!.reference,
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
    const recoveryAttempt = uncertain.view.attempts[0]!
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
    const sourceDigest = canonicalDigest({
      operation: fixture.operation,
      descriptor: {
        id: fixture.descriptor.id,
        version: fixture.descriptor.version,
        target: fixture.descriptor.target,
        inputSchema: fixture.descriptor.inputSchema,
        outputSchema: fixture.descriptor.outputSchema,
      },
    } as StableHashValue)
    const material = {
      format: 'dynamic-published-action-invocation-evidence:v1' as const,
      environment: 'MOCK/DEVELOPMENT ONLY' as const,
      fixture,
      cases,
      recovery,
      sourceDigest,
      verdict: 'PASS_FOR_DECLARED_CLASS' as const,
      claimCeiling:
        'Labelled fixture/local development proof of the dynamic Action Invocation seam only; no host parity, deployment, independent provider, settlement, fulfilment, production safety, or customer value.',
    }
    const serializable = JSON.parse(JSON.stringify(material)) as typeof material
    return {
      ...serializable,
      packetDigest: canonicalDigest(serializable as unknown as StableHashValue),
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
  const recomputedSource = canonicalDigest({
    operation: packet.fixture.operation,
    descriptor: {
      id: packet.fixture.descriptor.id,
      version: packet.fixture.descriptor.version,
      target: packet.fixture.descriptor.target,
      inputSchema: packet.fixture.descriptor.inputSchema,
      outputSchema: packet.fixture.descriptor.outputSchema,
    },
  } as StableHashValue)
  const separatelyResumed = packet.cases.every((entry) => {
    const loaded = loadDynamicPublishedAdapterSnapshot(entry.snapshot)
    const source = createDevelopmentDynamicPublishedSource([rebuiltOperation], loaded.sourceRows)
    const adapter = createDynamicPublishedActionInvocationAdapter({
      operation: rebuiltOperation,
      source,
      runtime: verifierRuntime(),
      now: () => rebuiltOperation.readiness.observedAt + 2_000,
      nextInvocationRef: () => 'verifier:unused',
      nextAuthorityRef: () => 'verifier:unused',
      nextAttemptRef: () => 'verifier:unused',
      durableState: loaded.durableState,
    })
    const view = adapter.inspect(entry.invocationRef)
    return view?.control.state === 'terminal'
      && view.origin.kind === entry.origin.kind
      && view.action.id === rebuiltOperation.operationId
      && view.action.contractVersion === rebuiltDescriptor.version
  })
  if (
    canonicalDigest(material as unknown as StableHashValue) !== packetDigest
    || recomputedSource !== packet.sourceDigest
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
    createX402PaymentSignature: async () => undefined,
  }
}

function successRuntime(endpoint: string, effects: { payment: number; provider: number }): RouteTransportRuntime {
  const challenge = {
    x402Version: 2,
    resource: { url: `${endpoint}?symbol=BTC&convert=USD` },
    accepts: [{
      scheme: 'exact', network: 'eip155:8453', amount: '10000', asset: '0xmock-usdc',
      payTo: '0xmock-provider-recipient', maxTimeoutSeconds: 30, extra: {},
    }],
  }
  const send: RouteTransportFetch = async (_url, init) => {
    if (init?.headers?.['Payment-Signature'] === undefined) {
      return response(402, '', {
        'payment-required': Buffer.from(JSON.stringify(challenge)).toString('base64'),
      })
    }
    effects.provider += 1
    return response(200, JSON.stringify({ data: { BTC: { price: 1 } } }), {
      'payment-response': 'mock:payment-proof',
      'provider-receipt': 'mock:provider-receipt',
    })
  }
  return {
    send,
    resolveCredential: () => 'mock:server-held-credential',
    createX402PaymentSignature: async () => {
      effects.payment += 1
      return 'mock:payment-signature'
    },
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

function response(status: number, body: string, headers: Record<string, string>) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  }
}
