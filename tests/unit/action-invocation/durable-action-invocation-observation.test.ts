import { actor, input, origins } from './durable-action-invocation-harness'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { requireDurableWriteFixtureAction } from '../../helpers/durable-write-fixture-action'
import {
  createDevelopmentDurablePort,
  createDurableActionInvocationTracer,
  type PreparedInvocation,
} from '@/modules/action-invocation'
import { describe, expect, it, vi } from 'vitest'

describe('durable Action Invocation observation', () => {
  it('fences stale generation, preserves uncertainty, and records late evidence as non-current', async () => {
    const origin = origins[1]!
    const action = requireDurableWriteFixtureAction()
    const port = createDevelopmentDurablePort()
    const source = {
      input,
      context: { developmentOnlyDurableWriteAdapter: vi.fn() },
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
})
