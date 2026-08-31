import { describe, expect, it } from 'vitest'

import { readAuthenticatedE2EEnvironment } from '../../e2e/authenticated/environment'

const publishableKey = ['pk', 'test', '1234567890abcdef'].join('_')
const secretKey = ['sk', 'test', '1234567890abcdef'].join('_')

function localEnvironment(overrides: Record<string, string | undefined> = {}) {
  return {
    CLERK_PUBLISHABLE_KEY: publishableKey,
    CLERK_SECRET_KEY: secretKey,
    AE_E2E_OWNER_EMAIL: 'owner+clerk_test@example.com',
    VITE_CLERK_PUBLISHABLE_KEY: publishableKey,
    CLERK_JWT_ISSUER_DOMAIN: 'https://clerk.example.test',
    CONVEX_URL: 'https://convex.example.test',
    VITE_CONVEX_URL: 'https://convex.example.test',
    AE_CONVEX_SERVER_FUNCTION_TOKEN: 'server-function-token',
    ...overrides,
  }
}

describe('authenticated E2E environment', () => {
  it('accepts a complete local Clerk test instance and Convex runtime', () => {
    const result = readAuthenticatedE2EEnvironment(localEnvironment())

    expect(result.configured).toBe(true)
    expect(result.baseURL).toBe('http://127.0.0.1:3021')
    expect(result.missing).toEqual([])
    expect(result.invalid).toEqual([])
  })

  it('rejects production Clerk keys', () => {
    const result = readAuthenticatedE2EEnvironment(localEnvironment({
      CLERK_PUBLISHABLE_KEY: ['pk', 'live', '1234567890abcdef'].join('_'),
      CLERK_SECRET_KEY: ['sk', 'live', '1234567890abcdef'].join('_'),
      VITE_CLERK_PUBLISHABLE_KEY: ['pk', 'live', '1234567890abcdef'].join('_'),
    }))

    expect(result.configured).toBe(false)
    expect(result.invalid).toEqual(expect.arrayContaining([
      expect.stringContaining('CLERK_PUBLISHABLE_KEY'),
      expect.stringContaining('CLERK_SECRET_KEY'),
      expect.stringContaining('VITE_CLERK_PUBLISHABLE_KEY'),
    ]))
  })

  it('rejects a local app configured for a different Clerk instance', () => {
    const result = readAuthenticatedE2EEnvironment(localEnvironment({
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_fedcba0987654321',
    }))

    expect(result.configured).toBe(false)
    expect(result.invalid).toContain('VITE_CLERK_PUBLISHABLE_KEY must match CLERK_PUBLISHABLE_KEY')
  })

  it('allows an external deployment without local Convex runtime values', () => {
    const result = readAuthenticatedE2EEnvironment({
      CLERK_PUBLISHABLE_KEY: publishableKey,
      CLERK_SECRET_KEY: secretKey,
      AE_E2E_OWNER_EMAIL: 'owner+clerk_test@example.com',
      AE_AUTHENTICATED_E2E_BASE_URL: 'https://staging.agentic.example',
    })

    expect(result.configured).toBe(true)
    expect(result.baseURL).toBe('https://staging.agentic.example')
    expect(result.missing).toEqual([])
  })

  it('keeps required mode incomplete until every required value is present', () => {
    const result = readAuthenticatedE2EEnvironment({ AE_REQUIRE_AUTHENTICATED_E2E: 'true' })

    expect(result.required).toBe(true)
    expect(result.configured).toBe(false)
    expect(result.missing).toEqual(expect.arrayContaining([
      'CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'AE_E2E_OWNER_EMAIL',
      'CONVEX_URL',
    ]))
  })
})
