import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '@/modules/common/action'
import schema from '../../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createDevelopmentEvidenceVerifier } from '../../../tools/dev/fixtures/capability-supply/development-evidence-fixture'

vi.mock('@/modules/registry/registry.functions', () => ({
  readPublicOfferingRegistryBusinessDetail: vi.fn(),
  readPublicOfferingRegistryPage: vi.fn(),
  readPublicOfferingRegistrySearchPage: vi.fn(),
}))

import { findAction } from '@/modules/actions'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionInvocationTracer,
  readCompletedResultIdentity,
  type ActionInvocationOrigin,
  type ActionInvocationView,
  type DurableActionInvocationPort,
  type InvocationActor,
  type PreparedInvocation,
  type ReconciliationEvidenceMaterial,
} from '@/modules/action-invocation'
import type { DevelopmentDurableState } from '@/modules/action-invocation/internal/development-durable-port'

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

type AuthorizedDurableFixture = {
  state: DevelopmentDurableState<ActionResult>
  port: DurableActionInvocationPort<ActionResult>
  prepared: Pick<ActionInvocationView, 'invocationRef'>
}

type LegacyAuthorityMode = 'approve_each' | 'standing_mandate_use'


async function createAuthorizedDurableFixture(mode: LegacyAuthorityMode) {
  const action = findAction('inquiry.submit')!
  const state = createDevelopmentDurableState()
  const port = createDevelopmentDurablePort(state)
  const origin = origins[1]!
  const source = {
    input,
    context: { developmentOnlyInquirySubmitAdapter: vi.fn() },
    prepared: undefined as PreparedInvocation | undefined,
    observedResolution: { state: 'pending' as const },
  }
  const tracer = createDurableActionInvocationTracer({
    action,
    port,
    now: () => '2026-07-19T15:15:00.000Z',
    nextInvocationRef: () => `dev:legacy-authority:${mode}`,
    nextAuthorityRef: () => `opaque:legacy-authority:${mode}`,
    nextAttemptRef: () => `dev:legacy-authority:${mode}:attempt`,
    resolveSourceState: () => source,
  })
  const prepared = await tracer.prepare({
    origin,
    actor,
    input,
    context: source.context,
    freshnessMs: 300_000,
  })
  source.prepared = prepared.prepared!
  const basis = {
    kind: 'standing_mandate_use' as const,
    mandateRef: 'mock:mandate:legacy',
    mandateVersion: 3,
    mandateGeneration: 2,
    authorityUseRef: 'mock:authority-use:legacy',
    grantEvidenceRef: 'mock:grant-evidence:legacy',
  }
  const accepted = mode === 'approve_each'
    ? await tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    : await tracer.authorizeStandingMandateUse({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      basis,
    })
  if (accepted.kind !== 'accepted') throw new Error(accepted.code)
  return {
    state,
    port,
    tracer,
    prepared,
    origin,
    authority: accepted.view.acceptedAuthority!,
  }
}

describe('durable Action Invocation control', () => {
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
    const create = () => createDurableActionInvocationTracer({
      action, port,
      now: () => '2026-07-19T15:15:00.000Z',
      nextInvocationRef: () => 'dev:sync:single-permit',
      nextAuthorityRef: () => 'opaque:sync:single-permit',
      nextAttemptRef: () => 'dev:sync:single-permit:attempt',
      resolveSourceState: () => source,
    })
    const root = create()
    const origin = origins[1]!
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
      leaseOwner: 'mock:sync:single-permit',
      leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      throw new Error('Expected sync single-permit lease.')
    }
    const winner = await root.coldResume(prepared.invocationRef)
    const loser = await root.coldResume(prepared.invocationRef)
    const token = acquired.view.control
    const winningCompletion = winner.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: token.attemptRef,
      leaseOwner: token.leaseOwner,
      effectGeneration: token.effectGeneration,
    })
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(1))
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

  it('refuses non-monotonic rows while preserving exact duplicate idempotency', async () => {
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
    expect(await port.transact(create)).toEqual({ kind: 'applied', invocationVersion: 1 })
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
    expect(await port.transact(downgrade)).toEqual({
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
    expect(await port.transact(advance)).toEqual({ kind: 'applied', invocationVersion: 2 })
    expect(await port.transact(advance)).toEqual({ kind: 'duplicate', invocationVersion: 2 })
  })


  it('fences the sync release transaction to the stale worker token and rehydrates the winner', async () => {
    const origin = origins[1]!
    const action = findAction('inquiry.submit')!
    const state = createDevelopmentDurableState()
    const base = createDevelopmentDurablePort(state)
    const adapter = vi.fn()
    const racingPort = {
      ...base,
      async transact(command: Parameters<typeof base.transact>[0]) {
        if (command.history.kind === 'begin_release') {
          const current = await base.readControl(command.row.invocationRef)
          if (current === undefined) throw new Error('Missing sync race row.')
          const winnerVersion = current.invocationVersion + 1
          const winnerDigest = canonicalDigest({ winner: command.commandDigest })
          expect(await base.transact({
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
    const cold = await createDurableActionInvocationTracer({
      action,
      port: createDevelopmentDurablePort(state),
      now: () => '2026-07-19T12:45:00.000Z',
      nextInvocationRef: () => 'unused',
      resolveSourceState: () => source,
    }).coldResume(prepared.invocationRef)
    expect(cold.inspect(prepared.invocationRef)).toMatchObject({
      control: { state: 'terminal' },
      attempts: [{ release: { state: 'not_released' } }],
    })
    expect((await createDevelopmentDurablePort(state).readHistory(prepared.invocationRef, 0, 20))
      .map(({ kind }) => kind)).not.toContain('begin_release')

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
    const create = () => createDurableActionInvocationTracer({
      action,
      port: createDevelopmentDurablePort(state),
      now: () => '2026-07-19T11:30:00.000Z',
      nextInvocationRef: () => `dev:durable:release-fence:${origin.kind}`,
      nextAuthorityRef: () => `opaque:durable:release-fence:${origin.kind}`,
      nextAttemptRef: () => `dev:attempt:release-fence:${origin.kind}`,
      resolveSourceState: () => source,
    })
    const tracer = create()
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
    await vi.waitFor(() => expect(source.context.developmentOnlyInquirySubmitAdapter).toHaveBeenCalledTimes(1))
    const cold = await tracer.coldResume(prepared.invocationRef)
    const releaseStarted = cold.inspect(prepared.invocationRef)
    expect(releaseStarted).toMatchObject({
      control: { state: 'leased', release: 'possibly_released' },
    })
    if (releaseStarted === undefined) throw new Error('Expected persisted release fence.')
    const cancelled = await cold.cancel({
      invocationRef: prepared.invocationRef,
      idempotencyKey: `cancel:${prepared.invocationRef}:release-fence`,
      expectedInvocationVersion: releaseStarted.invocationVersion,
      actor, origin,
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
    expect((await tracer.coldResume(prepared.invocationRef)).inspect(prepared.invocationRef)?.control)
      .toEqual(cancelled.kind === 'accepted' ? cancelled.view.control : undefined)
  })

  it.each(origins)('expires a real lease, fails closed, reconciles, and cold-resumes takeover for $kind', async (origin) => {
    let now = '2026-07-19T12:00:00.000Z'
    let attemptSequence = 0
    const action = findAction('inquiry.submit')!
    const state = createDevelopmentDurableState()
    const evidenceSource = createDevelopmentEvidenceVerifier()
    const source = {
      input,
      context: { developmentOnlyInquirySubmitAdapter: vi.fn() },
      prepared: undefined as PreparedInvocation | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const create = () => createDurableActionInvocationTracer({
      action,
      port: createDevelopmentDurablePort(state),
      now: () => now,
      nextInvocationRef: () => `dev:durable:expiry:${origin.kind}`,
      nextAuthorityRef: () => `opaque:durable:expiry:${origin.kind}`,
      nextAttemptRef: () => `dev:attempt:expiry:${origin.kind}:${++attemptSequence}`,
      verifyReconciliationEvidence: evidenceSource.verify,
      resolveSourceState: () => source,
    })
    const firstProcess = create()
    const prepared = await firstProcess.prepare({
      origin, actor, input, context: source.context, freshnessMs: 300_000,
    })
    source.prepared = prepared.prepared!
    const decided = await firstProcess.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const firstLease = await firstProcess.acquire({
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
    const cold = () => create().coldResume(prepared.invocationRef)

    now = '2026-07-19T12:00:02.000Z'
    const expiry = await (await cold()).acquire({
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
        control: { state: 'reconciliation_required', attemptRef: firstToken.attemptRef },
        attempts: [{
          release: { state: 'possibly_released' },
          outcome: { state: 'uncertain', retry: 'reconcile_before_retry' },
        }],
      },
    })
    if (expiry.view === undefined) throw new Error('Expected durable expiry view.')
    expect(await (await cold()).acquire({
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
    const reconciled = await (await cold()).reconcile({
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

    const takeover = await (await cold()).acquire({
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
    const staleWorkerProcess = await cold()
    expect(await staleWorkerProcess.publishObservation({
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

    const late = await (await cold()).recordLateObservation({
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
    expect(await port.readHistory(prepared.invocationRef, 0, 50)).toContainEqual(
      expect.objectContaining({
        kind: 'late_observation',
        current: false,
        effectGeneration: firstToken.effectGeneration,
      }),
    )
    expect((await cold()).inspect(prepared.invocationRef)).toMatchObject({
      origin,
      owner: actor,
      control: {
        state: 'leased',
        leaseOwner: 'mock:worker:new-generation',
        effectGeneration: firstToken.effectGeneration + 1,
      },
    })
    expect(JSON.stringify({
      control: await port.readControl(prepared.invocationRef),
      attempts: await port.readAttempts(prepared.invocationRef, 10),
      history: await port.readHistory(prepared.invocationRef, 0, 50),
    })).not.toContain(input.body)
  })


  it('composes the module-owned control, attempt and history tables with bounded-read indexes', async () => { const exported = JSON.parse(String(Reflect.get(schema, 'export').call(schema))) as {
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
  ])) })

  it.each(origins)('persists, cold-resumes and cancels before release for $kind', async (origin) => {
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
    const create = (selectedPort = port) => createDurableActionInvocationTracer({
      action,
      port: selectedPort,
      now: () => '2026-07-19T09:00:00.000Z',
      nextInvocationRef: () => `dev:durable:${origin.kind}:${++invocationSequence}`,
      nextAuthorityRef: () => `opaque:durable:${origin.kind}`,
      nextAttemptRef: () => `dev:attempt:${origin.kind}:1`,
      resolveSourceState: () => source,
    })
    const tracer = create()
    const prepared = await tracer.prepare({
      origin,
      actor,
      input,
      context: source.context,
      freshnessMs: 60_000,
    })
    source.prepared = prepared.prepared!
    const decided = await tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor,
      origin,
      accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = await tracer.acquire({
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
    const noRelease = await tracer.publishObservation({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
      release: 'not_released',
    })
    if (noRelease.kind !== 'accepted') throw new Error(noRelease.code)

    const freshProcess = await tracer.coldResume(prepared.invocationRef)
    expect(freshProcess.inspect(prepared.invocationRef)).toMatchObject({
      origin,
      control: { state: 'retryable', reason: 'pre_release_failure' },
    })
    const cancelled = await freshProcess.cancel({
      invocationRef: prepared.invocationRef,
      idempotencyKey: `cancel:${prepared.invocationRef}:pre-release`,
      expectedInvocationVersion: noRelease.view.invocationVersion,
      actor,
      origin,
    })
    expect(cancelled).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'cancelled', effect: 'not_released' } },
    })

    const replayedProcess = await freshProcess.coldResume(prepared.invocationRef)
    await expect(replayedProcess.cancel({
      invocationRef: prepared.invocationRef,
      idempotencyKey: `cancel:${prepared.invocationRef}:pre-release`,
      expectedInvocationVersion: cancelled.kind === 'accepted' ? cancelled.view.invocationVersion : 0,
      actor,
      origin,
    })).resolves.toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'cancelled', effect: 'not_released' } },
    })
    await expect(replayedProcess.cancel({
      invocationRef: prepared.invocationRef,
      idempotencyKey: `cancel:${prepared.invocationRef}:different`,
      expectedInvocationVersion: cancelled.kind === 'accepted' ? cancelled.view.invocationVersion : 0,
      actor,
      origin,
    })).resolves.toMatchObject({
      kind: 'refused',
      code: 'command_identity_conflict',
      view: { control: { state: 'cancelled', effect: 'not_released' } },
    })

    const persisted = JSON.stringify({
      control: await port.readControl(prepared.invocationRef),
      attempts: await port.readAttempts(prepared.invocationRef, 10),
      history: await port.readHistory(prepared.invocationRef, 0, 20),
    })
    expect(persisted).not.toContain(input.body)
    expect(persisted).not.toContain(input.contact.email)
    expect(persisted).toContain(input.operationKey)
    for (const row of await port.readHistory(prepared.invocationRef, 0, 20)) {
      expect(row.commandDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    }
    const cancellationHistory = (await port.readHistory(prepared.invocationRef, 0, 20))
      .find((history) => history.kind === 'cancel')
    expect(cancellationHistory?.commandId).toBe(`${prepared.invocationRef}:cancel`)
    expect(cancellationHistory?.commandDigest).toBe(canonicalDigest({
      format: 'action-invocation-cancel:v1',
      invocationRef: prepared.invocationRef,
      idempotencyKey: `cancel:${prepared.invocationRef}:pre-release`,
    }))
    if (origin.kind === 'request_owned') {
      expect(await readCompletedResultIdentity(port, prepared.invocationRef, actor, () => ({})))
        .toEqual({ kind: 'refused', code: 'request_owned_refused' })
    }
  })

  it('fences stale generation, preserves uncertainty, and records late evidence as non-current', async () => {
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
    const prepared = await tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 60_000,
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
      actor, origin, materialInput: input, leaseOwner: 'mock:worker:current', leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      throw new Error('Expected acquired generation')
    }
    const token = acquired.view.control
    const competingProcess = await tracer.coldResume(prepared.invocationRef)
    expect(await tracer.publishObservation({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: token.attemptRef,
      leaseOwner: token.leaseOwner,
      effectGeneration: token.effectGeneration + 1,
      release: 'not_released',
    })).toMatchObject({ kind: 'refused', code: 'effect_generation_stale' })

    const uncertain = await tracer.publishObservation({
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
    const conflicting = await competingProcess.publishObservation({
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
      .toEqual((await port.readControl(prepared.invocationRef))?.control.control)
    const late = await tracer.recordLateObservation({
      invocationRef: prepared.invocationRef,
      commandId: 'mock:late:observation:1',
      effectGeneration: token.effectGeneration,
      actorRef: 'mock:worker:late',
      sourceEvidenceRef: 'mock:evidence:worker-log',
      release: 'released',
      evidenceDigest: canonicalDigest('mock evidence'),
    })
    expect(late).toEqual({ kind: 'applied', invocationVersion: uncertain.kind === 'accepted' ? uncertain.view.invocationVersion : 0 })
    expect(await tracer.recordLateObservation({
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
    expect(await tracer.recordLateObservation({
      invocationRef: prepared.invocationRef,
      commandId: 'mock:late:observation:1',
      effectGeneration: token.effectGeneration,
      actorRef: 'mock:worker:late',
      sourceEvidenceRef: 'mock:evidence:worker-log',
      release: 'not_released',
      evidenceDigest: canonicalDigest('different evidence'),
    })).toEqual({ kind: 'refused', code: 'command_identity_conflict' })
    expect(await port.readHistory(prepared.invocationRef, 0, 20)).toContainEqual(
      expect.objectContaining({ kind: 'late_observation', current: false }),
    )
    expect((await port.readControl(prepared.invocationRef))?.control.control).toEqual({
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
    const prepared = await tracer.prepare({
      origin: origins[1]!, actor, input, context: source.context, freshnessMs: 60_000,
    })
    source.prepared = prepared.prepared!
    const decided = await tracer.decide({
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
      control: await port.readControl(prepared.invocationRef),
      attempts: await port.readAttempts(prepared.invocationRef, 10),
      history: await port.readHistory(prepared.invocationRef, 0, 20),
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
    const prepared = await tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 60_000,
    })
    source.prepared = prepared.prepared!
    expect(await readCompletedResultIdentity(port, prepared.invocationRef, actor, () => ({
      sourceResultRef: source.resultIdentity.sourceResultRef, result,
    }))).toEqual({ kind: 'refused', code: 'invocation_not_terminal' })
    const decided = await tracer.decide({
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
    expect(await readCompletedResultIdentity(port, prepared.invocationRef, actor, () => ({
      sourceResultRef: source.resultIdentity.sourceResultRef, result,
    }))).toMatchObject({
      kind: 'completed_result',
      actionId: 'inquiry.submit',
      actionVersion: 'inquiry.submit:v1',
      sourceResultRef: 'mock:inquiry-result:durable',
      businessOutcome: 'queued_communication',
    })
    const completedRow = await port.readControl(prepared.invocationRef)
    if (completedRow === undefined) throw new Error('completed_row_missing')
    const readIdentity = async () => readCompletedResultIdentity(port,
      prepared.invocationRef,
      actor,
      () => ({ sourceResultRef: source.resultIdentity.sourceResultRef, result }),
    )
    durableState.controls.set(prepared.invocationRef, {
      ...completedRow,
      terminalBusinessOutcome: 'new_action_outcome',
      terminalResultReferenceable: true,
    })
    expect(await readIdentity()).toMatchObject({
      kind: 'completed_result',
      businessOutcome: 'new_action_outcome',
    })
    durableState.controls.set(prepared.invocationRef, {
      ...completedRow,
      terminalResultReferenceable: false,
    })
    expect(await readIdentity()).toEqual({ kind: 'refused', code: 'outcome_not_referenceable' })
    for (const outcome of [
      'queued_communication',
      'completed',
      'refused',
      'not_found',
      'arbitrary_legacy_outcome',
    ] as const) {
      const { terminalResultReferenceable: _explicitClassification, ...rowWithoutClassification } = completedRow
      durableState.controls.set(prepared.invocationRef, {
        ...rowWithoutClassification,
        terminalBusinessOutcome: outcome,
      })
      expect(await readIdentity()).toEqual({ kind: 'refused', code: 'outcome_not_referenceable' })
    }
    durableState.controls.set(prepared.invocationRef, completedRow)
    expect(source.resultIdentity.resultDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(await readCompletedResultIdentity(port,
    prepared.invocationRef,
    { ...actor, principalRef: 'mock:principal:other' },
    () => ({ sourceResultRef: source.resultIdentity.sourceResultRef, result }),)).toEqual({ kind: 'refused', code: 'cross_principal_refused' })
    expect(await readCompletedResultIdentity(port, prepared.invocationRef, actor, () => ({
      sourceResultRef: source.resultIdentity.sourceResultRef,
      result: { ...result, code: 'tampered' } as never,
    }))).toEqual({ kind: 'refused', code: 'source_result_mismatch' })
    expect(source.context.developmentOnlyInquirySubmitAdapter).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(await port.readControl(prepared.invocationRef))).not.toContain(result.receipt.accessKey)
    durableState.controls.delete(prepared.invocationRef)
    expect(await port.readControl(prepared.invocationRef)).toBeUndefined()
    expect(source.resultIdentity).toEqual({
      sourceResultRef: 'mock:inquiry-result:durable',
      resultDigest: canonicalDigest(result),
    })
    expect(result.receipt.accessKey).toBe('SECRET-MUST-NOT-PERSIST')
  })
})
