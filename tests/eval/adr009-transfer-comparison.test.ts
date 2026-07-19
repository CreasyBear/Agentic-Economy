import { describe, expect, it } from 'vitest'

import {
  evaluateAdr009Transfer,
  type TransferBoundaryEvent,
  type TransferEvidence,
} from './support/adr009-transfer-comparison'

const controlledEvents: TransferBoundaryEvent[] = [
  { kind: 'approval_policy', policy: 'ask', reason: 'exact invocation authority' },
  { kind: 'authority_decision', invocationRef: 'dev:invocation' },
  { kind: 'user_or_supervisor_decision', invocationRef: 'dev:invocation' },
  { kind: 'direct_runner_started', actionId: 'supply.collectDevelopmentQuote' },
  { kind: 'effect_call', actionId: 'supply.collectDevelopmentQuote' },
  { kind: 'direct_runner_returned', actionId: 'supply.collectDevelopmentQuote', outcome: 'quote_returned' },
  { kind: 'action_invocation', invocationRef: 'dev:invocation' },
  { kind: 'control', invocationRef: 'dev:invocation' },
  { kind: 'attempt', invocationRef: 'dev:invocation', attemptRef: 'dev:attempt' },
  { kind: 'history', invocationRef: 'dev:invocation', commandId: 'dev:command:1' },
]

function passingEvidence(): TransferEvidence {
  return {
    events: {
      direct_read: [
        { kind: 'approval_policy', policy: 'allow', reason: 'read only' },
        { kind: 'direct_runner_started', actionId: 'registry.detail' },
        { kind: 'direct_runner_returned', actionId: 'registry.detail', outcome: 'not_found' },
      ],
      direct_consequential: [
        { kind: 'approval_policy', policy: 'ask', reason: 'consequential' },
        { kind: 'direct_runner_started', actionId: 'supply.collectDevelopmentQuote' },
        { kind: 'direct_runner_returned', actionId: 'supply.collectDevelopmentQuote', outcome: 'quote_returned' },
      ],
      controlled: controlledEvents,
    },
    requiredContinuations: { direct_read: 1, direct_consequential: 2, controlled: 2 },
    controlledReadback: {
      invocationVersion: 5,
      controlRecords: 1,
      attributableAttempts: 1,
      durableHistoryRecords: 5,
      terminalResultReconstructed: true,
      exactAuthorityBeforeRelease: true,
      retryClass: 'reconcile_before_retry',
    },
    referenceReuse: {
      completedReferences: 1,
      completedNodes: 1,
      currentNodes: 1,
      effectsBeforeReuse: 1,
      effectsAfterReuse: 1,
      copiedLifecycleOrResultFields: 0,
      persistedRoutePlansOrBundles: 0,
    },
  }
}

describe('ADR-009 measured transfer recommendation', () => {
  it('narrows the seam when altered observed reference reuse repeats the effect', () => {
    const passing = evaluateAdr009Transfer(passingEvidence())
    const altered = evaluateAdr009Transfer({
      ...passingEvidence(),
      referenceReuse: {
        ...passingEvidence().referenceReuse,
        effectsAfterReuse: 2,
      },
    })

    expect(passing.recommendation)
      .toBe('retain_control_for_consequential_and_bypass_read_only')
    expect(altered.falsifiers.F5).toMatchObject({ disposition: 'holds' })
    expect(altered.recommendation).toBe('narrow_action_invocation_seam')
  })
})
