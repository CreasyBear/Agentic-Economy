import { convexTest } from 'convex-test'
import { internal } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'
import { actor, input, origins } from './durable-action-execution-harness'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { DurableControlRow } from '@/modules/action-execution/runtime'
import { requireDurableWriteFixtureAction } from '../../helpers/durable-write-fixture-action'
import { convexModules } from '../../helpers/convex-fixtures'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionExecutionTracer,
  type PreparedExecution,
} from '@/modules/action-execution/runtime'
import { describe, expect, it, vi } from 'vitest'

const lateObservationVector = {
  input: {
    executionRef: 'operation-invocation:c16-late-observation',
    commandId: 'action-execution:c16-late-observation',
    effectGeneration: 3,
    actorRef: 'worker:late-c16',
    sourceEvidenceRef: 'evidence:late-c16',
    release: 'released' as const,
    evidenceDigest: 'sha256:evidence-c16',
    recordedAt: '2026-09-07T00:00:00.000Z',
  },
  material: {
    invocationRef: 'operation-invocation:c16-late-observation',
    effectGeneration: 3,
    release: 'released' as const,
    evidenceDigest: 'sha256:evidence-c16',
    actorRef: 'worker:late-c16',
    sourceEvidenceRef: 'evidence:late-c16',
  },
  expectedDigest: 'sha256:f0d7b890098a3a67f21073a5001d28d5d12570cf3949441affc47bc96be563d4',
} as const

const changedLateObservation = {
  ...lateObservationVector.input,
  release: 'not_released' as const,
  evidenceDigest: 'sha256:evidence-c16-changed',
}

const lateObservationControl = {
  executionRef: lateObservationVector.input.executionRef,
  executionVersion: 7,
  sourceRef: 'source:c16-late-observation',
  control: {
    executionRef: lateObservationVector.input.executionRef,
    executionVersion: 7,
    origin: { kind: 'standalone', callerRef: 'caller:c16', principalRef: 'principal:c16' },
    owner: { callerRef: 'caller:c16', principalRef: 'principal:c16' },
    action: { id: 'test.c16_late_observation', contractVersion: 'test.c16_late_observation:v1' },
    desired: { state: 'invoke' },
    freshness: { state: 'not_observed' },
    control: { state: 'authorized', decidedAt: '2026-09-07T00:00:00.000Z' },
  },
  updatedAt: '2026-09-07T00:00:00.000Z',
} satisfies DurableControlRow

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

  it('uses one established digest vector for Convex and development late-observation replay', async () => {
    expect(canonicalDigest(lateObservationVector.material)).toBe(lateObservationVector.expectedDigest)

    const developmentState = createDevelopmentDurableState()
    developmentState.controls.set(lateObservationVector.input.executionRef, lateObservationControl)
    const developmentPort = createDevelopmentDurablePort(developmentState)

    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      await ctx.db.insert('actionExecutionControls', lateObservationControl)
    })

    const developmentFirst = await developmentPort.recordLateObservation(lateObservationVector.input)
    const developmentReplay = await developmentPort.recordLateObservation(lateObservationVector.input)
    const developmentConflict = await developmentPort.recordLateObservation(changedLateObservation)
    expect(developmentFirst).toEqual({ kind: 'applied', executionVersion: 7 })
    expect(developmentReplay).toEqual({ kind: 'duplicate', executionVersion: 7 })
    expect(developmentConflict).toEqual({ kind: 'refused', code: 'command_identity_conflict' })

    const convexFirst = await backend.mutation(
      internal.actionExecutionControl.recordLateObservation,
      lateObservationVector.input,
    )
    const convexReplay = await backend.mutation(
      internal.actionExecutionControl.recordLateObservation,
      lateObservationVector.input,
    )
    const convexConflict = await backend.mutation(
      internal.actionExecutionControl.recordLateObservation,
      changedLateObservation,
    )
    expect(convexFirst).toEqual({ kind: 'applied', executionVersion: 7 })
    expect(convexReplay).toEqual({ kind: 'duplicate', executionVersion: 7 })
    expect(convexConflict).toEqual({ kind: 'refused', code: 'command_identity_conflict' })

    const developmentHistory = await developmentPort.readHistoryCommand(
      lateObservationVector.input.executionRef,
      lateObservationVector.input.commandId,
    )
    const convexHistory = await backend.query(
      internal.actionExecutionControl.readHistoryCommand,
      {
        executionRef: lateObservationVector.input.executionRef,
        commandId: lateObservationVector.input.commandId,
      },
    )
    expect(developmentHistory).toMatchObject({ commandDigest: lateObservationVector.expectedDigest })
    expect(convexHistory).toMatchObject({ commandDigest: lateObservationVector.expectedDigest })
    expect(convexHistory?.commandDigest).toBe(developmentHistory?.commandDigest)
  })
})
