const NARROW_TO_CHIP_PATTERN = /^narrow to\s+(.+)$/i
const NATURAL_LOCATION_REFINEMENT_PATTERN = /^(?:only\s+show|show\s+only)\s+.+?\s+(?:near|around|in|at)\s+(.+?)(?:\s+(?:this|next)\s+(?:week|month)|\s+(?:today|tomorrow))?$/i

export function parseNarrowToSuburb(query: string): string | undefined {
  const normalized = query.trim()
  const match = normalized.match(NARROW_TO_CHIP_PATTERN)
    ?? normalized.match(NATURAL_LOCATION_REFINEMENT_PATTERN)
  const suburb = match?.[1]?.trim()
  return suburb === undefined || suburb.length === 0 ? undefined : suburb
}

export function isNarrowToChipQuery(query: string): boolean {
  return parseNarrowToSuburb(query) !== undefined
}
