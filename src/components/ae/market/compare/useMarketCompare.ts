import { useMemo } from 'react'

import { parseMarketCompareRefs } from '@/modules/market/market-route-data'
import { directoryCompareReference } from './market-compare-reference'
import type { UseMarketCompareInput } from './compare.contracts'

export function useMarketCompare({ compare, resolvedEntries, loadedEntries }: UseMarketCompareInput) {
  const refs = useMemo(() => parseMarketCompareRefs(compare) ?? [], [compare])
  const selections = useMemo(() => refs.map(resource => {
    const resolved = resolvedEntries.find(entry => entry.resource === resource)
    if (resolved !== undefined) return resolved
    const loaded = loadedEntries.find(entry => directoryCompareReference(entry) === resource || entry.resource === resource)
    if (loaded !== undefined) return { resource, entry: loaded, tool: undefined } as const
    return resolved ?? { resource, pending: true, entry: undefined, tool: undefined } as const
  }), [loadedEntries, refs, resolvedEntries])
  const availableEntries = useMemo(() => [...new Map(selections.flatMap(selection => selection.entry === undefined ? [] : [[selection.entry.resource, selection.entry] as const])).values()], [selections])

  const availableTools = useMemo(() => [...new Map(selections.flatMap(selection => selection.tool === undefined ? [] : [[selection.tool.toolRef, selection.tool] as const])).values()], [selections])

  return { refs, selections, availableEntries, availableTools }
}
