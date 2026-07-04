export type ProviderApiBaseUrlOptions = {
  defaultUrl: string
  allowedHosts: readonly string[]
  env?: string | undefined
  label: string
}

export type ProviderApiBaseUrlReason =
  | 'invalid_url'
  | 'credentials_not_allowed'
  | 'search_or_hash_not_allowed'
  | 'protocol_not_allowed'
  | 'host_not_allowed'

export class ProviderApiBaseUrlError extends Error {
  readonly label: string
  readonly reason: ProviderApiBaseUrlReason

  constructor(label: string, reason: ProviderApiBaseUrlReason, message: string) {
    super(message)
    this.name = 'ProviderApiBaseUrlError'
    this.label = label
    this.reason = reason
  }
}


export function resolveProviderApiBaseUrl(
  rawUrl: string | undefined,
  options: ProviderApiBaseUrlOptions
): string {
  const parsed = parseProviderBaseUrl(rawUrl ?? options.defaultUrl, options.label)
  const isProduction = (options.env ?? readNodeEnv()) === 'production'
  const hostname = parsed.hostname.toLowerCase()

  if (isProduction) {
    if (parsed.protocol !== 'https:') {
      throw new ProviderApiBaseUrlError(options.label, 'protocol_not_allowed', 'Provider API base URL must use https in production.')
    }
    if (parsed.port.length > 0 || !options.allowedHosts.some((allowedHost) => allowedHost.toLowerCase() === hostname)) {
      throw new ProviderApiBaseUrlError(options.label, 'host_not_allowed', 'Provider API base URL host is not allowed in production.')
    }
  } else if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalhost(hostname))) {
    throw new ProviderApiBaseUrlError(options.label, 'protocol_not_allowed', 'Provider API base URL must use https unless it is a non-production localhost override.')
  }

  return parsed.toString().replace(/\/$/, '')
}

function parseProviderBaseUrl(rawUrl: string, label: string): URL {
  const value = rawUrl.trim()
  if (value.length === 0) {
    throw new ProviderApiBaseUrlError(label, 'invalid_url', 'Provider API base URL is required.')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new ProviderApiBaseUrlError(label, 'invalid_url', 'Provider API base URL must be an absolute URL.')
  }

  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new ProviderApiBaseUrlError(label, 'credentials_not_allowed', 'Provider API base URL must not include credentials.')
  }
  if (parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new ProviderApiBaseUrlError(label, 'search_or_hash_not_allowed', 'Provider API base URL must not include a query string or fragment.')
  }

  return parsed
}


function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

function readNodeEnv(): string | undefined {
  if (typeof process === 'undefined') {
    return undefined
  }
  return process.env.NODE_ENV
}
