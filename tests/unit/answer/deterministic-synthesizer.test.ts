import { describe, expect, it } from 'vitest'

import { deterministicSynthesizer } from '@/modules/answer/public'
import type { AnswerEvent } from '@/modules/answer/public'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'
import { withRegistrySourcePortForTest } from '../../helpers/source-ports'

async function collectEvents(query: string, limit = 10): Promise<AnswerEvent[]> {
  const events: AnswerEvent[] = []
  for await (const event of deterministicSynthesizer.synthesize({ query, limit })) {
    events.push(event)
  }
  return events
}

describe('deterministic answer synthesizer', () => {
  it('emits thinking -> one-line -> sources -> summary-delta -> next-step -> complete with cited providers', async () => {
    const state = createDefaultRegistrySourceState()

    await withRegistrySourcePortForTest(state, async () => {
      const events = await collectEvents('emergency plumber parramatta')
      const types = events.map((event) => event.type)

      expect(types[0]).toBe('thinking')
      expect(types[1]).toBe('one-line')
      expect(types).toContain('sources')
      expect(types.at(-1)).toBe('complete')

      const complete = events.at(-1)
      if (complete?.type !== 'complete') {
        throw new Error('Expected a complete event.')
      }

      const answer = complete.answer
      expect(answer.providers.length).toBeGreaterThan(0)
      expect(answer.providers[0]?.slug).toBe('parramatta-emergency-plumbing')
      expect(answer.providers[0]?.detailUrl).toBe('/parramatta-emergency-plumbing')
      expect(answer.providers[0]?.availabilityLabel.length).toBeGreaterThan(0)
      expect(answer.providers[0]?.nextStepLabel.length).toBeGreaterThan(0)
      expect(answer.summary).toContain('No booking or payment happens on this page')
      expect(answer.agentJsonUrl).toContain('/api/businesses/search')
      expect(answer.oneLine).toMatch(/listed business/i)
    })
  })

  it('keeps epistemic and overclaim vocabulary out of the synthesized answer', async () => {
    const state = createDefaultRegistrySourceState()

    await withRegistrySourcePortForTest(state, async () => {
      const events = await collectEvents('emergency plumber parramatta')
      const complete = events.at(-1)
      if (complete?.type !== 'complete') {
        throw new Error('Expected a complete event.')
      }

      const serialized = JSON.stringify(complete.answer)
      expect(serialized).not.toMatch(/\b(?:KNOWN|UNKNOWN|UNAVAILABLE)\b/)
      expect(serialized).not.toMatch(/booking available|payment available|callable endpoint|agent-native/i)
    })
  })

  it('yields an empty answer with a listing nudge when no providers match', async () => {
    const state = createDefaultRegistrySourceState()

    await withRegistrySourcePortForTest(state, async () => {
      const events = await collectEvents('zzz-no-such-trade-xyz')
      const complete = events.at(-1)
      if (complete?.type !== 'complete') {
        throw new Error('Expected a complete event.')
      }

      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.oneLine).toMatch(/No listed businesses match/)
      expect(complete.answer.summary).toContain('No providers are listed for that yet')
    })
  })
})
