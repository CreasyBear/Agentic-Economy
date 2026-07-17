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

  it('binds a public HTTPS development journey to a separately trusted exact origin', () => {
    expect(customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_BASE_URL: 'https://jc-mbp.tail4d4766.ts.net/',
      AE_CUSTOMER_REQUEST_TRUSTED_DEVELOPMENT_ORIGIN: 'https://jc-mbp.tail4d4766.ts.net',
    }, 'a'.repeat(40))).toMatchObject({
      baseUrl: 'https://jc-mbp.tail4d4766.ts.net',
      trustedDevelopmentOrigin: 'https://jc-mbp.tail4d4766.ts.net',
      convexDeployment: 'convex:loyal-peacock-107',
      sourceRevision: 'a'.repeat(40),
    })
  })

  it.each([
    [undefined, 'AE_CUSTOMER_REQUEST_TRUSTED_DEVELOPMENT_ORIGIN is required'],
    ['https://attacker.example', 'must exactly match AE_CUSTOMER_REQUEST_BASE_URL'],
    ['https://user@jc-mbp.tail4d4766.ts.net', 'must exactly match AE_CUSTOMER_REQUEST_BASE_URL'],
    ['https://jc-mbp.tail4d4766.ts.net/private', 'must exactly match AE_CUSTOMER_REQUEST_BASE_URL'],
  ])('refuses an HTTPS development journey without the same exact trusted origin', (
    trustedDevelopmentOrigin,
    expected,
  ) => {
    expect(() => customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_BASE_URL: 'https://jc-mbp.tail4d4766.ts.net',
      AE_CUSTOMER_REQUEST_TRUSTED_DEVELOPMENT_ORIGIN: trustedDevelopmentOrigin,
    }, 'a'.repeat(40))).toThrow(expected)
  })

  it('refuses a non-origin HTTPS development base before creating journey credentials', () => {
    expect(() => customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_BASE_URL: 'https://jc-mbp.tail4d4766.ts.net/private',
      AE_CUSTOMER_REQUEST_TRUSTED_DEVELOPMENT_ORIGIN: 'https://jc-mbp.tail4d4766.ts.net',
    }, 'a'.repeat(40))).toThrow('AE_CUSTOMER_REQUEST_BASE_URL must be an exact HTTPS origin')
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

  it('selects cancellation after the current released step explicitly', () => {
    expect(customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_FINISH: 'cancel_after_current',
    }, 'a'.repeat(40))).toMatchObject({ finish: 'cancel_after_current' })
  })

  it.each([
    'adapter_cancel_accepted',
    'adapter_cancel_rejected',
    'adapter_cancel_unknown',
  ] as const)('selects the %s provider-cancellation journey explicitly', (finish) => {
    expect(customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_FINISH: finish,
    }, 'a'.repeat(40))).toMatchObject({ finish })
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

  it('selects an exact-scope repeat-permission journey explicitly', () => {
    expect(customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_FINISH: 'complete',
      AE_CUSTOMER_REQUEST_REPEAT_PERMISSION: 'true',
    }, 'a'.repeat(40))).toMatchObject({
      finish: 'complete',
      repeatPermission: true,
    })
  })

  it('refuses repeat-permission proof on a non-completing journey', () => {
    expect(() => customerRequestDevelopmentSmokeConfig({
      CLERK_SECRET_KEY: 'sk_test',
      AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID: 'ins_dev',
      AE_CUSTOMER_REQUEST_CLERK_SUBJECT: 'user_dev',
      CONVEX_DEPLOYMENT: 'dev:loyal-peacock-107',
      AE_CUSTOMER_REQUEST_FINISH: 'cancel',
      AE_CUSTOMER_REQUEST_REPEAT_PERMISSION: 'true',
    }, 'a'.repeat(40))).toThrow(
      'Repeat-permission development proof requires AE_CUSTOMER_REQUEST_FINISH=complete',
    )
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
