import {
  createDevelopmentDynamicPublishedSource,
  createDynamicPublishedActionInvocationAdapter,
  createDevelopmentInvocationApplication,
  createRequestOwnedDevelopmentHost,
  type DevelopmentHostCommandEvent,
  type DynamicPublishedAdapterSnapshot,
  type StructuredInvocationTaskProjection,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  developmentLostResponseRuntime,
  developmentSuccessRuntime,
  type DevelopmentEffectCounts,
  type DevelopmentTransportTraceEvent,
} from './development-host-scenario-runtime'
import { buildDevelopmentPublishedOperationEvidence } from './development-published-operation-evidence'
import {
  directEndpointBaselineTask,
  type DirectEndpointCase,
} from './direct-endpoint-baseline-contract'

export type Gate10HostRawEvent = Readonly<{
  sequence: number
  case: DirectEndpointCase
  source: 'host_application' | 'transport_runtime' | 'provider_runtime' | 'source_application'
  kind: string
  detail: Readonly<Record<string, StableHashValue>>
}>

export type Gate10HostCaseTrace = Readonly<{
  case: DirectEndpointCase
  task: typeof directEndpointBaselineTask
  timeline: readonly Gate10HostRawEvent[]
  checkpoints: Readonly<{
    gathering: DynamicPublishedAdapterSnapshot
    prepared: DynamicPublishedAdapterSnapshot
    corrected?: DynamicPublishedAdapterSnapshot
    authorized: DynamicPublishedAdapterSnapshot
    uncertain?: DynamicPublishedAdapterSnapshot
    final: DynamicPublishedAdapterSnapshot
  }>
  projections: readonly Readonly<{
    checkpoint: 'gathering' | 'prepared' | 'corrected' | 'authorized' | 'uncertain' | 'final'
    projection: StructuredInvocationTaskProjection
  }>[]
  staleAuthorityRefusal?: string
  retryBeforeReconcile?: string
  effects: DevelopmentEffectCounts
}>

export async function runRequestOwnedGate10HostTraces(): Promise<readonly Gate10HostCaseTrace[]> {
  const originalNow = Date.now
  const fixture = buildDevelopmentPublishedOperationEvidence()
  Date.now = () => fixture.operation.readiness.observedAt + 1_000
  try {
    const output = []
    for (const caseName of directEndpointBaselineTask.cases) {
      output.push(await runHostCase(caseName))
    }
    return output
  } finally {
    Date.now = originalNow
  }
}

async function runHostCase(caseName: DirectEndpointCase): Promise<Gate10HostCaseTrace> {
  const fixture = buildDevelopmentPublishedOperationEvidence()
  assertSameTask(fixture)
  const timeline: Gate10HostRawEvent[] = []
  const effects: DevelopmentEffectCounts = { payment: 0, provider: 0 }
  const append = (
    source: Gate10HostRawEvent['source'],
    kind: string,
    detail: Readonly<Record<string, StableHashValue>>,
  ) => timeline.push({ sequence: timeline.length + 1, case: caseName, source, kind, detail })
  const observeTransport = (event: DevelopmentTransportTraceEvent) => append(
    event.kind.startsWith('provider_') ? 'provider_runtime' : 'transport_runtime',
    event.kind,
    event.detail,
  )
  const runtime = caseName === 'post_release_uncertainty'
    ? developmentLostResponseRuntime(fixture.operation.binding.endpointUrl, effects, observeTransport)
    : developmentSuccessRuntime(fixture.operation.binding.endpointUrl, effects, observeTransport)
  const source = createDevelopmentDynamicPublishedSource([fixture.operation])
  let authoritySequence = 0
  const adapter = createDynamicPublishedActionInvocationAdapter({
    operation: fixture.operation,
    source,
    runtime,
    now: () => fixture.operation.readiness.observedAt + 1_000,
    nextInvocationRef: () => `gate10:request:${caseName}:invocation`,
    nextAuthorityRef: () => `gate10:request:${caseName}:authority:${++authoritySequence}`,
    nextAttemptRef: () => `gate10:request:${caseName}:attempt:1`,
  })
  const application = createDevelopmentInvocationApplication({
    adapter,
    observer: (event) => observeHostCommand(event, append),
    sourceCommands: {
      leaseOwner: (_host, invocationRef) => `gate10:source-worker:${invocationRef}`,
      reconciliationEvidence: (view) => {
        if (view.control.state !== 'reconciliation_required') return undefined
        const currentAttemptRef = view.control.attemptRef
        const attempt = view.attempts.find(({ attemptRef }) => attemptRef === currentAttemptRef)
        if (attempt === undefined) return undefined
        const material = {
          kind: 'action_invocation_reconciliation' as const,
          version: 1 as const,
          evidenceRef: `gate10:source-reconciliation:${view.invocationRef}`,
          source: `published-operation:${fixture.operation.operationId}`,
          invocationRef: view.invocationRef,
          attemptRef: attempt.attemptRef,
          effectGeneration: attempt.effectGeneration,
          resolution: 'released' as const,
          observedAt: new Date(fixture.operation.readiness.observedAt + 1_000).toISOString(),
        }
        append('source_application', 'reconciliation_evidence', {
          attemptRef: attempt.attemptRef,
          resolution: material.resolution,
          evidenceRef: material.evidenceRef,
          source: material.source,
        })
        return { ...material, digest: canonicalDigest(material) }
      },
    },
  })
  const host = createRequestOwnedDevelopmentHost({
    application,
    actor: {
      callerRef: 'human:request-owned-host',
      principalRef: 'principal:host-parity-customer',
    },
    requestRef: 'request:host-parity-existing',
    revision: 7,
  })
  const projections: Gate10HostCaseTrace['projections'][number][] = []
  const gathering = host.begin(directEndpointBaselineTask.startingFacts)
  const gatheringSnapshot = clone(host.exportSnapshot())
  projections.push({
    checkpoint: 'gathering',
    projection: host.projectStructured(gathering.invocationRef, gathering.invocationVersion),
  })
  const prepared = host.answer(gathering.invocationRef, directEndpointBaselineTask.answer, 60_000)
  if (!('control' in prepared) || prepared.control.state !== 'awaiting_authority') {
    throw new Error('gate10_host_prepare_failed')
  }
  const preparedSnapshot = clone(host.exportSnapshot())
  projections.push({
    checkpoint: 'prepared',
    projection: host.projectStructured(prepared.invocationRef, prepared.invocationVersion),
  })
  const initialAuthorityRef = prepared.authority!.reference
  const accepted = host.decide(prepared.invocationRef, true)
  if (accepted.kind !== 'accepted') throw new Error(`gate10_host_decision:${accepted.code}`)
  let authorizedSnapshot = clone(host.exportSnapshot())
  projections.push({
    checkpoint: 'authorized',
    projection: host.projectStructured(accepted.view.invocationRef, accepted.view.invocationVersion),
  })
  let correctedSnapshot: DynamicPublishedAdapterSnapshot | undefined
  let staleAuthorityRefusal: string | undefined
  if (caseName === 'material_correction') {
    const corrected = host.correct(
      prepared.invocationRef,
      directEndpointBaselineTask.correction,
      60_000,
    )
    if (corrected.kind !== 'accepted' || corrected.view.control.state !== 'awaiting_authority') {
      throw new Error(`gate10_host_correction:${corrected.kind === 'refused' ? corrected.code : 'state'}`)
    }
    correctedSnapshot = clone(host.exportSnapshot())
    projections.push({
      checkpoint: 'corrected',
      projection: host.projectStructured(corrected.view.invocationRef, corrected.view.invocationVersion),
    })
    const stale = adapter.decide({
      invocationRef: corrected.view.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: initialAuthorityRef,
      actor: host.actor,
      origin: host.origin,
      accept: true,
    })
    staleAuthorityRefusal = stale.kind === 'refused' ? stale.code : stale.kind
    append('source_application', 'stale_authority_probe', {
      authorityRef: initialAuthorityRef,
      result: staleAuthorityRefusal,
    })
    const fresh = host.decide(corrected.view.invocationRef, true)
    if (fresh.kind !== 'accepted') throw new Error(`gate10_host_fresh_decision:${fresh.code}`)
    authorizedSnapshot = clone(host.exportSnapshot())
    projections.push({
      checkpoint: 'authorized',
      projection: host.projectStructured(fresh.view.invocationRef, fresh.view.invocationVersion),
    })
  }
  const continued = await host.continue(prepared.invocationRef)
  if (continued.kind !== 'completed') throw new Error(`gate10_host_continue:${continued.kind}`)
  let uncertainSnapshot: DynamicPublishedAdapterSnapshot | undefined
  let retryBeforeReconcile: string | undefined
  if (caseName === 'post_release_uncertainty') {
    uncertainSnapshot = clone(host.exportSnapshot())
    const uncertainView = host.inspect(prepared.invocationRef)!
    projections.push({
      checkpoint: 'uncertain',
      projection: host.projectStructured(uncertainView.invocationRef, uncertainView.invocationVersion),
    })
    const retry = await host.continue(prepared.invocationRef)
    retryBeforeReconcile = retry.kind === 'refused' ? retry.code : retry.kind
    append('source_application', 'automated_recovery_dispatch', {
      invocationRef: prepared.invocationRef,
      humanDecisionRequired: false,
    })
    const recovered = host.recover(prepared.invocationRef)
    if (recovered.kind !== 'reconciled') throw new Error(`gate10_host_recover:${recovered.kind}`)
  }
  const finalSnapshot = clone(host.exportSnapshot())
  const finalView = host.inspect(prepared.invocationRef)!
  projections.push({
    checkpoint: 'final',
    projection: host.projectStructured(finalView.invocationRef, finalView.invocationVersion),
  })
  return {
    case: caseName,
    task: directEndpointBaselineTask,
    timeline,
    checkpoints: {
      gathering: gatheringSnapshot,
      prepared: preparedSnapshot,
      ...(correctedSnapshot === undefined ? {} : { corrected: correctedSnapshot }),
      authorized: authorizedSnapshot,
      ...(uncertainSnapshot === undefined ? {} : { uncertain: uncertainSnapshot }),
      final: finalSnapshot,
    },
    projections,
    ...(staleAuthorityRefusal === undefined ? {} : { staleAuthorityRefusal }),
    ...(retryBeforeReconcile === undefined ? {} : { retryBeforeReconcile }),
    effects: { ...effects },
  }
}

function observeHostCommand(
  event: DevelopmentHostCommandEvent,
  append: (
    source: Gate10HostRawEvent['source'],
    kind: string,
    detail: Readonly<Record<string, StableHashValue>>,
  ) => void,
): void {
  append('host_application', `${event.phase}:${event.command}`, {
    host: event.host,
    ...(event.invocationRef === undefined ? {} : { invocationRef: event.invocationRef }),
    ...event.detail,
  })
}

function assertSameTask(
  fixture: ReturnType<typeof buildDevelopmentPublishedOperationEvidence>,
): void {
  const operation = directEndpointBaselineTask.operation
  if (fixture.operation.identity.endpoint.resource !== `${operation.method} ${operation.path}`
    || fixture.operation.identity.publicationRef !== operation.publicationRef
    || fixture.operation.identity.publicationRevision !== operation.publicationRevision
    || fixture.operation.identity.price.kind !== 'fixed'
    || fixture.operation.identity.price.currency !== operation.price.currency
    || fixture.operation.identity.price.amountMinor !== operation.price.amountMinor
    || fixture.operation.identity.payment.kind !== 'x402'
    || fixture.operation.identity.payment.network !== operation.payment.network
    || fixture.operation.identity.payment.asset !== operation.payment.asset
    || fixture.operation.identity.payment.payTo !== operation.payment.payTo) {
    throw new Error('gate10_host_task_binding_invalid')
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
