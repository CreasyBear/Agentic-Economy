export type CanonicalBaseUrlResolution =
  | { kind: 'configured'; baseUrl: string }
  | { kind: 'allowlisted-origin'; baseUrl: string }
  | { kind: 'fallback'; baseUrl: string }

const fallbackCanonicalBaseUrl = 'http://localhost:3000'

export function resolveCanonicalBaseUrl(request: Request): CanonicalBaseUrlResolution {
  const configuredBaseUrl = readConfiguredCanonicalBaseUrl(process.env.AE_CANONICAL_BASE_URL)
  if (configuredBaseUrl !== undefined) {
    return { kind: 'configured', baseUrl: configuredBaseUrl }
  }

  const requestUrl = readRequestUrl(request)
  const allowlistedHosts = readCanonicalHostAllowlist(process.env.AE_CANONICAL_HOST_ALLOWLIST)
  if (requestUrl !== undefined && allowlistedHosts.has(requestUrl.host.toLowerCase())) {
    return { kind: 'allowlisted-origin', baseUrl: requestUrl.origin }
  }

  return { kind: 'fallback', baseUrl: fallbackCanonicalBaseUrl }
}

function readConfiguredCanonicalBaseUrl(value: string | undefined): string | undefined {
  const parsed = readHttpUrl(value)
  if (parsed === undefined) {
    return undefined
  }

  return parsed.href.replace(/\/+$/u, '')
}

function readCanonicalHostAllowlist(value: string | undefined): ReadonlySet<string> {
  const hosts = (value ?? '')
    .split(',')
    .map((host) => readAllowlistedHost(host))
    .filter((host): host is string => host !== undefined)

  return new Set(hosts)
}

function readAllowlistedHost(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return undefined
  }

  const parsedAsUrl = readHttpUrl(trimmed)
  if (parsedAsUrl !== undefined) {
    return parsedAsUrl.host.toLowerCase()
  }

  if (trimmed.includes('/') || trimmed.includes('?') || trimmed.includes('#')) {
    return undefined
  }

  return trimmed.toLowerCase()
}

function readRequestUrl(request: Request): URL | undefined {
  try {
    return new URL(request.url)
  } catch {
    return undefined
  }
}

function readHttpUrl(value: string | undefined): URL | undefined {
  const trimmed = value?.trim()
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined
  }

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return undefined
    }

    return url
  } catch {
    return undefined
  }
}

