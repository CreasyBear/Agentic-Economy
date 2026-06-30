type EnvRecord = Record<string, string | undefined>

export type ObservabilityClientConfig = {
  enabled: boolean
  sentryDsn?: string
  posthogKey?: string
  posthogHost: string
  posthogAppUrl?: string
  release?: string
  environment: string
}

export type ObservabilityServerConfig = {
  enabled: boolean
  sentryDsn?: string
  posthogKey?: string
  posthogHost: string
  posthogAppUrl?: string
  release?: string
  environment: string
}

const defaultPosthogHost = 'https://us.i.posthog.com'

export function isObservabilityDisabled(env: EnvRecord): boolean {
  return env.VITE_AE_DISABLE_OBSERVABILITY === 'true' || env.AE_DISABLE_OBSERVABILITY === 'true'
}

export function readObservabilityClientConfig(
  env: EnvRecord = import.meta.env as EnvRecord,
): ObservabilityClientConfig {
  const disabled = isObservabilityDisabled(env)
  const sentryDsn = readTrimmed(env.VITE_SENTRY_DSN)
  const posthogKey = readTrimmed(env.VITE_POSTHOG_KEY)
  const posthogHost = readTrimmed(env.VITE_POSTHOG_HOST) ?? defaultPosthogHost
  const posthogAppUrl = readTrimmed(env.VITE_POSTHOG_APP_URL)
  const release = readRelease(env)
  const environment =
    readTrimmed(env.VITE_SENTRY_ENVIRONMENT) ??
    readTrimmed(env.SENTRY_ENVIRONMENT) ??
    readTrimmed(env.VERCEL_ENV) ??
    import.meta.env.MODE

  return {
    enabled: !disabled && (sentryDsn !== undefined || posthogKey !== undefined),
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
  const posthogKey = readTrimmed(env.POSTHOG_KEY) ?? readTrimmed(env.VITE_POSTHOG_KEY)
  const posthogHost = readTrimmed(env.POSTHOG_HOST) ?? readTrimmed(env.VITE_POSTHOG_HOST) ?? defaultPosthogHost
  const posthogAppUrl = readTrimmed(env.POSTHOG_APP_URL) ?? readTrimmed(env.VITE_POSTHOG_APP_URL)
  const release = readRelease(env)
  const environment =
    readTrimmed(env.SENTRY_ENVIRONMENT) ??
    readTrimmed(env.VERCEL_ENV) ??
    readTrimmed(env.NODE_ENV) ??
    'development'

  return {
    enabled: !disabled && (sentryDsn !== undefined || posthogKey !== undefined),
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
