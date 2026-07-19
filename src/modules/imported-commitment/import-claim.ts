import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'

import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  ImportedCommitmentActor,
  ImportedCommitmentClaim,
  ImportedCommitmentReferenceIdentity,
  ImportedCommitmentRowPort,
  ImportedCommitmentSourceRecord,
  ImportedCommitmentTerm,
  ImportedCommitmentValidity,
} from './contracts'

const MAX_SOURCE_BYTES = 65_536
const MAX_TERMS = 64
const MAX_EVIDENCE_REFS = 64

export type ImportCommitmentInput = Readonly<{
  actor: ImportedCommitmentActor
  claimRef: string
  issuer: Readonly<{ ref: string; name?: string }>
  observer: Readonly<{ ref: string; name?: string }>
  subject: Readonly<{ kind: string; ref: string }>
  commitmentKind: string
  terms: readonly ImportedCommitmentTerm[]
  source: Readonly<{ system: string; reference: string; digest: string }>
  sourceBytes: readonly number[]
  observedAt: number
  assertedAt?: number
  validity: ImportedCommitmentValidity
  evidenceRefs: readonly string[]
}>

export type ImportCommitmentResult =
  | Readonly<{ kind: 'imported' | 'replayed'; claim: ImportedCommitmentClaim; noEffect: true }>
  | Readonly<{
      kind: 'refused'
      reason:
        | 'invalid_claim'
        | 'source_digest_mismatch'
        | 'cross_principal_refused'
        | 'claim_key_conflict'
    }>

export function sourceBytesDigest(sourceBytes: readonly number[]): string {
  return `sha256:${bytesToHex(sha256(Uint8Array.from(sourceBytes)))}`
}

export function importCommitmentClaim(
  input: ImportCommitmentInput,
  port: ImportedCommitmentRowPort,
): ImportCommitmentResult {
  if (!validInput(input)) return { kind: 'refused', reason: 'invalid_claim' }
  if (sourceBytesDigest(input.sourceBytes) !== input.source.digest) {
    return { kind: 'refused', reason: 'source_digest_mismatch' }
  }
  const claim = claimFromInput(input)
  const existing = port.load(input.claimRef)
  if (existing !== null) {
    if (existing.claim.principalRef !== input.actor.principalRef) {
      return { kind: 'refused', reason: 'cross_principal_refused' }
    }
    if (existing.claim.claimDigest !== claim.claimDigest
      || sourceBytesDigest(existing.sourceBytes) !== existing.claim.source.digest) {
      return { kind: 'refused', reason: 'claim_key_conflict' }
    }
    return { kind: 'replayed', claim: existing.claim, noEffect: true }
  }
  port.insert(Object.freeze({
    claim,
    sourceBytes: Object.freeze([...input.sourceBytes]),
  }))
  return { kind: 'imported', claim, noEffect: true }
}

export type ReadImportedCommitmentResult =
  | ImportedCommitmentReferenceIdentity
  | Readonly<{
      kind: 'refused'
      reason: 'claim_not_found' | 'cross_principal_refused' | 'source_identity_mismatch' | 'integrity_failure'
    }>

export function readImportedCommitmentReference(
  port: ImportedCommitmentRowPort,
  input: Readonly<{
    actor: ImportedCommitmentActor
    claimRef: string
    expectedSourceReference: string
    expectedSourceDigest: string
  }>,
): ReadImportedCommitmentResult {
  const record = port.load(input.claimRef)
  if (record === null) return { kind: 'refused', reason: 'claim_not_found' }
  if (record.claim.principalRef !== input.actor.principalRef) {
    return { kind: 'refused', reason: 'cross_principal_refused' }
  }
  if (record.claim.source.reference !== input.expectedSourceReference
    || record.claim.source.digest !== input.expectedSourceDigest) {
    return { kind: 'refused', reason: 'source_identity_mismatch' }
  }
  if (sourceBytesDigest(record.sourceBytes) !== record.claim.source.digest
    || claimDigest(record.claim) !== record.claim.claimDigest) {
    return { kind: 'refused', reason: 'integrity_failure' }
  }
  const { claim } = record
  return {
    kind: 'imported_commitment_reference',
    claimRef: claim.claimRef,
    claimDigest: claim.claimDigest,
    principalRef: claim.principalRef,
    issuerRef: claim.issuer.ref,
    observerRef: claim.observer.ref,
    subject: claim.subject,
    commitmentKind: claim.commitmentKind,
    source: claim.source,
    observedAt: claim.observedAt,
    ...(claim.assertedAt === undefined ? {} : { assertedAt: claim.assertedAt }),
    validity: claim.validity,
    evidenceRefs: claim.evidenceRefs,
    verification: 'imported_unverified',
    observationPosture: 'imported_claim_only',
    authority: 'none',
    effect: 'none',
    providerAdmission: 'not_established',
  }
}

export function importedCommitmentValidityAt(
  validity: ImportedCommitmentValidity,
  now: number,
): 'current_by_claim' | 'expired' | 'unknown' | 'withdrawn' {
  if (validity.kind === 'unknown') return 'unknown'
  if (validity.kind === 'withdrawn') return 'withdrawn'
  return validity.validUntil >= now ? 'current_by_claim' : 'expired'
}

function claimFromInput(input: ImportCommitmentInput): ImportedCommitmentClaim {
  const material = {
    claimRef: input.claimRef,
    principalRef: input.actor.principalRef,
    importedBy: { callerRef: input.actor.callerRef },
    issuer: input.issuer,
    observer: input.observer,
    subject: input.subject,
    commitmentKind: input.commitmentKind,
    terms: [...input.terms],
    source: input.source,
    observedAt: input.observedAt,
    ...(input.assertedAt === undefined ? {} : { assertedAt: input.assertedAt }),
    validity: input.validity,
    evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
    verification: 'imported_unverified' as const,
    observationPosture: 'imported_claim_only' as const,
  }
  return Object.freeze({ ...material, claimDigest: canonicalDigest(material as StableHashValue) })
}

function claimDigest(claim: ImportedCommitmentClaim): string {
  const { claimDigest: _digest, ...material } = claim
  return canonicalDigest(material as StableHashValue)
}

function validInput(input: ImportCommitmentInput): boolean {
  const identifiers = [
    input.actor.principalRef, input.actor.callerRef, input.claimRef,
    input.issuer.ref, input.observer.ref, input.subject.kind, input.subject.ref,
    input.commitmentKind, input.source.system, input.source.reference,
  ]
  return identifiers.every((value) => value.trim().length > 0 && value.length <= 500)
    && isCanonicalDigest(input.source.digest)
    && input.sourceBytes.length > 0
    && input.sourceBytes.length <= MAX_SOURCE_BYTES
    && input.sourceBytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    && input.terms.length > 0
    && input.terms.length <= MAX_TERMS
    && input.terms.every((term) => term.name.trim().length > 0 && term.name.length <= 200
      && term.value.trim().length > 0 && term.value.length <= 2_000
      && (term.unit === undefined || (term.unit.trim().length > 0 && term.unit.length <= 100)))
    && input.evidenceRefs.length > 0
    && input.evidenceRefs.length <= MAX_EVIDENCE_REFS
    && input.evidenceRefs.every((ref) => ref.trim().length > 0 && ref.length <= 500)
    && Number.isFinite(input.observedAt)
    && (input.assertedAt === undefined || Number.isFinite(input.assertedAt))
    && validityIsValid(input.validity)
}

function validityIsValid(validity: ImportedCommitmentValidity): boolean {
  if (validity.kind === 'unknown') return true
  if (validity.kind === 'valid_until') return Number.isFinite(validity.validUntil)
  return Number.isFinite(validity.withdrawnAt)
    && validity.evidenceRefs.length > 0
    && validity.evidenceRefs.every((ref) => ref.trim().length > 0 && ref.length <= 500)
}
