type EnvRecord = Record<string, string | undefined>

export type ObservabilityClientConfig = {
  enabled: boolean
  /** Sentry reports only from production and preview, never under Vitest. */
  sentryEnabled: boolean
  sentryDsn?: string
  posthogKey?: string
  posthogHost: string
  posthogAppUrl?: string
  release?: string
  environment: string
}

export type ObservabilityServerConfig = {
  enabled: boolean
  sentryEnabled: boolean
  sentryDsn?: string
  posthogKey?: string
  posthogHost: string
  posthogAppUrl?: string
  release?: string
  environment: string
}

const defaultPosthogHost = 'https://us.i.posthog.com'

export type ObservabilityEnvironment = 'production' | 'preview' | 'development'

/** One env scheme (Vercel's): anything that is not production or preview is development. */
export function normalizeEnvironment(raw: string | undefined): ObservabilityEnvironment {
  const value = raw?.trim().toLowerCase()
  return value === 'production' || value === 'preview' ? value : 'development'
}

function isSentryEnvironment(environment: ObservabilityEnvironment, env: EnvRecord): boolean {
  return environment !== 'development' && env.VITEST === undefined && (typeof process === 'undefined' || process.env.VITEST === undefined)
}

export function isObservabilityDisabled(env: EnvRecord): boolean {
  return env.VITE_AE_DISABLE_OBSERVABILITY === 'true' || env.AE_DISABLE_OBSERVABILITY === 'true'
}

/** Executor/DO_NOT_TRACK convention opts out unless the value is explicitly false. */
export function isProductAnalyticsDisabled(env: EnvRecord): boolean {
  return ['DO_NOT_TRACK', 'AE_DISABLE_ANALYTICS', 'VITE_AE_DISABLE_ANALYTICS'].some(name =>
    !['', '0', 'false', 'no', 'off'].includes((env[name] ?? '').trim().toLowerCase()))
}

export function readObservabilityClientConfig(
  env: EnvRecord = import.meta.env as EnvRecord,
): ObservabilityClientConfig {
  const disabled = isObservabilityDisabled(env)
  const sentryDsn = readTrimmed(env.VITE_SENTRY_DSN)
  const posthogKey = isProductAnalyticsDisabled(env) ? undefined : readTrimmed(env.VITE_POSTHOG_KEY)
  const posthogHost = readTrimmed(env.VITE_POSTHOG_HOST) ?? defaultPosthogHost
  const posthogAppUrl = readTrimmed(env.VITE_POSTHOG_APP_URL)
  const release = readRelease(env)
  const environment = normalizeEnvironment(
    readTrimmed(env.VITE_SENTRY_ENVIRONMENT) ??
    readTrimmed(env.SENTRY_ENVIRONMENT) ??
    readTrimmed(env.VERCEL_ENV),
  )

  return {
    enabled: !disabled && (sentryDsn !== undefined || posthogKey !== undefined),
    sentryEnabled: !disabled && sentryDsn !== undefined && isSentryEnvironment(environment, env),
    ...(sentryDsn === undefined ? {} : { sentryDsn }),
    ...(posthogKey === undefined ? {} : { posthogKey }),
    posthogHost,
    ...(posthogAppUrl === undefined ? {} : { posthogAppUrl }),
    ...(release === undefined ? {} : { release }),
    environment,
  }
}

export function readObservabilityServerConfig(
  env: EnvRecord = process.env as EnvRecord,
): ObservabilityServerConfig {
  const disabled = isObservabilityDisabled(env)
  const sentryDsn = readTrimmed(env.SENTRY_DSN) ?? readTrimmed(env.VITE_SENTRY_DSN)
  const posthogKey = isProductAnalyticsDisabled(env) ? undefined : readTrimmed(env.POSTHOG_KEY) ?? readTrimmed(env.VITE_POSTHOG_KEY)
  const posthogHost = readTrimmed(env.POSTHOG_HOST) ?? readTrimmed(env.VITE_POSTHOG_HOST) ?? defaultPosthogHost
  const posthogAppUrl = readTrimmed(env.POSTHOG_APP_URL) ?? readTrimmed(env.VITE_POSTHOG_APP_URL)
  const release = readRelease(env)
  const environment = normalizeEnvironment(
    readTrimmed(env.SENTRY_ENVIRONMENT) ??
    readTrimmed(env.VERCEL_ENV) ??
    readTrimmed(env.NODE_ENV),
  )

  return {
    enabled: !disabled && (sentryDsn !== undefined || posthogKey !== undefined),
    sentryEnabled: !disabled && sentryDsn !== undefined && isSentryEnvironment(environment, env),
    ...(sentryDsn === undefined ? {} : { sentryDsn }),
    ...(posthogKey === undefined ? {} : { posthogKey }),
    posthogHost,
    ...(posthogAppUrl === undefined ? {} : { posthogAppUrl }),
    ...(release === undefined ? {} : { release }),
    environment,
  }
}

function readRelease(env: EnvRecord): string | undefined {
  return (
    readTrimmed(env.VITE_SENTRY_RELEASE) ??
    readTrimmed(env.SENTRY_RELEASE) ??
    readTrimmed(env.VERCEL_GIT_COMMIT_SHA) ??
    readTrimmed(env.GITHUB_SHA)
  )
}

function readTrimmed(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}
