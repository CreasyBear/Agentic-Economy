import { createAutumnHttpProvider } from '@/modules/billing/server'
import type { AutumnClientConfig, AutumnProvider } from '@/modules/billing/public'

export type BillingProviderErrorCode = 'missing_autumn_key' | 'unverified_webhook'

export class BillingProviderError extends Error {
  readonly code: BillingProviderErrorCode
  readonly status: number

  constructor(code: BillingProviderErrorCode, message: string, status: number) {
    super(message)
    this.name = 'BillingProviderError'
    this.code = code
    this.status = status
  }
}

type Env = Record<string, string | undefined>

export type RawAutumnWebhook = {
  rawBody: string
  headers: Headers
  secret?: string
}

export type VerifiedAutumnWebhook = {
  provider: 'autumn_cloud'
  rawBody: string
  headers: Headers
}

export function createAutumnProviderFromEnv(env: Env = process.env): AutumnProvider {
  return createAutumnHttpProvider(readAutumnClientConfig(env))
}

export function readAutumnClientConfig(env: Env = process.env): AutumnClientConfig {
  const secretKey = readEnv(env, 'AUTUMN_SECRET_KEY')
  if (secretKey === undefined) {
    throw new BillingProviderError('missing_autumn_key', 'AUTUMN_SECRET_KEY is required for Autumn provider calls.', 500)
  }

  const config: AutumnClientConfig = { secretKey }
  const apiBaseUrl = readEnv(env, 'AUTUMN_API_BASE_URL')
  const apiVersion = readEnv(env, 'AUTUMN_API_VERSION')

  if (apiBaseUrl !== undefined) {
    config.apiBaseUrl = apiBaseUrl
  }
  if (apiVersion !== undefined) {
    config.apiVersion = apiVersion
  }

  return config
}

export async function verifyAutumnWebhook(_input: RawAutumnWebhook): Promise<VerifiedAutumnWebhook> {
  throw new BillingProviderError(
    'unverified_webhook',
    'Autumn webhook verification is not configured in source; refusing unverified provider callback.',
    401
  )
}

export function readAutumnWebhookSecret(env: Env = process.env): string | undefined {
  return readEnv(env, 'AUTUMN_WEBHOOK_SECRET')
}

function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }

  return value.trim()
}
