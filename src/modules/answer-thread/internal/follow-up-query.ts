import { extractRequestedLocation } from '@/modules/answer/public'
import { isNarrowToChipQuery, parseNarrowToSuburb } from '@/modules/common/narrow-to-chip'
import { classifyFollowUpIntent } from './follow-up-intent'

export { isNarrowToChipQuery, parseNarrowToSuburb }

export function findThreadNeedQuery(priorTurns: readonly { query: string }[]): string | undefined {
  const matchingTurn = priorTurns.findLast((turn, index) => {
    const query = turn?.query.trim()
    return (
      query !== undefined &&
      query.length > 0 &&
      !isFollowUpChipLabel(query, hasEarlierQuery(priorTurns, index))
    )
  })
  return matchingTurn?.query.trim()
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

  const priorLocation = extractRequestedLocation(needQuery)
  const needWithoutLocation = priorLocation === undefined
    ? needQuery
    : needQuery
      .replace(
        new RegExp(
          `(?:\\b(?:near|around|in|at|serving)\\s+)?${priorLocation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'i',
        ),
        ' ',
      )
      .replace(/\s+(?:near|around|in|at|serving)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
  return `${needWithoutLocation} ${suburb}`.trim().slice(0, 200)
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
  if (/^(?:prepare|send|start) a qualified inquiry(?: (?:for|to|with) .+)?$/i.test(normalized)) {
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
