import { describe, expect, it, vi } from 'vitest'
import schema from '../../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { ActionContext, ActionResult } from '@/modules/common/action'

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
  type ReconciliationEvidence,
  type ReconciliationEvidenceMaterial,
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

function createEvidenceSource() {
  const issued = new Set<string>()
  return {
    issue(material: ReconciliationEvidenceMaterial): ReconciliationEvidence {
      const evidence = { ...material, digest: canonicalDigest(material as never) }
      issued.add(canonicalDigest(evidence as never))
      return evidence
    },
    verify: (evidence: ReconciliationEvidence) =>
      issued.has(canonicalDigest(evidence as never)),
  }
}

describe('durable Action Invocation control', () => {
  it.each(origins)('grants one async effect permit for duplicate same-token workers with $kind', async (origin) => {
    let resolveRunner!: (value: { kind: 'error'; code: string; retryable: false; reason: string }) => void
    const runner = new Promise<{ kind: 'error'; code: string; retryable: false; reason: string }>(
      (resolve) => { resolveRunner = resolve },
    )
    const adapter = vi.fn(() => runner)
    const action = findAction('inquiry.submit')!
    const state = createDevelopmentDurableState()
    const sync = () => createDevelopmentDurablePort(state)
    let beginCount = 0
    let firstBeginSeen!: () => void
    const firstBeginPending = new Promise<void>((resolve) => { firstBeginSeen = resolve })
    let releaseFirstBegin!: () => void
    const firstBeginGate = new Promise<void>((resolve) => { releaseFirstBegin = resolve })
    const asyncPort: AsyncDurableActionInvocationPort = {
      transact: async (command) => {
        if (command.history.kind === 'begin_release' && ++beginCount === 1) {
          firstBeginSeen()
          await firstBeginGate
        }
        return sync().transact(command)
      },
      readControl: async (ref) => sync().readControl(ref),
      readAttempts: async ({ invocationRef, numItems }) => ({
        page: sync().readAttempts(invocationRef, numItems),
        continueCursor: '', isDone: true,
      }),
      readAttempt: async (invocationRef, attemptRef) => sync().readAttempt(invocationRef, attemptRef),
      readHistory: async ({ invocationRef, numItems }) => ({
        page: sync().readHistory(invocationRef, 0, numItems),
        continueCursor: '', isDone: true,
      }),
      recordLateObservation: async (observation) => sync().recordLateObservation(observation),
    }
    const source = {
      input,
      context: { developmentOnlyInquirySubmitAdapter: adapter },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const root = await createAsyncDurableActionInvocationTracer({
      action, port: asyncPort,
      now: () => '2026-07-19T15:00:00.000Z',
      nextInvocationRef: () => `dev:async:single-permit:${origin.kind}`,
      nextAuthorityRef: () => `opaque:async:single-permit:${origin.kind}`,
      nextAttemptRef: () => `dev:async:single-permit:attempt:${origin.kind}`,
      resolveSourceState: () => source,
    })
    const prepared = await root.prepare({
      origin, actor, input, context: source.context, freshnessMs: 300_000,
    })
    source.prepared = prepared.prepared!
    const decided = await root.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = await root.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input,
      leaseOwner: 'mock:async:single-permit',
      leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      throw new Error('Expected single-permit lease.')
    }
    const firstWorker = await root.coldResume(prepared.invocationRef)
    const secondWorker = await root.coldResume(prepared.invocationRef)
    const token = acquired.view.control
    const firstCompletion = firstWorker.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: token.attemptRef,
      leaseOwner: token.leaseOwner,
      effectGeneration: token.effectGeneration,
    })
    await firstBeginPending
    const winningCompletion = secondWorker.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: token.attemptRef,
      leaseOwner: token.leaseOwner,
      effectGeneration: token.effectGeneration,
    })
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(1))
    expect(sync().readControl(prepared.invocationRef)?.control.control).toMatchObject({
      state: 'leased',
      release: 'possibly_released',
    })
    releaseFirstBegin()
    const replay = await firstCompletion
    expect(replay).toMatchObject({
      kind: 'refused',
      code: 'reconciliation_required',
      view: {
        invocationRef: prepared.invocationRef,
        control: { state: 'leased', release: 'possibly_released' },
      },
    })
    expect(adapter).toHaveBeenCalledTimes(1)
    resolveRunner({
      kind: 'error',
      code: 'mock_single_permit_complete',
      retryable: false,
      reason: 'MOCK single permit completion',
    })
    await expect(winningCompletion).resolves.toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'terminal' } },
    })
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(sync().readControl(prepared.invocationRef)?.control.control).toEqual({ state: 'terminal' })
  })

  it('grants one sync effect permit when two cold workers replay the same token', async () => {
    let resolveRunner!: (value: { kind: 'error'; code: string; retryable: false; reason: string }) => void
    const runner = new Promise<{ kind: 'error'; code: string; retryable: false; reason: string }>(
      (resolve) => { resolveRunner = resolve },
    )
    const adapter = vi.fn(() => runner)
    const action = findAction('inquiry.submit')!
    const state = createDevelopmentDurableState()
    const port = createDevelopmentDurablePort(state)
    const source = {
      input,
      context: { developmentOnlyInquirySubmitAdapter: adapter },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const create = (resumeRef?: string) => createDurableActionInvocationTracer({
      action, port,
      now: () => '2026-07-19T15:15:00.000Z',
      nextInvocationRef: () => 'dev:sync:single-permit',
      nextAuthorityRef: () => 'opaque:sync:single-permit',
      nextAttemptRef: () => 'dev:sync:single-permit:attempt',
      resolveSourceState: () => source,
    }, resumeRef)
    const root = create()
    const origin = origins[1]!
    const prepared = root.prepare({
      origin, actor, input, context: source.context, freshnessMs: 300_000,
    })
    source.prepared = prepared.prepared!
    const decided = root.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = root.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input,
      leaseOwner: 'mock:sync:single-permit',
      leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      throw new Error('Expected sync single-permit lease.')
    }
    const winner = create(prepared.invocationRef)
    const loser = create(prepared.invocationRef)
    const token = acquired.view.control
    const winningCompletion = winner.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: token.attemptRef,
      leaseOwner: token.leaseOwner,
      effectGeneration: token.effectGeneration,
    })
    expect(adapter).toHaveBeenCalledTimes(1)
    await expect(loser.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: token.attemptRef,
      leaseOwner: token.leaseOwner,
      effectGeneration: token.effectGeneration,
    })).resolves.toMatchObject({
      kind: 'refused',
      code: 'reconciliation_required',
      view: { control: { state: 'leased', release: 'possibly_released' } },
    })
    expect(adapter).toHaveBeenCalledTimes(1)
    resolveRunner({
      kind: 'error',
      code: 'mock_sync_single_permit_complete',
      retryable: false,
      reason: 'MOCK sync single permit completion',
    })
    await expect(winningCompletion).resolves.toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'terminal' } },
    })
  })

  it('refuses non-monotonic rows while preserving exact duplicate idempotency', () => {
    const state = createDevelopmentDurableState()
    const port = createDevelopmentDurablePort(state)
    const invocationRef = 'dev:durable:monotonic'
    const row = {
      invocationRef,
      invocationVersion: 1,
      sourceRef: 'mock:source:monotonic',
      control: {
        invocationRef,
        invocationVersion: 1,
        environment: 'MOCK/DEVELOPMENT ONLY' as const,
        persistence: 'durable_control' as const,
        origin: origins[1]!,
        owner: actor,
        action: { id: 'inquiry.submit', contractVersion: 'inquiry.submit:v1' },
        desired: { state: 'invoke' as const },
        freshness: { state: 'not_observed' as const },
        control: { state: 'authorized' as const, decidedAt: '2026-07-19T14:45:00.000Z' },
      },
      updatedAt: '2026-07-19T14:45:00.000Z',
    }
    const create = {
      commandId: 'mock:monotonic:create',
      commandDigest: canonicalDigest({ invocationRef, version: 1 }),
      expectedInvocationVersion: null,
      row,
      history: {
        invocationRef,
        commandId: 'mock:monotonic:create',
        commandDigest: canonicalDigest({ invocationRef, version: 1 }),
        commandResult: 'applied' as const,
        kind: 'create',
      },
    }
    expect(port.transact(create)).toEqual({ kind: 'applied', invocationVersion: 1 })
    const downgrade = {
      ...create,
      commandId: 'mock:monotonic:downgrade',
      commandDigest: canonicalDigest({ invocationRef, version: 1, downgrade: true }),
      expectedInvocationVersion: 1,
      history: {
        ...create.history,
        commandId: 'mock:monotonic:downgrade',
        commandDigest: canonicalDigest({ invocationRef, version: 1, downgrade: true }),
        kind: 'downgrade',
      },
    }
    expect(port.transact(downgrade)).toEqual({
      kind: 'refused',
      code: 'stale_invocation_version',
    })
    const advance = {
      ...create,
      commandId: 'mock:monotonic:advance',
      commandDigest: canonicalDigest({ invocationRef, version: 2 }),
      expectedInvocationVersion: 1,
      row: {
        ...row,
        invocationVersion: 2,
        control: { ...row.control, invocationVersion: 2 },
      },
      history: {
        ...create.history,
        commandId: 'mock:monotonic:advance',
        commandDigest: canonicalDigest({ invocationRef, version: 2 }),
        kind: 'advance',
      },
    }
    expect(port.transact(advance)).toEqual({ kind: 'applied', invocationVersion: 2 })
    expect(port.transact(advance)).toEqual({ kind: 'duplicate', invocationVersion: 2 })
  })

  it('keeps concurrent async invocation command queues isolated while one release transaction pauses', async () => {
    const action = findAction('inquiry.submit')!
    const state = createDevelopmentDurableState()
    const sync = () => createDevelopmentDurablePort(state)
    const events: string[] = []
    let releaseA!: () => void
    const releaseAGate = new Promise<void>((resolve) => { releaseA = resolve })
    let observedAPause!: () => void
    const aPaused = new Promise<void>((resolve) => { observedAPause = resolve })
    const asyncPort: AsyncDurableActionInvocationPort = {
      transact: async (command) => {
        const ref = command.row.invocationRef.endsWith(':1') ? 'A' : 'B'
        events.push(`${ref}:durable:${command.history.kind}:start`)
        if (ref === 'A' && command.history.kind === 'begin_release') {
          observedAPause()
          await releaseAGate
        }
        const result = sync().transact(command)
        events.push(`${ref}:durable:${command.history.kind}:done`)
        return result
      },
      readControl: async (ref) => sync().readControl(ref),
      readAttempts: async ({ invocationRef, numItems }) => ({
        page: sync().readAttempts(invocationRef, numItems),
        continueCursor: '', isDone: true,
      }),
      readAttempt: async (invocationRef, attemptRef) => sync().readAttempt(invocationRef, attemptRef),
      readHistory: async ({ invocationRef, numItems }) => ({
        page: sync().readHistory(invocationRef, 0, numItems),
        continueCursor: '', isDone: true,
      }),
      recordLateObservation: async (observation) => sync().recordLateObservation(observation),
    }
    const sources = new Map<string, {
      input: typeof input
      context: ActionContext
      prepared: PreparedInvocation | undefined
      observedResolution: { state: 'pending' } | {
        state: 'returned'
        execution: 'runner_returned' | 'pre_release_refused'
        businessOutcome: string
        resultReferenceable: boolean
        result: ActionResult
      }
    }>()
    const makeInput = (label: 'A' | 'B') => ({
      ...input,
      operationKey: `mock:source:concurrent:${label}`,
    })
    for (const label of ['A', 'B'] as const) {
      const selectedInput = makeInput(label)
      sources.set(selectedInput.operationKey, {
        input: selectedInput,
        context: {
          developmentOnlyInquirySubmitAdapter: vi.fn(async () => {
            events.push(`${label}:adapter`)
            return {
              kind: 'error' as const,
              code: `mock_${label}_complete`,
              retryable: false,
              reason: `MOCK ${label} completion`,
            }
          }),
        },
        prepared: undefined,
        observedResolution: { state: 'pending' },
      })
    }
    let invocationSequence = 0
    let attemptSequence = 0
    const tracer = await createAsyncDurableActionInvocationTracer({
      action, port: asyncPort,
      now: () => '2026-07-19T14:00:00.000Z',
      nextInvocationRef: () => `dev:async:concurrent:${++invocationSequence}`,
      nextAuthorityRef: () => `opaque:async:concurrent:${invocationSequence}`,
      nextAttemptRef: () => `dev:async:concurrent:attempt:${++attemptSequence}`,
      resolveSourceState: (sourceRef) => {
        const source = sources.get(sourceRef)
        if (source === undefined) throw new Error(`Missing source ${sourceRef}.`)
        return source
      },
    })
    const prepared = await Promise.all((['A', 'B'] as const).map(async (label) => {
      const source = sources.get(`mock:source:concurrent:${label}`)!
      const view = await tracer.prepare({
        origin: origins[1]!, actor, input: source.input,
        context: source.context, freshnessMs: 300_000,
      })
      source.prepared = view.prepared!
      const decided = await tracer.decide({
        invocationRef: view.invocationRef,
        expectedInvocationVersion: view.invocationVersion,
        authorityRef: view.authority!.reference,
        actor, origin: origins[1]!, accept: true,
      })
      if (decided.kind !== 'accepted') throw new Error(decided.code)
      return { label, source, prepared: view, decided: decided.view }
    }))
    events.length = 0
    const a = prepared.find(({ label }) => label === 'A')!
    const b = prepared.find(({ label }) => label === 'B')!
    const executeA = tracer.execute({
      invocationRef: a.prepared.invocationRef,
      expectedInvocationVersion: a.decided.invocationVersion,
      authorityRef: a.prepared.authority!.reference,
      actor, origin: origins[1]!, materialInput: a.source.input,
    })
    await aPaused
    const executeB = tracer.execute({
      invocationRef: b.prepared.invocationRef,
      expectedInvocationVersion: b.decided.invocationVersion,
      authorityRef: b.prepared.authority!.reference,
      actor, origin: origins[1]!, materialInput: b.source.input,
    })
    await expect(executeB).resolves.toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'terminal' } },
    })
    expect(events).toContain('B:adapter')
    expect(events).not.toContain('A:adapter')
    releaseA()
    await expect(executeA).resolves.toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'terminal' } },
    })
    expect(events.indexOf('B:durable:begin_release:done'))
      .toBeLessThan(events.indexOf('B:adapter'))
    expect(events.indexOf('B:adapter'))
      .toBeLessThan(events.indexOf('B:durable:execute_acquired:start'))
    expect(events.indexOf('A:durable:begin_release:done'))
      .toBeLessThan(events.indexOf('A:adapter'))
    expect(events.indexOf('A:adapter'))
      .toBeLessThan(events.indexOf('A:durable:execute_acquired:start'))
    expect(sync().readControl(a.prepared.invocationRef)?.control.control).toEqual({ state: 'terminal' })
    expect(sync().readControl(b.prepared.invocationRef)?.control.control).toEqual({ state: 'terminal' })
  })

  it('scopes a concurrent async begin_release refusal to its exact invocation', async () => {
    const action = findAction('inquiry.submit')!
    const state = createDevelopmentDurableState()
    const sync = () => createDevelopmentDurablePort(state)
    let refusedInvocationRef = ''
    const asyncPort: AsyncDurableActionInvocationPort = {
      transact: async (command) => {
        if (
          command.row.invocationRef === refusedInvocationRef &&
          command.history.kind === 'begin_release'
        ) {
          const current = sync().readControl(refusedInvocationRef)
          if (current === undefined) throw new Error('Missing isolated race row.')
          const version = current.invocationVersion + 1
          const digest = canonicalDigest({ isolatedWinner: command.commandDigest })
          expect(sync().transact({
            ...command,
            commandId: `${command.commandId}:isolated-winner`,
            commandDigest: digest,
            expectedInvocationVersion: current.invocationVersion,
            ...(current.currentEffectGeneration === undefined ? {} : {
              expectedEffectGeneration: current.currentEffectGeneration,
            }),
            row: {
              ...current,
              invocationVersion: version,
              control: {
                ...current.control,
                invocationVersion: version,
                control: { state: 'cancelled', effect: 'not_released' },
              },
            },
            history: {
              invocationRef: refusedInvocationRef,
              commandId: `${command.commandId}:isolated-winner`,
              commandDigest: digest,
              commandResult: 'applied',
              kind: 'isolated_forced_winner',
            },
          })).toMatchObject({ kind: 'applied' })
        }
        return sync().transact(command)
      },
      readControl: async (ref) => sync().readControl(ref),
      readAttempts: async ({ invocationRef, numItems }) => ({
        page: sync().readAttempts(invocationRef, numItems),
        continueCursor: '', isDone: true,
      }),
      readAttempt: async (invocationRef, attemptRef) => sync().readAttempt(invocationRef, attemptRef),
      readHistory: async ({ invocationRef, numItems }) => ({
        page: sync().readHistory(invocationRef, 0, numItems),
        continueCursor: '', isDone: true,
      }),
      recordLateObservation: async (observation) => sync().recordLateObservation(observation),
    }
    const adapters = { A: vi.fn(), B: vi.fn() }
    const sources = new Map<string, {
      input: typeof input
      context: ActionContext
      prepared: PreparedInvocation | undefined
      observedResolution: { state: 'pending' }
    }>()
    for (const label of ['A', 'B'] as const) {
      const selectedInput = { ...input, operationKey: `mock:source:refusal-isolation:${label}` }
      adapters[label].mockResolvedValue({
        kind: 'error', code: `mock_${label}`, retryable: false, reason: `MOCK ${label}`,
      })
      sources.set(selectedInput.operationKey, {
        input: selectedInput,
        context: { developmentOnlyInquirySubmitAdapter: adapters[label] },
        prepared: undefined,
        observedResolution: { state: 'pending' },
      })
    }
    let invocationSequence = 0
    const tracer = await createAsyncDurableActionInvocationTracer({
      action, port: asyncPort,
      now: () => '2026-07-19T14:30:00.000Z',
      nextInvocationRef: () => `dev:async:refusal-isolation:${++invocationSequence}`,
      nextAuthorityRef: () => `opaque:async:refusal-isolation:${invocationSequence}`,
      nextAttemptRef: () => `dev:async:refusal-isolation:attempt:${invocationSequence}`,
      resolveSourceState: (sourceRef) => sources.get(sourceRef)!,
    })
    const ready = []
    for (const label of ['A', 'B'] as const) {
      const source = sources.get(`mock:source:refusal-isolation:${label}`)!
      const prepared = await tracer.prepare({
        origin: origins[1]!, actor, input: source.input,
        context: source.context, freshnessMs: 300_000,
      })
      source.prepared = prepared.prepared!
      const decided = await tracer.decide({
        invocationRef: prepared.invocationRef,
        expectedInvocationVersion: prepared.invocationVersion,
        authorityRef: prepared.authority!.reference,
        actor, origin: origins[1]!, accept: true,
      })
      if (decided.kind !== 'accepted') throw new Error(decided.code)
      ready.push({ label, source, prepared, decided: decided.view })
    }
    const a = ready[0]!
    const b = ready[1]!
    refusedInvocationRef = a.prepared.invocationRef
    const [aResult, bResult] = await Promise.all([
      tracer.execute({
        invocationRef: a.prepared.invocationRef,
        expectedInvocationVersion: a.decided.invocationVersion,
        authorityRef: a.prepared.authority!.reference,
        actor, origin: origins[1]!, materialInput: a.source.input,
      }),
      tracer.execute({
        invocationRef: b.prepared.invocationRef,
        expectedInvocationVersion: b.decided.invocationVersion,
        authorityRef: b.prepared.authority!.reference,
        actor, origin: origins[1]!, materialInput: b.source.input,
      }),
    ])
    expect(aResult).toMatchObject({
      kind: 'refused',
      code: 'stale_invocation_version',
      view: { invocationRef: a.prepared.invocationRef, control: { state: 'cancelled' } },
    })
    expect(bResult).toMatchObject({
      kind: 'accepted',
      view: { invocationRef: b.prepared.invocationRef, control: { state: 'terminal' } },
    })
    expect(adapters.A).not.toHaveBeenCalled()
    expect(adapters.B).toHaveBeenCalledTimes(1)
    expect(sync().readControl(a.prepared.invocationRef)?.control.control)
      .toEqual({ state: 'cancelled', effect: 'not_released' })
    expect(sync().readControl(b.prepared.invocationRef)?.control.control)
      .toEqual({ state: 'terminal' })
  })

  it('fences the sync release transaction to the stale worker token and rehydrates the winner', async () => {
    const origin = origins[1]!
    const action = findAction('inquiry.submit')!
    const state = createDevelopmentDurableState()
    const base = createDevelopmentDurablePort(state)
    const adapter = vi.fn()
    const racingPort = {
      ...base,
      transact(command: Parameters<typeof base.transact>[0]) {
        if (command.history.kind === 'begin_release') {
          const current = base.readControl(command.row.invocationRef)
          if (current === undefined) throw new Error('Missing sync race row.')
          const winnerVersion = current.invocationVersion + 1
          const winnerDigest = canonicalDigest({ winner: command.commandDigest })
          expect(base.transact({
            ...command,
            commandId: `${command.commandId}:sync-winner`,
            commandDigest: winnerDigest,
            expectedInvocationVersion: current.invocationVersion,
            ...(current.currentEffectGeneration === undefined ? {} : {
              expectedEffectGeneration: current.currentEffectGeneration,
            }),
            row: {
              ...current,
              invocationVersion: winnerVersion,
              control: {
                ...current.control,
                invocationVersion: winnerVersion,
                control: { state: 'cancelled', effect: 'not_released' },
              },
              updatedAt: '2026-07-19T12:40:00.000Z',
            },
            history: {
              invocationRef: command.row.invocationRef,
              commandId: `${command.commandId}:sync-winner`,
              commandDigest: winnerDigest,
              commandResult: 'applied',
              kind: 'forced_sync_cas_winner',
            },
          })).toMatchObject({ kind: 'applied' })
        }
        return base.transact(command)
      },
    }
    const source = {
      input,
      context: { developmentOnlyInquirySubmitAdapter: adapter },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const tracer = createDurableActionInvocationTracer({
      action, port: racingPort,
      now: () => '2026-07-19T12:40:00.000Z',
      nextInvocationRef: () => 'dev:durable:sync-cas-race',
      nextAuthorityRef: () => 'opaque:durable:sync-cas-race',
      nextAttemptRef: () => 'dev:attempt:sync-cas-race',
      resolveSourceState: () => source,
    })
    const prepared = tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 300_000,
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
      actor, origin, materialInput: input,
      leaseOwner: 'mock:sync:cas-loser',
      leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      throw new Error('Expected sync race lease.')
    }
    const refused = await tracer.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(refused).toMatchObject({
      kind: 'refused',
      code: 'stale_invocation_version',
      view: { control: { state: 'cancelled', effect: 'not_released' } },
    })
    expect(adapter).not.toHaveBeenCalled()
    expect(tracer.inspect(prepared.invocationRef)).toEqual(refused.view)
  })

  it('reconstructs the exact current attempt beyond the bounded first 100 rows in sync and async ports', async () => {
    const origin = origins[1]!
    const action = findAction('inquiry.submit')!
    const state = createDevelopmentDurableState()
    const port = createDevelopmentDurablePort(state)
    const source = {
      input, context: {},
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const tracer = createDurableActionInvocationTracer({
      action, port,
      now: () => '2026-07-19T12:42:00.000Z',
      nextInvocationRef: () => 'dev:durable:attempt-boundary',
      nextAuthorityRef: () => 'opaque:durable:attempt-boundary',
      nextAttemptRef: () => 'dev:attempt:boundary:1',
      resolveSourceState: () => source,
    })
    const prepared = tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 300_000,
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
      actor, origin, materialInput: input,
      leaseOwner: 'mock:worker:boundary',
      leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      throw new Error('Expected boundary lease.')
    }
    const attemptRows = state.attempts.get(prepared.invocationRef)
    const firstAttempt = attemptRows?.get(acquired.view.control.attemptRef)
    const control = state.controls.get(prepared.invocationRef)
    if (attemptRows === undefined || firstAttempt === undefined || control === undefined) {
      throw new Error('Missing fixture rows.')
    }
    for (let number = 2; number <= 101; number += 1) {
      attemptRows.set(`dev:attempt:boundary:${number}`, {
        ...firstAttempt,
        attemptRef: `dev:attempt:boundary:${number}`,
        attemptNumber: number,
        effectGeneration: number,
      })
    }
    const currentAttemptRef = 'dev:attempt:boundary:101'
    state.controls.set(prepared.invocationRef, {
      ...control,
      currentAttemptRef,
      currentEffectGeneration: 101,
      currentLeaseOwner: 'mock:worker:boundary',
      control: {
        ...control.control,
        control: {
          ...acquired.view.control,
          attemptRef: currentAttemptRef,
          effectGeneration: 101,
        },
      },
    })
    const syncResumed = createDurableActionInvocationTracer({
      action, port: createDevelopmentDurablePort(state),
      now: () => '2026-07-19T12:42:00.000Z',
      nextInvocationRef: () => 'unused',
      resolveSourceState: () => source,
    }, prepared.invocationRef)
    expect(syncResumed.inspect(prepared.invocationRef)).toMatchObject({
      control: { state: 'leased', attemptRef: currentAttemptRef, effectGeneration: 101 },
      attempts: expect.arrayContaining([
        expect.objectContaining({ attemptRef: currentAttemptRef, effectGeneration: 101 }),
      ]),
    })
    const asyncPort: AsyncDurableActionInvocationPort = {
      transact: async (command) => createDevelopmentDurablePort(state).transact(command),
      readControl: async (ref) => createDevelopmentDurablePort(state).readControl(ref),
      readAttempts: async ({ invocationRef, numItems }) => ({
        page: createDevelopmentDurablePort(state).readAttempts(invocationRef, numItems),
        continueCursor: '', isDone: true,
      }),
      readAttempt: async (invocationRef, attemptRef) =>
        createDevelopmentDurablePort(state).readAttempt(invocationRef, attemptRef),
      readHistory: async ({ invocationRef, numItems }) => ({
        page: createDevelopmentDurablePort(state).readHistory(invocationRef, 0, numItems),
        continueCursor: '', isDone: true,
      }),
      recordLateObservation: async (observation) =>
        createDevelopmentDurablePort(state).recordLateObservation(observation),
    }
    const asyncResumed = await createAsyncDurableActionInvocationTracer({
      action, port: asyncPort,
      now: () => '2026-07-19T12:42:00.000Z',
      nextInvocationRef: () => 'unused',
      resolveSourceState: () => source,
    }, prepared.invocationRef)
    expect(await asyncResumed.inspect(prepared.invocationRef)).toEqual(
      syncResumed.inspect(prepared.invocationRef),
    )
  })

  it.each(origins)('persists pre-release refusal without inventing a begin_release version for $kind', async (origin) => {
    const baseAction = findAction('inquiry.submit')!
    const runner = vi.fn()
    const action = {
      ...baseAction,
      preReleaseCheck: vi.fn().mockResolvedValue({
        kind: 'error' as const,
        code: 'mock_pre_release_refusal',
        retryable: false,
        reason: 'MOCK refusal before release',
      }),
      run: runner,
    }
    const state = createDevelopmentDurableState()
    const source = {
      input, context: {},
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const tracer = createDurableActionInvocationTracer({
      action,
      port: createDevelopmentDurablePort(state),
      now: () => '2026-07-19T12:45:00.000Z',
      nextInvocationRef: () => `dev:durable:pre-release-refusal:${origin.kind}`,
      nextAuthorityRef: () => `opaque:durable:pre-release-refusal:${origin.kind}`,
      nextAttemptRef: () => `dev:attempt:pre-release-refusal:${origin.kind}`,
      resolveSourceState: () => source,
    })
    const prepared = tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 300_000,
    })
    source.prepared = prepared.prepared!
    const decided = tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const refused = await tracer.execute({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input,
    })
    expect(refused).toMatchObject({
      kind: 'accepted',
      view: {
        observedResolution: { execution: 'pre_release_refused' },
        control: { state: 'terminal' },
      },
    })
    expect(runner).not.toHaveBeenCalled()
    expect(createDurableActionInvocationTracer({
      action,
      port: createDevelopmentDurablePort(state),
      now: () => '2026-07-19T12:45:00.000Z',
      nextInvocationRef: () => 'unused',
      resolveSourceState: () => source,
    }, prepared.invocationRef).inspect(prepared.invocationRef)).toMatchObject({
      control: { state: 'terminal' },
      attempts: [{ release: { state: 'not_released' } }],
    })
    expect(createDevelopmentDurablePort(state).readHistory(prepared.invocationRef, 0, 20)
      .map(({ kind }) => kind)).not.toContain('begin_release')

    const asyncState = createDevelopmentDurableState()
    const asyncSync = () => createDevelopmentDurablePort(asyncState)
    const asyncPort: AsyncDurableActionInvocationPort = {
      transact: async (command) => asyncSync().transact(command),
      readControl: async (ref) => asyncSync().readControl(ref),
      readAttempts: async ({ invocationRef, numItems }) => ({
        page: asyncSync().readAttempts(invocationRef, numItems),
        continueCursor: '', isDone: true,
      }),
      readAttempt: async (invocationRef, attemptRef) =>
        asyncSync().readAttempt(invocationRef, attemptRef),
      readHistory: async ({ invocationRef, numItems }) => ({
        page: asyncSync().readHistory(invocationRef, 0, numItems),
        continueCursor: '', isDone: true,
      }),
      recordLateObservation: async (observation) => asyncSync().recordLateObservation(observation),
    }
    const asyncSource = {
      ...source,
      prepared: undefined as PreparedInvocation | undefined,
    }
    const asyncTracer = await createAsyncDurableActionInvocationTracer({
      action, port: asyncPort,
      now: () => '2026-07-19T12:46:00.000Z',
      nextInvocationRef: () => `dev:async:pre-release-refusal:${origin.kind}`,
      nextAuthorityRef: () => `opaque:async:pre-release-refusal:${origin.kind}`,
      nextAttemptRef: () => `dev:async:attempt:pre-release-refusal:${origin.kind}`,
      resolveSourceState: () => asyncSource,
    })
    const asyncPrepared = await asyncTracer.prepare({
      origin, actor, input, context: asyncSource.context, freshnessMs: 300_000,
    })
    asyncSource.prepared = asyncPrepared.prepared!
    const asyncDecided = await asyncTracer.decide({
      invocationRef: asyncPrepared.invocationRef,
      expectedInvocationVersion: asyncPrepared.invocationVersion,
      authorityRef: asyncPrepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (asyncDecided.kind !== 'accepted') throw new Error(asyncDecided.code)
    await expect(asyncTracer.execute({
      invocationRef: asyncPrepared.invocationRef,
      expectedInvocationVersion: asyncDecided.view.invocationVersion,
      authorityRef: asyncPrepared.authority!.reference,
      actor, origin, materialInput: input,
    })).resolves.toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'terminal' } },
    })
    expect((await asyncPort.readControl(asyncPrepared.invocationRef))?.control.control)
      .toEqual({ state: 'terminal' })
    expect(asyncSync().readHistory(asyncPrepared.invocationRef, 0, 20)
      .map(({ kind }) => kind)).not.toContain('begin_release')
  })

  it.each(origins)('flushes async begin_release before the runner and completion for $kind', async (origin) => {
    const events: string[] = []
    let resolveRunner!: (value: { kind: 'error'; code: string; retryable: false; reason: string }) => void
    const runner = new Promise<{ kind: 'error'; code: string; retryable: false; reason: string }>(
      (resolve) => { resolveRunner = resolve },
    )
    const action = findAction('inquiry.submit')!
    const state = createDevelopmentDurableState()
    const sync = () => createDevelopmentDurablePort(state)
    const asyncPort: AsyncDurableActionInvocationPort = {
      transact: async (command) => {
        events.push(`durable:${command.history.kind}`)
        return sync().transact(command)
      },
      readControl: async (ref) => sync().readControl(ref),
      readAttempts: async ({ invocationRef, numItems }) => ({
        page: sync().readAttempts(invocationRef, numItems),
        continueCursor: '', isDone: true,
      }),
      readAttempt: async (invocationRef, attemptRef) =>
        sync().readAttempt(invocationRef, attemptRef),
      readHistory: async ({ invocationRef, numItems }) => ({
        page: sync().readHistory(invocationRef, 0, numItems),
        continueCursor: '', isDone: true,
      }),
      recordLateObservation: async (observation) => sync().recordLateObservation(observation),
    }
    const source = {
      input,
      context: {
        developmentOnlyInquirySubmitAdapter: vi.fn(() => {
          events.push('adapter:called')
          return runner
        }),
      },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const tracer = await createAsyncDurableActionInvocationTracer({
      action, port: asyncPort,
      now: () => '2026-07-19T13:00:00.000Z',
      nextInvocationRef: () => `dev:async:release-order:${origin.kind}`,
      nextAuthorityRef: () => `opaque:async:release-order:${origin.kind}`,
      nextAttemptRef: () => `dev:async:release-order:attempt:${origin.kind}`,
      resolveSourceState: () => source,
    })
    const prepared = await tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 300_000,
    })
    source.prepared = prepared.prepared!
    const decided = await tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = await tracer.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input,
      leaseOwner: 'mock:async:release-order',
      leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      throw new Error('Expected async lease.')
    }
    events.length = 0
    const completion = tracer.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    await vi.waitFor(() => expect(source.context.developmentOnlyInquirySubmitAdapter).toHaveBeenCalledTimes(1))
    expect(events).toEqual(['durable:begin_release', 'adapter:called'])
    expect((await asyncPort.readControl(prepared.invocationRef))?.control.control).toEqual(
      expect.objectContaining({ state: 'leased', release: 'possibly_released' }),
    )
    resolveRunner({
      kind: 'error',
      code: 'mock_async_complete',
      retryable: false,
      reason: 'MOCK async completion',
    })
    await expect(completion).resolves.toMatchObject({ kind: 'accepted' })
    expect(events).toEqual([
      'durable:begin_release',
      'adapter:called',
      'durable:execute_acquired',
    ])
  })

  it.each(origins)('rehydrates the durable winner when async begin_release loses CAS for $kind', async (origin) => {
    const action = findAction('inquiry.submit')!
    const state = createDevelopmentDurableState()
    const sync = () => createDevelopmentDurablePort(state)
    const adapter = vi.fn()
    const asyncPort: AsyncDurableActionInvocationPort = {
      transact: async (command) => {
        if (command.history.kind === 'begin_release') {
          const current = sync().readControl(command.row.invocationRef)
          if (current === undefined) throw new Error('Missing race control row.')
          const winnerVersion = current.invocationVersion + 1
          const winner = {
            ...command,
            commandId: `${command.commandId}:winner`,
            commandDigest: canonicalDigest({ winner: command.commandDigest }),
            expectedInvocationVersion: current.invocationVersion,
            ...(current.currentEffectGeneration === undefined ? {} : {
              expectedEffectGeneration: current.currentEffectGeneration,
            }),
            row: {
              ...current,
              invocationVersion: winnerVersion,
              control: {
                ...current.control,
                invocationVersion: winnerVersion,
                control: { state: 'cancelled' as const, effect: 'not_released' as const },
              },
              updatedAt: '2026-07-19T13:30:00.000Z',
            },
            history: {
              invocationRef: command.row.invocationRef,
              commandId: `${command.commandId}:winner`,
              commandDigest: canonicalDigest({ winner: command.commandDigest }),
              commandResult: 'applied' as const,
              kind: 'forced_cas_winner',
            },
          }
          expect(sync().transact(winner)).toMatchObject({ kind: 'applied' })
        }
        return sync().transact(command)
      },
      readControl: async (ref) => sync().readControl(ref),
      readAttempts: async ({ invocationRef, numItems }) => ({
        page: sync().readAttempts(invocationRef, numItems),
        continueCursor: '', isDone: true,
      }),
      readAttempt: async (invocationRef, attemptRef) =>
        sync().readAttempt(invocationRef, attemptRef),
      readHistory: async ({ invocationRef, numItems }) => ({
        page: sync().readHistory(invocationRef, 0, numItems),
        continueCursor: '', isDone: true,
      }),
      recordLateObservation: async (observation) => sync().recordLateObservation(observation),
    }
    const source = {
      input,
      context: { developmentOnlyInquirySubmitAdapter: adapter },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const tracer = await createAsyncDurableActionInvocationTracer({
      action, port: asyncPort,
      now: () => '2026-07-19T13:30:00.000Z',
      nextInvocationRef: () => `dev:async:cas-race:${origin.kind}`,
      nextAuthorityRef: () => `opaque:async:cas-race:${origin.kind}`,
      nextAttemptRef: () => `dev:async:cas-race:attempt:${origin.kind}`,
      resolveSourceState: () => source,
    })
    const prepared = await tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 300_000,
    })
    source.prepared = prepared.prepared!
    const decided = await tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = await tracer.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input,
      leaseOwner: 'mock:async:cas-loser',
      leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      throw new Error('Expected async race lease.')
    }
    const refused = await tracer.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(refused).toMatchObject({
      kind: 'refused',
      code: 'stale_invocation_version',
      view: { control: { state: 'cancelled', effect: 'not_released' } },
    })
    expect(adapter).not.toHaveBeenCalled()
    expect(await tracer.inspect(prepared.invocationRef)).toEqual(refused.view)
  })

  it.each(origins)('persists the release fence before running and rejects late completion for $kind', async (origin) => {
    let resolveRunner!: (value: { kind: 'error'; code: string; retryable: false; reason: string }) => void
    const runner = new Promise<{ kind: 'error'; code: string; retryable: false; reason: string }>(
      (resolve) => { resolveRunner = resolve },
    )
    const action = findAction('inquiry.submit')!
    const state = createDevelopmentDurableState()
    const source = {
      input,
      context: { developmentOnlyInquirySubmitAdapter: vi.fn(() => runner) },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const create = (resumeRef?: string) => createDurableActionInvocationTracer({
      action,
      port: createDevelopmentDurablePort(state),
      now: () => '2026-07-19T11:30:00.000Z',
      nextInvocationRef: () => `dev:durable:release-fence:${origin.kind}`,
      nextAuthorityRef: () => `opaque:durable:release-fence:${origin.kind}`,
      nextAttemptRef: () => `dev:attempt:release-fence:${origin.kind}`,
      resolveSourceState: () => source,
    }, resumeRef)
    const tracer = create()
    const prepared = tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 300_000,
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
      actor, origin, materialInput: input,
      leaseOwner: 'mock:worker:release-fence',
      leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      throw new Error('Expected release-fence lease.')
    }
    const pending = tracer.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    expect(source.context.developmentOnlyInquirySubmitAdapter).toHaveBeenCalledTimes(1)
    const cold = create(prepared.invocationRef)
    const releaseStarted = cold.inspect(prepared.invocationRef)
    expect(releaseStarted).toMatchObject({
      control: { state: 'leased', release: 'possibly_released' },
    })
    if (releaseStarted === undefined) throw new Error('Expected persisted release fence.')
    const cancelled = cold.cancel({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: releaseStarted.invocationVersion,
      actor, origin,
    })
    expect(cancelled).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'reconciliation_required' } },
    })
    resolveRunner({
      kind: 'error',
      code: 'mock_late_completion',
      retryable: false,
      reason: 'MOCK late completion after cancellation',
    })
    await expect(pending).resolves.toMatchObject({
      kind: 'refused',
      code: 'stale_invocation_version',
      view: { control: { state: 'reconciliation_required' } },
    })
    expect(create(prepared.invocationRef).inspect(prepared.invocationRef)?.control)
      .toEqual(cancelled.kind === 'accepted' ? cancelled.view.control : undefined)
  })

  it.each(origins)('expires a real lease, fails closed, reconciles, and cold-resumes takeover for $kind', async (origin) => {
    let now = '2026-07-19T12:00:00.000Z'
    let attemptSequence = 0
    const action = findAction('inquiry.submit')!
    const state = createDevelopmentDurableState()
    const evidenceSource = createEvidenceSource()
    const source = {
      input,
      context: { developmentOnlyInquirySubmitAdapter: vi.fn() },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const create = (resumeRef?: string) => createDurableActionInvocationTracer({
      action,
      port: createDevelopmentDurablePort(state),
      now: () => now,
      nextInvocationRef: () => `dev:durable:expiry:${origin.kind}`,
      nextAuthorityRef: () => `opaque:durable:expiry:${origin.kind}`,
      nextAttemptRef: () => `dev:attempt:expiry:${origin.kind}:${++attemptSequence}`,
      verifyReconciliationEvidence: evidenceSource.verify,
      resolveSourceState: () => source,
    }, resumeRef)
    const firstProcess = create()
    const prepared = firstProcess.prepare({
      origin, actor, input, context: source.context, freshnessMs: 300_000,
    })
    source.prepared = prepared.prepared!
    const decided = firstProcess.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const firstLease = firstProcess.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input,
      leaseOwner: 'mock:worker:expired',
      leaseMs: 1_000,
    })
    if (firstLease.kind !== 'accepted' || firstLease.view.control.state !== 'leased') {
      throw new Error('Expected initial lease.')
    }
    const firstToken = firstLease.view.control

    now = '2026-07-19T12:00:02.000Z'
    const expiry = create(prepared.invocationRef).acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: firstLease.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input,
      leaseOwner: 'mock:worker:blocked-takeover',
      leaseMs: 1_000,
    })
    expect(expiry).toMatchObject({
      kind: 'refused',
      code: 'reconciliation_required',
      view: {
        persistence: 'durable_control',
        control: { state: 'reconciliation_required', attemptRef: firstToken.attemptRef },
        attempts: [{
          release: { state: 'possibly_released' },
          outcome: { state: 'uncertain', retry: 'reconcile_before_retry' },
        }],
      },
    })
    if (expiry.view === undefined) throw new Error('Expected durable expiry view.')
    expect(create(prepared.invocationRef).acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: expiry.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input,
      leaseOwner: 'mock:worker:still-blocked',
      leaseMs: 1_000,
    })).toMatchObject({ kind: 'refused', code: 'invalid_control_state' })
    expect(source.context.developmentOnlyInquirySubmitAdapter).not.toHaveBeenCalled()

    const material: ReconciliationEvidenceMaterial = {
      kind: 'action_invocation_reconciliation',
      version: 1,
      evidenceRef: `mock:evidence:expiry:${origin.kind}:not-released`,
      source: 'inquiry.submit:delivery-observer:v1',
      invocationRef: prepared.invocationRef,
      attemptRef: firstToken.attemptRef,
      effectGeneration: firstToken.effectGeneration,
      resolution: 'not_released',
      observedAt: now,
    }
    const reconciled = create(prepared.invocationRef).reconcile({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: expiry.view.invocationVersion,
      attemptRef: firstToken.attemptRef,
      actor, origin,
      evidence: evidenceSource.issue(material),
    })
    if (reconciled.kind !== 'accepted') throw new Error(reconciled.code)
    expect(reconciled.view.attempts[0]).toMatchObject({
      release: { state: 'not_released' },
      outcome: { state: 'reconciled_not_released', retry: 'safe_after_reconciliation' },
    })

    const takeover = create(prepared.invocationRef).acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: reconciled.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input,
      leaseOwner: 'mock:worker:new-generation',
      leaseMs: 30_000,
    })
    if (takeover.kind !== 'accepted' || takeover.view.control.state !== 'leased') {
      throw new Error('Expected reconciled takeover.')
    }
    expect(takeover.view.control.effectGeneration).toBe(firstToken.effectGeneration + 1)
    const staleWorkerProcess = create(prepared.invocationRef)
    expect(staleWorkerProcess.publishObservation({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: takeover.view.invocationVersion,
      attemptRef: firstToken.attemptRef,
      leaseOwner: firstToken.leaseOwner,
      effectGeneration: firstToken.effectGeneration,
      release: 'released',
    })).toMatchObject({ kind: 'refused', code: 'effect_generation_stale' })
    await expect(staleWorkerProcess.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: takeover.view.invocationVersion,
      attemptRef: firstToken.attemptRef,
      leaseOwner: firstToken.leaseOwner,
      effectGeneration: firstToken.effectGeneration,
    })).resolves.toMatchObject({ kind: 'refused', code: 'effect_generation_stale' })
    expect(source.context.developmentOnlyInquirySubmitAdapter).not.toHaveBeenCalled()

    const late = create(prepared.invocationRef).recordLateObservation({
      invocationRef: prepared.invocationRef,
      commandId: `mock:late:expiry:${origin.kind}`,
      effectGeneration: firstToken.effectGeneration,
      actorRef: firstToken.leaseOwner,
      sourceEvidenceRef: `mock:evidence:late:${origin.kind}`,
      release: 'released',
      evidenceDigest: canonicalDigest('MOCK late completion evidence'),
    })
    expect(late.kind).toBe('applied')
    const port = createDevelopmentDurablePort(state)
    expect(port.readHistory(prepared.invocationRef, 0, 50)).toContainEqual(
      expect.objectContaining({
        kind: 'late_observation',
        current: false,
        effectGeneration: firstToken.effectGeneration,
      }),
    )
    expect(create(prepared.invocationRef).inspect(prepared.invocationRef)).toMatchObject({
      origin,
      owner: actor,
      persistence: 'durable_control',
      control: {
        state: 'leased',
        leaseOwner: 'mock:worker:new-generation',
        effectGeneration: firstToken.effectGeneration + 1,
      },
    })
    expect(JSON.stringify({
      control: port.readControl(prepared.invocationRef),
      attempts: port.readAttempts(prepared.invocationRef, 10),
      history: port.readHistory(prepared.invocationRef, 0, 50),
    })).not.toContain(input.body)
  })

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
      readAttempt: async (invocationRef, attemptRef) =>
        createDevelopmentDurablePort(state).readAttempt(invocationRef, attemptRef),
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
    const accepted = await firstProcess.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin: origins[1]!,
      accept: true,
    })
    expect(accepted.kind).toBe('accepted')
    const cancellingProcess = await createAsyncDurableActionInvocationTracer({
      action, port: asyncPort(),
      now: () => '2026-07-19T08:30:00.000Z',
      nextInvocationRef: () => 'unused',
      nextAttemptRef: () => 'dev:async:attempt',
      resolveSourceState: () => source,
    }, prepared.invocationRef)
    const competingProcess = await createAsyncDurableActionInvocationTracer({
      action, port: asyncPort(),
      now: () => '2026-07-19T08:30:00.000Z',
      nextInvocationRef: () => 'unused',
      nextAttemptRef: () => 'dev:async:attempt',
      resolveSourceState: () => source,
    }, prepared.invocationRef)
    if (accepted.kind !== 'accepted') throw new Error('Expected accepted authority')
    const cancelled = await cancellingProcess.cancel({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      actor,
      origin: origins[1]!,
    })
    expect(cancelled.kind).toBe('accepted')
    const refused = await competingProcess.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: accepted.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin: origins[1]!,
      materialInput: input,
      leaseOwner: 'mock:async:stale-worker',
      leaseMs: 30_000,
    })
    expect(refused).toMatchObject({
      kind: 'refused',
      code: 'stale_invocation_version',
      view: { control: { state: 'cancelled' } },
    })
    expect((await competingProcess.inspect(prepared.invocationRef))?.control)
      .toEqual((await asyncPort().readControl(prepared.invocationRef))?.control.control)
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
      'by_idempotency_effectIdentity_and_attemptRef',
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
    expect(prepared.prepared?.materialInputDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(acquired.view.attempts[0]?.idempotency.effectIdentity).toMatch(/^sha256:[0-9a-f]{64}$/)
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
    for (const row of port.readHistory(prepared.invocationRef, 0, 20)) {
      expect(row.commandDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
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
      evidenceDigest: canonicalDigest('mock evidence'),
    })
    expect(late).toEqual({ kind: 'applied', invocationVersion: uncertain.kind === 'accepted' ? uncertain.view.invocationVersion : 0 })
    expect(tracer.recordLateObservation({
      invocationRef: prepared.invocationRef,
      commandId: 'mock:late:observation:1',
      effectGeneration: token.effectGeneration,
      actorRef: 'mock:worker:late',
      sourceEvidenceRef: 'mock:evidence:worker-log',
      release: 'released',
      evidenceDigest: canonicalDigest('mock evidence'),
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
      evidenceDigest: canonicalDigest('different evidence'),
    })).toEqual({ kind: 'refused', code: 'command_identity_conflict' })
    expect(port.readHistory(prepared.invocationRef, 0, 20)).toContainEqual(
      expect.objectContaining({ kind: 'late_observation', current: false }),
    )
    expect(port.readControl(prepared.invocationRef)?.control.control).toEqual({
      state: 'reconciliation_required',
      attemptRef: token.attemptRef,
    })
  })

  it('never persists raw adapter failure text', async () => {
    const secretFailure = `${input.body} ${input.contact.email} accessKey=SECRET-FAILURE-KEY`
    const action = findAction('inquiry.submit')!
    const port = createDevelopmentDurablePort()
    const source = {
      input,
      context: {
        developmentOnlyInquirySubmitAdapter: vi.fn().mockRejectedValue(new Error(secretFailure)),
      },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const tracer = createDurableActionInvocationTracer({
      action, port,
      now: () => '2026-07-19T10:30:00.000Z',
      nextInvocationRef: () => 'dev:durable:secret-failure',
      nextAuthorityRef: () => 'opaque:durable:secret-failure',
      nextAttemptRef: () => 'dev:attempt:secret-failure',
      resolveSourceState: () => source,
    })
    const prepared = tracer.prepare({
      origin: origins[1]!, actor, input, context: source.context, freshnessMs: 60_000,
    })
    source.prepared = prepared.prepared!
    const decided = tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin: origins[1]!, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const failed = await tracer.execute({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decided.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin: origins[1]!, materialInput: input,
    })
    expect(failed).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'reconciliation_required' } },
    })
    const persisted = JSON.stringify({
      control: port.readControl(prepared.invocationRef),
      attempts: port.readAttempts(prepared.invocationRef, 10),
      history: port.readHistory(prepared.invocationRef, 0, 20),
    })
    expect(persisted).not.toContain(input.body)
    expect(persisted).not.toContain(input.contact.email)
    expect(persisted).not.toContain('SECRET-FAILURE-KEY')
    expect(persisted).not.toContain(secretFailure)
  })

  it('exposes only a source-verified completed-result identity and refuses tamper or nonterminal reads', async () => {
    const origin = origins[1]!
    const action = findAction('inquiry.submit')!
    const durableState = createDevelopmentDurableState()
    const port = createDevelopmentDurablePort(durableState)
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
        resultDigest: canonicalDigest(result),
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
      actionId: 'inquiry.submit',
      actionVersion: 'inquiry.submit:v1',
      sourceResultRef: 'mock:inquiry-result:durable',
      businessOutcome: 'queued_communication',
    })
    const completedRow = port.readControl(prepared.invocationRef)!
    const readIdentity = () => readCompletedResultIdentity(
      port,
      prepared.invocationRef,
      actor,
      () => ({ sourceResultRef: source.resultIdentity.sourceResultRef, result }),
    )
    durableState.controls.set(prepared.invocationRef, {
      ...completedRow,
      terminalBusinessOutcome: 'new_action_outcome',
      terminalResultReferenceable: true,
    })
    expect(readIdentity()).toMatchObject({
      kind: 'completed_result',
      businessOutcome: 'new_action_outcome',
    })
    durableState.controls.set(prepared.invocationRef, {
      ...completedRow,
      terminalResultReferenceable: false,
    })
    expect(readIdentity()).toEqual({ kind: 'refused', code: 'outcome_not_referenceable' })
    for (const legacyOutcome of ['queued_communication', 'completed'] as const) {
      const { terminalResultReferenceable: _newFlag, ...legacyRow } = completedRow
      durableState.controls.set(prepared.invocationRef, {
        ...legacyRow,
        terminalBusinessOutcome: legacyOutcome,
      })
      expect(readIdentity()).toMatchObject({
        kind: 'completed_result',
        businessOutcome: legacyOutcome,
      })
    }
    for (const legacyOutcome of ['refused', 'not_found', 'arbitrary_legacy_outcome'] as const) {
      const { terminalResultReferenceable: _newFlag, ...legacyRow } = completedRow
      durableState.controls.set(prepared.invocationRef, {
        ...legacyRow,
        terminalBusinessOutcome: legacyOutcome,
      })
      expect(readIdentity()).toEqual({ kind: 'refused', code: 'outcome_not_referenceable' })
    }
    durableState.controls.set(prepared.invocationRef, completedRow)
    expect(source.resultIdentity.resultDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
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
    expect(source.context.developmentOnlyInquirySubmitAdapter).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(port.readControl(prepared.invocationRef))).not.toContain(result.receipt.accessKey)
    durableState.controls.delete(prepared.invocationRef)
    expect(port.readControl(prepared.invocationRef)).toBeUndefined()
    expect(source.resultIdentity).toEqual({
      sourceResultRef: 'mock:inquiry-result:durable',
      resultDigest: canonicalDigest(result),
    })
    expect(result.receipt.accessKey).toBe('SECRET-MUST-NOT-PERSIST')
  })
})
