import { describe, expect, it } from 'vitest'

import {
  issueStandingMandate,
  createDevelopmentStandingMandateGrantVerifier,
  StandingMandateStore,
  type AuthorityUseMaterial,
} from '@/modules/action-invocation'
import { createDevelopmentReservationAction } from '@/modules/booking/development-booking.actions'
import {
  bookingActor,
  bookingInput,
  developmentBookingNow,
} from '@/modules/booking/development-booking-fixture'
import { createDevelopmentBookingProvider } from '@/modules/booking/development-booking-provider'
import { runReservationInvocation } from '@/modules/booking/development-booking-runner'
import { createDevelopmentBookingMandateService } from '@/modules/booking/development-booking-mandate'

const now = developmentBookingNow()
const principalRef = 'request-owner:mock:request:mandated'
const callerRef = 'request:mock:request:mandated'
const mandate = issueStandingMandate({
  mandateRef: 'mock:standing-mandate:booking',
  version: 1,
  generation: 1,
  grantorRef: 'mock:grantor:customer',
  principalRef,
  delegateRef: 'mock:delegate:agent',
  callerRef,
  issuedAt: now,
  scope: {
    objective: 'Reserve suitable development consultation times.',
    action: { id: createDevelopmentReservationAction.id, version: 'v1' },
    providerRefs: ['mock:provider:calendar'],
    recipientRefs: ['mock:provider:calendar'],
    purposes: ['create_development_reservation'],
    allowedDataFields: ['customer.name', 'customer.email'],
    maximumSpend: { amountMinor: 0, currency: 'AUD' },
    maximumActionCount: 3,
    maximumConcurrentReservations: 1,
    startsAt: now,
    expiresAt: '2026-07-19T05:00:00.000Z',
    permittedFallbacks: ['none'],
    riskCeiling: 'development_booking_zero_charge',
  },
})

function use(overrides: Partial<AuthorityUseMaterial> = {}): AuthorityUseMaterial {
  return {
    authorityUseRef: 'mock:authority-use:1',
    mandateRef: mandate.mandateRef,
    mandateVersion: 1,
    mandateGeneration: 1,
    callerRef,
    principalRef,
    delegateRef: mandate.delegateRef,
    invocationRef: 'mock:invocation:1',
    action: mandate.scope.action,
    preparedMaterialDigest: 'sha256:prepared',
    providerRef: 'mock:provider:calendar',
    recipientRef: 'mock:provider:calendar',
    purpose: 'create_development_reservation',
    dataFields: ['customer.name', 'customer.email'],
    reservedSpend: { amountMinor: 0, currency: 'AUD' },
    fallbackRef: null,
    risk: 'development_booking_zero_charge',
    effectGeneration: 1,
    ...overrides,
  }
}

function issuedStore() {
  const store = new StandingMandateStore()
  const verifier = createDevelopmentStandingMandateGrantVerifier({
    admittedMandateDigest: mandate.digest,
    evidenceRef: 'mock:grant-evidence:1',
    verifierRef: 'mock:grant-verifier:1',
    source: 'mock:authenticated-principal-grant:v1',
    freshUntil: '2026-07-19T04:30:00.000Z',
  })
  const admission = verifier(mandate, now)
  if (!admission.authenticated) throw new Error(admission.reason)
  expect(store.issue(mandate, admission, now).kind).toBe('accepted')
  return store
}

function bookingService(store: StandingMandateStore) {
  return createDevelopmentBookingMandateService({
    store,
    authenticatedDelegate: { delegateRef: mandate.delegateRef, callerRef, principalRef },
    now: developmentBookingNow,
  })
}

describe('Action Invocation bounded standing mandate', () => {
  it('executes Request-owned and standalone booking through one mandate and exact authority uses', async () => {
    const store = issuedStore()
    const service = bookingService(store)
    const provider = createDevelopmentBookingProvider()
    const slot = await provider.availability()
    const requestOrigin = { kind: 'request_owned', requestRef: 'mock:request:mandated', revision: 1 } as const
    const standaloneOrigin = { kind: 'standalone', callerRef, principalRef } as const

    const runs = []
    for (const [index, origin] of [requestOrigin, standaloneOrigin].entries()) {
      const material = use({
        authorityUseRef: `mock:authority-use:origin:${index}`,
        invocationRef: `replaced-by-runner:${index}`,
      })
      const run = await runReservationInvocation({
        provider,
        booking: bookingInput(slot, bookingActor(origin).principalRef, `mock:operation:mandated:${index}`),
        origin,
        ref: `mandated:${index}`,
        boundedMandate: {
          service,
          mandateRef: mandate.mandateRef,
          authorityUseRef: material.authorityUseRef,
        },
      })
      expect(run.view.observedResolution).toMatchObject({
        state: 'returned',
        result: { kind: 'reservation_confirmed' },
      })
      expect(store.inspectUse(material.authorityUseRef)).toMatchObject({
        state: 'released',
        mandateGeneration: 1,
        invocationRef: run.view.invocationRef,
        preparedMaterialDigest: run.view.prepared?.materialInputDigest,
        effectGeneration: 1,
      })
      runs.push(run)
    }
    expect(store.capacity(mandate.mandateRef)).toMatchObject({
      consumedCount: 2,
      reservedCount: 0,
      consumedSpendMinor: 0,
    })
    expect(provider.effectCount()).toBe(2)
    expect(runs.flatMap(({ events }) => events).filter(({ kind }) => kind === 'authority_decision')).toHaveLength(0)
    expect(runs.flatMap(({ events }) => events)
      .filter(({ kind }) => kind === 'standing_mandate_authorization')).toHaveLength(2)
    const coldMandates = new StandingMandateStore(structuredClone(store.exportSnapshot()))
    expect(coldMandates.capacity(mandate.mandateRef).consumedCount).toBe(2)
    for (const run of runs) {
      expect(run.tracer.coldResume(run.view.invocationRef).inspect(run.view.invocationRef))
        .toMatchObject({
          invocationRef: run.view.invocationRef,
          observedResolution: { state: 'returned', result: { kind: 'reservation_confirmed' } },
        })
    }
  })

  it('requires authenticated grant admission and refuses self-authored, stale, mismatched, and tampered evidence', () => {
    const store = new StandingMandateStore()
    const verifier = createDevelopmentStandingMandateGrantVerifier({
      admittedMandateDigest: mandate.digest,
      evidenceRef: 'mock:grant-evidence:test',
      verifierRef: 'mock:grant-verifier:test',
      source: 'mock:authenticated-principal-grant:v1',
      freshUntil: '2026-07-19T04:30:00.000Z',
    })
    const grant = verifier(mandate, now)
    if (!grant.authenticated) throw new Error(grant.reason)
    expect(store.issue(mandate, { ...grant, principalRef: 'self-authored' }, now))
      .toEqual({ kind: 'refused', code: 'mandate_grant_unauthenticated' })
    expect(store.issue(mandate, grant, grant.freshUntil))
      .toEqual({ kind: 'refused', code: 'mandate_grant_unauthenticated' })
    expect(store.issue({ ...mandate, principalRef: 'mismatch' }, grant, now))
      .toEqual({ kind: 'refused', code: 'mandate_integrity_invalid' })
    expect(store.issue(mandate, { ...grant, digest: 'sha256:tampered' }, now))
      .toEqual({ kind: 'refused', code: 'mandate_grant_unauthenticated' })
  })

  it('derives actual actor and booking scope instead of trusting caller-supplied use material', async () => {
    const store = issuedStore()
    const provider = createDevelopmentBookingProvider()
    const slot = await provider.availability()
    const wrongActorService = createDevelopmentBookingMandateService({
      store,
      authenticatedDelegate: {
        delegateRef: mandate.delegateRef,
        callerRef: 'mock:caller:wrong',
        principalRef,
      },
      now: developmentBookingNow,
    })
    await expect(runReservationInvocation({
      provider,
      booking: bookingInput(slot, principalRef, 'mock:operation:actual-actor-mismatch'),
      origin: { kind: 'standalone', callerRef, principalRef },
      ref: 'actual-actor-mismatch',
      boundedMandate: {
        service: wrongActorService,
        mandateRef: mandate.mandateRef,
        authorityUseRef: 'mock:authority-use:actual-actor-mismatch',
      },
    })).rejects.toThrow('mandate_principal_mismatch')
    expect(provider.effectCount()).toBe(0)

    const service = bookingService(store)
    await expect(runReservationInvocation({
      provider,
      booking: {
        ...bookingInput(slot, principalRef, 'mock:operation:actual-booking-mismatch'),
        disclosure: {
          fields: ['customer.name', 'customer.email'],
          recipient: 'mock:provider:wrong',
          purpose: 'create_development_reservation',
        },
      },
      origin: { kind: 'standalone', callerRef, principalRef },
      ref: 'actual-booking-mismatch',
      boundedMandate: {
        service,
        mandateRef: mandate.mandateRef,
        authorityUseRef: 'mock:authority-use:actual-booking-mismatch',
      },
    })).rejects.toThrow('mandate_recipient_mismatch')
    expect(provider.effectCount()).toBe(0)
  })

  it.each([
    ['mandate_principal_mismatch', { principalRef: 'other' }],
    ['mandate_delegate_mismatch', { delegateRef: 'other' }],
    ['mandate_action_mismatch', { action: { id: 'other.action', version: 'v1' } }],
    ['mandate_provider_mismatch', { providerRef: 'other' }],
    ['mandate_recipient_mismatch', { recipientRef: 'other' }],
    ['mandate_purpose_mismatch', { purpose: 'other' }],
    ['mandate_data_widening', { dataFields: ['customer.name', 'customer.email', 'customer.phone'] }],
    ['mandate_currency_mismatch', { reservedSpend: { amountMinor: 0, currency: 'USD' } }],
    ['mandate_spend_exceeded', { reservedSpend: { amountMinor: 1, currency: 'AUD' } }],
    ['mandate_fallback_mismatch', { fallbackRef: 'other' }],
    ['mandate_risk_exceeded', { risk: 'higher' }],
    ['mandate_caller_mismatch', { callerRef: 'other' }],
  ] as const)('refuses %s scope widening', (code, override) => {
    const store = issuedStore()
    expect(store.reserve(use(override as Partial<AuthorityUseMaterial>), now)).toEqual({ kind: 'refused', code })
  })

  it('refuses expired mandates', () => {
    const store = issuedStore()
    expect(store.reserve(use(), mandate.scope.expiresAt))
      .toEqual({ kind: 'refused', code: 'mandate_expired' })
  })

  it('rechecks revocation immediately before provider release', async () => {
    const store = issuedStore()
    const service = bookingService(store)
    const provider = createDevelopmentBookingProvider()
    const slot = await provider.availability()
    const origin = { kind: 'standalone', callerRef, principalRef } as const
    await expect(runReservationInvocation({
      provider,
      booking: bookingInput(slot, principalRef, 'mock:operation:revoke-before-release'),
      origin,
      ref: 'revoke-before-release',
      boundedMandate: {
        service,
        mandateRef: mandate.mandateRef,
        authorityUseRef: 'mock:authority-use:revoke-before-release',
        afterReservation: () => {
          store.revoke({
            mandateRef: mandate.mandateRef,
            expectedGeneration: 1,
            reason: 'Customer revoked before provider release.',
            revokedAt: '2026-07-19T04:00:01.000Z',
          })
        },
      },
    })).rejects.toThrow('authority_not_accepted')
    expect(provider.effectCount()).toBe(0)
    expect(store.inspectUse('mock:authority-use:revoke-before-release')).toMatchObject({ state: 'not_released' })
  })

  it('atomically refuses concurrent oversubscription and count exhaustion', () => {
    const store = issuedStore()
    expect(store.reserve(use(), now).kind).toBe('accepted')
    expect(store.reserve(use({ authorityUseRef: 'mock:authority-use:2' }), now))
      .toEqual({ kind: 'refused', code: 'mandate_concurrency_exhausted' })
    store.settle('mock:authority-use:1', 'released', now)
    for (const id of ['2', '3']) {
      expect(store.reserve(use({ authorityUseRef: `mock:authority-use:${id}` }), now).kind).toBe('accepted')
      store.settle(`mock:authority-use:${id}`, 'released', now)
    }
    expect(store.reserve(use({ authorityUseRef: 'mock:authority-use:4' }), now))
      .toEqual({ kind: 'refused', code: 'mandate_count_exhausted' })
  })

  it('fences revocation and stale generations without rewriting released effects', () => {
    const store = issuedStore()
    store.reserve(use(), now)
    store.settle('mock:authority-use:1', 'released', now)
    store.reserve(use({ authorityUseRef: 'mock:authority-use:before-revoke' }), now)
    const revoked = store.revoke({
      mandateRef: mandate.mandateRef,
      expectedGeneration: 1,
      reason: 'Customer stopped further booking.',
      revokedAt: '2026-07-19T04:01:00.000Z',
    })
    expect(revoked).toMatchObject({ kind: 'accepted', value: { generation: 2, revoked: { reason: expect.any(String) } } })
    expect(store.reserve(use({ authorityUseRef: 'mock:authority-use:2' }), '2026-07-19T04:02:00.000Z'))
      .toEqual({ kind: 'refused', code: 'mandate_revoked' })
    expect(store.inspectUse('mock:authority-use:1')).toMatchObject({ state: 'released', mandateGeneration: 1 })
  })

  it('holds uncertain capacity until reconciliation settlement and reconstructs cold', () => {
    const store = issuedStore()
    store.reserve(use(), now)
    store.settle('mock:authority-use:1', 'uncertain', now)
    expect(store.reserve(use({ authorityUseRef: 'mock:authority-use:2' }), now))
      .toEqual({ kind: 'refused', code: 'mandate_concurrency_exhausted' })
    const cold = new StandingMandateStore(structuredClone(store.exportSnapshot()))
    expect(cold.capacity(mandate.mandateRef)).toMatchObject({ consumedCount: 0, reservedCount: 1 })
    expect(cold.settle('mock:authority-use:1', 'released', '2026-07-19T04:03:00.000Z').kind).toBe('accepted')
    expect(cold.reserve(use({ authorityUseRef: 'mock:authority-use:2' }), '2026-07-19T04:04:00.000Z').kind)
      .toBe('accepted')
  })

  it('rejects checksummed-record tampering during cold reconstruction', () => {
    const store = issuedStore()
    store.reserve(use(), now)
    const snapshot = structuredClone(store.exportSnapshot())
    ;(snapshot.mandates[0] as { generation: number }).generation = 9
    expect(() => new StandingMandateStore(snapshot)).toThrow('standing_mandate_snapshot_integrity_refused')
    const useSnapshot = structuredClone(store.exportSnapshot())
    ;(useSnapshot.uses[0] as { preparedMaterialDigest: string }).preparedMaterialDigest = 'sha256:tampered'
    expect(() => new StandingMandateStore(useSnapshot))
      .toThrow('standing_mandate_snapshot_authority_use_refused')
  })
})
