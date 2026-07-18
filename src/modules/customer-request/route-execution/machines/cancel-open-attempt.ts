import { routeAttemptIntegrityValid } from '../journal'

import type { CancelOpenPorts } from './cancel-ports'
import type { OpenCancellationResult } from './types'

export async function openCancellationAttempt(
  args: Readonly<{ cancellationRef: string }>,
  ports: CancelOpenPorts,
): Promise<OpenCancellationResult> {
  const cancellation = await ports.loadCancellationAttempt(args.cancellationRef)
  if (cancellation === null || cancellation.state !== 'pending') {
    return { kind: 'unavailable' }
  }
  const attempt = await ports.loadAttemptByRef(cancellation.attemptRef)
  if (attempt === null || attempt.runRef !== cancellation.runRef
    || attempt.operationKeyDigest !== cancellation.operationKeyDigest
    || attempt.grant.step.cancellation.kind !== 'adapter_managed'
    || (attempt.state !== 'dispatched' && attempt.state !== 'accepted')
    || !routeAttemptIntegrityValid(attempt)) {
    return { kind: 'unavailable' }
  }
  const mandate = await ports.loadActiveMandateForCancellation(
    attempt.requestId, attempt.grant.principalId, ports.now(),
  )
  if (mandate.kind !== 'active' || mandate.mandateRef !== attempt.grant.mandateRef
    || mandate.mandateDigest !== attempt.grant.mandateDigest) {
    return { kind: 'unavailable' }
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
  if (supply.kind !== 'available') return { kind: 'unavailable' }
  return {
    kind: 'available',
    invocation: {
      cancellationRef: cancellation.cancellationRef,
      attemptRef: attempt.attemptRef,
      operationKeyDigest: attempt.operationKeyDigest,
      binding: { ...supply.binding },
      authority: {
        mandateDigest: attempt.grant.mandateDigest,
        grantDigest: attempt.grant.grantDigest,
        capabilityContractDigest: attempt.grant.step.contractRef.contractDigest,
        maximumSpend: { ...attempt.grant.step.maximumSpend },
        expiresAt: attempt.grant.expiresAt,
      },
    },
  }
}
