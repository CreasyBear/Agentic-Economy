import { describe, expect, it } from 'vitest'

import {
  bootValidationClass,
  clerkMiddlewareConfigured,
  deploymentPaymentEnvironment,
  resolveDeploymentMode,
  vercelPreviewHosts,
} from '@/lib/deployment/environment'

describe('deploymentPaymentEnvironment', () => {
  it.each([
    ['production', 'production'],
    ['development', 'sandbox'],
  ] as const)('maps exact %s declarations to %s', (declaration, expected) => {
    expect(deploymentPaymentEnvironment({ AE_DEPLOYMENT_ENVIRONMENT: declaration })).toBe(expected)
  })

  it.each([
    undefined,
    '',
    ' ',
    '\t\n',
    ' production',
    'production ',
    ' development ',
    '\tdevelopment\n',
    'Production',
    'PRODUCTION',
    'Development',
    'DEVELOPMENT',
    'sandbox',
    'preview',
    'test',
    'staging',
    'invalid',
  ])('returns undefined for unsupported declaration %j', (declaration) => {
    expect(deploymentPaymentEnvironment({ AE_DEPLOYMENT_ENVIRONMENT: declaration })).toBeUndefined()
  })

  it.each([
    ['production', 'production', 'development', 'preview', 'sandbox', 'sk_test_example'],
    ['development', 'sandbox', 'production', 'production', 'live', 'sk_live_example'],
  ] as const)(
    'uses the %s declaration despite conflicting hosting, service and key hints',
    (declaration, expected, nodeEnvironment, vercelEnvironment, serviceMode, stripeKey) => {
      expect(deploymentPaymentEnvironment({
        AE_DEPLOYMENT_ENVIRONMENT: declaration,
        NODE_ENV: nodeEnvironment,
        VERCEL_ENV: vercelEnvironment,
        AE_SERVICE_MODE: serviceMode,
        STRIPE_SECRET_KEY: stripeKey,
        CF_PAGES_BRANCH: 'main',
      })).toBe(expected)
    },
  )

  it.each([
    ['production', 'production', 'live', 'sk_live_example'],
    ['development', 'preview', 'sandbox', 'sk_test_example'],
  ] as const)(
    'returns undefined without a declaration despite %s hosting and payment hints',
    (nodeEnvironment, vercelEnvironment, serviceMode, stripeKey) => {
      expect(deploymentPaymentEnvironment({
        NODE_ENV: nodeEnvironment,
        VERCEL_ENV: vercelEnvironment,
        AE_SERVICE_MODE: serviceMode,
        STRIPE_SECRET_KEY: stripeKey,
        CF_PAGES_BRANCH: 'main',
      })).toBeUndefined()
    },
  )

  it('returns undefined when the environment has no declaration', () => {
    expect(deploymentPaymentEnvironment({})).toBeUndefined()
  })

  it.each(['production', 'development', ' production', undefined])(
    'does not mutate the environment for declaration %j',
    (declaration) => {
      const env = Object.freeze({
        AE_DEPLOYMENT_ENVIRONMENT: declaration,
        NODE_ENV: 'production',
        STRIPE_SECRET_KEY: 'sk_test_example',
      })
      const original = { ...env }

      deploymentPaymentEnvironment(env)

      expect(env).toEqual(original)
    },
  )
})

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
