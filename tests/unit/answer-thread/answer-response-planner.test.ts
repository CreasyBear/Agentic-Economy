import { describe, expect, it } from 'vitest'

import { planPendingOperationClarification } from '@/modules/answer-thread/internal/answer-response-planner'

describe('pending operation clarification', () => {
  it('asks for an operation name when nothing is pending', () => {
    const plan = planPendingOperationClarification({
      query: 'do it',
      hasPendingDecision: false,
    })

    expect(plan).toMatchObject({
      mode: 'clarify',
      reason: 'missing_pending_operation',
      toolPolicy: { kind: 'none' },
    })
    expect(plan.snapshot.oneLine).toBe('What should I execute?')
  })

  it('asks for the recorded approval action when a decision is pending', () => {
    const plan = planPendingOperationClarification({
      query: 'go ahead',
      hasPendingDecision: true,
    })

    expect(plan).toMatchObject({
      mode: 'clarify',
      reason: 'pending_operation_action',
      toolPolicy: { kind: 'none' },
    })
    expect(plan.snapshot.oneLine).toBe('What should I do with the pending operation?')
  })
})
