import { describe, expect, it, vi } from 'vitest'
import schema from '../../../convex/schema'
import { stableHash } from '@/modules/common/stable-hash'

vi.mock('@/modules/registry/registry.functions', () => ({
  readPublicRegistryBusinessDetail: vi.fn(),
  readPublicRegistryCatalogPage: vi.fn(),
  readPublicRegistrySearchPage: vi.fn(),
}))

import { findAction } from '@/modules/actions'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createAsyncDurableActionInvocationTracer,
  createDurableActionInvocationTracer,
  readCompletedResultIdentity,
  type ActionInvocationOrigin,
  type InvocationActor,
  type PreparedInvocation,
  type AsyncDurableActionInvocationPort,
} from '@/modules/action-invocation'

const actor: InvocationActor = {
  callerRef: 'mock:caller:cold-agent',
  principalRef: 'mock:principal:owner',
}
const origins: readonly ActionInvocationOrigin[] = [
  { kind: 'request_owned', requestRef: 'mock:request:durable', revision: 7 },
  { kind: 'standalone', ...actor },
]
const input = {
  target: {
    businessId: 'mock:business:durable',
    serviceId: 'mock:service:quote',
    capabilityKind: 'quote_request' as const,
  },
  body: 'RAW BODY MUST REMAIN SOURCE OWNED',
  contact: { email: 'raw-contact@example.test' },
  expectedDigest: `sha256:${'b'.repeat(64)}`,
  operationKey: 'mock:source:inquiry:durable',
}

describe('durable Action Invocation control', () => {
  it('reconstructs through the async runtime contract with a fresh port instance', async () => {
    const action = findAction('inquiry.submit')!
    const state = createDevelopmentDurableState()
    const asyncPort = (): AsyncDurableActionInvocationPort => ({
      transact: async (command) => createDevelopmentDurablePort(state).transact(command),
      readControl: async (ref) => createDevelopmentDurablePort(state).readControl(ref),
      readAttempts: async ({ invocationRef, numItems }) => ({
        page: createDevelopmentDurablePort(state).readAttempts(invocationRef, numItems),
        continueCursor: '', isDone: true,
      }),
      readHistory: async ({ invocationRef, numItems }) => ({
        page: createDevelopmentDurablePort(state).readHistory(invocationRef, 0, numItems),
        continueCursor: '', isDone: true,
      }),
      recordLateObservation: async (observation) =>
        createDevelopmentDurablePort(state).recordLateObservation(observation),
    })
    const source = {
      input,
      context: { developmentOnlyInquirySubmitAdapter: vi.fn() },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const firstProcess = await createAsyncDurableActionInvocationTracer({
      action, port: asyncPort(),
      now: () => '2026-07-19T08:30:00.000Z',
      nextInvocationRef: () => 'dev:async-durable:standalone',
      nextAuthorityRef: () => 'opaque:async-durable',
      resolveSourceState: () => source,
    })
    const prepared = await firstProcess.prepare({
      origin: origins[1]!, actor, input, context: source.context, freshnessMs: 60_000,
    })
    source.prepared = prepared.prepared!
    const freshProcess = await createAsyncDurableActionInvocationTracer({
      action, port: asyncPort(),
      now: () => '2026-07-19T08:30:00.000Z',
      nextInvocationRef: () => 'unused',
      resolveSourceState: () => source,
    }, prepared.invocationRef)
    expect(await freshProcess.inspect(prepared.invocationRef)).toMatchObject({
      persistence: 'durable_control',
      invocationRef: prepared.invocationRef,
      control: { state: 'awaiting_authority' },
    })
  })

  it('composes the module-owned control, attempt and history tables with bounded-read indexes', () => {
    const exported = JSON.parse(String(Reflect.get(schema, 'export').call(schema))) as {
      tables: { tableName: string; indexes: { indexDescriptor: string }[] }[]
    }
    const indexes = Object.fromEntries(exported.tables.map((table) => [
      table.tableName,
      table.indexes.map(({ indexDescriptor }) => indexDescriptor),
    ]))
    expect(indexes.actionInvocationControls).toEqual(expect.arrayContaining([
      'by_invocationRef', 'by_control_owner_principalRef_and_invocationRef', 'by_sourceRef_and_invocationRef',
    ]))
    expect(indexes.actionInvocationAttempts).toEqual(expect.arrayContaining([
      'by_invocationRef_and_attemptNumber', 'by_invocationRef_and_attemptRef',
      'by_effectIdentity_and_attemptRef',
    ]))
    expect(indexes.actionInvocationHistory).toEqual(expect.arrayContaining([
      'by_invocationRef_and_commandId', 'by_invocationRef_and_invocationVersion',
      'by_invocationRef_and_effectGeneration',
    ]))
  })

  it.each(origins)('persists, cold-resumes and cancels before release for $kind', (origin) => {
    const action = findAction('inquiry.submit')!
    const durableState = createDevelopmentDurableState()
    const port = createDevelopmentDurablePort(durableState)
    const source = {
      input,
      context: { developmentOnlyInquirySubmitAdapter: vi.fn() },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    let invocationSequence = 0
    const create = (selectedPort = port, resumeRef?: string) => createDurableActionInvocationTracer({
      action,
      port: selectedPort,
      now: () => '2026-07-19T09:00:00.000Z',
      nextInvocationRef: () => `dev:durable:${origin.kind}:${++invocationSequence}`,
      nextAuthorityRef: () => `opaque:durable:${origin.kind}`,
      nextAttemptRef: () => `dev:attempt:${origin.kind}:1`,
      resolveSourceState: () => source,
    }, resumeRef)
    const tracer = create()
    const prepared = tracer.prepare({
      origin,
      actor,
      input,
      context: source.context,
      freshnessMs: 60_000,
    })
    source.prepared = prepared.prepared!
    const decided = tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = tracer.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      materialInput: input,
      leaseOwner: 'mock:worker:one',
      leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted') throw new Error(acquired.code)
    if (acquired.view.control.state !== 'leased') throw new Error('Expected lease')
    const noRelease = tracer.publishObservation({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
      release: 'not_released',
    })
    if (noRelease.kind !== 'accepted') throw new Error(noRelease.code)

    const freshProcess = create(
      createDevelopmentDurablePort(durableState),
      prepared.invocationRef,
    )
    expect(freshProcess.inspect(prepared.invocationRef)).toMatchObject({
      persistence: 'durable_control',
      origin,
      control: { state: 'retryable', reason: 'pre_release_failure' },
    })
    const cancelled = freshProcess.cancel({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: noRelease.view.invocationVersion,
      actor,
      origin,
    })
    expect(cancelled).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'cancelled', effect: 'not_released' } },
    })

    const persisted = JSON.stringify({
      control: port.readControl(prepared.invocationRef),
      attempts: port.readAttempts(prepared.invocationRef, 10),
      history: port.readHistory(prepared.invocationRef, 0, 20),
    })
    expect(persisted).not.toContain(input.body)
    expect(persisted).not.toContain(input.contact.email)
    expect(persisted).toContain(input.operationKey)
    if (origin.kind === 'request_owned') {
      expect(readCompletedResultIdentity(port, prepared.invocationRef, actor, () => ({})))
        .toEqual({ kind: 'refused', code: 'request_owned_refused' })
    }
  })

  it('fences stale generation, preserves uncertainty, and records late evidence as non-current', () => {
    const origin = origins[1]!
    const action = findAction('inquiry.submit')!
    const port = createDevelopmentDurablePort()
    const source = {
      input,
      context: { developmentOnlyInquirySubmitAdapter: vi.fn() },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const tracer = createDurableActionInvocationTracer({
      action,
      port,
      now: () => '2026-07-19T10:00:00.000Z',
      nextInvocationRef: () => 'dev:durable:uncertain',
      nextAuthorityRef: () => 'opaque:durable:uncertain',
      nextAttemptRef: () => 'dev:attempt:uncertain:1',
      resolveSourceState: () => source,
    })
    const prepared = tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 60_000,
    })
    source.prepared = prepared.prepared!
    const decided = tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = tracer.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input, leaseOwner: 'mock:worker:current', leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      throw new Error('Expected acquired generation')
    }
    const token = acquired.view.control
    const competingProcess = tracer.coldResume(prepared.invocationRef)
    expect(tracer.publishObservation({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: token.attemptRef,
      leaseOwner: token.leaseOwner,
      effectGeneration: token.effectGeneration + 1,
      release: 'not_released',
    })).toMatchObject({ kind: 'refused', code: 'effect_generation_stale' })

    const uncertain = tracer.publishObservation({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: token.attemptRef,
      leaseOwner: token.leaseOwner,
      effectGeneration: token.effectGeneration,
      release: 'possibly_released',
    })
    expect(uncertain).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'reconciliation_required' } },
    })
    const conflicting = competingProcess.publishObservation({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: token.attemptRef,
      leaseOwner: token.leaseOwner,
      effectGeneration: token.effectGeneration,
      release: 'not_released',
    })
    expect(conflicting).toMatchObject({
      kind: 'refused',
      code: 'command_identity_conflict',
      view: { control: { state: 'reconciliation_required' } },
    })
    expect(competingProcess.inspect(prepared.invocationRef)?.control)
      .toEqual(port.readControl(prepared.invocationRef)?.control.control)
    const late = tracer.recordLateObservation({
      invocationRef: prepared.invocationRef,
      commandId: 'mock:late:observation:1',
      effectGeneration: token.effectGeneration,
      actorRef: 'mock:worker:late',
      sourceEvidenceRef: 'mock:evidence:worker-log',
      release: 'released',
      evidenceDigest: 'sha256:mock-evidence',
    })
    expect(late).toEqual({ kind: 'applied', invocationVersion: uncertain.kind === 'accepted' ? uncertain.view.invocationVersion : 0 })
    expect(tracer.recordLateObservation({
      invocationRef: prepared.invocationRef,
      commandId: 'mock:late:observation:1',
      effectGeneration: token.effectGeneration,
      actorRef: 'mock:worker:late',
      sourceEvidenceRef: 'mock:evidence:worker-log',
      release: 'released',
      evidenceDigest: 'sha256:mock-evidence',
    })).toEqual({
      kind: 'duplicate',
      invocationVersion: uncertain.kind === 'accepted' ? uncertain.view.invocationVersion : 0,
    })
    expect(tracer.recordLateObservation({
      invocationRef: prepared.invocationRef,
      commandId: 'mock:late:observation:1',
      effectGeneration: token.effectGeneration,
      actorRef: 'mock:worker:late',
      sourceEvidenceRef: 'mock:evidence:worker-log',
      release: 'not_released',
      evidenceDigest: 'sha256:different',
    })).toEqual({ kind: 'refused', code: 'command_identity_conflict' })
    expect(port.readHistory(prepared.invocationRef, 0, 20)).toContainEqual(
      expect.objectContaining({ kind: 'late_observation', current: false }),
    )
    expect(port.readControl(prepared.invocationRef)?.control.control).toEqual({
      state: 'reconciliation_required',
      attemptRef: token.attemptRef,
    })
  })

  it('exposes only a source-verified completed-result identity and refuses tamper or nonterminal reads', async () => {
    const origin = origins[1]!
    const action = findAction('inquiry.submit')!
    const port = createDevelopmentDurablePort()
    const result = {
      kind: 'ok' as const,
      code: 'inquiry_submitted' as const,
      receipt: {
        threadId: 'mock:thread:durable',
        businessId: 'mock:business:durable',
        serviceId: 'mock:service:quote',
        status: 'open' as const,
        version: 1,
        notificationId: 'mock:notification:durable',
        notificationStatus: 'queued' as const,
        accessKey: 'SECRET-MUST-NOT-PERSIST',
      },
    }
    const source = {
      input,
      context: { developmentOnlyInquirySubmitAdapter: vi.fn().mockResolvedValue(result) },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
      resultIdentity: {
        sourceResultRef: 'mock:inquiry-result:durable',
        resultDigest: String(stableHash(result)),
      },
    }
    const tracer = createDurableActionInvocationTracer({
      action, port,
      now: () => '2026-07-19T11:00:00.000Z',
      nextInvocationRef: () => 'dev:durable:completed',
      nextAuthorityRef: () => 'opaque:durable:completed',
      nextAttemptRef: () => 'dev:attempt:completed:1',
      resolveSourceState: () => source,
    })
    const prepared = tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 60_000,
    })
    source.prepared = prepared.prepared!
    expect(readCompletedResultIdentity(port, prepared.invocationRef, actor, () => ({
      sourceResultRef: source.resultIdentity.sourceResultRef, result,
    }))).toEqual({ kind: 'refused', code: 'invocation_not_terminal' })
    const decided = tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const completed = await tracer.execute({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input,
    })
    expect(completed).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'terminal' } },
    })
    expect(readCompletedResultIdentity(port, prepared.invocationRef, actor, () => ({
      sourceResultRef: source.resultIdentity.sourceResultRef, result,
    }))).toMatchObject({
      kind: 'completed_result',
      sourceResultRef: 'mock:inquiry-result:durable',
      businessOutcome: 'queued_communication',
    })
    expect(readCompletedResultIdentity(
      port,
      prepared.invocationRef,
      { ...actor, principalRef: 'mock:principal:other' },
      () => ({ sourceResultRef: source.resultIdentity.sourceResultRef, result }),
    )).toEqual({ kind: 'refused', code: 'cross_principal_refused' })
    expect(readCompletedResultIdentity(port, prepared.invocationRef, actor, () => ({
      sourceResultRef: source.resultIdentity.sourceResultRef,
      result: { ...result, code: 'tampered' } as never,
    }))).toEqual({ kind: 'refused', code: 'source_result_mismatch' })
    expect(JSON.stringify(port.readControl(prepared.invocationRef))).not.toContain(result.receipt.accessKey)
  })
})
