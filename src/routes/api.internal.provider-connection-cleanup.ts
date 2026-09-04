import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { readTrimmedEnv, type StringEnvironment } from '@/lib/server/read-trimmed-env'
import type {
  ProviderOAuthCleanupResult,
  SecretPointerInput,
} from '@/modules/capability-supply/server'
import { isRecord } from '@/modules/common/is-record'

const MAX_BODY_BYTES = 16 * 1024
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u
const CONNECTION_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u
const SECRET_REF = /^sec_[0-9a-f]{32}$/u
const GENERATION_REF = /^sgn_[0-9a-f]{32}$/u
const DIGEST = /^sha256:[0-9a-f]{64}$/u

type CleanupRequest = Readonly<{
  connectionRef: string
  adapterId: 'mcp-jsonrpc:v1'
  requestDigest: string
  secret: SecretPointerInput
}>

type CleanupRuntime = Readonly<{
  readSecret?: (pointer: SecretPointerInput) => Promise<Uint8Array>
  revoke?: (material: Uint8Array) => Promise<ProviderOAuthCleanupResult>
}>

export const Route = createFileRoute('/api/internal/provider-connection-cleanup')({
  server: {
    handlers: {
      POST: ({ request }) => handleProviderConnectionCleanupRequest(request),
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
      TRACE: () => methodNotAllowed(['POST']),
      CONNECT: () => methodNotAllowed(['POST']),
    },
  },
})

function noStore(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key))
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

async function channelAuthenticated(request: Request, environment: StringEnvironment): Promise<boolean> {
  const authorization = request.headers.get('authorization')
  const supplied = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined
  const configured = readTrimmedEnv(environment, 'AE_CONVEX_SERVER_FUNCTION_TOKEN')
  if (supplied === undefined || configured === undefined
    || !TOKEN_PATTERN.test(supplied) || !TOKEN_PATTERN.test(configured)) return false
  const [left, right] = await Promise.all([digest(supplied), digest(configured)])
  let mismatch = left.byteLength ^ right.byteLength
  for (let index = 0; index < left.byteLength; index += 1) {
    mismatch |= left[index]! ^ (right[index] ?? 0)
  }
  return mismatch === 0
}

function secretPointer(value: unknown): SecretPointerInput | undefined {
  if (!isRecord(value) || !exactKeys(value, ['secretRef', 'activeGeneration', 'pointerRevision'])
    || typeof value.secretRef !== 'string' || !SECRET_REF.test(value.secretRef)
    || typeof value.activeGeneration !== 'string' || !GENERATION_REF.test(value.activeGeneration)
    || !Number.isSafeInteger(value.pointerRevision) || Number(value.pointerRevision) < 1) return undefined
  return {
    secretRef: value.secretRef,
    activeGeneration: value.activeGeneration,
    pointerRevision: Number(value.pointerRevision),
  }
}

async function readRequest(request: Request): Promise<CleanupRequest | undefined> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return undefined
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return undefined
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return undefined
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isRecord(value) || !exactKeys(value, [
    'connectionRef', 'adapterId', 'requestDigest', 'secret',
  ])) return undefined
  const pointer = secretPointer(value.secret)
  if (typeof value.connectionRef !== 'string' || !CONNECTION_REF.test(value.connectionRef)
    || value.adapterId !== 'mcp-jsonrpc:v1'
    || typeof value.requestDigest !== 'string' || !DIGEST.test(value.requestDigest)
    || pointer === undefined) return undefined
  return {
    connectionRef: value.connectionRef,
    adapterId: value.adapterId,
    requestDigest: value.requestDigest,
    secret: pointer,
  }
}

export async function handleProviderConnectionCleanupRequest(
  request: Request,
  environment: StringEnvironment = process.env,
  runtime: CleanupRuntime = {},
): Promise<Response> {
  if (!await channelAuthenticated(request, environment)) return noStore({ kind: 'unavailable' }, 401)
  const input = await readRequest(request)
  if (input === undefined) return noStore({ kind: 'unavailable' }, 400)
  let material: Uint8Array
  try {
    const readSecret = runtime.readSecret ?? (await import(
      '@/modules/capability-supply/internal/supply-funnel/provider-connection-handoff'
    )).readActiveCustomerSecret
    material = await readSecret(input.secret)
  } catch {
    return noStore({
      outcome: 'outcome_unknown',
      reasonCode: 'oauth_credential_unavailable',
      evidenceRefs: ['provider_cleanup:oauth_credential_unavailable'],
    }, 200)
  }
  try {
    const revoke = runtime.revoke ?? (await import(
      '@/modules/capability-supply/internal/supply-funnel/provider-connection-handoff'
    )).revokeStoredMcpProviderConnection
    const result = await revoke(material)
    return noStore(result, 200)
  } finally {
    material.fill(0)
  }
}
