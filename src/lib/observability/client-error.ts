import { z } from 'zod'

import { sanitizeTelemetryValue, safeTelemetryPath } from '@/lib/observability/private-route-safety'

const clientErrorMetadata = z.strictObject({
  component: z.string().trim().min(1).max(160).optional(),
  route: z.string().trim().min(1).max(160).optional(),
  action: z.string().trim().min(1).max(160).optional(),
  browser: z.string().trim().min(1).max(160).optional(),
  os: z.string().trim().min(1).max(160).optional(),
  release: z.string().trim().min(1).max(160).optional(),
  build: z.string().trim().min(1).max(160).optional(),
  feature: z.string().trim().min(1).max(160).optional(),
})

export const clientErrorPayloadSchema = z.strictObject({
  message: z.string().trim().min(1).max(1_000),
  name: z.string().trim().min(1).max(160).optional(),
  stack: z.string().trim().max(8_000).optional(),
  url: z.string().trim().max(2_048).optional(),
  source: z.string().trim().max(160).optional(),
  metadata: clientErrorMetadata.optional(),
})

export type ClientErrorPayload = z.infer<typeof clientErrorPayloadSchema>

export type NormalizedClientError = Readonly<{
  message: string
  name?: string
  stack?: string
  url?: string
  source?: string
  metadata?: Readonly<Record<string, string | number | boolean | null>>
}>

export function normalizeClientError(input: ClientErrorPayload): NormalizedClientError {
  const message = String(sanitizeTelemetryValue(input.message, 'message'))
  const normalizedStack = input.stack === undefined ? undefined : String(sanitizeTelemetryValue(input.stack, 'stack'))
  const normalizedUrl = input.url === undefined ? undefined : normalizeClientErrorUrl(input.url)
  const normalizedSource = input.source === undefined ? undefined : String(sanitizeTelemetryValue(input.source, 'source'))
  const normalizedMetadata = input.metadata === undefined
    ? undefined
    : Object.fromEntries(
        Object.entries(input.metadata).flatMap(([key, value]) => (
          typeof value === 'string' ? [[key, normalizeClientErrorText(value)] as const] : []
        )),
      )
  return {
    message,
    ...(input.name === undefined ? {} : { name: String(sanitizeTelemetryValue(input.name, 'name')) }),
    ...(normalizedStack === undefined ? {} : { stack: normalizedStack }),
    ...(normalizedUrl === undefined ? {} : { url: normalizedUrl }),
    ...(normalizedSource === undefined ? {} : { source: normalizedSource }),
    ...(normalizedMetadata === undefined ? {} : { metadata: normalizedMetadata }),
  }
}

function normalizeClientErrorText(value: string): string {
  const sanitized = String(sanitizeTelemetryValue(value))
  if (!sanitized.startsWith('/') && !/^https?:\/\//iu.test(sanitized)) return sanitized
  try {
    return safeTelemetryPath({ pathname: new URL(sanitized, 'https://ae.invalid').pathname })
  } catch {
    return sanitized.split(/[?#]/u)[0] ?? '/[Filtered]'
  }
}
function normalizeClientErrorUrl(value: string): string {
  try {
    return safeTelemetryPath({ pathname: new URL(value, 'https://ae.invalid').pathname })
  } catch {
    return '/[Filtered]'
  }
}
