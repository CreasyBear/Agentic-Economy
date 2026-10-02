const FILLER = new Set(['about', 'after', 'again', 'could', 'every', 'using', 'would', 'their', 'there', 'these', 'those', 'today', 'tomorrow', 'morning', 'tonight', 'recent', 'under', 'which', 'where', 'while'])

const ACTION_FAMILIES = [
  { query: ['search', 'web'], row: ['search', 'web'] },
  { query: ['weather', 'forecast'], row: ['weather', 'forecast'] },
  { query: ['transfer', 'erc20', 'token'], row: ['transfer'] },
  { query: ['ocr', 'invoice', 'scanned', 'extract'], row: ['ocr', 'invoice', 'scanned'] },
  { query: ['timezone', 'convert', 'tokyo'], row: ['timezone', 'convert', 'tokyo'] },
] as const

function words(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, ' ').split(' ').filter(term => term.length >= 5 && !FILLER.has(term))
}

/** A row must match the request's action. A shared noun such as "storage" or "token" is not enough. */
export function suitableListing(query: string, title: string, summary: string): boolean {
  const terms = words(query)
  if (terms.length === 0) return true
  const haystack = `${title} ${summary}`.toLowerCase()
  const active = ACTION_FAMILIES.filter(family => family.query.some(action => terms.some(term => term.includes(action))))
  if (active.length > 0) return active.every(family => family.row.some(action => haystack.includes(action)))
  return terms.some(term => haystack.includes(term.slice(0, Math.min(term.length, 12))))
}

const ACCESS_ORDER = { ae_callable: 0, setup_required: 1, unavailable: 2, external_listing: 3 } as const

/** Callable admitted Tools stay ahead of setup rows and labelled Bazaar listings. */
export function callableFirst<T extends { access?: string }>(rows: readonly T[]): T[] {
  return rows.map((row, index) => ({ row, index })).sort((left, right) => {
    const leftRank = left.row.access !== undefined && left.row.access in ACCESS_ORDER
      ? ACCESS_ORDER[left.row.access as keyof typeof ACCESS_ORDER] : 4
    const rightRank = right.row.access !== undefined && right.row.access in ACCESS_ORDER
      ? ACCESS_ORDER[right.row.access as keyof typeof ACCESS_ORDER] : 4
    return leftRank - rightRank || left.index - right.index
  }).map(entry => entry.row)
}
