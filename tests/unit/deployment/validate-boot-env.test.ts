import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ensureBootEnvironmentValidated,
  resetBootEnvironmentValidationForTests,
} from '@/lib/deployment/validate-boot-env.server'

afterEach(() => {
  resetBootEnvironmentValidationForTests()
  vi.unstubAllEnvs()
})

describe('ensureBootEnvironmentValidated', () => {
  it('does not demand production secrets on a Vercel Preview', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    vi.stubEnv('AE_SOURCE_WRITE_SECRET', 'preview-source-write-secret-that-is-long-enough')
    delete process.env.AE_CANONICAL_BASE_URL
    delete process.env.CLERK_SECRET_KEY

    expect(() => ensureBootEnvironmentValidated()).not.toThrow()
  })

  it('keeps hosted production fail-closed and repeats the same error', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    delete process.env.AE_CANONICAL_BASE_URL

    expect(() => ensureBootEnvironmentValidated()).toThrow(/AE_CANONICAL_BASE_URL: required in production but missing/)
    expect(() => ensureBootEnvironmentValidated()).toThrow(/AE_CANONICAL_BASE_URL: required in production but missing/)
  })

  it('does not gate public boot on missing or malformed operation-only configuration', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://ae.example')
    vi.stubEnv('CONVEX_URL', 'https://convex.example')
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'source-token')
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_live_example')
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_live_example')
    vi.stubEnv('CLERK_JWT_ISSUER_DOMAIN', 'https://clerk.example')
    vi.stubEnv('CLERK_WEBHOOK_SIGNING_SECRET', 'whsec_example')
    for (const family of ['BILLING', 'PROTECTED', 'CATALOG', 'OPERATOR', 'REPAIR', 'SESSION']) {
      vi.stubEnv(`AE_SOURCE_WRITE_KEY_${family}`, `${family.toLowerCase()}:0123456789abcdef0123456789abcdef`)
    }
    vi.stubEnv('AE_INFISICAL_BASE_URL', 'malformed-optional-url')
    vi.stubEnv('OPENROUTER_API_KEY', '')
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    vi.stubEnv('CDP_API_KEY_ID', '')

    expect(() => ensureBootEnvironmentValidated()).not.toThrow()
  })

  it('rejects a missing declaration on preview repeatedly until corrected and reset', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', undefined)

    expect(() => ensureBootEnvironmentValidated()).toThrow(
      /AE_DEPLOYMENT_ENVIRONMENT: must be exactly production or development/,
    )
    expect(() => ensureBootEnvironmentValidated()).toThrow(
      /AE_DEPLOYMENT_ENVIRONMENT: must be exactly production or development/,
    )

    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    resetBootEnvironmentValidationForTests()
    expect(() => ensureBootEnvironmentValidated()).not.toThrow()
  })

  it.each(['', 'preview', ' production ', 'Production', 'sandbox'])(
    'rejects malformed deployment declaration %j without echoing it',
    (declaration) => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('VERCEL_ENV', 'preview')
      vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', declaration)

      let message = ''
      try {
        ensureBootEnvironmentValidated()
      } catch (error) {
        message = (error as Error).message
      }
      expect(message).toBe('Invalid environment configuration:\nAE_DEPLOYMENT_ENVIRONMENT: must be exactly production or development')
      expect(() => ensureBootEnvironmentValidated()).toThrow(
        /AE_DEPLOYMENT_ENVIRONMENT: must be exactly production or development/,
      )
    },
  )
})
