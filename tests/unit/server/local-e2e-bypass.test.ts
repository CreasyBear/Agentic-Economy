import { afterEach, describe, expect, it, vi } from 'vitest'

import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isLocalE2EAuthBypassEnabled', () => {
  it('throws when the flag is enabled in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')

    expect(() => isLocalE2EAuthBypassEnabled()).toThrow(
      'VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E cannot be enabled in production.'
    )
  })

  it('returns false in production when the flag is unset', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', '')

    expect(isLocalE2EAuthBypassEnabled()).toBe(false)
  })

  it('returns true outside production when the flag is enabled', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')

    expect(isLocalE2EAuthBypassEnabled()).toBe(true)
  })

  it('returns false outside production when the flag is unset', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', '')

    expect(isLocalE2EAuthBypassEnabled()).toBe(false)
  })
})
