import type { GenericActionCtx, GenericDataModel } from 'convex/server'
import type { Infer } from 'convex/values'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { internal } from '../../../_generated/api'
import { prepareX402PaymentAuthorizationReturns } from '../../money/x402PaymentAttempt/reserve'
import {
  readX402PaymentAuthorizationByDigestReturns,
  readX402PaymentAuthorizationReturns,
} from '../../money/x402PaymentAttempt/read'
import { bearer, boundedJson, canonicalRef, exactKeys, isRecord, json, tokenDigest } from './http'

const X402_OPERATIONS = new Set([
  'prepare_authorization',
  'read_authorization',
  'read_authorization_by_digest',
  'record_signature_digest',
  'mark_possibly_submitted',
  'observe_attempt',
  'checkpoint_response',
] as const)

type X402Operation = typeof X402_OPERATIONS extends Set<infer Operation> ? Operation : never
type X402OperationResult =
  | Infer<typeof prepareX402PaymentAuthorizationReturns>
  | Infer<typeof readX402PaymentAuthorizationReturns>
  | Infer<typeof readX402PaymentAuthorizationByDigestReturns>
  | { kind: 'attribution_mismatch' }
  | null

async function runX402Operation(
  ctx: Pick<GenericActionCtx<GenericDataModel>, 'runMutation' | 'runQuery'>,
  operation: X402Operation,
  args: Record<string, unknown>,
): Promise<X402OperationResult> {
  const checkedArgs = args as never
  switch (operation) {
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
    case 'checkpoint_response':
      return await ctx.runMutation(internal.moneyX402PaymentAttempts.checkpointX402Response, checkedArgs)
  }
}

function canonicalX402Args(
  operation: X402Operation,
  supplied: Record<string, unknown>,
  authority: Readonly<{
    callRef: string
    toolRef: string
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
  reservationRef?: string,
): Record<string, unknown> {
  if (operation === 'checkpoint_response') {
    const { custodyRef: _custodyRef, authorizationDigest: _authorizationDigest, ...response } = supplied
    return { ...response, dispatchRef: authority.callRef, toolRef: authority.toolRef,
      inputDigest: authority.inputDigest, attemptRef: authority.attemptRef,
      effectGeneration: authority.effectGeneration }
  }
  if (operation === 'prepare_authorization') {
    const {
      dispatchRef: _dispatchRef,
      operationRef: _operationRef,
      toolRef: _toolRef,
      inputDigest: _inputDigest,
      attemptRef: _attemptRef,
      effectGeneration: _effectGeneration,
      credentialRef: _credentialRef,
      custodyBudgetRef: _custodyBudgetRef,
      custodyGeneration: _custodyGeneration,
      custodyDailyMaximumUnits: _custodyDailyMaximumUnits,
      reservationRef: _reservationRef,
      ...material
    } = supplied
    void _dispatchRef
    void _operationRef
    void _toolRef
    void _inputDigest
    void _attemptRef
    void _effectGeneration
    void _credentialRef
    void _custodyBudgetRef
    void _custodyGeneration
    void _custodyDailyMaximumUnits
    void _reservationRef
    return {
      ...material,
      dispatchRef: authority.callRef,
      toolRef: authority.toolRef,
      inputDigest: authority.inputDigest,
      attemptRef: authority.attemptRef,
      effectGeneration: authority.effectGeneration,
      credentialRef: authority.credentialRef,
      ...(reservationRef === undefined ? {} : { reservationRef }),
    }
  }
  return supplied
}

export async function providerConsequenceX402RpcHandler(ctx: GenericActionCtx<GenericDataModel>, request: Request): Promise<Response> {
  const token = bearer(request)
  if (token === undefined) return json({ kind: 'unavailable' }, 401)
  // The checkpoint can carry a 512 KiB normalized JSON response inside a JSON string.
  const body = await boundedJson(request, 1024 * 1024 + 16 * 1024)
  if (body === undefined || !exactKeys(body, ['ticketRef', 'operation', 'args'])) {
    return json({ kind: 'unavailable' }, 400)
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
    let reservationRef: string | undefined
    if (operation === 'prepare_authorization') {
      const reservation = await ctx.runQuery(
        internal.moneyManagedCallLifecycle.readReservation,
        { callRef: authorization.callRef },
      )
      if (reservation === null || reservation.state !== 'reserved') {
        return json({ kind: 'result', value: null })
      }
      reservationRef = reservation.treasuryReservationRef ?? reservation.reservationRef
    }
    const args = canonicalX402Args(operation, body.args, authorization, reservationRef)
    return json({ kind: 'result', value: await runX402Operation(ctx, operation, args) })
  } catch (cause) {
    return degradeBackend(cause, json({ kind: 'unavailable' }, 503), { site: 'providerConsequenceX402Rpc', reason: 'source_unavailable' })
  }
}
