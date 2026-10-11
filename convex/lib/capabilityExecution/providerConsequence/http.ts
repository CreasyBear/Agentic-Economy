import type { GenericActionCtx, GenericDataModel } from 'convex/server'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { internal } from '../../../_generated/api'

const MAX_BODY_BYTES = 128 * 1024
const JOURNAL_TOKEN = /^[A-Za-z0-9_-]{43,128}$/u
const OPAQUE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u
const DIGEST = /^sha256:[0-9a-f]{64}$/u
const SECRET_REF = /^sec_[0-9a-f]{32}$/u
const SECRET_GENERATION = /^sgn_[0-9a-f]{32}$/u

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length
    && expected.every((key) => Object.hasOwn(value, key))
}

export async function boundedJson(request: Request, maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown> | undefined> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return undefined
  const length = Number(request.headers.get('content-length'))
  if (Number.isFinite(length) && length > maxBytes) return undefined
  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > maxBytes) return undefined
  try {
    const value: unknown = JSON.parse(body)
    return isRecord(value) ? value : undefined
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'boundedJson', reason: 'invalid_response' })
  }
}

export function bearer(request: Request): string | undefined {
  const authorization = request.headers.get('authorization')
  if (authorization === null || !authorization.startsWith('Bearer ')) return undefined
  const token = authorization.slice('Bearer '.length)
  return JOURNAL_TOKEN.test(token) ? token : undefined
}

export async function tokenDigest(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export function canonicalRef(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_REF.test(value)
}

function canonicalDigest(value: unknown): value is string {
  return typeof value === 'string' && DIGEST.test(value)
}

export async function beginProviderConsequenceJournalHandler(ctx: GenericActionCtx<GenericDataModel>, request: Request): Promise<Response> {
  const token = bearer(request)
  if (token === undefined) return json({ kind: 'unavailable' }, 401)
  const body = await boundedJson(request)
  if (body === undefined || !exactKeys(body, [
    'ticketRef', 'effectRef', 'requestDigest', 'invocationDigest', 'ticketClaimsDigest', 'expiresAt',
  ])) return json({ kind: 'unavailable' }, 400)
  if (!canonicalRef(body.ticketRef)
    || !canonicalRef(body.effectRef)
    || !canonicalDigest(body.requestDigest)
    || !canonicalDigest(body.invocationDigest)
    || !canonicalDigest(body.ticketClaimsDigest)
    || !Number.isSafeInteger(body.expiresAt)) return json({ kind: 'unavailable' }, 400)
  try {
    const result = await ctx.runMutation(internal.capabilityProviderConsequenceJournal.claimProviderConsequence, {
      ticketRef: body.ticketRef,
      journalTokenDigest: await tokenDigest(token),
      effectRef: body.effectRef,
      requestDigest: body.requestDigest,
      invocationDigest: body.invocationDigest,
      ticketClaimsDigest: body.ticketClaimsDigest,
      expiresAt: Number(body.expiresAt),
    })
    return json(result)
  } catch (cause) {
    return degradeBackend(cause, json({ kind: 'unavailable' }, 503), { site: 'beginProviderConsequenceJournal', reason: 'source_unavailable' })
  }
}

export async function attestProviderConsequenceTicketHandler(ctx: GenericActionCtx<GenericDataModel>, request: Request): Promise<Response> {
  const token = bearer(request)
  if (token === undefined) return json({ kind: 'unavailable' }, 401)
  const body = await boundedJson(request)
  if (body === undefined || !exactKeys(body, [
    'ticketRef', 'ticketClaimsDigest', 'expiresAt',
    'signingSecretRef', 'signingSecretGeneration', 'signingSecretPointerRevision',
  ])) return json({ kind: 'unavailable' }, 400)
  if (!canonicalRef(body.ticketRef)
    || !canonicalDigest(body.ticketClaimsDigest)
    || !Number.isSafeInteger(body.expiresAt)
    || typeof body.signingSecretRef !== 'string'
    || !SECRET_REF.test(body.signingSecretRef)
    || typeof body.signingSecretGeneration !== 'string'
    || !SECRET_GENERATION.test(body.signingSecretGeneration)
    || !Number.isSafeInteger(body.signingSecretPointerRevision)
    || Number(body.signingSecretPointerRevision) < 1) return json({ kind: 'unavailable' }, 400)
  try {
    const result = await ctx.runQuery(
      internal.capabilityProviderConsequenceJournal.attestProviderConsequenceTicket,
      {
        ticketRef: body.ticketRef,
        journalTokenDigest: await tokenDigest(token),
        ticketClaimsDigest: body.ticketClaimsDigest,
        expiresAt: Number(body.expiresAt),
        signingSecretRef: body.signingSecretRef,
        signingSecretGeneration: body.signingSecretGeneration,
        signingSecretPointerRevision: Number(body.signingSecretPointerRevision),
      },
    )
    return json(result, result.kind === 'attested' ? 200 : 409)
  } catch (cause) {
    return degradeBackend(cause, json({ kind: 'unavailable' }, 503), { site: 'attestProviderConsequenceTicket', reason: 'source_unavailable' })
  }
}

export async function completeProviderConsequenceJournalHandler(ctx: GenericActionCtx<GenericDataModel>, request: Request): Promise<Response> {
  const token = bearer(request)
  if (token === undefined) return json({ kind: 'unavailable' }, 401)
  const body = await boundedJson(request)
  if (body === undefined || !exactKeys(body, ['ticketRef', 'claimRef', 'observation'])) {
    return json({ kind: 'unavailable' }, 400)
  }
  if (!canonicalRef(body.ticketRef) || !canonicalRef(body.claimRef)) {
    return json({ kind: 'unavailable' }, 400)
  }
  let observationJson: string
  try {
    observationJson = JSON.stringify(body.observation)
  } catch (cause) {
    return degradeBackend(cause, json({ kind: 'unavailable' }, 400), { site: 'completeProviderConsequenceJournal', reason: 'invalid_response' })
  }
  try {
    const result = await ctx.runMutation(internal.capabilityProviderConsequenceJournal.completeProviderConsequence, {
      ticketRef: body.ticketRef,
      journalTokenDigest: await tokenDigest(token),
      claimRef: body.claimRef,
      observationJson,
    })
    return json(result, result.kind === 'completed' ? 200 : 409)
  } catch (cause) {
    return degradeBackend(cause, json({ kind: 'unavailable' }, 503), { site: 'completeProviderConsequenceJournal', reason: 'source_unavailable' })
  }
}

export async function abortProviderConsequenceJournalHandler(ctx: GenericActionCtx<GenericDataModel>, request: Request): Promise<Response> {
  const token = bearer(request)
  if (token === undefined) return json({ kind: 'unavailable' }, 401)
  const body = await boundedJson(request)
  if (body === undefined || !exactKeys(body, ['ticketRef', 'claimRef'])) {
    return json({ kind: 'unavailable' }, 400)
  }
  if (!canonicalRef(body.ticketRef) || !canonicalRef(body.claimRef)) {
    return json({ kind: 'unavailable' }, 400)
  }
  try {
    const result = await ctx.runMutation(internal.capabilityProviderConsequenceJournal.abortProviderConsequence, {
      ticketRef: body.ticketRef,
      journalTokenDigest: await tokenDigest(token),
      claimRef: body.claimRef,
    })
    return json(result, result.kind === 'aborted' ? 200 : 409)
  } catch (cause) {
    return degradeBackend(cause, json({ kind: 'unavailable' }, 503), { site: 'abortProviderConsequenceJournal', reason: 'source_unavailable' })
  }
}
