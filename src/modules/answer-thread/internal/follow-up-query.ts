import { isNarrowToChipQuery, parseNarrowToSuburb } from '@/modules/common/narrow-to-chip'
import { classifyFollowUpIntent } from './follow-up-intent'

export { isNarrowToChipQuery, parseNarrowToSuburb }

export function findThreadNeedQuery(priorTurns: readonly { query: string }[]): string | undefined {
  for (let index = priorTurns.length - 1; index >= 0; index -= 1) {
    const query = priorTurns[index]?.query.trim()
    if (
      query !== undefined &&
      query.length > 0 &&
      !isFollowUpChipLabel(query, hasEarlierQuery(priorTurns, index))
    ) {
      return query
    }
  }
  return undefined
}

export function resolveThreadRegistryQuery(turns: readonly { query: string }[]): string | undefined {
  let registryQuery: string | undefined
  const acceptedTurns: { query: string }[] = []

  for (const turn of turns) {
    const query = turn.query.trim()
    if (query.length === 0) {
      continue
    }

    const suburb = parseNarrowToSuburb(query)
    if (suburb !== undefined) {
      registryQuery = resolveNarrowToSearchQuery(suburb, acceptedTurns)
    } else if (!isFollowUpChipLabel(query, acceptedTurns.length > 0)) {
      registryQuery = query
    }

    acceptedTurns.push({ query })
  }

  return registryQuery
}

export function resolveNarrowToSearchQuery(
  suburb: string,
  priorTurns: readonly { query: string }[],
): string {
  const needQuery = findThreadNeedQuery(priorTurns)
  if (needQuery === undefined) {
    return suburb
  }
  if (needQuery.toLowerCase().includes(suburb.toLowerCase())) {
    return needQuery
  }
  return `${needQuery} ${suburb}`.trim().slice(0, 200)
}

export function resolveFollowUpRegistryQuery(
  displayQuery: string,
  priorTurns: readonly { query: string }[],
): string {
  const suburb = parseNarrowToSuburb(displayQuery)
  if (suburb === undefined) {
    return displayQuery
  }
  return resolveNarrowToSearchQuery(suburb, priorTurns)
}

export function filterProvidersBySuburb<T extends { suburb: string; serviceArea: string }>(
  providers: readonly T[],
  suburb: string,
): T[] {
  const needle = suburb.trim().toLowerCase()
  if (needle.length === 0) {
    return []
  }

  return providers.filter((provider) => {
    const providerSuburb = provider.suburb.trim().toLowerCase()
    if (providerSuburb.length === 0) {
      return provider.serviceArea.trim().toLowerCase().includes(needle)
    }
    return providerSuburb === needle || providerSuburb.includes(needle)
  })
}

function isFollowUpChipLabel(query: string, hasEarlierContext = false): boolean {
  const normalized = query.trim()
  if (isNarrowToChipQuery(normalized)) {
    return true
  }
  if (/^show only businesses that accept inquiries$/i.test(normalized)) {
    return true
  }
  if (/^compare the top two$/i.test(normalized)) {
    return true
  }
  if (/^what can agentic economy do here\?$/i.test(normalized)) {
    return true
  }
  if (/^send a qualified inquiry(?: to .+)?$/i.test(normalized)) {
    return true
  }
  if (hasEarlierContext && classifyFollowUpIntent(normalized, 1) !== 'refine_search') {
    return true
  }
  return false
}

function hasEarlierQuery(turns: readonly { query: string }[], index: number): boolean {
  return turns.slice(0, Math.max(0, index)).some((turn) => turn.query.trim().length > 0)
}
