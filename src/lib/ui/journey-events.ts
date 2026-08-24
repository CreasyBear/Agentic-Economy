import {
  readStoredCompatibilityFunnelEventType,
  type StoredCompatibilityFunnelEventType,
} from '@/modules/observability/stored-compatibility'

/**
 * Compatibility reader for already-stored journey telemetry. Retired journey
 * events intentionally have no emitter or current write surface.
 */
export function readStoredJourneyEventName(
  value: unknown,
): StoredCompatibilityFunnelEventType | undefined {
  return readStoredCompatibilityFunnelEventType(value)
}
