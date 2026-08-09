import { createFileRoute } from '@tanstack/react-router'

import { discoveryTextResponse } from '@/lib/http/discovery-response'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'

/**
 * Public Web Bot Auth key directory for AE-owned signature agents.
 * Serves keys from AE_WBA_DIRECTORY_PUBLIC_JWK_JSON (single JWK or { keys: [...] }).
 */
export const Route = createFileRoute('/.well-known/http-message-signatures-directory')({
  server: {
    handlers: {
      GET: () => handleHttpMessageSignaturesDirectory(),
      POST: () => methodNotAllowed(['GET']),
      PUT: () => methodNotAllowed(['GET']),
      PATCH: () => methodNotAllowed(['GET']),
      DELETE: () => methodNotAllowed(['GET']),
      HEAD: () => methodNotAllowed(['GET']),
      OPTIONS: () => methodNotAllowed(['GET']),
      TRACE: () => methodNotAllowed(['GET']),
      CONNECT: () => methodNotAllowed(['GET']),
    },
  },
})

export function handleHttpMessageSignaturesDirectory(): Response {
  const keys = readDirectoryPublicKeys(process.env.AE_WBA_DIRECTORY_PUBLIC_JWK_JSON)
  if (keys === undefined) {
    return problem({
      status: 404,
      kind: 'NOT_FOUND',
      code: 'wba_directory_unconfigured',
      detail: 'No public WBA directory keys configured.',
    })
  }

  return discoveryTextResponse(
    JSON.stringify({ keys }),
    'application/http-message-signatures-directory+json',
  )
}

function readDirectoryPublicKeys(raw: string | undefined): readonly JsonWebKey[] | undefined {
  const trimmed = raw?.trim()
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (Array.isArray(parsed)) {
      const keys = parsed.filter(isPublicDirectoryJwk)
      return keys.length > 0 ? keys : undefined
    }
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'keys' in parsed &&
      Array.isArray((parsed as { keys: unknown }).keys)
    ) {
      const keys = (parsed as { keys: unknown[] }).keys.filter(isPublicDirectoryJwk)
      return keys.length > 0 ? keys : undefined
    }
    if (isPublicDirectoryJwk(parsed)) {
      return [parsed]
    }
    return undefined
  } catch {
    return undefined
  }
}

function isPublicDirectoryJwk(value: unknown): value is JsonWebKey {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  if (typeof record.kty !== 'string' || typeof record.x !== 'string') {
    return false
  }
  // Never serve private key material from the public directory.
  if (typeof record.d === 'string') {
    return false
  }
  return true
}
