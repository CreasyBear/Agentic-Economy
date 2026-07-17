import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  exportState,
  routeAttemptIntegrityValid,
  routeDispatchIntegrityValid,
  routeRunIdentityDigest,
  type RouteAttemptIntegritySnapshot,
  type RouteDispatchIntegritySnapshot,
  type RouteRunIdentitySnapshot,
} from '@/modules/customer-request/route-execution/journal'

const runBase: RouteRunIdentitySnapshot = {
  runRef: 'route-run:v1:abc',
  principalId: 'principal:1',
  requestId: 'req:1',
  requestRevision: 2,
  mandateRef: 'mandate:1',
  mandateDigest: 'mandate-digest',
  generationRef: 'gen:1',
  routePlanId: 'plan:1',
  routeDigest: 'route-digest',
  totalSteps: 2,
  createdAt: 1_000,
}

describe('routeRunIdentityDigest', () => {
  it('is stable under field reorder and optional businesses', () => {
    const withoutBusinesses = routeRunIdentityDigest(runBase)
    const reordered = routeRunIdentityDigest({
      createdAt: runBase.createdAt,
      totalSteps: runBase.totalSteps,
      routeDigest: runBase.routeDigest,
      routePlanId: runBase.routePlanId,
      generationRef: runBase.generationRef,
      mandateDigest: runBase.mandateDigest,
      mandateRef: runBase.mandateRef,
      requestRevision: runBase.requestRevision,
      requestId: runBase.requestId,
      principalId: runBase.principalId,
      runRef: runBase.runRef,
    })
    expect(reordered).toBe(withoutBusinesses)

    const withBusinesses = routeRunIdentityDigest({
      ...runBase,
      businesses: [{ businessRef: 'business:1', name: 'AccessRide' }],
    })
    expect(withBusinesses).not.toBe(withoutBusinesses)
    expect(withBusinesses).toBe(routeRunIdentityDigest({
      ...runBase,
      businesses: [{ name: 'AccessRide', businessRef: 'business:1' }],
    }))
  })
})

describe('routeAttemptIntegrityValid', () => {
  const input = { destination: 'Perth' }
  const inputJson = JSON.stringify(input)
  const inputDigest = canonicalDigest(input)
  const attemptMaterial = {
    runRef: 'run:1',
    requestId: 'req:1',
    mandateRef: 'mandate:1',
    actionId: 'action:1',
    position: 1,
    operationKeyDigest: 'op:1',
    grantDigest: 'grant:1',
    inputDigest,
    createdAt: 1_000,
  }
  const attemptDigest = canonicalDigest(attemptMaterial)

  function validAttempt(
    overrides: Partial<RouteAttemptIntegritySnapshot> = {},
  ): RouteAttemptIntegritySnapshot {
    return {
      runRef: attemptMaterial.runRef,
      requestId: attemptMaterial.requestId,
      mandateRef: attemptMaterial.mandateRef,
      actionId: attemptMaterial.actionId,
      position: attemptMaterial.position,
      operationKeyDigest: attemptMaterial.operationKeyDigest,
      grant: { grantDigest: attemptMaterial.grantDigest },
      inputDigest,
      createdAt: attemptMaterial.createdAt,
      attemptDigest,
      attemptRef: `route-step-attempt:v1:${attemptDigest}`,
      inputJson,
      ...overrides,
    }
  }

  it('accepts a matching attempt snapshot', () => {
    expect(routeAttemptIntegrityValid(validAttempt())).toBe(true)
  })

  it('rejects digest mismatch, bad attemptRef, and payload skew', () => {
    expect(routeAttemptIntegrityValid(validAttempt({ attemptDigest: 'wrong' }))).toBe(false)
    expect(routeAttemptIntegrityValid(validAttempt({
      attemptRef: 'route-step-attempt:v1:wrong',
    }))).toBe(false)
    expect(routeAttemptIntegrityValid(validAttempt({
      inputJson: JSON.stringify({ destination: 'Sydney' }),
    }))).toBe(false)

    const output = { status: 'ok' }
    const outputJson = JSON.stringify(output)
    expect(routeAttemptIntegrityValid(validAttempt({
      outputJson,
      outputDigest: 'wrong-output',
    }))).toBe(false)
    expect(routeAttemptIntegrityValid(validAttempt({
      outputJson,
      outputDigest: canonicalDigest(output),
    }))).toBe(true)

    const observation = {
      transport: 'http',
      disposition: 'succeeded',
      releaseStarted: true,
      requestDigest: 'req-digest',
    }
    const transportObservationJson = JSON.stringify(observation)
    expect(routeAttemptIntegrityValid(validAttempt({
      transportObservationJson,
      transportObservationDigest: 'wrong-obs',
    }))).toBe(false)
    expect(routeAttemptIntegrityValid(validAttempt({
      transportObservationJson,
      transportObservationDigest: canonicalDigest(observation),
    }))).toBe(true)
  })
})

describe('routeDispatchIntegrityValid', () => {
  const material = {
    runRef: 'run:1',
    attemptRef: 'attempt:1',
    operationKeyDigest: 'op:1',
    availableAt: 1_000,
    createdAt: 1_000,
  }
  const digest = canonicalDigest(material)

  function validDispatch(
    overrides: Partial<RouteDispatchIntegritySnapshot> = {},
  ): RouteDispatchIntegritySnapshot {
    return {
      runRef: material.runRef,
      attemptRef: material.attemptRef,
      operationKeyDigest: material.operationKeyDigest,
      createdAt: material.createdAt,
      dispatchDigest: digest,
      dispatchRef: `route-dispatch:v1:${digest}`,
      ...overrides,
    }
  }

  it('accepts a matching dispatch snapshot', () => {
    expect(routeDispatchIntegrityValid(validDispatch())).toBe(true)
  })

  it('rejects digest and dispatchRef mismatch', () => {
    expect(routeDispatchIntegrityValid(validDispatch({ dispatchDigest: 'wrong' }))).toBe(false)
    expect(routeDispatchIntegrityValid(validDispatch({
      dispatchRef: 'route-dispatch:v1:wrong',
    }))).toBe(false)
  })
})

describe('exportState', () => {
  it('maps attempt states to exported step states', () => {
    expect(exportState('leased')).toBe('ready_to_contact')
    expect(exportState('dispatched')).toBe('contacting')
    expect(exportState('accepted')).toBe('awaiting_result')
    expect(exportState('succeeded')).toBe('completed')
    expect(exportState('queued')).toBe('queued')
    expect(exportState('failed')).toBe('failed')
    expect(exportState('outcome_unknown')).toBe('outcome_unknown')
    expect(exportState('cancelled')).toBe('cancelled')
  })
})
