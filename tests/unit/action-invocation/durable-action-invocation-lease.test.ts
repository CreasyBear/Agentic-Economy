import { actor, input, origins } from './durable-action-invocation-harness'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createDevelopmentEvidenceVerifier } from '../../../tools/dev/fixtures/capability-supply/development-evidence-fixture'
import { requireDurableWriteFixtureAction } from '../../helpers/durable-write-fixture-action'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionInvocationTracer,
  type PreparedInvocation,
  type ReconciliationEvidenceMaterial,
} from '@/modules/action-invocation'
import { describe, expect, it, vi } from 'vitest'

describe('durable Action Invocation lease', () => {
  it('grants one sync effect permit when two cold workers replay the same token', async () => {
    let resolveRunner!: (value: { kind: 'error'; code: string; retryable: false; reason: string }) => void
    const runner = new Promise<{ kind: 'error'; code: string; retryable: false; reason: string }>(
      (resolve) => { resolveRunner = resolve },
    )
    const adapter = vi.fn(() => runner)
    const action = requireDurableWriteFixtureAction()
    const state = createDevelopmentDurableState()
    const port = createDevelopmentDurablePort(state)
    const source = {
      input,
      context: { developmentOnlyDurableWriteAdapter: adapter },
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

  it.each(origins)('expires a real lease, fails closed, reconciles, and cold-resumes takeover for $kind', async (origin) => {
    let now = '2026-07-19T12:00:00.000Z'
    let attemptSequence = 0
    const action = requireDurableWriteFixtureAction()
    const state = createDevelopmentDurableState()
    const evidenceSource = createDevelopmentEvidenceVerifier()
    const source = {
      input,
      context: { developmentOnlyDurableWriteAdapter: vi.fn() },
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
    expect(source.context.developmentOnlyDurableWriteAdapter).not.toHaveBeenCalled()

    const material: ReconciliationEvidenceMaterial = {
      kind: 'action_invocation_reconciliation',
      version: 1,
      evidenceRef: `mock:evidence:expiry:${origin.kind}:not-released`,
      source: 'test.durable_write:delivery-observer:v1',
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
    expect(source.context.developmentOnlyDurableWriteAdapter).not.toHaveBeenCalled()

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
})
