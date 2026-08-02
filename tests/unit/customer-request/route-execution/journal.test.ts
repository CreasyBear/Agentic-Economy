import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  canPreReleaseCancel,
  canRequestAdapterCancellation,
  cancelCommandArgsConflict,
  cancelDisposition,
  cancelPriorCommandConflicts,
  cancelReplayKind,
  cancelRunHeadIntegrityValid,
  cancelRunNotFound,
  exportState,
  projectCustomerEvidenceExport,
  routeAttemptIntegrityValid,
  routeDispatchIntegrityValid,
  routeRunIdentityDigest,
  type CustomerEvidenceExportAttemptSnapshot,
  type RouteAttemptIntegritySnapshot,
  type RouteDispatchIntegritySnapshot,
  type RouteRunIdentitySnapshot,
} from '@/modules/customer-request/route-execution/journal'
import { evidenceReceiptRef } from '@/modules/customer-request/route-execution/problem-support/evidence'

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
    expect(exportState('dispatched')).toBe('contacting')
    expect(exportState('accepted')).toBe('awaiting_result')
    expect(exportState('succeeded')).toBe('completed')
    expect(exportState('queued')).toBe('queued')
    expect(exportState('failed')).toBe('failed')
    expect(exportState('outcome_unknown')).toBe('outcome_unknown')
    expect(exportState('cancelled')).toBe('cancelled')
  })
})

describe('projectCustomerEvidenceExport', () => {
  const input = { destination: 'Perth' }
  const inputJson = JSON.stringify(input)
  const inputDigest = canonicalDigest(input)
  const output = { status: 'ok' }
  const outputJson = JSON.stringify(output)
  const outputDigest = canonicalDigest(output)
  const evidenceItem = {
    evidenceId: 'ev-1',
    outputPointer: '/status',
    schemaIdentity: 'schema:1',
    valueDigest: 'value-digest',
  }
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
    overrides: Partial<CustomerEvidenceExportAttemptSnapshot> = {},
  ): CustomerEvidenceExportAttemptSnapshot {
    return {
      runRef: attemptMaterial.runRef,
      requestId: attemptMaterial.requestId,
      mandateRef: attemptMaterial.mandateRef,
      actionId: attemptMaterial.actionId,
      position: attemptMaterial.position,
      operationKeyDigest: attemptMaterial.operationKeyDigest,
      grant: {
        grantDigest: attemptMaterial.grantDigest,
        step: {
          offeringId: 'offering:1',
          bindingRegistrationHash: 'reg:1',
          businessId: 'biz:1',
        },
      },
      inputDigest,
      createdAt: attemptMaterial.createdAt,
      attemptDigest,
      attemptRef: `route-step-attempt:v1:${attemptDigest}`,
      inputJson,
      outputJson,
      outputDigest,
      state: 'succeeded',
      updatedAt: 2_000,
      evidence: [evidenceItem],
      ...overrides,
    }
  }

  const binding = {
    offeringId: 'offering:1',
    registrationHash: 'reg:1',
    endpointUrl: 'https://provider.example/v1/book',
  }

  it('assembles found evidence from plain snapshots', () => {
    const attempt = validAttempt()
    const exported = projectCustomerEvidenceExport({
      run: {
        state: 'completed',
        totalSteps: 1,
        resultJson: '{"ok":true}',
        businesses: [{ businessRef: 'business:1', name: 'AccessRide' }],
      },
      attempts: [attempt],
      bindings: [binding],
      problems: [],
      updatesByProblem: [],
      businessReportsByProblem: [],
      principalId: 'principal:1',
      generatedAt: 9_000,
    })

    expect(exported).toEqual({
      kind: 'found',
      state: 'completed',
      generatedAt: 9_000,
      resultJson: '{"ok":true}',
      steps: [{
        step: 1,
        state: 'completed',
        observedAt: 2_000,
        business: 'AccessRide',
        providerOrigin: 'https://provider.example',
        outputDigest,
        evidence: [{
          receiptRef: evidenceReceiptRef(attempt.attemptRef, evidenceItem),
          label: 'Result evidence 1',
        }],
      }],
      problems: [],
    })
  })

  it('rejects attempt, binding, and problem integrity failures', () => {
    expect(() => projectCustomerEvidenceExport({
      run: { state: 'completed', totalSteps: 1 },
      attempts: [validAttempt({ attemptDigest: 'wrong' })],
      bindings: [binding],
      problems: [],
      updatesByProblem: [],
      businessReportsByProblem: [],
      principalId: 'principal:1',
      generatedAt: 1,
    })).toThrow('customer_request_route_run_attempt_integrity_failure')

    expect(() => projectCustomerEvidenceExport({
      run: { state: 'completed', totalSteps: 1 },
      attempts: [validAttempt()],
      bindings: [{ ...binding, registrationHash: 'wrong' }],
      problems: [],
      updatesByProblem: [],
      businessReportsByProblem: [],
      principalId: 'principal:1',
      generatedAt: 1,
    })).toThrow('customer_request_route_run_binding_integrity_failure')

    expect(() => projectCustomerEvidenceExport({
      run: { state: 'completed', totalSteps: 1 },
      attempts: [validAttempt()],
      bindings: [binding],
      problems: [{
        reportRef: 'problem:1',
        principalId: 'other',
        createdAt: 1,
        category: 'other',
        summary: 'Issue',
      }],
      updatesByProblem: [[]],
      businessReportsByProblem: [[]],
      principalId: 'principal:1',
      generatedAt: 1,
    })).toThrow('customer_request_route_problem_integrity_failure')
  })
})

describe('journal cancel predicates', () => {
  it('detects cancel refuse and conflict cases', () => {
    expect(cancelCommandArgsConflict({
      idempotencyKey: '', principalId: 'p1',
    })).toBe(true)
    expect(cancelCommandArgsConflict({
      idempotencyKey: 'k1', principalId: 'p1',
    })).toBe(false)

    expect(cancelPriorCommandConflicts({
      prior: {
        commandDigest: 'digest-a',
        principalId: 'p1',
        requestId: 'r1',
        mode: 'current_and_downstream',
      },
      args: {
        requestId: 'r1',
        principalId: 'p1',
        mode: 'after_current_step',
      },
      commandDigest: 'digest-b',
      historicalDefaultDigest: 'digest-hist',
    })).toBe(true)

    expect(cancelPriorCommandConflicts({
      prior: {
        commandDigest: 'digest-hist',
        principalId: 'p1',
        requestId: 'r1',
      },
      args: {
        requestId: 'r1',
        principalId: 'p1',
        mode: 'current_and_downstream',
      },
      commandDigest: 'digest-full',
      historicalDefaultDigest: 'digest-hist',
    })).toBe(false)

    expect(cancelRunNotFound(null, 'p1')).toBe(true)
    expect(cancelRunNotFound({ principalId: 'other' }, 'p1')).toBe(true)
    expect(cancelRunNotFound({ principalId: 'p1' }, 'p1')).toBe(false)
    expect(cancelRunHeadIntegrityValid(null, { currentMandateRef: 'm1' })).toBe(false)
    expect(cancelRunHeadIntegrityValid(
      { mandateRef: 'm1' },
      { currentMandateRef: 'm1' },
    )).toBe(true)
  })

  it('decides cancel disposition without patches', () => {
    expect(canPreReleaseCancel({
      attemptState: 'queued', outboxState: 'pending',
    })).toBe(true)
    expect(canPreReleaseCancel({
      attemptState: 'dispatched', outboxState: 'delivered',
    })).toBe(false)

    expect(canRequestAdapterCancellation({
      canPreReleaseCancel: false,
      mode: 'current_and_downstream',
      attemptState: 'accepted',
      cancellationKind: 'adapter_managed',
    })).toBe(true)
    expect(canRequestAdapterCancellation({
      canPreReleaseCancel: true,
      mode: 'current_and_downstream',
      attemptState: 'accepted',
      cancellationKind: 'adapter_managed',
    })).toBe(false)

    expect(cancelDisposition({
      canPreReleaseCancel: true,
      canRequestAdapterCancellation: false,
    })).toBe('cancelled')
    expect(cancelDisposition({
      canPreReleaseCancel: false,
      canRequestAdapterCancellation: true,
    })).toBe('pending')
    expect(cancelDisposition({
      canPreReleaseCancel: false,
      canRequestAdapterCancellation: false,
    })).toBe('too_late')
    expect(cancelReplayKind('cancelled')).toBe('replayed')
    expect(cancelReplayKind('pending')).toBe('pending')
    expect(cancelReplayKind('too_late')).toBe('too_late')
  })


})
