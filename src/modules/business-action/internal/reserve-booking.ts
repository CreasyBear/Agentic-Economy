import { brandNonEmpty } from '@/modules/common/ids'
import type {
  BusinessActionCardId,
  BusinessId,
  BuyerMandateId,
  CorrelationId,
  OperationKey,
  OwnerId,
  SourceHash,
} from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'
import type {
  BusinessEndpointCapabilityDescriptor,
  CapabilityTrustState,
} from '@/modules/capabilities/public'

import { ReserveBookingActionSlug, type BusinessActionCard, type BuyerMandate } from './schema'
import { createCapabilityRequest, type BusinessActionSourceState, type CreateCapabilityRequestResult } from './business-action'

/**
 * Reserve-booking fulfilment mode.
 *
 * A reserve-booking proposal is always proposal-only + owner-approved (the card
 * defaults enforce it). How the *approved* booking is fulfilled depends on what
 * the business published:
 *  - `endpoint`: the business exposes a checked booking endpoint AE can hand the
 *    approved reservation to (interface with the business's booking platform).
 *  - `query`: no checked endpoint, so the reservation degrades to a written
 *    query the business owner reviews and confirms on reply.
 *
 * AE never books, charges, or confirms in either mode — it proposes and records.
 */
export type ReserveBookingMode = 'endpoint' | 'query'

export type ReserveBookingResolution =
  | { mode: 'endpoint'; endpoint: BusinessEndpointCapabilityDescriptor }
  | { mode: 'query'; reason: 'no_published_endpoint' | 'endpoint_unverified' }

/**
 * Resolve how a reservation should be fulfilled. Only a business-supplied
 * endpoint that has been independently `checked` is trusted for the direct path;
 * anything else falls back to the written query path.
 */
export function resolveReserveBookingMode(input: {
  endpoint?: BusinessEndpointCapabilityDescriptor
  endpointTrust?: CapabilityTrustState
}): ReserveBookingResolution {
  if (input.endpoint !== undefined && input.endpointTrust === 'checked') {
    return { mode: 'endpoint', endpoint: input.endpoint }
  }

  return {
    mode: 'query',
    reason: input.endpoint === undefined ? 'no_published_endpoint' : 'endpoint_unverified',
  }
}

/** Build a proposal-only reserve-booking card. The type enforces the boundary. */
export function createReserveBookingCard(input: {
  cardId: BusinessActionCardId
  ownerId?: OwnerId
  sourceHash: SourceHash
  publicLabel?: string
  now: number
}): BusinessActionCard {
  return {
    id: input.cardId,
    actionSlug: ReserveBookingActionSlug,
    version: 1,
    ...(input.ownerId === undefined ? {} : { ownerId: input.ownerId }),
    sourceHash: input.sourceHash,
    status: 'active',
    publicLabel: input.publicLabel ?? 'Request a booking',
    posture: 'proposal_only',
    callable: false,
    paymentRequired: false,
    ownerApprovalRequired: true,
    receiptRequired: true,
    updatedAt: input.now,
  }
}

const RESERVE_BOOKING_MANDATE_TTL_MS = 15 * 60_000

/**
 * Mint an AE-issued, scoped, single-use mandate for a human reserve-booking
 * proposal. Bound to one business + the reserve-booking slug, no payment
 * authority, short-lived. Agent callers supply their own signed mandate instead.
 */
export function mintReserveBookingMandate(input: {
  mandateId: BuyerMandateId
  buyerRef: string
  businessId: BusinessId
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  now: number
  ttlMs?: number
}): BuyerMandate {
  return {
    id: input.mandateId,
    buyerRef: input.buyerRef,
    allowedBusinessId: input.businessId,
    allowedActionSlug: ReserveBookingActionSlug,
    status: 'active',
    mandateHash: brandNonEmpty(
      `hash:${stableHash({
        mandateId: input.mandateId,
        businessId: input.businessId,
        actionSlug: ReserveBookingActionSlug,
        buyerRef: input.buyerRef,
        idempotencyKey: input.idempotencyKey,
      })}`,
      'SourceHash',
    ),
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    createdAt: input.now,
    expiresAt: input.now + (input.ttlMs ?? RESERVE_BOOKING_MANDATE_TTL_MS),
  }
}

/**
 * Propose a reserve-booking: register the card + mandate into source state, then
 * create the capability request. The result flows into the existing owner
 * authorization checkpoint + receipt spine unchanged.
 */
export function proposeReserveBooking(
  state: BusinessActionSourceState,
  input: {
    card: BusinessActionCard
    mandate: BuyerMandate
    businessId: BusinessId
    requestedBy: 'buyer' | 'hermes' | 'operator'
    idempotencyKey: OperationKey
    correlationId: CorrelationId
    now: number
    expiresAt: number
  },
): CreateCapabilityRequestResult {
  const seeded: BusinessActionSourceState = {
    ...state,
    cards: upsertById(state.cards, input.card),
    mandates: upsertById(state.mandates, input.mandate),
  }

  return createCapabilityRequest(seeded, {
    actionSlug: ReserveBookingActionSlug,
    cardId: input.card.id as BusinessActionCardId,
    mandateId: input.mandate.id,
    businessId: input.businessId,
    requestedBy: input.requestedBy,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    now: input.now,
    expiresAt: input.expiresAt,
  })
}

function upsertById<T extends { id: string | { toString(): string } }>(
  items: readonly T[],
  item: T,
): readonly T[] {
  return [...items.filter((existing) => existing.id !== item.id), item]
}
