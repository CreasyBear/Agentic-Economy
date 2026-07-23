import { afterEach, describe, expect, it, vi } from 'vitest'

import { emitSnapshotEvents, type AnswerSnapshot } from '@/modules/answer/public'

describe('emitSnapshotEvents', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

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

  it('streams with the Node 20 promise surface used by hosted functions', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const descriptor = Object.getOwnPropertyDescriptor(Promise, 'withResolvers')
    Object.defineProperty(Promise, 'withResolvers', {
      configurable: true,
      value: undefined,
      writable: true,
    })

    try {
      const events = []
      for await (const event of emitSnapshotEvents(snapshot(), { emitThinking: false, pauseMs: 1 })) {
        events.push(event)
      }
      expect(events.at(-1)?.type).toBe('complete')
    } finally {
      if (descriptor === undefined) {
        Reflect.deleteProperty(Promise, 'withResolvers')
      } else {
        Object.defineProperty(Promise, 'withResolvers', descriptor)
      }
    }
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
    nextStep: 'Open the inquiry form. AE does not book, charge, or dispatch.',
    agentJsonUrl: '/api/businesses/search?q=plumber',
    compactLayout: true,
    layoutProfile: 'refinement_compact',
  }
}
