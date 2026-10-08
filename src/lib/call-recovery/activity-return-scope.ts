import { z } from 'zod'

/** Bounded presentation state. A return link never supplies authority, input, or an executable action. */
export const monthlyDraftRefSearchSchema = z.string().regex(/^monthly-usage-(?:draft|close):[a-f0-9]{64}$/u).optional().catch(undefined)
const presentationRef = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/u).optional().catch(undefined)
export const activityReturnScopeSchema = z.object({
  returnRange: z.enum(['all', 'today', '7d', '30d', 'month']).optional().catch(undefined),
  returnDraftRef: monthlyDraftRefSearchSchema,
  returnAgent: presentationRef,
  returnStatus: z.enum(['all', 'completed', 'refused', 'outcome_unknown']).optional().catch(undefined),
  returnTo: z.enum(['chat', 'agent', 'tool', 'plan']).optional().catch(undefined),
  returnThread: presentationRef,
  returnCaller: presentationRef,
  returnTool: presentationRef,
  returnPlan: presentationRef,
})
export type ActivityReturnScope = z.infer<typeof activityReturnScopeSchema>
export function activityReturnSearch(scope: ActivityReturnScope | undefined) {
  const safe = activityReturnScopeSchema.parse(scope ?? {})
  return { ...(safe.returnRange === undefined ? {} : { range: safe.returnRange }),
    ...(safe.returnAgent === undefined ? {} : { agent: safe.returnAgent }),
    ...(safe.returnStatus === undefined ? {} : { status: safe.returnStatus }),
    ...(safe.returnDraftRef === undefined ? {} : { draftRef: safe.returnDraftRef }) }
}
export function activityReturnHref(scope: ActivityReturnScope | undefined) {
  const query = new URLSearchParams(activityReturnSearch(scope)).toString()
  return query.length === 0 ? '/activity' : `/activity?${query}`
}
export function buyerReturnDestination(scope: ActivityReturnScope | undefined): Readonly<{ href: string; label: string }> | undefined {
  const safe = activityReturnScopeSchema.parse(scope ?? {})
  if (safe.returnTo === 'chat' && safe.returnThread !== undefined) return { href: `/t/${encodeURIComponent(safe.returnThread)}`, label: 'Return to conversation' }
  if (safe.returnTo === 'tool' && safe.returnTool !== undefined) return { href: `/tools/${encodeURIComponent(safe.returnTool)}`, label: 'Return to selected Tool' }
  if (safe.returnTo === 'plan' && safe.returnPlan !== undefined) return { href: `/plans/${encodeURIComponent(safe.returnPlan)}`, label: 'Return to Plan' }
  if (safe.returnTo === 'agent') {
    const query = new URLSearchParams({ ...(safe.returnCaller === undefined ? {} : { caller: safe.returnCaller }),
      ...(safe.returnTool === undefined ? {} : { resumeTool: safe.returnTool }) }).toString()
    return { href: `/agent-access${query ? `?${query}` : ''}`, label: 'Return to Agent' }
  }
  return undefined
}
export function scopedCallHref(href: string, scope: ActivityReturnScope | undefined) {
  // Existing Call/Plan paths are the only handoff targets; no arbitrary redirect URL is accepted.
  if (!/^\/(?:calls|plans)\/[A-Za-z0-9%:._-]+$/u.test(href)) return href
  const safe = activityReturnScopeSchema.parse(scope ?? {})
  const entries = Object.entries(safe).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  const query = new URLSearchParams(entries).toString()
  return query.length === 0 ? href : `${href}?${query}`
}
