import { isTelemetryAllowedForCurrentRoute, sanitizeTelemetryValue } from './private-route-safety'

const contentKeys = /^(?:query|prompt|input|output|body|content|messages?|requestBody|responseBody|request_body|response_body|\$elements|\$elements_chain)$/i

function withoutContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutContent)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).flatMap(([key, field]) =>
    contentKeys.test(key) ? [] : [[key, withoutContent(field)]]))
}

/** Runs after SDK default properties are attached, so URLs cannot bypass sanitization. */
export function protectPostHogEvent<T extends { event: string; properties: Record<string, unknown>; $set?: Record<string, unknown>; $set_once?: Record<string, unknown> }>(event: T | null): T | null {
  if (event === null || !isTelemetryAllowedForCurrentRoute()) return null
  if (event.event === '$autocapture' || event.event === '$copy_autocapture') return null
  const clean = (properties: Record<string, unknown>) => withoutContent(sanitizeTelemetryValue(properties)) as Record<string, unknown>
  return {
    ...event,
    properties: clean(event.properties),
    ...(event.$set === undefined ? {} : { $set: clean(event.$set) }),
    ...(event.$set_once === undefined ? {} : { $set_once: clean(event.$set_once) }),
  }
}
