export type QuarantineParentDisposition =
  | Readonly<{ kind: 'unresolved' }>
  | Readonly<{
      kind: 'updated'
      offeringId: string
      status: 'active' | 'inactive'
      registrationHash: string
      eligibilityHash: string
    }>

export function offeringStatusAfterBindingQuarantine(
  hasOtherEligibleSibling: boolean,
): 'active' | 'inactive' {
  return hasOtherEligibleSibling ? 'active' : 'inactive'
}

export function quarantineParentUpdatedDisposition(
  offering: Readonly<{ offeringId: string; registrationHash: string }>,
  status: 'active' | 'inactive',
  eligibilityHash: string,
): Extract<QuarantineParentDisposition, { kind: 'updated' }> {
  return {
    kind: 'updated',
    offeringId: offering.offeringId,
    status,
    registrationHash: offering.registrationHash,
    eligibilityHash,
  }
}
