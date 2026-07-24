import { describe, expect, it } from 'vitest'

import { emitSnapshotEvents, type AnswerSnapshot } from '@/modules/answer/public'

describe('emitSnapshotEvents', () => {
  it('preserves selected-provider, next-step, summary, and completion order', async () => {
    const events = []
    for await (const event of emitSnapshotEvents(snapshot(), { emitThinking: false, pauseMs: 0 })) {
      events.push(event)
    }

    expect(events.map((event) => event.type)).toEqual([
      'plan',
      'one-line',
      'sources',
      'artifact',
      'next-step',
      'summary-delta',
      'summary-delta',
      'complete',
    ])
    expect(events[3]).toMatchObject({ type: 'artifact', artifact: { kind: 'selected-provider' } })
    expect(events[5]).toMatchObject({ type: 'summary-delta', delta: 'First sentence.' })
    expect(events[6]).toMatchObject({ type: 'summary-delta', delta: 'Second sentence.' })
  })
})

function snapshot(): AnswerSnapshot {
  const provider = {
    citationIndex: 1,
    slug: 'demo-plumbing',
    name: 'Demo Plumbing',
    category: 'Plumber',
    suburb: 'Perth',
    stateTerritory: 'WA',
    serviceArea: 'Perth',
    hoursLabel: 'Hours supplied',
    availabilityLabel: 'Needs confirmation',
    trustLabel: 'Checked',
    responseTimeLabel: 'Response time supplied',
    trustCue: 'Checked',
    nextStepLabel: 'Send inquiry',
    detailUrl: '/demo-plumbing',
    services: [],
  } as const
  return {
    query: 'plumber Perth',
    oneLine: 'Demo Plumbing publishes a qualified inquiry path.',
    providers: [provider],
    selectedProvider: provider,
    summary: 'First sentence. Second sentence.',
    nextStep: 'Open the inquiry form. The business confirms timing, price, availability, and the work.',
    agentJsonUrl: '/api/businesses/search?q=plumber',
    compactLayout: true,
    layoutProfile: 'refinement_compact',
  }
}
