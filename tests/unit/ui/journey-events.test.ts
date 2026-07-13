import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  captureClientProductEventOnClient: vi.fn(),
}))

vi.mock('@/lib/observability/capture-client-events', () => ({
  captureClientProductEventOnClient: mocks.captureClientProductEventOnClient,
}))

import {
  JOURNEY_EVENT_NAMES,
  WAVE_1_JOURNEY_EVENT_NAMES,
  WAVE_2_DORMANT_JOURNEY_EVENT_NAMES,
  emitWave1JourneyEvent,
  markJourneyViewedAfterReopenWindow,
} from '@/lib/ui/journey-events'
import * as journeyEvents from '@/lib/ui/journey-events'
import { FunnelEventTypeValues } from '@/modules/observability/internal/literals'
import type {
  DormantWave2JourneyEvent,
  PseudonymousJourneyId,
  ShortlistExportFormat,
  Wave1JourneyEvent,
} from '@/lib/ui/journey-events'

const ACTIVE_EVENT_NAMES = [
  'listing_viewed',
  'listing_trust_fact_opened',
  'direct_call_selected',
  'shortlist_started',
  'shortlist_ready',
  'shortlist_reopened',
  'export_preview_opened',
  'shortlist_exported',
  'business_opened',
  'urgent_call_route_shown',
  'journey_abandoned',
] as const

const DORMANT_EVENT_NAMES = [
  'record_reopened',
  'record_exported',
  'record_shared',
  'record_cited',
  'dispute_opened',
  'replay_materially_resolved',
  'admitted_r1_send',
] as const

describe('Wave 1 journey telemetry contract', () => {
  afterEach(() => {
    mocks.captureClientProductEventOnClient.mockReset()
    vi.unstubAllGlobals()
  })

  it('keeps the exact active and dormant names registered as canonical funnel events', () => {
    expect(WAVE_1_JOURNEY_EVENT_NAMES).toEqual(ACTIVE_EVENT_NAMES)
    expect(WAVE_2_DORMANT_JOURNEY_EVENT_NAMES).toEqual(DORMANT_EVENT_NAMES)
    expect(JOURNEY_EVENT_NAMES).toEqual([...ACTIVE_EVENT_NAMES, ...DORMANT_EVENT_NAMES])
    expect(FunnelEventTypeValues).toEqual(expect.arrayContaining([...JOURNEY_EVENT_NAMES]))
  })

  it('dispatches the versioned shortlist export format as an exact product-event tuple', () => {
    const format = 'pdf' satisfies ShortlistExportFormat
    const pseudonymousJourneyId = 'j2_opaque-fixture' as PseudonymousJourneyId
    stubBrowserStorage(new FakeStorage(), new FakeStorage())

    emitWave1JourneyEvent({
      event: 'shortlist_exported',
      eventVersion: 1,
      journey: 'J2',
      pseudonymousJourneyId,
      cohort: 'wave-1',
      format,
    })

    expectTypeOf<ShortlistExportFormat>().toEqualTypeOf<'copy' | 'print' | 'pdf'>()
    expect(mocks.captureClientProductEventOnClient).toHaveBeenCalledOnce()
    expect(mocks.captureClientProductEventOnClient).toHaveBeenCalledWith('shortlist_exported', {
      eventVersion: 1,
      journey: 'J2',
      pseudonymousJourneyId,
      cohort: 'wave-1',
      format: 'pdf',
    })
  })

  it('emits the same versioned event, journey id, and format only once in each browser session', () => {
    const pseudonymousJourneyId = 'j2_session-deduplication-fixture' as PseudonymousJourneyId
    const event = {
      event: 'shortlist_exported',
      eventVersion: 1,
      journey: 'J2',
      pseudonymousJourneyId,
      format: 'print',
    } satisfies Wave1JourneyEvent
    const localStorage = new FakeStorage()

    stubBrowserStorage(localStorage, new FakeStorage())
    emitWave1JourneyEvent(event)
    emitWave1JourneyEvent(event)

    stubBrowserStorage(localStorage, new FakeStorage())
    emitWave1JourneyEvent(event)
    emitWave1JourneyEvent(event)

    expect(mocks.captureClientProductEventOnClient).toHaveBeenCalledTimes(2)
    expect(mocks.captureClientProductEventOnClient).toHaveBeenNthCalledWith(1, 'shortlist_exported', {
      eventVersion: 1,
      journey: 'J2',
      pseudonymousJourneyId,
      format: 'print',
    })
    expect(mocks.captureClientProductEventOnClient).toHaveBeenNthCalledWith(2, 'shortlist_exported', {
      eventVersion: 1,
      journey: 'J2',
      pseudonymousJourneyId,
      format: 'print',
    })
  })

  it('does not expose a dormant Wave 2 emitter', () => {
    expect(journeyEvents).not.toHaveProperty('emitDormantWave2JourneyEvent')
  })

  it('reports a reopen only in a later browser session at or beyond thirty minutes', () => {
    const localStorage = new FakeStorage()
    const firstSession = new FakeStorage()
    const firstViewedAt = 10_000

    stubBrowserStorage(localStorage, firstSession)
    expect(markJourneyViewedAfterReopenWindow('J2', 'shortlist-42', firstViewedAt)).toBe(false)
    expect(markJourneyViewedAfterReopenWindow('J2', 'shortlist-42', firstViewedAt + 30 * 60 * 1000)).toBe(false)

    stubBrowserStorage(localStorage, new FakeStorage())
    expect(markJourneyViewedAfterReopenWindow('J2', 'shortlist-42', firstViewedAt + 30 * 60 * 1000 - 1)).toBe(false)

    const reopenedSession = new FakeStorage()
    stubBrowserStorage(localStorage, reopenedSession)
    expect(markJourneyViewedAfterReopenWindow('J2', 'shortlist-42', firstViewedAt + 30 * 60 * 1000)).toBe(true)
    expect(markJourneyViewedAfterReopenWindow('J2', 'shortlist-42', firstViewedAt + 31 * 60 * 1000)).toBe(false)
  })
})

function compileTimeJourneyEventContract(): void {
  const j1FixtureId = 'j1_typed-fixture' as PseudonymousJourneyId
  const j2FixtureId = 'j2_typed-fixture' as PseudonymousJourneyId
  const validExport = {
    event: 'shortlist_exported',
    eventVersion: 1,
    journey: 'J2',
    pseudonymousJourneyId: j2FixtureId,
    format: 'print',
  } satisfies Wave1JourneyEvent
  expectTypeOf(validExport.format).toEqualTypeOf<'print'>()

  const plainStringIdEvent: Wave1JourneyEvent = {
    event: 'shortlist_started',
    eventVersion: 1,
    journey: 'J2',
    // @ts-expect-error plain strings are not admitted as pseudonymous journey IDs
    pseudonymousJourneyId: 'j2_plain-string',
  }
  void plainStringIdEvent

  const noncanonicalCohortEvent: Wave1JourneyEvent = {
    event: 'shortlist_started',
    eventVersion: 1,
    journey: 'J2',
    pseudonymousJourneyId: j2FixtureId,
    // @ts-expect-error arbitrary cohort labels are closed out of journey telemetry
    cohort: 'wave-1-fixture',
  }
  void noncanonicalCohortEvent

  // @ts-expect-error eventVersion is mandatory on every journey event
  const missingVersion: Wave1JourneyEvent = {
    event: 'listing_viewed',
    journey: 'J1',
    pseudonymousJourneyId: j1FixtureId,
  }
  void missingVersion

  // @ts-expect-error shortlist_exported requires one of the typed export formats
  const missingFormat: Wave1JourneyEvent = {
    event: 'shortlist_exported',
    eventVersion: 1,
    journey: 'J2',
    pseudonymousJourneyId: j2FixtureId,
  }
  void missingFormat

  const invalidFormat: Wave1JourneyEvent = {
    event: 'shortlist_exported',
    eventVersion: 1,
    journey: 'J2',
    pseudonymousJourneyId: j2FixtureId,
    // @ts-expect-error arbitrary export format strings are not admitted
    format: 'csv',
  }
  void invalidFormat

  const freeTextEvent: Wave1JourneyEvent = {
    event: 'shortlist_started',
    eventVersion: 1,
    journey: 'J2',
    pseudonymousJourneyId: j2FixtureId,
    // @ts-expect-error free-text fields are closed out of journey telemetry
    freeText: 'call after five',
  }
  void freeTextEvent

  const piiEvent: Wave1JourneyEvent = {
    event: 'listing_viewed',
    eventVersion: 1,
    journey: 'J1',
    pseudonymousJourneyId: j1FixtureId,
    // @ts-expect-error direct PII fields are closed out of journey telemetry
    email: 'person@example.test',
  }
  void piiEvent

  const bearerEvent: Wave1JourneyEvent = {
    event: 'direct_call_selected',
    eventVersion: 1,
    journey: 'J1',
    pseudonymousJourneyId: j1FixtureId,
    // @ts-expect-error bearer credentials are closed out of journey telemetry
    bearerToken: 'Bearer secret',
  }
  void bearerEvent

  const dormantEvent: DormantWave2JourneyEvent = {
    event: 'record_reopened',
    eventVersion: 1,
    journey: 'J2',
    pseudonymousJourneyId: j2FixtureId,
  }
  // @ts-expect-error dormant Wave 2 events cannot be passed to the Wave 1 emitter
  emitWave1JourneyEvent(dormantEvent)
}
void compileTimeJourneyEventContract

function stubBrowserStorage(localStorage: Storage, sessionStorage: Storage): void {
  vi.stubGlobal('window', { localStorage, sessionStorage })
}

class FakeStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}
