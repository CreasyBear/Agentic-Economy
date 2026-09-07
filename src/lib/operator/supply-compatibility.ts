export type SupplyCompatibilityIntent = Readonly<{
  search: Record<string, string>
  hash?: string
}>

export type OwnerToolsX402ConnectionIntent = Readonly<{
  connect: 'x402'
  draft: string
  resourceUrl: string
  method: 'GET' | 'POST'
  environment: 'sandbox' | 'production'
}>

type OwnerToolsLegacyCompatibilitySearch = Readonly<{
  rebind?: string
  connect?: 'return' | 'refresh'
  cursor?: string
}>

type OwnerToolsX402CompatibilitySearch = OwnerToolsX402ConnectionIntent & Readonly<{
  rebind?: never
  cursor?: never
}>

export type OwnerToolsCompatibilitySearch =
  | OwnerToolsLegacyCompatibilitySearch
  | OwnerToolsX402CompatibilitySearch

export function parseOwnerToolsCompatibilitySearch(
  search: Readonly<Record<string, unknown>>,
): OwnerToolsCompatibilitySearch {
  const x402 = parseOwnerToolsX402ConnectionSearch(search)
  if (x402 !== undefined) return x402
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

export function parseOwnerToolsX402ConnectionSearch(
  search: Readonly<Record<string, unknown>>,
): OwnerToolsX402ConnectionIntent | undefined {
  if (!isX402ConnectionSearch(search)) return undefined
  return {
    connect: 'x402',
    draft: search.draft,
    resourceUrl: search.resourceUrl,
    method: search.method,
    environment: search.environment,
  }
}

export function parseSupplyCompatibilityIntent(
  search: Readonly<Record<string, unknown>>,
  hash: string,
): SupplyCompatibilityIntent {
  const x402 = parseOwnerToolsX402ConnectionSearch(search)
  if (x402 !== undefined) return { search: { ...x402 } }
  const validatedSearch = parseOwnerToolsCompatibilitySearch(search)
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
  const validatedSearch = parseOwnerToolsCompatibilitySearch(search)
  return hash === '' && validatedSearch.rebind !== undefined
    ? { search: { rebind: validatedSearch.rebind } }
    : intent
}

function isSafeReference(value: string): boolean {
  return value.length > 0 && value.length <= 240 && /^[A-Za-z0-9:._-]+$/.test(value)
}

function isX402ConnectionSearch(
  search: Readonly<Record<string, unknown>>,
): search is Readonly<{
  connect: 'x402'
  draft: string
  resourceUrl: string
  method: 'GET' | 'POST'
  environment: 'sandbox' | 'production'
}> {
  if (Object.keys(search).length !== 5 || search.connect !== 'x402') return false
  if (typeof search.draft !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(search.draft)) return false
  if (typeof search.resourceUrl !== 'string' || !isSafeHttpsUrl(search.resourceUrl)) return false
  if (search.method !== 'GET' && search.method !== 'POST') return false
  return search.environment === 'sandbox' || search.environment === 'production'
}

function isSafeHttpsUrl(value: string): boolean {
  if (value.length === 0 || value.length > 2_048) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.username === '' && url.password === '' && url.hash === ''
  } catch {
    return false
  }
}
