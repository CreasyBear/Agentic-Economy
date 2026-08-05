import { contractRefFromRow } from '../offering/registration'

import type { PublicationCommandPorts, PublicationCommandRow } from './ports'

export type WithdrawCapabilityCommandInput = Readonly<{
  publication: PublicationCommandRow
  evidenceRefs: readonly string[]
  now: number
}>

export async function withdrawCapabilityCommand(
  input: WithdrawCapabilityCommandInput,
  ports: PublicationCommandPorts,
) {
  const { publication } = input
  if (publication.disposition !== 'current') {
    return { kind: 'refused' as const, reason: 'revision_changed' as const }
  }

  const [offering, binding] = await Promise.all([
    ports.loadOfferingByOfferingId(publication.offeringId),
    ports.loadBindingByBindingId(publication.bindingId),
  ])
  if (offering === null || binding === null) {
    throw new Error('capability_publication_supply_integrity_failure')
  }

  const revoked = await ports.setEligibility({
    offeringId: offering.offeringId,
    bindingId: binding.bindingId,
    contractRef: contractRefFromRow(publication),
    decision: 'revoke',
    expectedOfferingRegistrationHash: offering.registrationHash,
    expectedBindingRegistrationHash: binding.registrationHash,
    admissionEvidenceRefs: input.evidenceRefs,
    conformanceEvidenceRefs: input.evidenceRefs,
  }, input.now)
  if (revoked.kind === 'refused') {
    throw new Error(`capability_publication_withdraw_${revoked.reason}`)
  }

  await ports.patchPublicationWithdrawn(publication.id, input.now)
  return {
    kind: 'withdrawn' as const,
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    lifecycle: { state: 'withdrawn' as const, reasons: ['withdrawn' as const] },
  }
}
