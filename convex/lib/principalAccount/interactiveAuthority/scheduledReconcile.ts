import { externalIdentityBindingRef } from '../../../../src/modules/principal-account/external-identity/public'
import type { InteractiveBusinessAuthorityContext } from '../../../../src/modules/business/public'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { v } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { resolveInteractiveAuthorityFactsForToken } from './factResolution'
import {
  currentContextAtTrustedServerTime,
  interactiveAuthorityContextFromValue,
  requireExactlyOne,
  sameScheduledAuthority,
  type AuthorityDb,
} from './shared'
import { interactiveAuthorityContextValue } from './contracts'

/**
 * Re-derives a previously admitted interactive context from canonical records.
 * The binding reference is only a locator: every Principal, Account, access,
 * revision and current-time fact is loaded again and must exactly match.
 */
export async function resolveScheduledInteractiveAuthorityContext(
  db: AuthorityDb,
  expectedInput: typeof interactiveAuthorityContextValue.type,
): Promise<InteractiveBusinessAuthorityContext | null> {
  try {
    const expected = interactiveAuthorityContextFromValue(expectedInput)
    const bindingRefValue = externalIdentityBindingRef(expected.provenance.bindingRef)
    const bindings = await db.query('externalIdentityBindings')
      .withIndex('by_bindingRef', (query) => query.eq('bindingRef', bindingRefValue))
      .take(2)
    const binding = requireExactlyOne(bindings, 'binding_missing', 'binding_ambiguous')
    const facts = await resolveInteractiveAuthorityFactsForToken(
      db,
      binding.providerIdentifier,
      undefined,
    )
    const current = currentContextAtTrustedServerTime(facts, Date.now())
    if (current === null || !sameScheduledAuthority(current, expected)) return null
    return current
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'resolveScheduledInteractiveAuthorityContext', reason: 'source_unavailable' })
  }
}

export const reconcileScheduledInteractiveAuthorityArgs = {
  authority: interactiveAuthorityContextValue,
}

export const reconcileScheduledInteractiveAuthorityResult = v.union(
  interactiveAuthorityContextValue,
  v.null(),
)

export async function reconcileScheduledInteractiveAuthorityHandler(
  ctx: QueryCtx,
  args: { authority: typeof interactiveAuthorityContextValue.type },
): Promise<InteractiveBusinessAuthorityContext | null> {
  return await resolveScheduledInteractiveAuthorityContext(ctx.db, args.authority)
}
