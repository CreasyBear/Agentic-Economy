import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadEnabledFollowUpChips } from '@/modules/answer-thread/client'
import type { PublicThreadTurn } from '@/modules/answer-thread/public'

describe('follow-up chips client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stops at the gate when generated chips are disabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ llmChipsEnabled: false }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await loadEnabledFollowUpChips(turn(), new AbortController().signal)

    expect(result).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/answer/eval-status', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('projects providers and returns validated generated chips', async () => {
    const chips = [{ label: 'Compare opening hours', submitQuery: 'Compare their opening hours' }]
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ llmChipsEnabled: true }))
      .mockResolvedValueOnce(Response.json({ chips }))
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    await expect(loadEnabledFollowUpChips(turn(), controller.signal)).resolves.toEqual(chips)
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/answer/follow-up-chips', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', signal: controller.signal,
    }))
    const secondCall = fetchMock.mock.calls[1]
    if (secondCall === undefined) throw new Error('missing follow-up chips request')
    const body = JSON.parse(String((secondCall[1] as RequestInit).body))
    expect(body).toMatchObject({ query: 'Find a plumber', providers: [{ slug: 'plumber-one' }] })
  })

  it('uses the same signal for both requests and falls back after cancellation', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) return Response.json({ llmChipsEnabled: true })
      controller.abort()
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      return Response.json({ chips: [] })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadEnabledFollowUpChips(turn(), controller.signal)).resolves.toBeUndefined()
    expect(fetchMock.mock.calls.every((call) => (call[1] as RequestInit).signal === controller.signal)).toBe(true)
  })

  it.each([
    Response.json({ chips: [{ label: 'Missing query' }] }),
    Response.json({ chips: 'not-an-array' }),
    Response.json({ error: 'unavailable' }, { status: 503 }),
  ])('keeps deterministic chips for malformed or failed responses', async (followUpResponse) => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ llmChipsEnabled: true }))
      .mockResolvedValueOnce(followUpResponse))

    await expect(loadEnabledFollowUpChips(turn(), new AbortController().signal)).resolves.toBeUndefined()
  })
})

function turn(): PublicThreadTurn {
  return {
    turnId: 'turn-1', seq: 1, query: 'Find a plumber', intent: 'refine_search', status: 'complete',
    oneLine: 'One business found.', workLog: [],
    artifacts: [{
      kind: 'provider-cards',
      providers: [{
        citationIndex: 1, slug: 'plumber-one', name: 'Plumber One', category: 'Plumber',
        suburb: 'Perth', stateTerritory: 'WA', serviceArea: 'Perth', hoursLabel: 'Hours supplied',
        availabilityLabel: 'Published', trustLabel: 'Checked', responseTimeLabel: 'Responds soon',
        trustCue: 'Checked', nextStepLabel: 'Review listing', detailUrl: '/plumber-one', services: [],
      }],
    }],
  }
}
