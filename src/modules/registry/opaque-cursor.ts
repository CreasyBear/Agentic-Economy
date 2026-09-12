import { z } from 'zod'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { base64Codec, tryDecodeBase64Url } from '@/modules/common/base64-codec'

/**
 * A page token is opaque to the caller and owned by the API (Google AIP-158;
 * Stripe's list cursors follow the same contract): the client must treat it
 * as an unstructured string, never construct or mutate one itself. AE
 * additionally binds every cursor to the route family that issued it
 * (`kind`) and to the data generation it was issued against (`scope`), so a
 * cursor from a different route, or one issued against a directory
 * generation that has since rotated, is rejected up front rather than
 * silently reinterpreted (or blindly replayed) by the underlying engine.
 */
export type OpaqueCursorKind = 'registry' | 'market-tools' | 'businesses'

// Comfortably larger than any real inner engine cursor this app issues; kept
// equal to the pre-existing per-route cursor ceilings so wrapping a cursor in
// this envelope never needs a new magic number.
const MAX_OPAQUE_CURSOR_LENGTH = 512

const opaqueCursorPayloadSchema = z.strictObject({
  kind: z.enum(['registry', 'market-tools', 'businesses']),
  scope: z.string(),
  cursor: z.string(),
})

type OpaqueCursorScope = Readonly<{ kind: OpaqueCursorKind; scope: string }>

export function encodeOpaqueCursor(input: OpaqueCursorScope & Readonly<{ cursor: string }>): string {
  return base64Codec.toBase64Url(new TextEncoder().encode(JSON.stringify(input)))
}

/**
 * Returns the inner engine cursor, or `undefined` when the token is
 * malformed, oversized, or bound to a different route/generation. Callers
 * must reject with 400 `invalid_cursor` on `undefined` rather than ever
 * forwarding the raw token to the underlying engine.
 */
export function decodeOpaqueCursor(token: string, expected: OpaqueCursorScope): string | undefined {
  if (token.length === 0 || token.length > MAX_OPAQUE_CURSOR_LENGTH) return undefined
  const bytes = tryDecodeBase64Url(token)
  if (bytes === undefined) return undefined
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(bytes))
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'decodeOpaqueCursor', reason: 'invalid_response' })
  }
  const parsed = opaqueCursorPayloadSchema.safeParse(json)
  if (!parsed.success) return undefined
  if (parsed.data.kind !== expected.kind || parsed.data.scope !== expected.scope) return undefined
  return parsed.data.cursor
}

/** Thrown by callers that cannot build an HTTP response inline (e.g. a shared action `run`). */
export class InvalidOpaqueCursorError extends Error {
  constructor() {
    super('The supplied pagination cursor is invalid or expired.')
    this.name = 'InvalidOpaqueCursorError'
  }
}

/** Same contract as {@link decodeOpaqueCursor}, throwing {@link InvalidOpaqueCursorError} instead of returning `undefined`. */
export function requireOpaqueCursor(token: string, expected: OpaqueCursorScope): string {
  const cursor = decodeOpaqueCursor(token, expected)
  if (cursor === undefined) throw new InvalidOpaqueCursorError()
  return cursor
}
