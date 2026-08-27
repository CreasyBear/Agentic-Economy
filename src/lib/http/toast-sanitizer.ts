/**
 * Turns an unknown failure value into a short, renderable toast string.
 *
 * The funnel (see `./toast-error-funnel`) feeds this everything that fails on
 * the way out of a server-function RPC: plain strings, real AE RFC 9457
 * problem bodies (`src/lib/errors.buildProblem`), errors whose message carries
 * the serialized problem document, framework errors, or arbitrary garbage.
 *
 * Hard rules:
 * - Never dump internals: stack traces, wire envelopes, machine codes, or
 *   `[object Object]` can never reach the output.
 * - Strings pass through, minus markup, control/format characters, and length
 *   beyond {@link TOAST_COPY_MAX_LENGTH}.
 * - Problem-details objects render their `title` and `detail` members only;
 *   when neither exists, a numeric `status` falls back to the canonical title
 *   from `@/lib/errors`.
 */
import { defaultTitle, kindForStatus } from '@/lib/errors'

/** Maximum characters (code points) a sanitized toast copy may occupy. */
export const TOAST_COPY_MAX_LENGTH = 160

/** Copy used when a failure value yields nothing safely renderable. */
export const FALLBACK_TOAST_COPY = 'Something went wrong'

const ELLIPSIS = '…'

const MAX_UNWRAP_DEPTH = 3

/** Strip markup tags, Unicode control/format characters; collapse whitespace. */
function stripUnsafeCharacters(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\p{Cc}|\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Code-point-safe truncation so astral characters never split mid-pair. */
function capToLength(text: string): string {
  const points = Array.from(text)
  if (points.length <= TOAST_COPY_MAX_LENGTH) return text
  return points.slice(0, TOAST_COPY_MAX_LENGTH).join('').trimEnd() + ELLIPSIS
}

function sanitizeText(value: string): string {
  return capToLength(stripUnsafeCharacters(value))
}

/**
 * A problem document that arrived embedded inside an Error message: the RPC
 * layer surfaces raw `Response` bodies as `new Error(bodyText)`, and
 * `problem()` bodies are exactly that JSON for non-serialized failures.
 */
function parseEmbeddedProblem(message: string): unknown {
  const trimmed = message.trim()
  if (!trimmed.startsWith('{')) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

/**
 * Render `title`/`detail` members only — `type`, `status`, `kind`, `code`,
 * `instance`, `reason`, and extension fields are envelope internals.
 */
function sanitizeProblemFields(record: Record<string, unknown>): string {
  const title = typeof record.title === 'string' ? sanitizeText(record.title) : ''
  const detail = typeof record.detail === 'string' ? sanitizeText(record.detail) : ''
  if (title.length > 0 && detail.length > 0) return `${title}. ${detail}`
  if (title.length > 0) return title
  if (detail.length > 0) return detail
  const status = record.status
  if (typeof status === 'number' && Number.isFinite(status) && status >= 400) {
    return defaultTitle(kindForStatus(status))
  }
  return ''
}

function sanitizeUnknown(value: unknown, depth: number): string {
  if (typeof value === 'string') {
    const embedded = parseEmbeddedProblem(value)
    if (embedded !== null && typeof embedded === 'object' && !Array.isArray(embedded)) {
      return sanitizeProblemFields(embedded as Record<string, unknown>)
    }
    return sanitizeText(value)
  }
  if (typeof value !== 'object' || value === null || depth <= 0) return ''
  const record = value as Record<string, unknown>
  if ('title' in record || 'detail' in record || 'status' in record) {
    // A problem body or a Response-ish shape: both project through their
    // title/detail/status surface without dumping any other internals.
    return sanitizeProblemFields(record)
  }
  if ('message' in record && typeof record.message === 'string') {
    return sanitizeUnknown(record.message, depth - 1)
  }
  if ('message' in record && typeof record.message === 'object' && depth > 0) {
    // Wrapped failures (error causes serialized as objects) stay followable
    // while the shared depth budget keeps pathological nesting bounded.
    return sanitizeUnknown(record.message, depth - 1)
  }
  return ''
}

/**
 * Project any failure value onto safe toast copy. Returns
 * {@link FALLBACK_TOAST_COPY} rather than ever surfacing internal shapes.
 */
export function sanitizeToastCopy(input: unknown): string {
  const copy = sanitizeUnknown(input, MAX_UNWRAP_DEPTH)
  return copy.length > 0 ? copy : FALLBACK_TOAST_COPY
}
