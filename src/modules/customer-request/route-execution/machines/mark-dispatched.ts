import { routeStepGrantDigest } from '@/modules/customer-request/route-mandate-admission'

import { routeAttemptIntegrityValid, routeDispatchIntegrityValid } from '../journal'
import type { DispatchLifecyclePorts } from './dispatch-lifecycle-ports'
import type { MarkDispatchedCommand, MarkDispatchedResult } from './types'

export async function markDispatched(
  args: MarkDispatchedCommand,
  ports: DispatchLifecyclePorts,
): Promise<MarkDispatchedResult> {
  const now = ports.now()
  const dispatch = await ports.loadDispatchByRef(args.dispatchRef)
  const attempt = await ports.loadAttemptByRef(args.attemptRef)
  if (dispatch === null || attempt === null || !routeDispatchIntegrityValid(dispatch)
    || !routeAttemptIntegrityValid(attempt) || dispatch.attemptRef !== attempt.attemptRef) {
    return { kind: 'refused', reason: 'dispatch_not_current' }
  }
  if (dispatch.state === 'delivered'
    && (attempt.state === 'dispatched' || attempt.state === 'accepted'
      || attempt.state === 'succeeded' || attempt.state === 'outcome_unknown')) {
    return { kind: 'replayed' }
  }
  if (dispatch.state !== 'pending' || attempt.state !== 'queued'
    || attempt.grant.expiresAt <= now) {
    return { kind: 'refused', reason: 'dispatch_not_current' }
  }
  const mandate = await ports.loadActiveMandateForPrincipal(
    attempt.requestId, attempt.grant.principalId, now,
  )
  if (mandate.kind !== 'active' || mandate.mandateRef !== attempt.grant.mandateRef
    || mandate.mandateDigest !== attempt.grant.mandateDigest) {
    return { kind: 'refused', reason: 'dispatch_not_current' }
  }
  if (attempt.grant.grantRef !== `route-step-grant:v1:${attempt.grant.grantDigest}`
    || routeStepGrantDigest(attempt.grant) !== attempt.grant.grantDigest) {
    return { kind: 'refused', reason: 'dispatch_not_current' }
  }
  const supply = await ports.loadEligibleExactCapabilitySupply({
    networkId: mandate.networkId,
    businessId: attempt.grant.step.businessId,
    offeringId: attempt.grant.step.offeringId,
    bindingId: attempt.grant.step.bindingId,
    contractRef: attempt.grant.step.contractRef,
    expectedOfferingRegistrationHash: attempt.grant.step.offeringRegistrationHash,
    expectedBindingRegistrationHash: attempt.grant.step.bindingRegistrationHash,
  })
  if (supply.kind !== 'available') {
    return { kind: 'refused', reason: 'dispatch_not_current' }
  }
  const publication = await ports.loadPublicationAtRevision(
    attempt.grant.step.publicationRef,
    attempt.grant.step.publicationRevision,
  )
  if (publication === null || publication.disposition !== 'current'
    || publication.businessId !== attempt.grant.step.businessId
    || publication.networkId !== mandate.networkId
    || publication.offeringId !== attempt.grant.step.offeringId
    || publication.bindingId !== attempt.grant.step.bindingId
    || publication.capabilityId !== attempt.grant.step.contractRef.capabilityId
    || publication.version !== attempt.grant.step.contractRef.version
    || publication.contractDigest !== attempt.grant.step.contractRef.contractDigest
    || publication.credentialState !== 'ready' || publication.healthState !== 'healthy'
    || publication.readinessObservedAt === undefined || publication.readinessObservedAt > now
    || publication.readinessValidUntil === undefined
    || publication.readinessValidUntil < now) {
    return { kind: 'refused', reason: 'dispatch_not_current' }
  }
  const run = await ports.loadRunByRef(attempt.runRef)
  if (run === null || run.currentPosition !== attempt.position) {
    throw new Error('customer_request_route_run_integrity_failure')
  }
  return await ports.commitMarkDispatched({
    dispatchRef: dispatch.dispatchRef,
    attemptRef: attempt.attemptRef,
    runRef: run.runRef,
    now,
  })
}
