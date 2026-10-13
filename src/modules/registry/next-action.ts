import type { z } from 'zod'

import type { toolCatalogSearchInputSchema } from './tool-search-input'

export type RegistrySearchArgs = Omit<z.input<typeof toolCatalogSearchInputSchema>, 'cursor'>
export type RegistryRetryArgs = RegistrySearchArgs & Pick<z.input<typeof toolCatalogSearchInputSchema>, 'cursor'>

export type RegistryNextAction =
  | Readonly<{ action: 'registry.tools.describe'; args: { toolRef: string }; authority: 'public' }>
  | Readonly<{ action: 'registry.tools.search'; args: RegistryRetryArgs; authority: 'public' }>

export type RegistryPageNext = Extract<RegistryNextAction, { action: 'registry.tools.search' }> &
  Readonly<{ args: RegistrySearchArgs & { cursor: string } }>

/** A page read retains the exact cursor and query scope; it creates no purchase. */
export function isRegistryPageNext(next: RegistryNextAction | undefined): next is RegistryPageNext {
  return next?.action === 'registry.tools.search' && typeof next.args.cursor === 'string'
}

/** A completed assessment needs caller refinement, not a replay of its unchanged query. */
export function searchNextActions(
  query: string,
  pagination: Readonly<{ nextCursor?: string; hasMore: boolean }>,
  scope: Omit<RegistrySearchArgs, 'query'> = {},
): readonly RegistryNextAction[] {
  return pagination.hasMore && pagination.nextCursor !== undefined
    ? [{ action: 'registry.tools.search', args: { ...scope, query, cursor: pagination.nextCursor }, authority: 'public' }]
    : []
}
