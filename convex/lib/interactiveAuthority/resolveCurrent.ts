import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { InteractiveBusinessAuthorityContext } from '../../../src/modules/business/public'
import type { ActionCtx } from '../../_generated/server'
import { currentContextAtTrustedServerTime } from './shared'
import { interactiveAuthorityContextValue, type InteractiveAuthorityFacts } from './validators'

const readCurrentInteractiveAuthorityFactsRef = makeFunctionReference<
  'query',
  Record<string, never>,
  InteractiveAuthorityFacts | null
>('interactiveAuthority:readCurrentInteractiveAuthorityFacts')

export const resolveCurrentInteractiveAuthorityArgs = {}

export const resolveCurrentInteractiveAuthorityResult = v.union(
  interactiveAuthorityContextValue,
  v.null(),
)

export async function resolveCurrentInteractiveAuthorityHandler(
  ctx: ActionCtx,
): Promise<InteractiveBusinessAuthorityContext | null> {
  const facts = await ctx.runQuery(readCurrentInteractiveAuthorityFactsRef, {})
  if (facts === null) return null
  return currentContextAtTrustedServerTime(facts, Date.now())
}
