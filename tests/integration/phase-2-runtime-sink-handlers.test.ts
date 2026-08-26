import Stripe from 'stripe'
import {
  getFunctionName,
  type FunctionReference,
  type PublicHttpAction,
} from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { digestMetadata } from '@/lib/server/stripe-money-provider-config'
import { Route } from '@/routes/api.stripe.webhook'
import { internal } from '../../convex/_generated/api'
import type { ActionCtx } from '../../convex/_generated/server'
import convexHttp from '../../convex/http'
import {
  abortProviderConsequenceJournal,
  attestProviderConsequenceTicket,
  beginProviderConsequenceJournal,
  providerConsequenceX402Rpc,
} from '../../convex/providerConsequenceHttp'
import { secretLifecycleRpc } from '../../convex/secretLifecycleHttp'
import { providerConnectionCleanupRequestDigest } from '@/modules/capability-supply/provider-connection'
import {
  convexTestWithMarketComponents,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'

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
const PROVIDER_JOURNAL_TOKEN = 'a'.repeat(43)
const SECRET_LIFECYCLE_TOKEN = 'b'.repeat(43)

type StripeWebhookPost = (input: Readonly<{ request: Request }>) => Promise<Response>
type RegisteredHttpHandler = (ctx: ActionCtx, request: Request) => Promise<Response>
type RegisteredHttpAction = PublicHttpAction & { _handler: RegisteredHttpHandler }
const beginProviderConsequenceRuntime = beginProviderConsequenceJournal as RegisteredHttpAction
const attestProviderConsequenceRuntime = attestProviderConsequenceTicket as RegisteredHttpAction
const abortProviderConsequenceRuntime = abortProviderConsequenceJournal as RegisteredHttpAction
const providerConsequenceX402Runtime = providerConsequenceX402Rpc as RegisteredHttpAction
const secretLifecycleRuntime = secretLifecycleRpc as RegisteredHttpAction
type DurableRuntimeCall<Kind extends 'query' | 'mutation' | 'action'> = (
  reference: FunctionReference<Kind>,
  args: Record<string, unknown>,
) => Promise<unknown>
const stripeWebhookPostRuntime = (
  Route.options.server?.handlers as Readonly<Record<string, unknown>> | undefined
)?.POST as StripeWebhookPost | undefined

function registeredConvexPost(path: string): RegisteredHttpHandler {
  const match = convexHttp.lookup(path, 'POST')
  if (match === null || match[1] !== 'POST' || match[2] !== path) {
    throw new Error(`registered_convex_POST_missing:${path}`)
  }
  return (match[0] as RegisteredHttpAction)._handler
}

function durableActionContext(
  backend: ConvexFixtureBackend,
  callTrace: string[] = [],
): ActionCtx {
  const mutation = backend.mutation.bind(backend) as unknown as DurableRuntimeCall<'mutation'>
  const query = backend.query.bind(backend) as unknown as DurableRuntimeCall<'query'>
  const action = backend.action.bind(backend) as unknown as DurableRuntimeCall<'action'>
  return {
    runMutation: async (reference: FunctionReference<'mutation'>, args: Record<string, unknown>) => {
      callTrace.push(getFunctionName(reference))
      return await mutation(reference, args)
    },
    runQuery: async (reference: FunctionReference<'query'>, args: Record<string, unknown>) => {
      callTrace.push(getFunctionName(reference))
      return await query(reference, args)
    },
    runAction: async (reference: FunctionReference<'action'>, args: Record<string, unknown>) => {
      callTrace.push(getFunctionName(reference))
      return await action(reference, args)
    },
  } as unknown as ActionCtx
}

function registeredConvexRequest(
  path: string,
  body: unknown,
  token = PROVIDER_JOURNAL_TOKEN,
): Request {
  return new Request(`https://deployment.convex.site${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`
}

const CLEANUP_AUTHORITY = Object.freeze({
  canonicalConnectionRef: `con_${'c'.repeat(32)}`,
  connectionGeneration: 3,
  owningAccountRef: `acc_${'1'.repeat(32)}`,
  actorPrincipalRef: `prn_${'2'.repeat(32)}`,
  accountRevision: 1,
  ownershipRef: `own_${'3'.repeat(32)}`,
  grantRef: `grt_${'4'.repeat(32)}`,
  grantGeneration: 1,
  authorityExpiresAt: 4_000_000_000_000,
})

const SECRET_AUTHORITY = Object.freeze({
  operation: 'rotate' as const,
  snapshotRef: 'das_00000000000040008000000000000121',
  accountRef: 'acc_00000000000040008000000000000121',
  actorPrincipalRef: 'prn_00000000000040008000000000000121',
  grantRef: 'grt_00000000000040008000000000000121',
  grantGeneration: 1,
  correlationRef: 'secret:runtime-sink:rotate',
  idempotencyRef: 'secret:runtime-sink:rotate',
  occurredAt: 5_000,
})

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

  it('runs the registered invocation worker action through durable authority reconciliation and denies an unknown invocation', async () => {
    const backend = convexTestWithMarketComponents()
    const invocationRef = 'invocation:runtime-sink:unknown'

    await expect(backend.action(
      internal.capabilityOperationInvocationWorker.run,
      { invocationRef },
    )).resolves.toEqual({ kind: 'none' })

    const persisted = await backend.run(async (ctx) => await ctx.db
      .query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
      .unique())
    expect(persisted).toBeNull()
  })

  it('runs the registered cleanup worker action through the durable target reader and refuses an unknown connection', async () => {
    const backend = convexTestWithMarketComponents()
    const connectionRef = 'connection:runtime-sink:unknown'
    const expectedAuthorityGeneration = 1
    const expectedAuthorityDigest = digest('c')
    const cleanupAttempt = 1
    const requestDigest = providerConnectionCleanupRequestDigest({
      revocationRef: 'provider-revocation:runtime-sink',
      cleanupAttempt,
      connectionRef,
      expectedAuthorityGeneration,
      expectedAuthorityDigest,
      adapterId: 'http-json:v1',
    })

    await expect(backend.action(
      internal.capabilityProviderConnectionCleanup.run,
      {
        connectionRef,
        commandId: 'provider-cleanup:runtime-sink',
        expectedAuthorityGeneration,
        expectedAuthorityDigest,
        requestDigest,
        cleanupAttempt,
        workKind: 'cleanup',
        resourceAuthority: CLEANUP_AUTHORITY,
      },
    )).resolves.toEqual({
      kind: 'cleanup',
      result: {
        outcome: 'outcome_unknown',
        reasonCode: 'cleanup_target_unavailable',
        evidenceRefs: ['provider_cleanup:cleanup_target_unavailable'],
      },
    })

    const persisted = await backend.run(async (ctx) => await ctx.db
      .query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', connectionRef))
      .unique())
    expect(persisted).toBeNull()
  })

  it('runs the registered provider journal begin route through the durable claim mutation', async () => {
    const backend = convexTestWithMarketComponents()
    const callTrace: string[] = []
    const path = '/internal/provider-consequence/journal/begin'
    expect(registeredConvexPost(path)).toBe(beginProviderConsequenceRuntime._handler)
    const response = await beginProviderConsequenceRuntime._handler(
      durableActionContext(backend, callTrace),
      registeredConvexRequest(path, {
        ticketRef: 'ticket:runtime-sink:unknown',
        effectRef: 'effect:runtime-sink:unknown',
        requestDigest: digest('1'),
        invocationDigest: digest('2'),
        ticketClaimsDigest: digest('3'),
        expiresAt: 4_000_000_000_000,
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ kind: 'unavailable' })
    expect(callTrace).toEqual(['capabilityProviderConsequenceJournal:claimProviderConsequence'])
    await expect(backend.run(async (ctx) => await ctx.db
      .query('providerConsequenceJournal')
      .withIndex('by_ticketRef', (query) => query.eq('ticketRef', 'ticket:runtime-sink:unknown'))
      .unique())).resolves.toBeNull()
  })

  it('runs the registered provider ticket attestation route through the durable ticket query', async () => {
    const backend = convexTestWithMarketComponents()
    const callTrace: string[] = []
    const path = '/internal/provider-consequence/journal/attest'
    expect(registeredConvexPost(path)).toBe(attestProviderConsequenceRuntime._handler)
    const response = await attestProviderConsequenceRuntime._handler(
      durableActionContext(backend, callTrace),
      registeredConvexRequest(path, {
        ticketRef: 'ticket:runtime-sink:unknown',
        ticketClaimsDigest: digest('3'),
        expiresAt: 4_000_000_000_000,
        signingSecretRef: `sec_${'1'.repeat(32)}`,
        signingSecretGeneration: `sgn_${'2'.repeat(32)}`,
        signingSecretPointerRevision: 1,
      }),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ kind: 'unavailable' })
    expect(callTrace).toEqual(['capabilityProviderConsequenceJournal:attestProviderConsequenceTicket'])
  })

  it('runs the registered provider journal abort route through the durable abort mutation', async () => {
    const backend = convexTestWithMarketComponents()
    const callTrace: string[] = []
    const path = '/internal/provider-consequence/journal/abort'
    expect(registeredConvexPost(path)).toBe(abortProviderConsequenceRuntime._handler)
    const response = await abortProviderConsequenceRuntime._handler(
      durableActionContext(backend, callTrace),
      registeredConvexRequest(path, {
        ticketRef: 'ticket:runtime-sink:unknown',
        claimRef: 'claim:runtime-sink:unknown',
      }),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ kind: 'unavailable' })
    expect(callTrace).toEqual(['capabilityProviderConsequenceJournal:abortProviderConsequence'])
  })

  it('runs the registered provider x402 route through durable authorization and never reaches money for an unknown ticket', async () => {
    const backend = convexTestWithMarketComponents()
    const callTrace: string[] = []
    const path = '/internal/provider-consequence/x402'
    expect(registeredConvexPost(path)).toBe(providerConsequenceX402Runtime._handler)
    const response = await providerConsequenceX402Runtime._handler(
      durableActionContext(backend, callTrace),
      registeredConvexRequest(path, {
        ticketRef: 'ticket:runtime-sink:unknown',
        operation: 'reserve_external_spend',
        args: {
          paymentIdentifier: 'payment:runtime-sink',
          challengeDigest: digest('4'),
          amount: { currency: 'USD', units: '1', exponent: 2 },
        },
      }),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ kind: 'unavailable' })
    expect(callTrace).toEqual(['capabilityProviderConsequenceJournal:authorizeProviderConsequenceX402Rpc'])
    await expect(backend.run(async (ctx) => await ctx.db
      .query('moneyTransactions')
      .take(1))).resolves.toEqual([])
  })

  it('runs the registered secret lifecycle route through the durable journal reader without secret material', async () => {
    vi.stubEnv('AE_SECRET_LIFECYCLE_RPC_TOKEN', SECRET_LIFECYCLE_TOKEN)
    const backend = convexTestWithMarketComponents()
    const callTrace: string[] = []
    const path = '/internal/secret-lifecycle'
    expect(registeredConvexPost(path)).toBe(secretLifecycleRuntime._handler)
    const response = await secretLifecycleRuntime._handler(
      durableActionContext(backend, callTrace),
      registeredConvexRequest(path, {
        operation: 'journal_read',
        args: {
          authority: SECRET_AUTHORITY,
          idempotencyRef: SECRET_AUTHORITY.idempotencyRef,
        },
      }, SECRET_LIFECYCLE_TOKEN),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ kind: 'ok', result: null })
    expect(callTrace).toEqual(['secretLifecycleOperations:readLifecycleJournal'])
    await expect(backend.run(async (ctx) => await ctx.db
      .query('secretLifecycleJournal')
      .take(1))).resolves.toEqual([])
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
