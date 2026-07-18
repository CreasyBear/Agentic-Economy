import { routeStepGrantDigest } from '@/modules/customer-request/route-mandate-admission'

import { routeAttemptIntegrityValid, routeDispatchIntegrityValid } from '../journal'

import type { DispatchLifecycleOpenPorts } from './dispatch-lifecycle-ports'
import type { LeasedInvocation } from './types'

export async function currentLeasedInvocation(
  input: Readonly<{
    dispatchRef: string
    workerId: string
    now: number
  }>,
  ports: DispatchLifecycleOpenPorts,
): Promise<LeasedInvocation | null> {
  const dispatch = await ports.loadDispatchByRef(input.dispatchRef)
  if (dispatch === null || dispatch.state !== 'leased' || dispatch.leaseOwner !== input.workerId
    || (dispatch.leaseExpiresAt ?? 0) <= input.now || !routeDispatchIntegrityValid(dispatch)) {
    return null
  }
  const attempt = await ports.loadAttemptByRef(dispatch.attemptRef)
  if (attempt === null || attempt.state !== 'leased' || attempt.runRef !== dispatch.runRef
    || attempt.operationKeyDigest !== dispatch.operationKeyDigest || !routeAttemptIntegrityValid(attempt)
    || attempt.grant.grantRef !== `route-step-grant:v1:${attempt.grant.grantDigest}`
    || routeStepGrantDigest(attempt.grant) !== attempt.grant.grantDigest
    || attempt.grant.expiresAt <= input.now) {
    return null
  }
  const mandate = await ports.loadActiveMandateForPrincipal(
    attempt.requestId, attempt.grant.principalId, input.now,
  )
  if (mandate.kind !== 'active' || mandate.mandateRef !== attempt.grant.mandateRef
    || mandate.mandateDigest !== attempt.grant.mandateDigest) {
    return null
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
  if (supply.kind !== 'available') return null
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
    || publication.readinessObservedAt === undefined || publication.readinessObservedAt > input.now
    || publication.readinessValidUntil === undefined
    || publication.readinessValidUntil < input.now) {
    return null
  }
  return {
    dispatchRef: dispatch.dispatchRef,
    attemptRef: attempt.attemptRef,
    runRef: attempt.runRef,
    operationKeyDigest: attempt.operationKeyDigest,
    inputJson: attempt.inputJson,
    inputDigest: attempt.inputDigest,
    binding: { ...supply.binding },
    authority: {
      mandateDigest: attempt.grant.mandateDigest,
      grantDigest: attempt.grant.grantDigest,
      capabilityContractDigest: attempt.grant.step.contractRef.contractDigest,
      maximumSpend: { ...attempt.grant.step.maximumSpend },
      expiresAt: attempt.grant.expiresAt,
    },
  }
}
