import { describe, expect, it } from 'vitest'

import {
  createEmptyBusinessActionSourceState,
  createReserveBookingCard,
  mintReserveBookingMandate,
  proposeReserveBooking,
  resolveReserveBookingMode,
} from '@/modules/business-action/public'
import type {
  BusinessEndpointCapabilityDescriptor,
  CapabilityTrustState,
} from '@/modules/capabilities/public'
import { brandNonEmpty } from '@/modules/common/ids'

const businessId = brandNonEmpty('business:booking-demo', 'BusinessId')
const otherBusinessId = brandNonEmpty('business:other', 'BusinessId')
const ownerId = brandNonEmpty('owner:booking-demo', 'OwnerId')
const cardId = brandNonEmpty('business_action_card:reserve-booking', 'BusinessActionCardId')
const mandateId = brandNonEmpty('buyer_mandate:reserve-booking', 'BuyerMandateId')
const sourceHash = brandNonEmpty('hash:reserve-booking-card', 'SourceHash')
const idempotencyKey = brandNonEmpty('operation:reserve-booking', 'OperationKey')
const correlationId = brandNonEmpty('correlation:reserve-booking', 'CorrelationId')

const now = 1_000
const DEFAULT_TTL_MS = 15 * 60_000

const endpoint: BusinessEndpointCapabilityDescriptor = {
  kind: 'business_endpoint',
  originUrl: 'https://booking.example.test',
  manifestUrl: 'https://booking.example.test/.well-known/ae-manifest.json',
  schemaRef: 'ae-endpoint-check:v1',
}

function reserveBookingCard(overrides: { ownerId?: typeof ownerId; publicLabel?: string } = {}) {
  return createReserveBookingCard({
    cardId,
    sourceHash,
    now,
    ...overrides,
  })
}

function reserveBookingMandate(overrides: Partial<Parameters<typeof mintReserveBookingMandate>[0]> = {}) {
  return mintReserveBookingMandate({
    mandateId,
    buyerRef: 'buyer:hash',
    businessId,
    idempotencyKey,
    correlationId,
    now,
    ...overrides,
  })
}

function proposeInput(overrides: Partial<Parameters<typeof proposeReserveBooking>[1]> = {}) {
  return {
    card: reserveBookingCard({ ownerId }),
    mandate: reserveBookingMandate(),
    businessId,
    requestedBy: 'buyer' as const,
    idempotencyKey,
    correlationId,
    now,
    expiresAt: now + 500,
    ...overrides,
  }
}

describe('resolveReserveBookingMode', () => {
  it('uses the direct endpoint path only when a checked endpoint is published', () => {
    const resolution = resolveReserveBookingMode({ endpoint, endpointTrust: 'checked' })

    expect(resolution.mode).toBe('endpoint')
    if (resolution.mode !== 'endpoint') {
      throw new Error('expected endpoint mode')
    }
    expect(resolution.endpoint).toBe(endpoint)
  })

  it('degrades to the written query path when a published endpoint is not checked', () => {
    for (const endpointTrust of ['business_supplied', 'stale', 'contradicted', 'unsupported'] as const satisfies readonly CapabilityTrustState[]) {
      const resolution = resolveReserveBookingMode({ endpoint, endpointTrust })

      expect(resolution.mode, endpointTrust).toBe('query')
      if (resolution.mode !== 'query') {
        throw new Error('expected query mode')
      }
      expect(resolution.reason, endpointTrust).toBe('endpoint_unverified')
    }
  })

  it('degrades to the written query path when no endpoint is published (even if trust reads checked)', () => {
    expect(resolveReserveBookingMode({})).toEqual({ mode: 'query', reason: 'no_published_endpoint' })
    expect(resolveReserveBookingMode({ endpointTrust: 'checked' })).toEqual({
      mode: 'query',
      reason: 'no_published_endpoint',
    })
  })
})

describe('createReserveBookingCard', () => {
  it('builds a proposal-only, owner-approved, non-callable card that never charges', () => {
    const card = reserveBookingCard()

    expect(card.actionSlug).toBe('reserve-booking')
    expect(card.status).toBe('active')
    expect(card.posture).toBe('proposal_only')
    expect(card.callable).toBe(false)
    expect(card.paymentRequired).toBe(false)
    expect(card.ownerApprovalRequired).toBe(true)
    expect(card.receiptRequired).toBe(true)
    expect(card.version).toBe(1)
    expect(card.updatedAt).toBe(now)
    expect(card.sourceHash).toBe(sourceHash)
  })

  it('defaults the public label and omits ownerId unless supplied', () => {
    const withoutOwner = reserveBookingCard()
    expect(withoutOwner.publicLabel).toBe('Request a booking')
    expect(withoutOwner.ownerId).toBeUndefined()
    expect('ownerId' in withoutOwner).toBe(false)

    const labelled = reserveBookingCard({ ownerId, publicLabel: 'Reserve a table' })
    expect(labelled.publicLabel).toBe('Reserve a table')
    expect(labelled.ownerId).toBe(ownerId)
  })
})

describe('mintReserveBookingMandate', () => {
  it('mints a scoped, short-lived mandate with no payment authority', () => {
    const mandate = reserveBookingMandate()

    expect(mandate.allowedActionSlug).toBe('reserve-booking')
    expect(mandate.allowedBusinessId).toBe(businessId)
    expect(mandate.status).toBe('active')
    expect(mandate.createdAt).toBe(now)
    expect(mandate.expiresAt).toBe(now + DEFAULT_TTL_MS)
    expect(mandate.mandateHash.length).toBeGreaterThan(0)
    expect(mandate.maxAmountCents).toBeUndefined()
    expect(mandate.currency).toBeUndefined()
  })

  it('honors an explicit ttl override', () => {
    const mandate = reserveBookingMandate({ ttlMs: 60_000 })

    expect(mandate.expiresAt).toBe(now + 60_000)
  })
})

describe('proposeReserveBooking', () => {
  it('registers the card + mandate and creates a proposed reserve-booking request', () => {
    const state = createEmptyBusinessActionSourceState()

    const result = proposeReserveBooking(state, proposeInput())

    expect(result.kind).toBe('ok')
    expect(result.code).toBe('business_action_request_created')
    if (result.kind !== 'ok') {
      throw new Error('expected request creation')
    }

    expect(result.request.status).toBe('proposed')
    expect(result.request.actionSlug).toBe('reserve-booking')
    expect(result.request.businessId).toBe(businessId)
    expect(result.request.mandateId).toBe(mandateId)
    // proposal-only: AE never carries payment intent into the request.
    expect(result.request.amountCents).toBeUndefined()
    expect(result.request.currency).toBeUndefined()
    // The card + mandate were seeded into the returned state.
    expect(result.state.cards.some((card) => card.id === cardId)).toBe(true)
    expect(result.state.mandates.some((mandate) => mandate.id === mandateId)).toBe(true)
    expect(result.state.requests.some((request) => request.id === result.request.id)).toBe(true)
  })

  it('replays an identical proposal under the same idempotency key without duplicating the request', () => {
    const first = proposeReserveBooking(createEmptyBusinessActionSourceState(), proposeInput())
    if (first.kind !== 'ok') {
      throw new Error('expected first proposal to succeed')
    }

    const replay = proposeReserveBooking(first.state, proposeInput())

    expect(replay.kind).toBe('ok')
    expect(replay.code).toBe('business_action_request_replayed')
    if (replay.kind !== 'ok') {
      throw new Error('expected replay')
    }
    expect(replay.request.id).toBe(first.request.id)
    expect(replay.state.requests).toHaveLength(1)
  })

  it('rejects a mandate bound to a different business than the request', () => {
    const result = proposeReserveBooking(createEmptyBusinessActionSourceState(), proposeInput({
      mandate: reserveBookingMandate({ businessId: otherBusinessId }),
      businessId,
    }))

    expect(result.kind).toBe('error')
    if (result.kind !== 'error') {
      throw new Error('expected mandate rejection')
    }
    expect(result.code).toBe('business_action_mandate_invalid')
  })

  it('rejects an already-expired mandate', () => {
    const result = proposeReserveBooking(createEmptyBusinessActionSourceState(), proposeInput({
      // minted earlier so expiresAt (500) <= propose now (1000)
      mandate: reserveBookingMandate({ now: 0, ttlMs: 500 }),
    }))

    expect(result.kind).toBe('error')
    if (result.kind !== 'error') {
      throw new Error('expected expired-mandate rejection')
    }
    expect(result.code).toBe('business_action_mandate_invalid')
  })
})
