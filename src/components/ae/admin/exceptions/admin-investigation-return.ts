import { z } from 'zod'
import {
  adminExceptionsSearchSchema, ADMIN_EXCEPTION_PARTITIONS, type AdminExceptionsSearch,
} from './exceptions.contracts'

/** A fixed source destination and bounded fields; no caller-supplied redirect URL. */
export const adminInvestigationSearchSchema = z.object({
  returnKind: adminExceptionsSearchSchema.shape.kind.catch(undefined),
  returnPartition: adminExceptionsSearchSchema.shape.partition.catch(undefined),
  returnLoaded: adminExceptionsSearchSchema.shape.loaded.catch(undefined),
  returnRef: adminExceptionsSearchSchema.shape.ref.catch(undefined),
  returnFocus: adminExceptionsSearchSchema.shape.focus.catch(undefined),
})
export type AdminInvestigationReturnScope = z.infer<typeof adminInvestigationSearchSchema>

export function adminInvestigationReturnSearch(scope: AdminInvestigationReturnScope): AdminExceptionsSearch {
  const safe = adminInvestigationSearchSchema.parse(scope)
  if (safe.returnKind === undefined) return {}
  const partition = safe.returnPartition !== undefined && ADMIN_EXCEPTION_PARTITIONS[safe.returnKind].includes(safe.returnPartition)
    ? safe.returnPartition : ADMIN_EXCEPTION_PARTITIONS[safe.returnKind][0]
  return {
    kind: safe.returnKind, partition,
    ...(safe.returnLoaded === undefined ? {} : { loaded: safe.returnLoaded }),
    ...(safe.returnRef === undefined ? {} : { ref: safe.returnRef }),
    ...(safe.returnFocus === undefined ? {} : { focus: safe.returnFocus }),
  }
}
export function adminInvestigationReturnHref(scope: AdminInvestigationReturnScope): string {
  const search = adminInvestigationReturnSearch(scope)
  const query = new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)])).toString()
  return query.length === 0 ? '/admin/exceptions' : `/admin/exceptions?${query}`
}
export function withAdminInvestigationScope(href: string, scope: AdminInvestigationReturnScope): string {
  if (!/^\/admin\/(?:calls|tools|providers)\/[^/?#]+$/u.test(href)) return href
  const safe = adminInvestigationSearchSchema.parse(scope)
  const query = new URLSearchParams(Object.entries(safe).filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => [key, String(value)])).toString()
  return query.length === 0 ? href : `${href}?${query}`
}
export function withAdminInvestigationReturn(href: string, search: AdminExceptionsSearch, row: { id: string; ref: string }): string {
  const scope = adminInvestigationSearchSchema.parse({
    returnKind: search.kind, returnPartition: search.partition, returnLoaded: search.loaded,
    returnRef: row.ref, returnFocus: row.id,
  })
  return withAdminInvestigationScope(href, scope)
}
