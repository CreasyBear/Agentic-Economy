import { z } from 'zod'

/** Bounded route state, never a caller-supplied redirect URL. */
export const activityReturnScopeSchema = z.object({
  returnRange: z.enum(['all','today','7d','30d','month']).optional().catch(undefined),
  returnAgent: z.string().trim().min(1).max(200).optional().catch(undefined),
})
export type ActivityReturnScope = z.infer<typeof activityReturnScopeSchema>
export function activityReturnSearch(scope: ActivityReturnScope | undefined) {
  return { ...(scope?.returnRange === undefined ? {} : { range: scope.returnRange }), ...(scope?.returnAgent === undefined ? {} : { agent: scope.returnAgent }) }
}
export function activityReturnHref(scope: ActivityReturnScope | undefined) {
  const query = new URLSearchParams(activityReturnSearch(scope)).toString()
  return query.length === 0 ? '/activity' : `/activity?${query}`
}
export function scopedCallHref(href: string, scope: ActivityReturnScope | undefined) {
  const query = new URLSearchParams({ ...(scope?.returnRange === undefined ? {} : { returnRange: scope.returnRange }), ...(scope?.returnAgent === undefined ? {} : { returnAgent: scope.returnAgent }) }).toString()
  return query.length === 0 ? href : `${href}?${query}`
}
