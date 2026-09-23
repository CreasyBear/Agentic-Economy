import { useMemo } from 'react'

import { parseMarketCompareRefs } from '@/modules/market/market-route-data'
import type { UseMarketCompareInput } from './compare.contracts'

export function useMarketCompare({ compare, resolvedEntries, loadedEntries }: UseMarketCompareInput) {
  const refs = useMemo(() => parseMarketCompareRefs(compare) ?? [], [compare])
  const selections = useMemo(() => refs.map(resource => {
    const loaded = loadedEntries.find(entry => entry.resource === resource)
    if (loaded !== undefined) return { resource, entry: loaded } as const
    return resolvedEntries.find(entry => entry.resource === resource) ?? { resource, pending: true, entry: undefined } as const
  }), [loadedEntries, refs, resolvedEntries])
  const availableEntries = useMemo(() => selections.flatMap(selection => selection.entry === undefined ? [] : [selection.entry]), [selections])

  return { refs, selections, availableEntries }
}
