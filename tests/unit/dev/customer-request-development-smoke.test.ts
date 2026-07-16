import { describe, expect, it } from 'vitest'

import { customerRequestDevelopmentSmokeConfig } from '../../../tools/dev/customer-request-development-smoke'

describe('customer Request development smoke configuration', () => {
  it('binds the exact checkout and Convex dev deployment to a loopback journey', () => {
    expect(customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
    }, 'a'.repeat(40))).toMatchObject({
      baseUrl: 'http://127.0.0.1:3002',
      convexDeployment: 'convex:loyal-peacock-107',
      sourceRevision: 'a'.repeat(40),
      expectedRoute: {
        stepCount: 2,
        businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
        recipients: [
          { name: 'Sandbox Route Resolver', purposes: ['resolve_sandbox_service_reference'] },
          { name: 'Sandbox Route Quoter', purposes: ['prepare_sandbox_service_quote'] },
        ],
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

  it('selects the partial-progress unknown-outcome journey explicitly', () => {
    expect(customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_FINISH: 'outcome_unknown',
    }, 'a'.repeat(40))).toMatchObject({ finish: 'outcome_unknown' })
  })

  it('selects the invalid-output journey explicitly', () => {
    expect(customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_FINISH: 'invalid_output',
    }, 'a'.repeat(40))).toMatchObject({ finish: 'invalid_output' })
  })

  it('configures an explicit stale-choice recovery wait', () => {
    expect(customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_EXPIRY_RECOVERY_WAIT_MS: '310000',
    }, 'a'.repeat(40))).toMatchObject({
      expiryRecovery: { waitMs: 310_000 },
    })
  })

  it('rejects an invalid stale-choice recovery wait', () => {
    expect(() => customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_EXPIRY_RECOVERY_WAIT_MS: '0',
    }, 'a'.repeat(40))).toThrow(
      'AE_CUSTOMER_REQUEST_EXPIRY_RECOVERY_WAIT_MS must be a positive integer',
    )
  })

  it('configures an ordinary-language unsupported-operation recovery', () => {
    expect(customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_UNSUPPORTED_RECOVERY_MESSAGE:
        'Instead, resolve a labelled sandbox service and prepare its quote.',
    }, 'a'.repeat(40))).toMatchObject({
      unsupportedRecovery: {
        message: 'Instead, resolve a labelled sandbox service and prepare its quote.',
      },
    })
  })

  it('rejects an empty unsupported-operation recovery message', () => {
    expect(() => customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_UNSUPPORTED_RECOVERY_MESSAGE: ' ',
    }, 'a'.repeat(40))).toThrow(
      'AE_CUSTOMER_REQUEST_UNSUPPORTED_RECOVERY_MESSAGE is required',
    )
  })

  it('admits an explicit frozen direct baseline only beside a completed hosted journey', () => {
    expect(customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_FINISH: 'complete',
      AE_DIRECT_PROVIDER_ORIGINS_JSON: JSON.stringify([
        'https://loyal-peacock-107.convex.site/api/sandbox/providers/route-resolver',
        'https://loyal-peacock-107.convex.site/api/sandbox/providers/route-quoter',
      ]),
      AE_DIRECT_PROVIDER_CREDENTIAL: 'provider-secret',
      AE_DIRECT_PREDECLARED_GAIN: 'recoverable_progress',
      AE_DIRECT_MAXIMUM_TOTAL_COST_JSON: JSON.stringify({ currency: 'AUD', amountMinor: 1_000 }),
    }, 'a'.repeat(40))).toMatchObject({
      directBaseline: {
        predeclaredGain: 'recoverable_progress',
        maximumTotalCost: { currency: 'AUD', amountMinor: 1_000 },
      },
    })
  })

  it('rejects a partially configured direct baseline', () => {
    expect(() => customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_FINISH: 'complete',
      AE_DIRECT_PROVIDER_ORIGINS_JSON: JSON.stringify([
        'https://loyal-peacock-107.convex.site/api/sandbox/providers/route-resolver',
        'https://loyal-peacock-107.convex.site/api/sandbox/providers/route-quoter',
      ]),
    }, 'a'.repeat(40))).toThrow('Direct comparison requires complete explicit configuration')
  })
})
