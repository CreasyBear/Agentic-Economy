import { v, type Infer } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { isRecord } from '../../../../src/modules/common/is-record'
import { requireAccountInteractiveHumanPrincipal } from './identity'
import { requireCurrentInteractiveSession } from '../interactiveAuthority/sessionProof'
import { workspaceActionDigest } from '../workspaceSecurity/stepUp'

const fields = {
  expectedAccountRef: v.string(), expectedAccountRevision: v.number(), expectedOwnershipRevision: v.number(),
  correlationRef: v.string(), idempotencyRef: v.string(),
}
export const readWorkspaceTerminalReceiptArgs = v.object({ command: v.union(
  v.object({ action: v.literal('close'), ...fields, confirmationName: v.string() }),
  v.object({ action: v.literal('transfer'), ...fields, successorPrincipalRef: v.string() }),
) })
export const readWorkspaceTerminalReceiptResult = v.union(v.null(),
  v.object({ kind: v.literal('replayed'), action: v.literal('close'), accountRef: v.string(), accountRevision: v.number() }),
  v.object({ kind: v.literal('replayed'), action: v.literal('transfer'), accountRef: v.string(), accountRevision: v.number(), currentOwnershipRef: v.string() }),
)

/** A receipt read grants no current workspace access and performs no writes. */
export async function readWorkspaceTerminalReceiptHandler(ctx: QueryCtx, input: Infer<typeof readWorkspaceTerminalReceiptArgs>) {
  const args = input.command
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
  if (![args.expectedAccountRevision, args.expectedOwnershipRevision].every(value => Number.isSafeInteger(value) && value >= 0)) throw new InteractiveAuthorityError('authority_fact_invalid')
  const principal = await requireAccountInteractiveHumanPrincipal(ctx.db, identity)
  const binding = await ctx.db.query('externalIdentityBindings').withIndex('by_providerNamespace_and_providerIdentifier', q =>
    q.eq('providerNamespace', 'clerk/user').eq('providerIdentifier', identity.tokenIdentifier)).unique()
  if (binding === null || binding.providerState.kind !== 'known' || binding.providerState.value !== 'active') throw new InteractiveAuthorityError('binding_untrusted')
  await requireCurrentInteractiveSession(ctx.db, identity, binding)
  const credentials = await ctx.db.query('credentials').withIndex('by_bindingRef_and_generation_and_lifecycle', q =>
    q.eq('bindingRef', binding.bindingRef).eq('generation', binding.credentialGeneration).eq('lifecycle', 'active')).take(2)
  const credential = credentials[0]
  if (credentials.length !== 1 || credential === undefined || credential.type !== 'provider_token' || credential.principalRef !== principal.principalRef) throw new InteractiveAuthorityError('credential_not_current')
  // Convex verifies the JWT's current validity; existing session cutoffs and the
  // current recorded generation reject revoked identities without Account access.
  const event = args.action === 'close' ? 'closed' : 'ownership_transferred'
  const audit = await ctx.db.query('auditEvents').withIndex('by_eventId', q =>
    q.eq('eventId', `audit:workspace:account.workspace.${event}:${args.idempotencyRef}`)).unique()
  if (audit === null) return null
  if (audit.actorRef !== principal.principalRef || audit.activeAccountRef !== args.expectedAccountRef) {
    throw new InteractiveAuthorityError('idempotency_conflict')
  }
  const { action, ...command } = args
  const payload: unknown = JSON.parse(audit.redactedPayloadJson)
  // Unlike historical mutation replay, this read requires a recorded digest.
  if (!isRecord(payload) || payload.actionDigest !== workspaceActionDigest(action,
    { ...command, operationKey: command.idempotencyRef }, principal.principalRef, command.expectedAccountRef)) {
    throw new InteractiveAuthorityError('idempotency_conflict')
  }
  const account = await ctx.db.query('accounts').withIndex('by_accountRef', q => q.eq('accountRef', command.expectedAccountRef)).unique()
  if (account === null) throw new InteractiveAuthorityError('account_missing')
  const base = { kind: 'replayed' as const, accountRef: account.accountRef, accountRevision: command.expectedAccountRevision + 1 }
  if (action === 'transfer' && typeof audit.outcome !== 'string') throw new InteractiveAuthorityError('idempotency_conflict')
  return action === 'close' ? { ...base, action } : { ...base, action, currentOwnershipRef: audit.outcome as string }
}
