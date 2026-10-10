import { afterEach, describe, expect, it, vi } from 'vitest'
const transport = vi.hoisted(() => ({ captureClientProductEventOnClient: vi.fn() }))
vi.mock('@/lib/observability/capture-client-events', () => transport)
import { recordProductJourney, type ProductJourneyEvent } from '@/lib/observability/product-journey'
import { protectPostHogEvent } from '@/lib/observability/posthog-event-safety'
afterEach(() => { vi.unstubAllGlobals(); transport.captureClientProductEventOnClient.mockReset() })
describe('metadata-only exploratory journey observations', () => {
  it('records search attempts separately from observed empty results, without raw query data', () => {
    vi.stubGlobal('window', {})
    recordProductJourney({ action: 'search_requested', phase: 'attempted', surface: 'market', queryLength: 37 })
    recordProductJourney({ action: 'search_observed', phase: 'observed', surface: 'market', queryLength: 37, resultCount: 0 })
    expect(transport.captureClientProductEventOnClient).toHaveBeenNthCalledWith(1, 'ae_product_journey', {
      action: 'search_requested', phase: 'attempted', surface: 'market', queryLength: 37, evidence: 'browser_observation',
    })
    expect(transport.captureClientProductEventOnClient).toHaveBeenNthCalledWith(2, 'ae_product_journey', {
      action: 'search_observed', phase: 'observed', surface: 'market', queryLength: 37, resultCount: 0, evidence: 'browser_observation',
    })
  })
  it('accepts bounded callableCount and rejects unknown keys on the strict schema', () => {
    vi.stubGlobal('window', {})
    recordProductJourney({ action: 'search_observed', phase: 'observed', surface: 'market', resultCount: 3, callableCount: 0 })
    expect(transport.captureClientProductEventOnClient).toHaveBeenLastCalledWith('ae_product_journey', {
      action: 'search_observed', phase: 'observed', surface: 'market', resultCount: 3, callableCount: 0, evidence: 'browser_observation',
    })
    transport.captureClientProductEventOnClient.mockClear()
    recordProductJourney({ action: 'search_observed', phase: 'observed', surface: 'market', unknownKey: 1 } as unknown as ProductJourneyEvent)
    expect(transport.captureClientProductEventOnClient).not.toHaveBeenCalled()
  })

  it('rejects caller-shaped content and does not let telemetry failure break an action', () => {
    vi.stubGlobal('window', {})
    const unsafe = { action: 'tool_viewed', phase: 'observed', surface: 'tool', prompt: 'private project', output: 'private answer' } as unknown as ProductJourneyEvent
    recordProductJourney(unsafe)
    expect(transport.captureClientProductEventOnClient).not.toHaveBeenCalled()
    transport.captureClientProductEventOnClient.mockImplementationOnce(() => { throw Error('offline') })
    expect(() => recordProductJourney({ action: 'auth_viewed', phase: 'observed', surface: 'sign_up' })).not.toThrow()
  })
  it('sanitizes SDK-added URLs and secrets and drops content even inside nested properties', () => {
    const event = protectPostHogEvent({ event: 'ae_product_journey', properties: {
      $current_url: 'https://app.aecon.ai/market?query=private%20brief&token=secret-value',
      query: 'private brief', prompt: 'private task', nested: { output: 'private result', queryLength: 13 },
      access_token: 'secret-value', phase: 'attempted',
    } })
    expect(event?.properties).toEqual({ $current_url: '/market', nested: { queryLength: 13 }, access_token: '[Filtered]', phase: 'attempted' })
    expect(JSON.stringify(event)).not.toMatch(/secret-value|private brief|private task|private result/)
  })
  it('never releases DOM autocapture or copy content', () => {
    expect(protectPostHogEvent({ event: '$autocapture', properties: { $elements: [{ text: 'private answer' }] } })).toBeNull()
    expect(protectPostHogEvent({ event: '$copy_autocapture', properties: {} })).toBeNull()
  })
  it('preserves SDK timestamp metadata while removing content from person properties', () => {
    const timestamp = new Date('2026-10-05T00:00:00Z')
    const safe = protectPostHogEvent({ event: '$identify', properties: {}, timestamp, $set: { prompt: 'private task', ae_environment: 'production' } })
    expect(safe?.timestamp).toBe(timestamp)
    expect(safe?.$set).toEqual({ ae_environment: 'production' })
  })
})
