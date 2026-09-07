import { describe, expect, it } from 'vitest'

import {
  nextActionForCallStatus,
  nextActionForToolFacts,
  suggestNextAction,
  type NextActionState,
  type SuggestedNextAction,
} from '@/modules/market/suggested-next-action'

const TOOL_REF = `operation:v1:${'a'.repeat(64)}`
const CALL_REF = 'invocation:current'
const SEARCH_QUERY = 'Find an award flight with current availability'
const CALLABLE_SEARCH_COMMAND = `ae search '${SEARCH_QUERY}' --filters '{"availability":["routeable"]}'`
const CALLABLE_SEARCH_HREF = '/market?window=30d&query=Find+an+award+flight+with+current+availability&availability=routeable'

describe('shared suggested next-action projection', () => {
  it.each([
    ['routeable', false, false, 'Call Tool'],
    ['routeable', true, false, 'Connect agent'],
    ['routeable', true, true, 'Call Tool'],
    ['setup_required', true, false, 'Find callable alternatives'],
    ['unavailable', true, false, 'Find callable alternatives'],
  ] as const)(
    'adapts %s Tool facts without mistaking authentication for availability',
    (availabilityPosture, requiresBuyerCredential, hasBuyerCredential, label) => {
      expect(nextActionForToolFacts({
        toolRef: TOOL_REF,
        searchQuery: SEARCH_QUERY,
        availabilityPosture,
        requiresBuyerCredential,
        hasBuyerCredential,
      }).label).toBe(label)
    },
  )

  it.each<readonly [NextActionState, SuggestedNextAction]>([
    [
      { subject: 'tool', state: 'ready', toolRef: TOOL_REF, searchQuery: SEARCH_QUERY },
      { label: 'Call Tool', kind: 'copy_command', command: `ae call ${TOOL_REF} --input '<json>'` },
    ],
    [
      { subject: 'tool', state: 'connection_required', toolRef: TOOL_REF, searchQuery: SEARCH_QUERY },
      { label: 'Connect agent', kind: 'navigate', command: 'ae connect', href: '/for-agents' },
    ],
    [
      { subject: 'tool', state: 'read_only', toolRef: TOOL_REF, searchQuery: SEARCH_QUERY },
      { label: 'Find callable alternatives', kind: 'navigate', command: CALLABLE_SEARCH_COMMAND, href: CALLABLE_SEARCH_HREF, warning: 'This Tool is inspectable but not currently callable.' },
    ],
    [
      { subject: 'tool', state: 'unavailable', toolRef: TOOL_REF, searchQuery: SEARCH_QUERY },
      { label: 'Find callable alternatives', kind: 'navigate', command: CALLABLE_SEARCH_COMMAND, href: CALLABLE_SEARCH_HREF, warning: 'This Tool is not currently callable.' },
    ],
    [
      { subject: 'call', state: 'pending', callRef: CALL_REF },
      { label: 'Check call status', kind: 'copy_command', command: `ae status ${CALL_REF}` },
    ],
    [
      { subject: 'call', state: 'completed', callRef: CALL_REF },
      { label: 'View receipt', kind: 'navigate', command: `ae status ${CALL_REF}`, href: `/calls/${CALL_REF}` },
    ],
    [
      { subject: 'call', state: 'retryable', callRef: CALL_REF },
      { label: 'Review safe retry', kind: 'retry', command: `ae status ${CALL_REF}`, warning: 'Reuse the recorded Call identity before retrying.' },
    ],
    [
      { subject: 'call', state: 'cancellable', callRef: CALL_REF },
      { label: 'Review cancellation', kind: 'copy_command', command: `ae status ${CALL_REF}` },
    ],
    [
      { subject: 'call', state: 'reconciliation_required', callRef: CALL_REF },
      { label: 'Prepare reconciliation', kind: 'reconcile', command: 'ae help recover', warning: 'The external effect may have started. Reconcile before retrying.' },
    ],
    [
      { subject: 'provider', state: 'draft', offeringRef: 'offering:one' },
      { label: 'Continue description', kind: 'navigate', href: '/owner/supply/offering%3Aone' },
    ],
    [
      { subject: 'provider', state: 'unready', offeringRef: 'offering:one' },
      { label: 'Recheck readiness', kind: 'navigate', href: '/owner/supply/offering%3Aone' },
    ],
    [
      { subject: 'provider', state: 'incompatible', offeringRef: 'offering:one' },
      { label: 'Inspect incompatibility', kind: 'navigate', href: '/owner/supply/offering%3Aone' },
    ],
    [
      { subject: 'provider', state: 'withdrawn', offeringRef: 'offering:one' },
      { label: 'Republish Tool', kind: 'navigate', href: '/owner/supply/offering%3Aone' },
    ],
    [
      { subject: 'provider', state: 'current', offeringRef: 'offering:one', toolRef: TOOL_REF },
      { label: 'View live Tool', kind: 'navigate', command: `ae describe ${TOOL_REF}`, href: `/tools/${TOOL_REF}` },
    ],
    [
      { subject: 'connection', state: 'missing', actor: 'buyer' },
      { label: 'Connect agent', kind: 'navigate', command: 'ae connect', href: '/for-agents' },
    ],
    [
      { subject: 'connection', state: 'missing', actor: 'provider' },
      {
        label: 'Connect provider',
        kind: 'navigate',
        href: '/owner/offerings#provider-connections',
      },
    ],
    [
      { subject: 'credit', state: 'insufficient' },
      { label: 'Add credit', kind: 'navigate', command: 'ae account balance', href: '/owner/credit#fund' },
    ],
  ])('projects %j to the single safe next action', (state, expected) => {
    expect(suggestNextAction(state)).toEqual(expected)
  })

  it('never puts authority material or blind-retry guidance into commands', () => {
    const states: NextActionState[] = [
      { subject: 'tool', state: 'ready', toolRef: TOOL_REF, searchQuery: SEARCH_QUERY },
      { subject: 'call', state: 'reconciliation_required', callRef: CALL_REF },
      { subject: 'provider', state: 'withdrawn', offeringRef: 'offering:one' },
    ]

    const serialized = JSON.stringify(states.map(suggestNextAction))
    expect(serialized).not.toMatch(/credential|api[_-]?key|idempotency|evidence|private/i)
    expect(suggestNextAction(states[1]!)).not.toMatchObject({ kind: 'retry' })
    expect(suggestNextAction(states[1]!).command).toBe('ae help recover')
  })

  it('turns the user-facing Tool summary into one bounded executable search phrase', () => {
    const nextAction = nextActionForToolFacts({
      toolRef: TOOL_REF,
      searchQuery: `  Find provider's\ncurrent invoice extractor ${'with evidence '.repeat(30)}`,
      availabilityPosture: 'setup_required',
      requiresBuyerCredential: true,
      hasBuyerCredential: true,
    })
    expect(nextAction.command).not.toContain('\n')
    expect(nextAction.command).toContain("ae search 'Find provider'\\''s current invoice extractor")
    const projectedQuery = new URL(nextAction.href!, 'https://market.example').searchParams.get('query')
    expect(projectedQuery).not.toContain('\n')
    expect(projectedQuery?.length).toBeLessThanOrEqual(200)
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
  ] as const)('adapts Call state %s without changing its safety meaning', (state, projectedState) => {
    expect(nextActionForCallStatus({ callRef: CALL_REF, state }))
      .toEqual(suggestNextAction({ subject: 'call', state: projectedState, callRef: CALL_REF }))
  })
})
