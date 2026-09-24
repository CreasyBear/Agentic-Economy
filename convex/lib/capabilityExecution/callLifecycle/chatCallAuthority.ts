import { makeFunctionReference } from 'convex/server'
import type { QueryCtx } from '../../../_generated/server'
import type { TrustedChatAuthority } from '@/modules/chat/agent-turn.contracts'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import { resolveCanonicalAgentContext } from '../../authority/canonicalAgent/authority'
import { chatThreadBelongsToPrincipal } from '../../chat/threadOwnership'
import { resolveCurrentAgentAuthority } from './agentCallAuthority'
import type { CallPrincipal } from './contracts'

export const authorizeChatCallRef = makeFunctionReference<
  'mutation',
  { authority: TrustedChatAuthority; quoteRef: string },
  CallPrincipal | null
>('chatCall:authorize')

/**
 * Internal chat admission: trust no authority supplied by a model or caller.
 * The turn, live credential, active grant and delegation must all still agree.
 * A cancellation fence denies new payable effects without changing any Call.
 */
export async function resolveTrustedChatAuthority(
  ctx: Pick<QueryCtx, 'db'>,
  input: TrustedChatAuthority,
  toolRef: string,
): Promise<CallPrincipal | null> {
  if (input.kind !== 'agent_key' || !isPublicToolRef(toolRef)) return null
  const turn = await ctx.db.query('chatTurns')
    .withIndex('by_turnRef', (query) => query.eq('turnRef', input.turnRef))
    .unique()
  if (turn === null || turn.principalKind !== 'agent_key'
    || turn.credentialLocator !== input.credentialLocator
    || turn.grantRef !== input.grantRef
    || turn.cancelRequestedAt !== undefined
    || turn.state === 'canceled' || turn.state === 'failed'
    || turn.state === 'completed' || turn.state === 'rejected') return null
  if ((input.applicationRef === 'ae-owner-chat') !== (turn.origin === 'owner_chat')) return null
  if (turn.threadId === undefined || turn.promptMessageId === undefined) return null
  const threadId = turn.threadId
  const thread = await ctx.db.query('chatThreads')
    .withIndex('by_threadId', (query) => query.eq('threadId', threadId))
    .unique()
  if (thread === null || !chatThreadBelongsToPrincipal(
    thread, turn.accountRef, 'agent_key', turn.principalRef,
  ) || thread.activePromptMessageId !== turn.promptMessageId) return null
  const canonical = await resolveCanonicalAgentContext(ctx, input.credentialLocator, Date.now())
  if (canonical === null || canonical.principalRef !== turn.principalRef
    || canonical.accountRef !== turn.accountRef) return null
  const stored = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (query) => query.eq('credentialId', input.credentialLocator))
    .unique()
  if (stored === null || stored.lifecycle !== 'active'
    || stored.principalId !== canonical.principalRef || stored.ownerId !== canonical.accountRef
    || stored.applicationRef !== input.applicationRef
    || stored.environment !== input.environment
    || stored.scopes.length !== input.scopes.length) return null
  const requestedScopes = uniqueSorted(input.scopes)
  if (requestedScopes.length !== input.scopes.length
    || uniqueSorted(stored.scopes).some((scope, index) => scope !== requestedScopes[index])) return null
  const current = await resolveCurrentAgentAuthority(ctx, {
    principalId: canonical.principalRef,
    ownerId: canonical.accountRef,
    credentialId: input.credentialLocator,
    applicationRef: input.applicationRef,
    environment: input.environment,
    scopes: requestedScopes,
    authorityMode: stored.authorityMode,
  }, Date.now(), { kind: 'new_operation', toolRef })
  return current?.grantRef === input.grantRef ? current.principal : null
}

