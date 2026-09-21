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
    vi.stubEnv('AE_SOURCE_WRITE_SECRET', 'preview-source-write-secret-that-is-long-enough')
    delete process.env.AE_CANONICAL_BASE_URL
    delete process.env.CLERK_SECRET_KEY

    expect(() => ensureBootEnvironmentValidated()).not.toThrow()
  })

  it('keeps hosted production fail-closed and repeats the same error', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    delete process.env.AE_CANONICAL_BASE_URL

    expect(() => ensureBootEnvironmentValidated()).toThrow(/AE_CANONICAL_BASE_URL: required in production but missing/)
    expect(() => ensureBootEnvironmentValidated()).toThrow(/AE_CANONICAL_BASE_URL: required in production but missing/)
  })
})
