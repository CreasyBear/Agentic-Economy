import type { PublicToolRef } from '@/modules/capability-supply/public'

export type RegistryNextAction =
  | Readonly<{ action: 'describe'; args: { toolRef: PublicToolRef }; authority: 'public' }>
  | Readonly<{ action: 'next-page'; args: { query: string; cursor: string }; authority: 'public' }>
  | Readonly<{ action: 'broaden'; args: { query: string }; authority: 'public' }>

/** Public, read-only continuation derived only from the search page. */
export function searchNextActions(
  query: string,
  pagination: Readonly<{ nextCursor?: string; hasMore: boolean }>,
): readonly RegistryNextAction[] {
  if (pagination.hasMore && pagination.nextCursor !== undefined) {
    return [{ action: 'next-page', args: { query, cursor: pagination.nextCursor }, authority: 'public' }]
  }
  return [{ action: 'broaden', args: { query }, authority: 'public' }]
}
