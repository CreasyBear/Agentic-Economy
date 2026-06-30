const NARROW_TO_CHIP_PATTERN = /^narrow to\s+(.+)$/i

export function parseNarrowToSuburb(query: string): string | undefined {
  const match = query.trim().match(NARROW_TO_CHIP_PATTERN)
  const suburb = match?.[1]?.trim()
  return suburb === undefined || suburb.length === 0 ? undefined : suburb
}

export function isNarrowToChipQuery(query: string): boolean {
  return parseNarrowToSuburb(query) !== undefined
}
