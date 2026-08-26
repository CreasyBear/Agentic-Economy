import { httpActionGeneric } from 'convex/server'
import type { Infer } from 'convex/values'

import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'
import { externalSpendMutationResultValue } from './moneyExternalSpend'
import { prepareX402PaymentAuthorizationReturns } from './moneyX402PaymentAuthorization'
import {
  readX402PaymentAuthorizationByDigestReturns,
  readX402PaymentAuthorizationReturns,
} from './moneyX402PaymentRead'

const MAX_BODY_BYTES = 128 * 1024
const JOURNAL_TOKEN = /^[A-Za-z0-9_-]{43,128}$/u
const OPAQUE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u
const DIGEST = /^sha256:[0-9a-f]{64}$/u
const SECRET_REF = /^sec_[0-9a-f]{32}$/u
const SECRET_GENERATION = /^sgn_[0-9a-f]{32}$/u

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

async function boundedJson(request: Request): Promise<Record<string, unknown> | undefined> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return undefined
  const length = Number(request.headers.get('content-length'))
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return undefined
  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return undefined
  try {
    const value: unknown = JSON.parse(body)
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

function bearer(request: Request): string | undefined {
  const authorization = request.headers.get('authorization')
  if (authorization === null || !authorization.startsWith('Bearer ')) return undefined
  const token = authorization.slice('Bearer '.length)
  return JOURNAL_TOKEN.test(token) ? token : undefined
}

async function tokenDigest(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function canonicalRef(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_REF.test(value)
}

function canonicalDigest(value: unknown): value is string {
  return typeof value === 'string' && DIGEST.test(value)
}

export const beginProviderConsequenceJournal = httpActionGeneric(async (ctx, request) => {
  const token = bearer(request)
  const body = await boundedJson(request)
  if (token === undefined || body === undefined || !exactKeys(body, [
    'ticketRef', 'effectRef', 'requestDigest', 'invocationDigest', 'ticketClaimsDigest', 'expiresAt',
  ])) return json({ kind: 'unavailable' }, token === undefined ? 401 : 400)
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
  } catch {
    return json({ kind: 'unavailable' }, 503)
  }
})

export const attestProviderConsequenceTicket = httpActionGeneric(async (ctx, request) => {
  const token = bearer(request)
  const body = await boundedJson(request)
  if (token === undefined || body === undefined || !exactKeys(body, [
    'ticketRef', 'ticketClaimsDigest', 'expiresAt',
    'signingSecretRef', 'signingSecretGeneration', 'signingSecretPointerRevision',
  ])) return json({ kind: 'unavailable' }, token === undefined ? 401 : 400)
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
  } catch {
    return json({ kind: 'unavailable' }, 503)
  }
})

export const completeProviderConsequenceJournal = httpActionGeneric(async (ctx, request) => {
  const token = bearer(request)
  const body = await boundedJson(request)
  if (token === undefined || body === undefined || !exactKeys(body, ['ticketRef', 'claimRef', 'observation'])) {
    return json({ kind: 'unavailable' }, token === undefined ? 401 : 400)
  }
  if (!canonicalRef(body.ticketRef) || !canonicalRef(body.claimRef)) {
    return json({ kind: 'unavailable' }, 400)
  }
  let observationJson: string
  try {
    observationJson = JSON.stringify(body.observation)
  } catch {
    return json({ kind: 'unavailable' }, 400)
  }
  try {
    const result = await ctx.runMutation(internal.capabilityProviderConsequenceJournal.completeProviderConsequence, {
      ticketRef: body.ticketRef,
      journalTokenDigest: await tokenDigest(token),
      claimRef: body.claimRef,
      observationJson,
    })
    return json(result, result.kind === 'completed' ? 200 : 409)
  } catch {
    return json({ kind: 'unavailable' }, 503)
  }
})

export const abortProviderConsequenceJournal = httpActionGeneric(async (ctx, request) => {
  const token = bearer(request)
  const body = await boundedJson(request)
  if (token === undefined || body === undefined || !exactKeys(body, ['ticketRef', 'claimRef'])) {
    return json({ kind: 'unavailable' }, token === undefined ? 401 : 400)
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
  } catch {
    return json({ kind: 'unavailable' }, 503)
  }
})

const X402_OPERATIONS = new Set([
  'reserve_external_spend',
  'prepare_authorization',
  'read_authorization',
  'read_authorization_by_digest',
  'record_signature_digest',
  'mark_possibly_submitted',
  'observe_attempt',
] as const)

type X402Operation = typeof X402_OPERATIONS extends Set<infer Operation> ? Operation : never
type X402OperationResult =
  | Infer<typeof externalSpendMutationResultValue>
  | Infer<typeof prepareX402PaymentAuthorizationReturns>
  | Infer<typeof readX402PaymentAuthorizationReturns>
  | Infer<typeof readX402PaymentAuthorizationByDigestReturns>
  | null

async function runX402Operation(
  ctx: Pick<ActionCtx, 'runMutation' | 'runQuery'>,
  operation: X402Operation,
  args: Record<string, unknown>,
): Promise<X402OperationResult> {
  const checkedArgs = args as never
  switch (operation) {
    case 'reserve_external_spend':
      return await ctx.runMutation(internal.moneyLedger.reserveExternalInvocationSpend, checkedArgs)
    case 'prepare_authorization':
      return await ctx.runMutation(internal.moneyX402PaymentAttempts.prepareX402PaymentAuthorization, checkedArgs)
    case 'read_authorization':
      return await ctx.runQuery(internal.moneyX402PaymentAttempts.readX402PaymentAuthorization, checkedArgs)
    case 'read_authorization_by_digest':
      return await ctx.runQuery(internal.moneyX402PaymentAttempts.readX402PaymentAuthorizationByDigest, checkedArgs)
    case 'record_signature_digest':
      return await ctx.runMutation(internal.moneyX402PaymentAttempts.recordX402PaymentSignatureDigest, checkedArgs)
    case 'mark_possibly_submitted':
      return await ctx.runMutation(internal.moneyX402PaymentAttempts.markX402PaymentPossiblySubmitted, checkedArgs)
    case 'observe_attempt':
      return await ctx.runMutation(internal.moneyX402PaymentAttempts.observeX402PaymentAttempt, checkedArgs)
  }
}

function canonicalX402Args(
  operation: X402Operation,
  supplied: Record<string, unknown>,
  authority: Readonly<{
    invocationRef: string
    operationRef: string
    attemptRef: string
    effectGeneration: number
    credentialRef: string
    principalId: string
    credentialId: string
    grantRef: string
    grantGeneration: number
    environment: 'sandbox' | 'production'
    inputDigest: string
    providerRef: string
  }>,
): Record<string, unknown> {
  if (operation === 'reserve_external_spend') {
    return {
      principalId: authority.principalId,
      credentialId: authority.credentialId,
      grantRef: authority.grantRef,
      grantGeneration: authority.grantGeneration,
      environment: authority.environment,
      invocationRef: authority.invocationRef,
      attemptRef: authority.attemptRef,
      effectGeneration: authority.effectGeneration,
      operationRef: authority.operationRef,
      providerRef: authority.providerRef,
      paymentIdentifier: supplied.paymentIdentifier,
      challengeDigest: supplied.challengeDigest,
      amount: supplied.amount,
      observedAt: Date.now(),
    }
  }
  if (operation === 'prepare_authorization') {
    const {
      dispatchRef: _dispatchRef,
      operationRef: _operationRef,
      inputDigest: _inputDigest,
      attemptRef: _attemptRef,
      effectGeneration: _effectGeneration,
      credentialRef: _credentialRef,
      custodyBudgetRef: _custodyBudgetRef,
      custodyGeneration: _custodyGeneration,
      custodyDailyMaximumUnits: _custodyDailyMaximumUnits,
      ...material
    } = supplied
    void _dispatchRef
    void _operationRef
    void _inputDigest
    void _attemptRef
    void _effectGeneration
    void _credentialRef
    void _custodyBudgetRef
    void _custodyGeneration
    void _custodyDailyMaximumUnits
    return {
      ...material,
      dispatchRef: authority.invocationRef,
      operationRef: authority.operationRef,
      inputDigest: authority.inputDigest,
      attemptRef: authority.attemptRef,
      effectGeneration: authority.effectGeneration,
      credentialRef: authority.credentialRef,
    }
  }
  return supplied
}

export const providerConsequenceX402Rpc = httpActionGeneric(async (ctx, request) => {
  const token = bearer(request)
  const body = await boundedJson(request)
  if (token === undefined || body === undefined || !exactKeys(body, ['ticketRef', 'operation', 'args'])) {
    return json({ kind: 'unavailable' }, token === undefined ? 401 : 400)
  }
  if (!canonicalRef(body.ticketRef)
    || typeof body.operation !== 'string'
    || !X402_OPERATIONS.has(body.operation as X402Operation)
    || !isRecord(body.args)) return json({ kind: 'unavailable' }, 400)
  const operation = body.operation as X402Operation
  const digest = await tokenDigest(token)
  try {
    const authorization = await ctx.runMutation(
      internal.capabilityProviderConsequenceJournal.authorizeProviderConsequenceX402Rpc,
      { ticketRef: body.ticketRef, journalTokenDigest: digest, operation, args: body.args as never },
    )
    if (authorization.kind !== 'authorized') return json({ kind: 'unavailable' }, 409)
    const args = canonicalX402Args(operation, body.args, authorization)
    return json({ kind: 'result', value: await runX402Operation(ctx, operation, args) })
  } catch {
    return json({ kind: 'unavailable' }, 503)
  }
})
