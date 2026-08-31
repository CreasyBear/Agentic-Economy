type EnvironmentSource = Readonly<Record<string, string | undefined>>

const sharedNames = [
  'CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'AE_E2E_OWNER_EMAIL',
] as const

const localNames = [
  'VITE_CLERK_PUBLISHABLE_KEY',
  'CLERK_JWT_ISSUER_DOMAIN',
  'CONVEX_URL',
  'VITE_CONVEX_URL',
  'AE_CONVEX_SERVER_FUNCTION_TOKEN',
] as const

function value(source: EnvironmentSource, name: string): string | undefined {
  const candidate = source[name]?.trim()
  return candidate === undefined || candidate.length === 0 ? undefined : candidate
}

function isClerkTestKey(candidate: string | undefined, prefix: 'pk_test_' | 'sk_test_'): boolean {
  return candidate !== undefined
    && candidate.startsWith(prefix)
    && candidate.length > prefix.length + 8
}

function validExternalBaseUrl(candidate: string | undefined): boolean {
  if (candidate === undefined) return true
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:'
      || (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
  } catch {
    return false
  }
}

export function readAuthenticatedE2EEnvironment(source: EnvironmentSource = process.env) {
  const externalBaseUrl = value(source, 'AE_AUTHENTICATED_E2E_BASE_URL')
  const required = value(source, 'AE_REQUIRE_AUTHENTICATED_E2E') === 'true'
  const missing = [...sharedNames, ...(externalBaseUrl === undefined ? localNames : [])]
    .filter((name) => value(source, name) === undefined)
  const invalid: string[] = []
  const publishableKey = value(source, 'CLERK_PUBLISHABLE_KEY')
  const secretKey = value(source, 'CLERK_SECRET_KEY')
  const vitePublishableKey = value(source, 'VITE_CLERK_PUBLISHABLE_KEY')

  if (publishableKey !== undefined && !isClerkTestKey(publishableKey, 'pk_test_')) {
    invalid.push('CLERK_PUBLISHABLE_KEY must be a Clerk test-instance pk_test_ key')
  }
  if (secretKey !== undefined && !isClerkTestKey(secretKey, 'sk_test_')) {
    invalid.push('CLERK_SECRET_KEY must be a Clerk test-instance sk_test_ key')
  }
  if (externalBaseUrl === undefined && vitePublishableKey !== undefined) {
    if (!isClerkTestKey(vitePublishableKey, 'pk_test_')) {
      invalid.push('VITE_CLERK_PUBLISHABLE_KEY must be a Clerk test-instance pk_test_ key')
    } else if (publishableKey !== undefined && vitePublishableKey !== publishableKey) {
      invalid.push('VITE_CLERK_PUBLISHABLE_KEY must match CLERK_PUBLISHABLE_KEY')
    }
  }
  if (!validExternalBaseUrl(externalBaseUrl)) {
    invalid.push('AE_AUTHENTICATED_E2E_BASE_URL must be HTTPS or a loopback HTTP URL')
  }

  const configured = missing.length === 0 && invalid.length === 0
  return Object.freeze({
    configured,
    required,
    missing: Object.freeze(missing),
    invalid: Object.freeze(invalid),
    externalBaseUrl,
    baseURL: externalBaseUrl ?? 'http://127.0.0.1:3021',
    ownerEmail: value(source, 'AE_E2E_OWNER_EMAIL'),
  })
}

export const authenticatedE2EEnvironment = readAuthenticatedE2EEnvironment()

export function requireAuthenticatedE2EEnvironment(): typeof authenticatedE2EEnvironment {
  const environment = authenticatedE2EEnvironment
  if (environment.configured) return environment
  const reasons = [
    ...(environment.missing.length === 0 ? [] : [`missing: ${environment.missing.join(', ')}`]),
    ...environment.invalid,
  ]
  throw new Error(`Authenticated E2E environment is not safe and complete (${reasons.join('; ')})`)
}
