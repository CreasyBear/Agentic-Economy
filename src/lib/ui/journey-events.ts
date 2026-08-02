import {
  JOURNEY_EVENT_NAMES,
  WAVE_1_JOURNEY_EVENT_NAMES,
  WAVE_2_DORMANT_JOURNEY_EVENT_NAMES,
} from '@/modules/observability/public'
import { captureClientProductEventOnClient } from '@/lib/observability/capture-client-events'
import { createPrefixedRandomId } from '@/modules/common/random-id'

export {
  JOURNEY_EVENT_NAMES,
  WAVE_1_JOURNEY_EVENT_NAMES,
  WAVE_2_DORMANT_JOURNEY_EVENT_NAMES,
}

export type Wave1JourneyEventName = (typeof WAVE_1_JOURNEY_EVENT_NAMES)[number]
export type DormantWave2JourneyEventName = (typeof WAVE_2_DORMANT_JOURNEY_EVENT_NAMES)[number]
export type JourneyEventName = (typeof JOURNEY_EVENT_NAMES)[number]
export type JourneyTag = 'J1' | 'J2'
export type ShortlistExportFormat = 'copy' | 'print' | 'pdf'
declare const pseudonymousJourneyIdBrand: unique symbol
export type PseudonymousJourneyId = string & { readonly [pseudonymousJourneyIdBrand]: true }
export type JourneyCohort = 'wave-1'

const JOURNEY_EVENT_VERSION = 1 as const
const REOPEN_AFTER_MS = 30 * 60 * 1000
const ID_STORAGE_PREFIX = 'ae.journey.pseudonym.v1'
const CREATED_STORAGE_PREFIX = 'ae.journey.created.v1'
const SESSION_STORAGE_PREFIX = 'ae.journey.session.v1'

type EventBase<Name extends JourneyEventName, Journey extends JourneyTag> = {
  event: Name
  eventVersion: typeof JOURNEY_EVENT_VERSION
  journey: Journey
  pseudonymousJourneyId: PseudonymousJourneyId
  cohort?: JourneyCohort
}

type J1EventName = 'listing_viewed' | 'listing_trust_fact_opened' | 'direct_call_selected'
type J2EventName = Exclude<Wave1JourneyEventName, J1EventName>

type SimpleJ1Event = EventBase<J1EventName, 'J1'>
type SimpleJ2Event = EventBase<Exclude<J2EventName, 'shortlist_exported'>, 'J2'>
type ShortlistExportedEvent = EventBase<'shortlist_exported', 'J2'> & { format: ShortlistExportFormat }

export type Wave1JourneyEvent = SimpleJ1Event | SimpleJ2Event | ShortlistExportedEvent

/** Wave 2 events are versioned for joinability, but this module deliberately exposes no emitter for them. */
export type DormantWave2JourneyEvent = EventBase<DormantWave2JourneyEventName, 'J2'>
export type JourneyEvent = Wave1JourneyEvent | DormantWave2JourneyEvent

export function emitWave1JourneyEvent(event: Wave1JourneyEvent): void {
  if (typeof window === 'undefined') {
    return
  }

  const { event: eventName, eventVersion, journey, pseudonymousJourneyId, cohort } = event
  const format = event.event === 'shortlist_exported' ? event.format : undefined
  const deduplicationKey = `${SESSION_STORAGE_PREFIX}:emitted:${eventVersion}:${eventName}:${pseudonymousJourneyId}:${format ?? ''}`
  try {
    if (window.sessionStorage.getItem(deduplicationKey) !== null) {
      return
    }
    window.sessionStorage.setItem(deduplicationKey, 'emitted')
  } catch {
    // Continue without deduplication when browser storage is unavailable.
  }

  captureClientProductEventOnClient(eventName, {
    eventVersion,
    journey,
    pseudonymousJourneyId,
    ...(cohort === undefined ? {} : { cohort }),
    ...(format === undefined ? {} : { format }),
  })
}

/**
 * Gives a browser-local durable artifact an opaque telemetry identity. The source id is
 * used only as a local-storage lookup key and never enters an event payload or sink.
 */
export function getOrCreatePseudonymousJourneyId(journey: JourneyTag, sourceId: string): PseudonymousJourneyId {
  if (typeof window === 'undefined') {
    return `${journey.toLowerCase()}_server` as PseudonymousJourneyId
  }

  try {
    const storageKey = `${ID_STORAGE_PREFIX}:${journey}:${sourceId}`
    const stored = window.localStorage.getItem(storageKey)
    if (stored !== null) {
      return stored as PseudonymousJourneyId
    }

    const pseudonymousId = `${journey.toLowerCase()}_${crypto.randomUUID()}`
    window.localStorage.setItem(storageKey, pseudonymousId)
    return pseudonymousId as PseudonymousJourneyId
  } catch {
    return createPrefixedRandomId(`${journey.toLowerCase()}_${Date.now()}-`) as PseudonymousJourneyId
  }
}

/**
 * Returns true once for a later browser session when the locally observed artifact is
 * at least 30 minutes old. This is a client-side approximation: cleared storage or a
 * different browser cannot be joined until server-side event custody is wired.
 */
export function markJourneyViewedAfterReopenWindow(journey: JourneyTag, sourceId: string, now = Date.now()): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    const artifactKey = `${journey}:${sourceId}`
    const createdKey = `${CREATED_STORAGE_PREFIX}:${artifactKey}`
    const sessionKey = `${SESSION_STORAGE_PREFIX}:${artifactKey}`
    const createdAt = Number(window.localStorage.getItem(createdKey))

    if (!Number.isFinite(createdAt) || createdAt <= 0) {
      window.localStorage.setItem(createdKey, String(now))
      window.sessionStorage.setItem(sessionKey, 'seen')
      return false
    }

    if (window.sessionStorage.getItem(sessionKey) !== null) {
      return false
    }

    window.sessionStorage.setItem(sessionKey, 'seen')
    return now - createdAt >= REOPEN_AFTER_MS
  } catch {
    return false
  }
}

