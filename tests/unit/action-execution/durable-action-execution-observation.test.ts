import { actor, input, origins } from './durable-action-execution-harness'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { requireDurableWriteFixtureAction } from '../../helpers/durable-write-fixture-action'
import {
  createDevelopmentDurablePort,
  createDurableActionExecutionTracer,
  type PreparedExecution,
} from '@/modules/action-execution'
import { describe, expect, it, vi } from 'vitest'

describe('durable Action Execution observation', () => {
  it('fences stale generation, preserves uncertainty, and records late evidence as non-current', async () => {
    const origin = origins[1]!
    const action = requireDurableWriteFixtureAction()
    const port = createDevelopmentDurablePort()
    const source = {
      input,
      context: { developmentOnlyDurableWriteAdapter: vi.fn() },
      prepared: undefined as PreparedExecution | undefined,
      observedResolution: { state: 'pending' as const },
    }
    const tracer = createDurableActionExecutionTracer({
      action,
      port,
      now: () => '2026-07-19T10:00:00.000Z',
      nextExecutionRef: () => 'dev:durable:uncertain',
      nextAuthorityRef: () => 'opaque:durable:uncertain',
      nextAttemptRef: () => 'dev:attempt:uncertain:1',
      resolveSourceState: () => source,
    })
    const prepared = await tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 60_000,
    })
    source.prepared = prepared.prepared!
    const decided = await tracer.decide({
      executionRef: prepared.executionRef,
      expectedExecutionVersion: prepared.executionVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const acquired = await tracer.acquire({
      executionRef: prepared.executionRef,
      expectedExecutionVersion: decided.view.executionVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input, leaseOwner: 'mock:worker:current', leaseMs: 30_000,
    })
    if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
      throw new Error('Expected acquired generation')
    }
    const token = acquired.view.control
    const competingProcess = await tracer.coldResume(prepared.executionRef)
    expect(await tracer.publishObservation({
      executionRef: prepared.executionRef,
      expectedExecutionVersion: acquired.view.executionVersion,
      attemptRef: token.attemptRef,
      leaseOwner: token.leaseOwner,
      effectGeneration: token.effectGeneration + 1,
      release: 'not_released',
    })).toMatchObject({ kind: 'refused', code: 'effect_generation_stale' })

    const uncertain = await tracer.publishObservation({
      executionRef: prepared.executionRef,
      expectedExecutionVersion: acquired.view.executionVersion,
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
      executionRef: prepared.executionRef,
      expectedExecutionVersion: acquired.view.executionVersion,
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
    expect(competingProcess.inspect(prepared.executionRef)?.control)
      .toEqual((await port.readControl(prepared.executionRef))?.control.control)
    const late = await tracer.recordLateObservation({
      executionRef: prepared.executionRef,
      commandId: 'mock:late:observation:1',
      effectGeneration: token.effectGeneration,
      actorRef: 'mock:worker:late',
      sourceEvidenceRef: 'mock:evidence:worker-log',
      release: 'released',
      evidenceDigest: canonicalDigest('mock evidence'),
    })
    expect(late).toEqual({ kind: 'applied', executionVersion: uncertain.kind === 'accepted' ? uncertain.view.executionVersion : 0 })
    expect(await tracer.recordLateObservation({
      executionRef: prepared.executionRef,
      commandId: 'mock:late:observation:1',
      effectGeneration: token.effectGeneration,
      actorRef: 'mock:worker:late',
      sourceEvidenceRef: 'mock:evidence:worker-log',
      release: 'released',
      evidenceDigest: canonicalDigest('mock evidence'),
    })).toEqual({
      kind: 'duplicate',
      executionVersion: uncertain.kind === 'accepted' ? uncertain.view.executionVersion : 0,
    })
    expect(await tracer.recordLateObservation({
      executionRef: prepared.executionRef,
      commandId: 'mock:late:observation:1',
      effectGeneration: token.effectGeneration,
      actorRef: 'mock:worker:late',
      sourceEvidenceRef: 'mock:evidence:worker-log',
      release: 'not_released',
      evidenceDigest: canonicalDigest('different evidence'),
    })).toEqual({ kind: 'refused', code: 'command_identity_conflict' })
    expect(await port.readHistory(prepared.executionRef, 0, 20)).toContainEqual(
      expect.objectContaining({ kind: 'late_observation', current: false }),
    )
    expect((await port.readControl(prepared.executionRef))?.control.control).toEqual({
      state: 'reconciliation_required',
      attemptRef: token.attemptRef,
    })
  })
})
