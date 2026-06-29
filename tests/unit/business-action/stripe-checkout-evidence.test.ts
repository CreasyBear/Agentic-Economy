import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  BusinessActionSlug,
  createCapabilityRequest,
  createEmptyBusinessActionSourceState,
  recordAuthorizationCheckpoint,
} from '@/modules/business-action/public'
import {
  admitStripeWebhookEvent,
  createStripeCheckoutSessionEvidence,
  type StripeCheckoutSessionCreateRequest,
} from '@/modules/business-action/internal/stripe-checkout'
import { handleBusinessActionStripeWebhookRequest } from '@/routes/api.business-actions.stripe-webhook'
import type {
  AuthorizationCheckpointId,
  BusinessActionCardId,
  BusinessId,
  BuyerMandateId,
  CapabilityRequestId,
  CorrelationId,
  OperationKey,
  OwnerId,
  SourceHash,
} from '@/modules/common/ids'
import type { BusinessActionCard, BuyerMandate, BusinessActionSourceState } from '@/modules/business-action/public'

const now = 4_000
const businessId = 'business:plumbing-demo' as BusinessId
const ownerId = 'owner:plumbing-demo' as OwnerId
const request = 'capability_request:operation:request' as CapabilityRequestId
const checkpoint =
  'authorization_checkpoint:capability_request:operation:request:operation:checkpoint' as AuthorizationCheckpointId

describe('Stripe Checkout Session evidence binding', () => {
  it('creates a test-mode Checkout Session bound to AE source refs and hashes', async () => {
    const createdRequests: StripeCheckoutSessionCreateRequest[] = []
    const result = await createStripeCheckoutSessionEvidence(createAcceptedState(), {
      requestId: request,
      checkpointId: checkpoint,
      clientPayload: {},
      now,
    }, {
      stripeSecretKey: 'sk_test_paid_intake',
      successUrl: 'https://agentic.test/business-actions/stripe/success',
      cancelUrl: 'https://agentic.test/business-actions/stripe/cancel',
      createSession: async (stripeRequest) => {
        createdRequests.push(stripeRequest)
        return {
          id: 'cs_test_paid_intake',
          url: 'https://checkout.stripe.test/cs_test_paid_intake',
          payment_intent: 'pi_test_paid_intake',
        }
      },
    })

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') {
      throw new Error(result.error.reason)
    }
    expect(result.session.testMode).toBe(true)
    expect(result.session.checkoutSessionId).toBe('cs_test_paid_intake')
    expect(result.session.paymentIntentId).toBe('pi_test_paid_intake')
    expect(result.session.payloadHash).toMatch(/^hash:/)
    expect(result.session.providerRefHash).toMatch(/^hash:/)

    expect(createdRequests).toHaveLength(1)
    const [stripeRequest] = createdRequests
    if (stripeRequest === undefined) {
      throw new Error('expected Stripe create request')
    }
    expect(stripeRequest.idempotencyKey).toBe(`business-action:stripe-checkout:${request}:${checkpoint}`)
    expect(stripeRequest.authorizationHeader).toBe('Bearer sk_test_paid_intake')
    expect(stripeRequest.body.get('mode')).toBe('payment')
    expect(stripeRequest.body.get('client_reference_id')).toBe(request)
    expect(stripeRequest.body.get('line_items[0][price_data][currency]')).toBe('aud')
    expect(stripeRequest.body.get('line_items[0][price_data][unit_amount]')).toBe('4500')
    expect(stripeRequest.body.get('success_url')).toBe('https://agentic.test/business-actions/stripe/success')
    expect(stripeRequest.body.get('cancel_url')).toBe('https://agentic.test/business-actions/stripe/cancel')
    expect(stripeRequest.body.get('metadata[ae_action_slug]')).toBe(BusinessActionSlug)
    expect(stripeRequest.body.get('metadata[ae_business_action_request_id]')).toBe(request)
    expect(stripeRequest.body.get('metadata[ae_authorization_checkpoint_id]')).toBe(checkpoint)
    expect(stripeRequest.body.get('metadata[ae_mandate_hash]')).toBe('hash:mandate')
    expect(stripeRequest.body.get('metadata[ae_request_hash]')).toMatch(/^hash:/)
    expect(stripeRequest.body.get('metadata[ae_card_hash]')).toBe('hash:card')
    expect(stripeRequest.body.get('metadata[ae_amount_cents]')).toBe('4500')
    expect(stripeRequest.body.get('metadata[ae_currency]')).toBe('aud')
    expect(stripeRequest.body.get('metadata[ae_idempotency_key]')).toBe('operation:request')
    expect(stripeRequest.body.get('metadata[ae_correlation_id]')).toBe('correlation:request')
  })

  it('rejects client-supplied money provider URL or authority fields before Stripe calls', async () => {
    const forbiddenFields = [
      'amount',
      'amountCents',
      'currency',
      'customer',
      'customerId',
      'providerObjectId',
      'checkoutSessionId',
      'successUrl',
      'cancelUrl',
      'paidState',
      'entitlement',
      'receiptStatus',
    ]

    for (const field of forbiddenFields) {
      let called = false
      const result = await createStripeCheckoutSessionEvidence(createAcceptedState(), {
        requestId: request,
        checkpointId: checkpoint,
        clientPayload: { [field]: 'client-controlled' },
        now,
      }, {
        stripeSecretKey: 'sk_test_paid_intake',
        successUrl: 'https://agentic.test/business-actions/stripe/success',
        cancelUrl: 'https://agentic.test/business-actions/stripe/cancel',
        createSession: async () => {
          called = true
          return { id: 'cs_test_unreachable' }
        },
      })

      expect(result).toMatchObject({
        kind: 'error',
        error: {
          code: 'business_action_stripe_client_field_rejected',
          field,
        },
      })
      expect(called).toBe(false)
    }
  })

  it('rejects live Stripe keys because Phase 6 evidence is test-mode only', async () => {
    let called = false
    const result = await createStripeCheckoutSessionEvidence(createAcceptedState(), {
      requestId: request,
      checkpointId: checkpoint,
      clientPayload: {},
      now,
    }, {
      stripeSecretKey: 'sk_live_forbidden',
      successUrl: 'https://agentic.test/business-actions/stripe/success',
      cancelUrl: 'https://agentic.test/business-actions/stripe/cancel',
      createSession: async () => {
        called = true
        return { id: 'cs_live_forbidden' }
      },
    })

    expect(result).toMatchObject({
      kind: 'error',
      error: {
        code: 'business_action_stripe_live_mode_rejected',
      },
    })
    expect(called).toBe(false)
  })
})

describe('Stripe webhook event admission', () => {
  const webhookSecret = 'whsec_phase6_paid_intake'

  it('accepts checkout.session.completed only when signature and source refs match', () => {
    const state = createAcceptedState()
    const rawBody = stripeEventBody(state, {
      id: 'evt_test_completed',
      type: 'checkout.session.completed',
    })
    const result = admitStripeWebhookEvent(state, {
      rawBody,
      headers: signedStripeHeaders(webhookSecret, rawBody),
      webhookSecret,
      now,
    })

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') {
      throw new Error(result.error.reason)
    }
    expect(result.code).toBe('business_action_stripe_webhook_received')
    expect(result.evidence).toMatchObject({
      provider: 'stripe_test_mode',
      status: 'accepted',
      requestId: request,
      checkpointId: checkpoint,
      amountCents: 4_500,
      currency: 'aud',
    })
    expect(result.evidence.payloadHash).toMatch(/^hash:/)
    expect(result.evidence.providerRefHash).toMatch(/^hash:/)
    expect(result.state.externalEvidenceEvents).toEqual([
      expect.objectContaining({
        provider: 'stripe_test_mode',
        status: 'accepted',
        payloadHash: result.evidence.payloadHash,
      }),
    ])
    expect(JSON.stringify(result)).not.toContain('checkout.session')
    expect(JSON.stringify(result)).not.toContain(rawBody)
  })

  it('rejects invalid signatures before the route forwards anything to source admission', async () => {
    const state = createAcceptedState()
    const rawBody = stripeEventBody(state, { id: 'evt_test_invalid_signature' })
    let forwarded = false
    const response = await handleBusinessActionStripeWebhookRequest(
      new Request('https://agentic.test/api/business-actions/stripe-webhook', {
        method: 'POST',
        body: rawBody,
        headers: signedStripeHeaders(webhookSecret, `${rawBody}tampered`),
      }),
      {
        env: { STRIPE_WEBHOOK_SECRET: webhookSecret },
        now,
        admitWebhook: () => {
          forwarded = true
          return {
            kind: 'error',
            error: { code: 'business_action_stripe_unreachable', reason: 'should_not_forward' },
          }
        },
      }
    )

    await expect(response.json()).resolves.toMatchObject({
      kind: 'error',
      code: 'business_action_stripe_invalid_signature',
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(forwarded).toBe(false)
  })

  it('dedupes exact repeats and holds same-event conflicts for operator review', () => {
    const state = createAcceptedState()
    const rawBody = stripeEventBody(state, { id: 'evt_test_duplicate' })
    const accepted = admitStripeWebhookEvent(state, {
      rawBody,
      headers: signedStripeHeaders(webhookSecret, rawBody),
      webhookSecret,
      now,
    })
    if (accepted.kind !== 'ok') {
      throw new Error('expected accepted event')
    }

    const duplicate = admitStripeWebhookEvent(accepted.state, {
      rawBody,
      headers: signedStripeHeaders(webhookSecret, rawBody),
      webhookSecret,
      now,
    })
    expect(duplicate).toMatchObject({
      kind: 'ok',
      code: 'business_action_stripe_webhook_duplicate',
      evidence: { status: 'duplicate' },
    })

    const conflictBody = stripeEventBody(state, {
      id: 'evt_test_duplicate',
      amountTotal: 4_501,
    })
    const conflict = admitStripeWebhookEvent(accepted.state, {
      rawBody: conflictBody,
      headers: signedStripeHeaders(webhookSecret, conflictBody),
      webhookSecret,
      now,
    })
    expect(conflict).toMatchObject({
      kind: 'ok',
      code: 'business_action_stripe_webhook_held',
      evidence: { status: 'held_for_operator', reason: 'stripe_event_payload_conflict' },
    })
  })

  it('holds unbound wrong amount currency checkpoint expired failed and unknown events', () => {
    const state = createAcceptedState()
    const cases = [
      {
        name: 'unbound',
        body: stripeEventBody(state, { id: 'evt_test_unbound', requestId: 'capability_request:unknown' }),
        reason: 'unbound_provider_event',
      },
      {
        name: 'wrong amount',
        body: stripeEventBody(state, { id: 'evt_test_wrong_amount', amountTotal: 4_501 }),
        reason: 'amount_mismatch',
      },
      {
        name: 'wrong currency',
        body: stripeEventBody(state, { id: 'evt_test_wrong_currency', currency: 'usd' }),
        reason: 'currency_mismatch',
      },
      {
        name: 'wrong checkpoint',
        body: stripeEventBody(state, {
          id: 'evt_test_wrong_checkpoint',
          checkpointId: 'authorization_checkpoint:wrong',
        }),
        reason: 'checkpoint_mismatch',
      },
      {
        name: 'expired',
        body: stripeEventBody(state, { id: 'evt_test_expired', type: 'checkout.session.expired' }),
        reason: 'checkout_session_expired',
      },
      {
        name: 'failed',
        body: stripeEventBody(state, { id: 'evt_test_failed', type: 'payment_intent.payment_failed' }),
        reason: 'payment_intent_failed',
      },
      {
        name: 'unknown',
        body: stripeEventBody(state, { id: 'evt_test_unknown', type: 'customer.created' }),
        reason: 'unsupported_event_type',
      },
    ]

    for (const entry of cases) {
      const result = admitStripeWebhookEvent(state, {
        rawBody: entry.body,
        headers: signedStripeHeaders(webhookSecret, entry.body),
        webhookSecret,
        now,
      })

      expect(result, entry.name).toMatchObject({
        kind: 'ok',
        code: 'business_action_stripe_webhook_held',
        evidence: {
          status: 'held_for_operator',
          reason: entry.reason,
        },
      })
      if (result.kind === 'ok') {
        expect(result.state.externalEvidenceEvents.filter((event) => event.status === 'accepted')).toHaveLength(0)
      }
    }
  })
})

function createAcceptedState(): BusinessActionSourceState {
  const requested = createCapabilityRequest(
    createEmptyBusinessActionSourceState({ cards: [card()], mandates: [mandate()] }),
    {
      actionSlug: BusinessActionSlug,
      cardId: card().id as BusinessActionCardId,
      mandateId: mandate().id,
      businessId,
      amountCents: 4_500,
      currency: 'aud',
      requestedBy: 'hermes',
      idempotencyKey: 'operation:request' as OperationKey,
      correlationId: 'correlation:request' as CorrelationId,
      now,
      expiresAt: now + 500,
    }
  )
  if (requested.kind !== 'ok') {
    throw new Error('fixture request creation failed')
  }

  const checked = recordAuthorizationCheckpoint(requested.state, {
    requestId: request,
    decision: 'accepted',
    authority: {
      ownerId,
      actorRef: 'clerk:user:owner',
      businessIds: [businessId],
      status: 'active',
    },
    ownerDecisionRef: 'owner-decision:approval',
    reasonCode: 'owner_approved',
    idempotencyKey: 'operation:checkpoint' as OperationKey,
    correlationId: 'correlation:checkpoint' as CorrelationId,
    now: now + 10,
    expiresAt: now + 400,
  })
  if (checked.kind !== 'ok') {
    throw new Error('fixture checkpoint failed')
  }

  return checked.state
}

function card(overrides: Partial<BusinessActionCard> = {}): BusinessActionCard {
  return {
    id: 'business_action_card:paid-intake' as BusinessActionCardId,
    actionSlug: BusinessActionSlug,
    version: 1,
    ownerId,
    sourceHash: 'hash:card' as SourceHash,
    status: 'active',
    publicLabel: 'Provision paid intake endpoint',
    posture: 'proposal_only',
    callable: false,
    paymentRequired: false,
    ownerApprovalRequired: true,
    receiptRequired: true,
    updatedAt: now - 10,
    ...overrides,
  }
}

function mandate(overrides: Partial<BuyerMandate> = {}): BuyerMandate {
  return {
    id: 'buyer_mandate:paid-intake' as BuyerMandateId,
    buyerRef: 'buyer:hash',
    allowedBusinessId: businessId,
    allowedActionSlug: BusinessActionSlug,
    maxAmountCents: 5_000,
    currency: 'aud',
    status: 'active',
    mandateHash: 'hash:mandate' as SourceHash,
    idempotencyKey: 'operation:mandate' as OperationKey,
    correlationId: 'correlation:mandate' as CorrelationId,
    createdAt: now - 100,
    expiresAt: now + 1_000,
    ...overrides,
  }
}

function stripeEventBody(
  state: BusinessActionSourceState,
  overrides: Partial<{
    id: string
    type: string
    requestId: string
    checkpointId: string
    amountTotal: number
    currency: string
  }> = {}
): string {
  const sourceRequest = state.requests[0]
  const sourceCheckpoint = state.checkpoints[0]
  if (sourceRequest === undefined || sourceCheckpoint === undefined) {
    throw new Error('stripe webhook fixture needs accepted source state')
  }

  const requestId = overrides.requestId ?? sourceRequest.id
  const checkpointId = overrides.checkpointId ?? sourceCheckpoint.id

  return JSON.stringify({
    id: overrides.id ?? 'evt_test_completed',
    type: overrides.type ?? 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_paid_intake',
        object: 'checkout.session',
        payment_intent: 'pi_test_paid_intake',
        client_reference_id: requestId,
        amount_total: overrides.amountTotal ?? sourceRequest.amountCents,
        currency: overrides.currency ?? sourceRequest.currency,
        metadata: {
          ae_action_slug: BusinessActionSlug,
          ae_business_action_request_id: requestId,
          ae_authorization_checkpoint_id: checkpointId,
          ae_mandate_hash: sourceRequest.mandateHash,
          ae_request_hash: sourceRequest.requestHash,
          ae_card_hash: sourceRequest.cardHash,
          ae_amount_cents: String(overrides.amountTotal ?? sourceRequest.amountCents),
          ae_currency: overrides.currency ?? sourceRequest.currency,
          ae_idempotency_key: sourceRequest.idempotencyKey,
          ae_correlation_id: sourceRequest.correlationId,
        },
      },
    },
  })
}

function signedStripeHeaders(secret: string, rawBody: string, timestamp = Math.floor(now / 1_000)): Headers {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  return new Headers({
    'content-type': 'application/json',
    'stripe-signature': `t=${timestamp},v1=${signature}`,
  })
}
