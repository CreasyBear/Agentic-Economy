import { describe, expect, it } from 'vitest'

import {
  bootValidationClass,
  clerkMiddlewareConfigured,
  resolveDeploymentMode,
  vercelPreviewHosts,
} from '@/lib/deployment/environment'

describe('resolveDeploymentMode', () => {
  it('prefers Vercel production over NODE_ENV', () => {
    expect(resolveDeploymentMode({ NODE_ENV: 'development', VERCEL_ENV: 'production' })).toBe('production')
  })

  it('classifies a Vercel Preview as preview even when NODE_ENV is production', () => {
    expect(resolveDeploymentMode({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toBe('preview')
  })

  it('classifies Cloudflare Pages branch builds as preview', () => {
    expect(resolveDeploymentMode({ NODE_ENV: 'production', CF_PAGES_BRANCH: 'well-11' })).toBe('preview')
  })

  it('falls back to NODE_ENV when Vercel does not set an environment', () => {
    expect(resolveDeploymentMode({ NODE_ENV: 'production' })).toBe('production')
    expect(resolveDeploymentMode({ NODE_ENV: 'development' })).toBe('development')
    expect(resolveDeploymentMode({ NODE_ENV: 'test' })).toBe('test')
  })
})

describe('bootValidationClass', () => {
  it('holds only hosted production to the production secret set', () => {
    expect(bootValidationClass({ NODE_ENV: 'production', VERCEL_ENV: 'production' })).toBe('production')
    expect(bootValidationClass({ NODE_ENV: 'production' })).toBe('production')
    expect(bootValidationClass({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toBe('development')
    expect(bootValidationClass({ NODE_ENV: 'development' })).toBe('development')
  })
})

describe('clerkMiddlewareConfigured', () => {
  it('requires both Clerk secrets before mounting middleware', () => {
    expect(clerkMiddlewareConfigured({})).toBe(false)
    expect(clerkMiddlewareConfigured({ CLERK_SECRET_KEY: 'sk_test_x' })).toBe(false)
    expect(clerkMiddlewareConfigured({
      CLERK_SECRET_KEY: 'sk_test_x',
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_x',
    })).toBe(true)
  })
})

describe('vercelPreviewHosts', () => {
  it('returns no hosts outside preview', () => {
    expect(vercelPreviewHosts({
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      VERCEL_URL: 'app.aecon.ai',
    })).toEqual([])
  })

  it('reads Vercel-assigned preview hosts only', () => {
    expect(vercelPreviewHosts({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'agentic-economy-cenm1yked-creasybears-projects.vercel.app',
      VERCEL_BRANCH_URL: 'agentic-economy-git-well-11-creasybears-projects.vercel.app',
    })).toEqual([
      'agentic-economy-cenm1yked-creasybears-projects.vercel.app',
      'agentic-economy-git-well-11-creasybears-projects.vercel.app',
    ])
  })
})
