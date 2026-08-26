import Stripe from 'stripe'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { digestMetadata } from '@/lib/server/stripe-money-provider-config'
import { Route } from '@/routes/api.stripe.webhook'

const stripeBoundary = vi.hoisted(() => ({
  retrieveCheckout: vi.fn(),
}))

vi.mock('stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('stripe')>()
  class RuntimeStripe extends actual.default {
    constructor(...args: ConstructorParameters<typeof actual.default>) {
      super(...args)
      Reflect.set(this.checkout.sessions, 'retrieve', stripeBoundary.retrieveCheckout)
    }
  }
  return { ...actual, default: RuntimeStripe }
})

const EVENT_ID = 'evt_phase_2_runtime_sink'
const SESSION_ID = 'cs_phase_2_runtime_sink'
const COMMAND_REF = 'command:phase-2-runtime-sink'
const WEBHOOK_SECRET = 'whsec_phase_2_runtime_sink'
const SUCCESS_RETURN_REF = 'https://agentic-economy.example/credit/return'

type StripeWebhookPost = (input: Readonly<{ request: Request }>) => Promise<Response>
const stripeWebhookPostRuntime = (
  Route.options.server?.handlers as Readonly<Record<string, unknown>> | undefined
)?.POST as StripeWebhookPost | undefined

function checkoutSession() {
  return {
    id: SESSION_ID,
    object: 'checkout.session',
    amount_total: 1_050,
    client_reference_id: COMMAND_REF,
    client_secret: 'cs_secret_runtime_sink',
    created: 1_700_000_000,
    currency: 'usd',
    livemode: false,
    metadata: { ae_command_ref: COMMAND_REF },
    mode: 'payment',
    payment_intent: 'pi_phase_2_runtime_sink',
    payment_status: 'paid',
    status: 'complete',
    ui_mode: 'elements',
    return_url: SUCCESS_RETURN_REF,
    line_items: {
      object: 'list',
      data: [{
        id: 'li_phase_2_runtime_sink',
        object: 'item',
        amount_subtotal: 1_050,
        amount_total: 1_050,
        currency: 'usd',
        description: 'AE credit',
        price: null,
        quantity: 1,
        discounts: [],
        taxes: [],
      }],
      has_more: false,
      url: `/v1/checkout/sessions/${SESSION_ID}/line_items`,
    },
  }
}

function signedCheckoutRequest(signatureOverride?: string): Request {
  const rawBody = JSON.stringify({
    id: EVENT_ID,
    object: 'event',
    api_version: Stripe.API_VERSION,
    created: 1_700_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: 'checkout.session.completed',
    data: { object: checkoutSession() },
  })
  const signature = signatureOverride ?? new Stripe('sk_test_phase_2_runtime_sink')
    .webhooks.generateTestHeaderString({
      payload: rawBody,
      secret: WEBHOOK_SECRET,
      timestamp: Math.floor(Date.now() / 1_000),
    })
  return new Request('https://agentic-economy.example/api/stripe/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': signature,
    },
    body: rawBody,
  })
}

describe('Phase 2 registered runtime sink handlers', () => {
  afterEach(() => {
    setPublicSourceTransportForTests(undefined)
    stripeBoundary.retrieveCheckout.mockReset()
    vi.unstubAllEnvs()
  })

  it('runs the registered Stripe webhook route through signature verification and preserves applied then replayed outcomes', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_phase_2_runtime_sink')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET)
    vi.stubEnv('VITE_STRIPE_PUBLISHABLE_KEY', 'pk_test_phase_2_runtime_sink')
    vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', 'server-function-token-with-at-least-32-bytes')
    vi.stubEnv('AE_SOURCE_WRITE_SECRET', 'source-write-secret-with-at-least-32-bytes')
    stripeBoundary.retrieveCheckout.mockResolvedValue(checkoutSession())
    const appliedEvents = new Set<string>()
    const calls: string[] = []
    setPublicSourceTransportForTests({
      query: async (reference: FunctionReference<'query'>) => {
        calls.push(getFunctionName(reference))
        return {
          kind: 'accepted',
          command: {
          commandRef: COMMAND_REF,
          principalId: 'principal:phase-2-runtime-sink',
          accountRef: 'account:phase-2-runtime-sink',
          amountUnits: '1000',
          processingFeeUnits: '50',
          chargeAmountUnits: '1050',
          currency: 'USD',
          exponent: 2,
          idempotencyKey: 'idempotency:phase-2-runtime-sink',
          inputDigest: `sha256:${'a'.repeat(64)}`,
          metadataDigest: digestMetadata({ ae_command_ref: COMMAND_REF }),
          successReturnRef: SUCCESS_RETURN_REF,
          providerRecoveryDeadlineAt: Number.MAX_SAFE_INTEGER,
          state: 'pending',
          externalRef: SESSION_ID,
          },
        } as never
      },
      mutation: vi.fn(),
      action: async (reference: FunctionReference<'action'>, args: Record<string, unknown>) => {
        calls.push(getFunctionName(reference))
        const event = args.event as { stripeEventId?: string }
        const replay = event.stripeEventId !== undefined && appliedEvents.has(event.stripeEventId)
        if (event.stripeEventId !== undefined) appliedEvents.add(event.stripeEventId)
        return { kind: 'accepted', status: replay ? 'replayed' : 'applied' } as never
      },
    } as never)
    expect(typeof stripeWebhookPostRuntime).toBe('function')
    if (stripeWebhookPostRuntime === undefined) throw new Error('stripe_webhook_POST_missing')

    const applied = await stripeWebhookPostRuntime({ request: signedCheckoutRequest() })
    if (!(applied instanceof Response)) throw new Error('stripe_webhook_response_missing')
    const appliedBody = await applied.json()
    expect(appliedBody).toEqual({
      kind: 'accepted',
      status: 'applied',
    })
    expect(applied.status).toBe(200)

    const replayed = await stripeWebhookPostRuntime({ request: signedCheckoutRequest() })
    if (!(replayed instanceof Response)) throw new Error('stripe_webhook_replay_response_missing')
    expect(replayed.status).toBe(200)
    await expect(replayed.json()).resolves.toEqual({
      kind: 'accepted',
      status: 'replayed',
    })
    expect(appliedEvents).toEqual(new Set([EVENT_ID]))
    expect(calls).toEqual([
      'moneyLedger:readCreditTopupWebhookCommand',
      'moneyLedger:applyVerifiedStripeEvent',
      'moneyLedger:readCreditTopupWebhookCommand',
      'moneyLedger:applyVerifiedStripeEvent',
    ])

    const invalid = await stripeWebhookPostRuntime({ request: signedCheckoutRequest('invalid-signature') })
    if (!(invalid instanceof Response)) throw new Error('stripe_webhook_invalid_response_missing')
    expect(invalid.status).toBe(400)
    await expect(invalid.json()).resolves.toMatchObject({ code: 'payment_binding_invalid' })
    expect(calls).toHaveLength(4)
    expect(appliedEvents).toEqual(new Set([EVENT_ID]))
  })
})
