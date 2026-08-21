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
      'next-step',
      'summary-delta',
      'summary-delta',
      'complete',
    ])
    expect(events[2]).toMatchObject({ type: 'next-step' })
    expect(events[3]).toMatchObject({ type: 'summary-delta', delta: 'First sentence.' })
    expect(events[4]).toMatchObject({ type: 'summary-delta', delta: 'Second sentence.' })
  })

  it('uses answer mode for a data answer with no providers', async () => {
    const { selectedProvider: _selectedProvider, compactLayout: _compactLayout, ...base } = snapshot()
    const events = []
    for await (const event of emitSnapshotEvents({
      ...base,
      providers: [],
      layoutProfile: 'data_answer',
    }, { emitThinking: false, pauseMs: 0 })) {
      events.push(event)
    }

    expect(events[0]).toMatchObject({
      type: 'plan',
      mode: 'answer',
      layoutProfile: 'data_answer',
    })
  })
})

function snapshot(): AnswerSnapshot {
  const provider = {
    citationIndex: 1,
    slug: 'demo-plumbing',
    name: 'Demo inquiry provider',
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
    oneLine: 'Demo inquiry provider publishes a qualified inquiry path.',
    providers: [provider],
    selectedProvider: provider,
    summary: 'First sentence. Second sentence.',
    nextStep: 'Open the inquiry form. The business confirms timing, price, availability, and the work.',
    agentJsonUrl: '/api/businesses/search?q=plumber',
    compactLayout: true,
    layoutProfile: 'refinement_compact',
  }
}
