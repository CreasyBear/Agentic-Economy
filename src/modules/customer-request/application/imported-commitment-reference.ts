import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  CustomerRequestImportedCommitmentReference,
  CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import type { ImportedCommitmentReferenceIdentity } from '@/modules/imported-commitment'

type ImportedCommitmentReferenceRefusal =
  | 'claim_not_found'
  | 'cross_principal_refused'
  | 'source_identity_mismatch'
  | 'integrity_failure'

export type AttachImportedCommitmentReferenceInput = Readonly<{
  principalRef: string
  callerRef: string
  claimRef: string
  expectedSourceReference: string
  expectedSourceDigest: string
  referencedAt: number
  candidateAggregate: CustomerRequestV2Aggregate
}>

export type AttachImportedCommitmentReferencePorts = Readonly<{
  readReference(input: Readonly<{
    actor: Readonly<{ principalRef: string; callerRef: string }>
    claimRef: string
    expectedSourceReference: string
    expectedSourceDigest: string
  }>):
    | ImportedCommitmentReferenceIdentity
    | Readonly<{ kind: 'refused'; reason: ImportedCommitmentReferenceRefusal }>
}>

export type AttachImportedCommitmentReferenceResult =
  | Readonly<{
      kind: 'attached' | 'replayed'
      aggregate: CustomerRequestV2Aggregate
      reference: CustomerRequestImportedCommitmentReference
      noEffect: true
      authority: 'none'
      providerAdmission: 'not_established'
    }>
  | Readonly<{
      kind: 'refused'
      reason:
        | 'request_not_owned'
        | 'claim_not_found'
        | 'cross_principal_refused'
        | 'source_identity_mismatch'
        | 'integrity_failure'
        | 'reference_integrity_failure'
    }>

/**
 * Attaches imported claim identity to a canonical Request revision. The source
 * record retains terms and original bytes; authority, attempts, provider
 * admission, qualification and effect state cannot cross this boundary.
 */
export function attachImportedCommitmentReference(
  input: AttachImportedCommitmentReferenceInput,
  ports: AttachImportedCommitmentReferencePorts,
): AttachImportedCommitmentReferenceResult {
  if (input.candidateAggregate.snapshot.principalId !== input.principalRef) {
    return { kind: 'refused', reason: 'request_not_owned' }
  }
  const identity = ports.readReference({
    actor: { principalRef: input.principalRef, callerRef: input.callerRef },
    claimRef: input.claimRef,
    expectedSourceReference: input.expectedSourceReference,
    expectedSourceDigest: input.expectedSourceDigest,
  })
  if (identity.kind === 'refused') return identity
  const referenceRef = `imported-commitment:${canonicalDigest({
    claimRef: identity.claimRef,
    claimDigest: identity.claimDigest,
  })}`
  const existing = input.candidateAggregate.importedCommitmentReferences?.find(
    (reference) => reference.referenceRef === referenceRef,
  )
  if (existing !== undefined) {
    const expected = referenceFromIdentity(identity, existing.referencedAt)
    if (!Number.isFinite(existing.referencedAt)
      || canonicalDigest(existing as never) !== canonicalDigest(expected as never)) {
      return { kind: 'refused', reason: 'reference_integrity_failure' }
    }
    return success('replayed', input.candidateAggregate, existing)
  }

  const reference = referenceFromIdentity(identity, input.referencedAt)
  const { aggregateDigest: _digest, importedCommitmentReferences: _prior, ...material } =
    input.candidateAggregate
  const nextMaterial = {
    ...material,
    importedCommitmentReferences: Object.freeze([
      ...(input.candidateAggregate.importedCommitmentReferences ?? []),
      reference,
    ]),
  }
  return success('attached', Object.freeze({
    ...nextMaterial,
    aggregateDigest: canonicalDigest(nextMaterial as never),
  }), reference)
}

function referenceFromIdentity(
  identity: ImportedCommitmentReferenceIdentity,
  referencedAt: number,
): CustomerRequestImportedCommitmentReference {
  return Object.freeze({
    role: 'imported_commitment_claim',
    referenceRef: `imported-commitment:${canonicalDigest({
      claimRef: identity.claimRef,
      claimDigest: identity.claimDigest,
    })}`,
    claimRef: identity.claimRef,
    claimDigest: identity.claimDigest,
    issuerRef: identity.issuerRef,
    observerRef: identity.observerRef,
    subject: identity.subject,
    commitmentKind: identity.commitmentKind,
    source: identity.source,
    observedAt: identity.observedAt,
    ...(identity.assertedAt === undefined ? {} : { assertedAt: identity.assertedAt }),
    validity: identity.validity,
    evidenceRefs: identity.evidenceRefs,
    verification: 'imported_unverified',
    observationPosture: 'imported_claim_only',
    referencedAt,
  })
}

function success(
  kind: 'attached' | 'replayed',
  aggregate: CustomerRequestV2Aggregate,
  reference: CustomerRequestImportedCommitmentReference,
): Extract<AttachImportedCommitmentReferenceResult, { kind: 'attached' | 'replayed' }> {
  return {
    kind,
    aggregate,
    reference,
    noEffect: true,
    authority: 'none',
    providerAdmission: 'not_established',
  }
}
