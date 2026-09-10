import { actor, input, origins } from './durable-action-execution-harness'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { requireDurableWriteFixtureAction } from '../../helpers/durable-write-fixture-action'
import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionExecutionTracer,
  readCompletedResultIdentity,
  type PreparedExecution,
} from '@/modules/action-execution'
import { describe, expect, it, vi } from 'vitest'

describe('durable Action Execution result', () => {
  it('exposes only a source-verified completed-result identity and refuses tamper or nonterminal reads', async () => {
    const origin = origins[1]!
    const action = requireDurableWriteFixtureAction()
    const durableState = createDevelopmentDurableState()
    const port = createDevelopmentDurablePort(durableState)
    const result = {
      kind: 'ok' as const,
      code: 'operation_invoked' as const,
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
      context: { developmentOnlyDurableWriteAdapter: vi.fn().mockResolvedValue(result) },
      prepared: undefined as PreparedExecution | undefined,
      observedResolution: { state: 'pending' as const },
      resultIdentity: {
        sourceResultRef: 'mock:inquiry-result:durable',
        resultDigest: canonicalDigest(result),
      },
    }
    const tracer = createDurableActionExecutionTracer({
      action, port,
      now: () => '2026-07-19T11:00:00.000Z',
      nextExecutionRef: () => 'dev:durable:completed',
      nextAuthorityRef: () => 'opaque:durable:completed',
      nextAttemptRef: () => 'dev:attempt:completed:1',
      resolveSourceState: () => source,
    })
    const prepared = await tracer.prepare({
      origin, actor, input, context: source.context, freshnessMs: 60_000,
    })
    source.prepared = prepared.prepared!
    expect(await readCompletedResultIdentity(port, prepared.executionRef, actor, () => ({
      sourceResultRef: source.resultIdentity.sourceResultRef, result,
    }))).toEqual({ kind: 'refused', code: 'execution_not_terminal' })
    const decided = await tracer.decide({
      executionRef: prepared.executionRef,
      expectedExecutionVersion: prepared.executionVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, accept: true,
    })
    if (decided.kind !== 'accepted') throw new Error(decided.code)
    const completed = await tracer.execute({
      executionRef: prepared.executionRef,
      expectedExecutionVersion: decided.view.executionVersion,
      authorityRef: prepared.authority!.reference,
      actor, origin, materialInput: input,
    })
    expect(completed).toMatchObject({
      kind: 'accepted',
      view: { control: { state: 'terminal' } },
    })
    expect(await readCompletedResultIdentity(port, prepared.executionRef, actor, () => ({
      sourceResultRef: source.resultIdentity.sourceResultRef, result,
    }))).toMatchObject({
      kind: 'completed_result',
      actionId: 'test.durable_write',
      actionVersion: 'test.durable_write:v1',
      sourceResultRef: 'mock:inquiry-result:durable',
      businessOutcome: 'queued_communication',
    })
    const completedRow = await port.readControl(prepared.executionRef)
    if (completedRow === undefined) throw new Error('completed_row_missing')
    const readIdentity = async () => readCompletedResultIdentity(port,
      prepared.executionRef,
      actor,
      () => ({ sourceResultRef: source.resultIdentity.sourceResultRef, result }),
    )
    durableState.controls.set(prepared.executionRef, {
      ...completedRow,
      terminalBusinessOutcome: 'new_action_outcome',
      terminalResultReferenceable: true,
    })
    expect(await readIdentity()).toMatchObject({
      kind: 'completed_result',
      businessOutcome: 'new_action_outcome',
    })
    durableState.controls.set(prepared.executionRef, {
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
      durableState.controls.set(prepared.executionRef, {
        ...rowWithoutClassification,
        terminalBusinessOutcome: outcome,
      })
      expect(await readIdentity()).toEqual({ kind: 'refused', code: 'outcome_not_referenceable' })
    }
    durableState.controls.set(prepared.executionRef, completedRow)
    expect(source.resultIdentity.resultDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(await readCompletedResultIdentity(port,
    prepared.executionRef,
    { ...actor, principalRef: 'mock:principal:other' },
    () => ({ sourceResultRef: source.resultIdentity.sourceResultRef, result }),)).toEqual({ kind: 'refused', code: 'cross_principal_refused' })
    expect(await readCompletedResultIdentity(port, prepared.executionRef, actor, () => ({
      sourceResultRef: source.resultIdentity.sourceResultRef,
      result: { ...result, code: 'tampered' } as never,
    }))).toEqual({ kind: 'refused', code: 'source_result_mismatch' })
    expect(source.context.developmentOnlyDurableWriteAdapter).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(await port.readControl(prepared.executionRef))).not.toContain(result.receipt.accessKey)
    durableState.controls.delete(prepared.executionRef)
    expect(await port.readControl(prepared.executionRef)).toBeUndefined()
    expect(source.resultIdentity).toEqual({
      sourceResultRef: 'mock:inquiry-result:durable',
      resultDigest: canonicalDigest(result),
    })
    expect(result.receipt.accessKey).toBe('SECRET-MUST-NOT-PERSIST')
  })
})
