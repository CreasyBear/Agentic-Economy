import { v, type Validator } from 'convex/values'
import type { JsonValue } from '@/modules/capability-contract/public'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'

const providerConsequenceX402Operation = v.union(
  v.literal('prepare_authorization'),
  v.literal('read_authorization'),
  v.literal('read_authorization_by_digest'),
  v.literal('record_signature_digest'),
  v.literal('mark_possibly_submitted'),
  v.literal('observe_attempt'),
  v.literal('checkpoint_response'),
)

type X402Operation =
  | 'prepare_authorization'
  | 'read_authorization'
  | 'read_authorization_by_digest'
  | 'record_signature_digest'
  | 'mark_possibly_submitted'
  | 'observe_attempt'
  | 'checkpoint_response'

const providerRpcJsonScalarValue: Validator<null | boolean | number | string> = v.union(
  v.null(),
  v.boolean(),
  v.number(),
  v.string(),
)

function providerRpcJsonValueAtDepth(depth: number): Validator<JsonValue, 'required', string> {
  if (depth === 0) return providerRpcJsonScalarValue
  const child = providerRpcJsonValueAtDepth(depth - 1)
  return v.union(
    providerRpcJsonScalarValue,
    v.array(child),
    v.record(v.string(), child),
  )
}

const providerConsequenceX402PayloadValue = v.record(
  v.string(),
  providerRpcJsonValueAtDepth(8),
)

export const authorizeProviderConsequenceX402RpcArgs = {
  ticketRef: v.string(),
  journalTokenDigest: v.string(),
  operation: providerConsequenceX402Operation,
  args: providerConsequenceX402PayloadValue,
} as const

function matchingOptionalIdentity(
  args: Record<string, unknown>,
  row: Doc<'providerConsequenceJournal'>,
): boolean {
  return (args.dispatchRef === undefined || args.dispatchRef === row.callRef)
    && (args.callRef === undefined || args.callRef === row.callRef)
    && (args.toolRef === undefined || args.toolRef === row.toolRef)
    && (args.attemptRef === undefined || args.attemptRef === row.attemptRef)
    && (args.effectGeneration === undefined || args.effectGeneration === row.effectGeneration)
    && (args.providerRef === undefined || args.providerRef === row.providerRef)
    && (args.credentialRef === undefined || args.credentialRef === row.paymentSecretRef)
    && (args.operationKeyDigest === undefined || args.operationKeyDigest === row.operationKeyDigest)
    && (args.paymentIdentifier === undefined || args.paymentIdentifier === row.operationKeyDigest)
}

async function matchingStoredAttempt(
  ctx: MutationCtx,
  args: Record<string, unknown>,
  row: Doc<'providerConsequenceJournal'>,
): Promise<boolean> {
  const custodyRef = args.custodyRef
  const authorizationDigest = args.authorizationDigest
  if (typeof custodyRef !== 'string' || typeof authorizationDigest !== 'string') return false
  const attempt = await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_custodyRef', (query) => query.eq('custodyRef', custodyRef)).unique()
  return attempt !== null
    && attempt.authorizationDigest === authorizationDigest
    && attempt.dispatchRef === row.callRef
    && attempt.attemptRef === row.attemptRef
    && attempt.effectGeneration === row.effectGeneration
    && attempt.toolRef === row.toolRef
    && attempt.credentialRef === row.paymentSecretRef
}

export async function authorizeProviderConsequenceX402RpcHandler(
  ctx: MutationCtx,
  input: {
    ticketRef: string
    journalTokenDigest: string
    operation: X402Operation
    args: unknown
  },
) {
  if (typeof input.args !== 'object' || input.args === null || Array.isArray(input.args)) {
    return { kind: 'unavailable' as const }
  }
  const args = input.args as Record<string, unknown>
  const row = await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_ticketRef', (query) => query.eq('ticketRef', input.ticketRef)).unique()
  if (row === null
    || row.state !== 'started'
    || row.adapterId !== 'x402-fetch:v2'
    || row.paymentSecretRef === undefined
    || row.journalTokenDigest !== input.journalTokenDigest
    || !matchingOptionalIdentity(args, row)) return { kind: 'unavailable' as const }
  const postRelease = input.operation === 'observe_attempt' || input.operation === 'checkpoint_response'
  if (!postRelease && Date.now() >= row.expiresAt) return { kind: 'unavailable' as const }
  const identityBoundOperations: readonly X402Operation[] = [
    'prepare_authorization',
  ]
  if (!identityBoundOperations.includes(input.operation)
    && !await matchingStoredAttempt(ctx, args, row)) return { kind: 'unavailable' as const }
  const call = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', row.callRef)).unique()
  if (call === null
    || call.toolRef !== row.toolRef
    || call.grantRef !== row.grantRef
    || call.grantGeneration !== row.grantGeneration
    || call.principalId !== row.actorPrincipalRef) return { kind: 'unavailable' as const }
  return {
    kind: 'authorized' as const,
    callRef: row.callRef,
    toolRef: row.toolRef,
    attemptRef: row.attemptRef,
    effectGeneration: row.effectGeneration,
    credentialRef: row.paymentSecretRef,
    principalId: call.principalId,
    credentialId: call.credentialId,
    grantRef: call.grantRef,
    grantGeneration: call.grantGeneration,
    environment: call.environment,
    inputDigest: call.inputDigest,
    providerRef: row.providerRef,
  }
}

export const authorizeProviderConsequenceX402RpcResult = v.union(
    v.object({
      kind: v.literal('authorized'),
      callRef: v.string(),
      toolRef: v.string(),
      attemptRef: v.string(),
      effectGeneration: v.number(),
      credentialRef: v.string(),
      principalId: v.string(),
      credentialId: v.string(),
      grantRef: v.string(),
      grantGeneration: v.number(),
      environment: v.union(v.literal('sandbox'), v.literal('production')),
      inputDigest: v.string(),
      providerRef: v.string(),
    }),
    v.object({ kind: v.literal('unavailable') }),
  )
