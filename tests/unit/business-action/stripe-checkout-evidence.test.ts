import { describe, expect, it } from 'vitest'

import {
  BusinessActionSlug,
  createCapabilityRequest,
  createEmptyBusinessActionSourceState,
  recordAuthorizationCheckpoint,
} from '@/modules/business-action/public'
import {
  createStripeCheckoutSessionEvidence,
  type StripeCheckoutSessionCreateRequest,
} from '@/modules/business-action/internal/stripe-checkout'
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
