import type { RegistryNextAction } from './tool-choice-contracts'

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
