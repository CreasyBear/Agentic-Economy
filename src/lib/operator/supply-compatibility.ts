export type SupplyCompatibilityIntent = Readonly<{
  search: Record<string, string>
  hash?: string
}>

export type OwnerOperationsCompatibilitySearch = Readonly<{
  rebind?: string
  connect?: 'return' | 'refresh'
  cursor?: string
}>

export function parseOwnerOperationsCompatibilitySearch(
  search: Readonly<Record<string, unknown>>,
): OwnerOperationsCompatibilitySearch {
  if ((search.connect === 'return' || search.connect === 'refresh') && Object.keys(search).length === 1) {
    return { connect: search.connect }
  }
  if (typeof search.rebind === 'string' && isSafeReference(search.rebind) && Object.keys(search).length === 1) {
    return { rebind: search.rebind }
  }
  if (typeof search.cursor === 'string' && search.cursor.length > 0 && search.cursor.length <= 10_000 && Object.keys(search).length === 1) {
    return { cursor: search.cursor }
  }
  return {}
}

export function parseSupplyCompatibilityIntent(
  search: Readonly<Record<string, unknown>>,
  hash: string,
): SupplyCompatibilityIntent {
  const validatedSearch = parseOwnerOperationsCompatibilitySearch(search)
  if (hash === 'earnings' && Object.keys(search).length === 0) {
    return { search: {}, hash: 'earnings' }
  }
  if (validatedSearch.connect !== undefined) {
    return { search: { connect: validatedSearch.connect }, hash: 'earnings' }
  }
  if (
    validatedSearch.rebind !== undefined
    && hash.startsWith('provider-connection-')
    && isSafeReference(hash.slice('provider-connection-'.length))
  ) {
    return { search: { rebind: validatedSearch.rebind }, hash }
  }
  return { search: {} }
}

export function parseSupplyCompatibilityIntentFromUrl(
  searchString: string,
  hash: string,
): SupplyCompatibilityIntent {
  const search: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(searchString)) {
    if (Object.hasOwn(search, key)) return { search: {} }
    search[key] = value
  }
  const intent = parseSupplyCompatibilityIntent(search, hash)
  if (intent.hash !== undefined || Object.keys(intent.search).length > 0) return intent

  // URL fragments are not sent with the initial HTTP request. Preserve only a
  // validated rebind reference at that boundary; the browser retains the
  // original fragment, and the workspace still refuses to act without it.
  const validatedSearch = parseOwnerOperationsCompatibilitySearch(search)
  return hash === '' && validatedSearch.rebind !== undefined
    ? { search: { rebind: validatedSearch.rebind } }
    : intent
}

function isSafeReference(value: string): boolean {
  return value.length > 0 && value.length <= 240 && /^[A-Za-z0-9:._-]+$/.test(value)
}
