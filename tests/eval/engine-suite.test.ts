import { describe, expect, it } from 'vitest'

import { runEngineEvalSuite } from '../../eval/engine/lib/suite'

describe('engine plan evaluation suite', () => {
  it('executes all twenty asks through production turn and journal seams', async () => {
    const report = await runEngineEvalSuite()

    expect(report).toMatchObject({
      schemaVersion: 'engine-eval-suite-report:v1',
      ok: true,
      summary: {
        caseCount: 20,
        failedCaseCount: 0,
        clearCaseCount: 6,
        planCaseCount: 6,
        planSuccessRate: 1,
      },
    })
    expect(report.cases.filter(({ kind }) => kind === 'clear').every(({ modelCalls, evidence }) =>
      modelCalls === 0 && evidence === 'runtime_turn_path_sandbox_supply')).toBe(true)
    expect(report.cases.filter(({ kind }) => kind === 'vague').every(({ status, modelCalls, evidence }) =>
      status === 'clarification' && modelCalls === 0 && evidence === 'runtime_turn_path_sandbox_supply')).toBe(true)
    expect(report.cases.filter(({ kind }) => kind === 'no_supply').every(({ failureReason, evidence, status }) =>
      failureReason === 'no_supply' && status === 'failed' && evidence === 'persisted_engine_plan_events')).toBe(true)
    expect(report.cases.filter(({ kind }) => kind === 'plan').every(({ planId, revisionCount, status, evidence, metrics }) =>
      planId !== undefined
      && revisionCount === 1
      && status === 'completed'
      && evidence === 'persisted_engine_plan_events'
      && metrics !== undefined
      && metrics.actionsUsed <= 4
      && metrics.costUsd <= 0.06)).toBe(true)
    expect(report.cases.filter(({ kind }) => kind === 'plan').every(({ modelCalls }) => modelCalls > 0)).toBe(true)
    expect(report.cases.filter(({ kind }) => kind === 'adversarial').every(({ evidence, status }) =>
      evidence === 'kernel_adversarial_validation' && status === 'refused')).toBe(true)
    expect(report.summary.p95RoleLatencyMs.proposal).toBeGreaterThan(0)
    expect(report.cases.filter(({ kind }) => kind === 'plan').every(({ roleLatencyMs }) =>
      roleLatencyMs.proposal > 0)).toBe(true)
    expect(report.cases.filter(({ kind }) => kind === 'adversarial').map(({ refusalReason }) => refusalReason)).toEqual([
      'proposal_action_not_in_menu',
      'proposal_plan_cyclic',
      'proposal_nonce_mismatch',
    ])
  })
})
