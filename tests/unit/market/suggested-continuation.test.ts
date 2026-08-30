import { describe, expect, it } from 'vitest'

import {
  continuationForInvocationStatus,
  continuationForOperationFacts,
  suggestContinuation,
  type ContinuationState,
  type SuggestedContinuation,
} from '@/modules/market/suggested-continuation'

const OPERATION_REF = `operation:v1:${'a'.repeat(64)}`
const INVOCATION_REF = 'invocation:current'

describe('shared suggested continuation projection', () => {
  it.each([
    ['routeable', false, false, 'Call Operation'],
    ['routeable', true, false, 'Connect agent'],
    ['routeable', true, true, 'Call Operation'],
    ['integrated', true, false, 'Inspect Operation'],
    ['unavailable', true, false, 'Inspect availability'],
  ] as const)(
    'adapts %s Operation facts without mistaking authentication for availability',
    (availabilityPosture, requiresBuyerCredential, hasBuyerCredential, label) => {
      expect(continuationForOperationFacts({
        operationRef: OPERATION_REF,
        availabilityPosture,
        requiresBuyerCredential,
        hasBuyerCredential,
      }).label).toBe(label)
    },
  )

  it.each<readonly [ContinuationState, SuggestedContinuation]>([
    [
      { subject: 'operation', state: 'ready', operationRef: OPERATION_REF },
      { label: 'Call Operation', kind: 'copy_command', command: `ae call ${OPERATION_REF} --input '<json>'` },
    ],
    [
      { subject: 'operation', state: 'connection_required', operationRef: OPERATION_REF },
      { label: 'Connect agent', kind: 'navigate', command: 'ae connect', href: '/for-agents' },
    ],
    [
      { subject: 'operation', state: 'inspect_only', operationRef: OPERATION_REF },
      { label: 'Inspect Operation', kind: 'navigate', command: `ae inspect ${OPERATION_REF}`, href: `/operations/${OPERATION_REF}` },
    ],
    [
      { subject: 'operation', state: 'unavailable', operationRef: OPERATION_REF },
      { label: 'Inspect availability', kind: 'copy_command', command: `ae inspect ${OPERATION_REF}`, warning: 'This Operation is not currently callable.' },
    ],
    [
      { subject: 'invocation', state: 'pending', invocationRef: INVOCATION_REF },
      { label: 'Check call status', kind: 'copy_command', command: `ae status ${INVOCATION_REF}` },
    ],
    [
      { subject: 'invocation', state: 'completed', invocationRef: INVOCATION_REF },
      { label: 'View receipt', kind: 'navigate', command: `ae status ${INVOCATION_REF}`, href: `/operations/invocations/${INVOCATION_REF}` },
    ],
    [
      { subject: 'invocation', state: 'retryable', invocationRef: INVOCATION_REF },
      { label: 'Review safe retry', kind: 'retry', command: `ae status ${INVOCATION_REF}`, warning: 'Reuse the recorded invocation identity before retrying.' },
    ],
    [
      { subject: 'invocation', state: 'cancellable', invocationRef: INVOCATION_REF },
      { label: 'Review cancellation', kind: 'copy_command', command: `ae status ${INVOCATION_REF}` },
    ],
    [
      { subject: 'invocation', state: 'reconciliation_required', invocationRef: INVOCATION_REF },
      { label: 'Review reconciliation', kind: 'reconcile', command: `ae status ${INVOCATION_REF}`, warning: 'The external effect may have started. Reconcile before retrying.' },
    ],
    [
      { subject: 'supplier', state: 'draft', offeringRef: 'offering:one' },
      { label: 'Continue description', kind: 'navigate', href: '/owner/offerings/offering%3Aone' },
    ],
    [
      { subject: 'supplier', state: 'unready', offeringRef: 'offering:one' },
      { label: 'Recheck readiness', kind: 'navigate', href: '/owner/supply/offering%3Aone' },
    ],
    [
      { subject: 'supplier', state: 'incompatible', offeringRef: 'offering:one' },
      { label: 'Inspect incompatibility', kind: 'navigate', href: '/owner/supply/offering%3Aone' },
    ],
    [
      { subject: 'supplier', state: 'withdrawn', offeringRef: 'offering:one' },
      { label: 'Republish Operation', kind: 'navigate', href: '/owner/supply/offering%3Aone' },
    ],
    [
      { subject: 'supplier', state: 'current', offeringRef: 'offering:one', operationRef: OPERATION_REF },
      { label: 'View live Operation', kind: 'navigate', command: `ae inspect ${OPERATION_REF}`, href: `/operations/${OPERATION_REF}` },
    ],
    [
      { subject: 'connection', state: 'missing', actor: 'buyer' },
      { label: 'Connect agent', kind: 'navigate', command: 'ae connect', href: '/for-agents' },
    ],
    [
      { subject: 'connection', state: 'missing', actor: 'supplier' },
      { label: 'Connect provider', kind: 'navigate', href: '/owner/settings/connections' },
    ],
    [
      { subject: 'credit', state: 'insufficient' },
      { label: 'Add credit', kind: 'navigate', command: 'ae account balance', href: '/owner/credit#fund' },
    ],
  ])('projects %j to the single safe continuation', (state, expected) => {
    expect(suggestContinuation(state)).toEqual(expected)
  })

  it('never puts authority material or blind-retry guidance into commands', () => {
    const states: ContinuationState[] = [
      { subject: 'operation', state: 'ready', operationRef: OPERATION_REF },
      { subject: 'invocation', state: 'reconciliation_required', invocationRef: INVOCATION_REF },
      { subject: 'supplier', state: 'withdrawn', offeringRef: 'offering:one' },
    ]

    const serialized = JSON.stringify(states.map(suggestContinuation))
    expect(serialized).not.toMatch(/credential|api[_-]?key|idempotency|evidence|private/i)
    expect(suggestContinuation(states[1]!)).not.toMatchObject({ kind: 'retry' })
    expect(suggestContinuation(states[1]!).command).toBe(`ae status ${INVOCATION_REF}`)
  })

  it.each([
    ['gathering_information', 'pending'],
    ['awaiting_authority', 'pending'],
    ['in_progress', 'pending'],
    ['authorized', 'cancellable'],
    ['leased', 'cancellable'],
    ['retryable', 'retryable'],
    ['reconciliation_required', 'reconciliation_required'],
    ['terminal', 'completed'],
    ['cancelled', 'completed'],
    ['invalidated', 'completed'],
  ] as const)('adapts invocation state %s without changing its safety meaning', (state, projectedState) => {
    expect(continuationForInvocationStatus({ invocationRef: INVOCATION_REF, state }))
      .toEqual(suggestContinuation({ subject: 'invocation', state: projectedState, invocationRef: INVOCATION_REF }))
  })
})
