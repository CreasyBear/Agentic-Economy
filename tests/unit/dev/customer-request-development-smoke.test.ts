import { describe, expect, it } from 'vitest'

import { customerRequestDevelopmentSmokeConfig } from '../../../tools/dev/customer-request-development-smoke'

describe('customer Request development smoke configuration', () => {
  it('binds the exact checkout and Convex dev deployment to a loopback journey', () => {
    expect(customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_DIRECT_PROVIDER_ORIGINS_JSON: 'production configuration must not leak into dev',
    }, 'a'.repeat(40))).toMatchObject({
      baseUrl: 'http://127.0.0.1:3002',
      convexDeployment: 'convex:loyal-peacock-107',
      sourceRevision: 'a'.repeat(40),
      expectedRoute: {
        stepCount: 2,
        businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
      },
    })
  })

  it('rejects production or ambiguous Convex deployment coordinates', () => {
    expect(() => customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'prod:main',
    }, 'a'.repeat(40))).toThrow('CONVEX_DEPLOYMENT must name an exact dev deployment')
  })

  it('requires an exact committed source revision', () => {
    expect(() => customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
    }, 'dirty')).toThrow('development source revision must be an exact Git commit')
  })

  it('selects the canonical cancellation and recovery journey explicitly', () => {
    expect(customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_FINISH: 'cancel',
    }, 'a'.repeat(40))).toMatchObject({ finish: 'cancel' })
  })
})
