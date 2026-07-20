import { describe, expect, it } from 'vitest'

import { runFrozenDirectEndpointBaseline } from '@/modules/capability-supply/direct-endpoint-baseline-executor'
import { runRequestOwnedGate10HostTraces } from '@/modules/capability-supply/gate-10-host-trace'
import { measureGate10Cases } from '@/modules/capability-supply/gate-10-measurement'

describe('ADR-010 Gate 10 PublishedOperation measurement', () => {
  it('judges every case independently before applying the frozen overall-gain rule', async () => {
    const direct = await runFrozenDirectEndpointBaseline()
    const embedded = await runRequestOwnedGate10HostTraces()
    const measured = measureGate10Cases(direct, embedded)
    expect(measured.cases.map(({ case: caseName }) => caseName)).toEqual([
      'success',
      'material_correction',
      'post_release_uncertainty',
    ])
    expect(measured.cases.every(({ casePass }) => casePass)).toBe(true)
    expect(measured.aggregateHumanEffort.embedded)
      .toEqual(measured.aggregateHumanEffort.direct)
    expect(measured.aggregateHumanEffort.strictImprovement).toBe(false)
    expect(measured.verdict).toBe('NARROW_OR_REDESIGN')
  })

  it('derives chronology, authority, privacy, effects, and recovery from anchored records', async () => {
    const direct = await runFrozenDirectEndpointBaseline()
    const embedded = await runRequestOwnedGate10HostTraces()
    const measured = measureGate10Cases(direct, embedded)
    const correction = measured.cases[1]!
    expect(correction.direct.control).toMatchObject({
      exactAuthorityChecks: 2,
      materialInvalidations: 1,
      staleAuthorityRefusals: 1,
      ambientAuthorityUses: 0,
    })
    expect(correction.embedded.control).toEqual(correction.direct.control)
    expect(correction.embedded.privacy).toEqual(correction.direct.privacy)
    const recovery = measured.cases[2]!
    expect(recovery.direct.humanEffort.recoveryDecisions).toBe(0)
    expect(recovery.embedded.humanEffort.recoveryDecisions).toBe(0)
    expect(recovery.direct.providerBurden.reconciliationCalls).toBe(1)
    expect(recovery.embedded.operatorBurden.reconciliationTasks).toBe(1)
    expect(recovery.direct.correctness).toEqual(recovery.embedded.correctness)
  })

  it('rejects dropped, reordered, and incomparable raw cases before measurement', async () => {
    const direct: any = clone(await runFrozenDirectEndpointBaseline())
    const embedded: any = clone(await runRequestOwnedGate10HostTraces())
    direct.cases[0].trace.splice(1, 1)
    expect(() => measureGate10Cases(direct, embedded)).toThrow('gate10_trace_sequence_invalid')

    const reordered: any = clone(await runFrozenDirectEndpointBaseline())
    ;[reordered.cases[0].trace[0], reordered.cases[0].trace[1]] = [
      reordered.cases[0].trace[1],
      reordered.cases[0].trace[0],
    ]
    expect(() => measureGate10Cases(reordered, embedded)).toThrow('gate10_trace_sequence_invalid')

    const incomparable: any = clone(await runFrozenDirectEndpointBaseline())
    incomparable.task.operation.price.amountMinor = 2
    expect(() => measureGate10Cases(incomparable, embedded)).toThrow('gate10_task_or_policy_mismatch')
  })
})

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
