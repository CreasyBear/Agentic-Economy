import { canonicalDigest } from '@/modules/common/canonical-digest'

export type ReconciliationResolution = 'not_released' | 'released'

export type ReconciliationEvidenceMaterial = Readonly<{
  kind: 'action_invocation_reconciliation'
  version: 1
  evidenceRef: string
  source: string
  invocationRef: string
  attemptRef: string
  effectGeneration: number
  resolution: ReconciliationResolution
  observedAt: string
}>

export type ReconciliationEvidence = ReconciliationEvidenceMaterial & Readonly<{
  digest: string
}>

export type ReconciliationEvidenceVerifier = (
  evidence: ReconciliationEvidence,
) => boolean

export function validateReconciliationEvidence(input: Readonly<{
  evidence: ReconciliationEvidence
  source: string | undefined
  invocationRef: string
  attemptRef: string
  effectGeneration: number
  now: string
  notBefore: string
  verifySourceEvidence: ReconciliationEvidenceVerifier | undefined
}>): 'evidence_malformed' | 'evidence_digest_mismatch' | 'evidence_source_mismatch' |
  'evidence_attempt_mismatch' | 'evidence_generation_stale' | 'evidence_time_invalid' |
  'evidence_source_unverified' | undefined {
  const { evidence } = input
  if (
    evidence.kind !== 'action_invocation_reconciliation' ||
    evidence.version !== 1 ||
    evidence.evidenceRef.length === 0 ||
    evidence.source.length === 0 ||
    !Number.isInteger(evidence.effectGeneration) ||
    evidence.effectGeneration < 1 ||
    (evidence.resolution !== 'not_released' && evidence.resolution !== 'released') ||
    !Number.isFinite(Date.parse(evidence.observedAt))
  ) return 'evidence_malformed'
  const { digest: _digest, ...material } = evidence
  if (canonicalDigest(material) !== evidence.digest) return 'evidence_digest_mismatch'
  if (input.source === undefined || evidence.source !== input.source) {
    return 'evidence_source_mismatch'
  }
  if (
    evidence.invocationRef !== input.invocationRef ||
    evidence.attemptRef !== input.attemptRef
  ) return 'evidence_attempt_mismatch'
  if (evidence.effectGeneration !== input.effectGeneration) {
    return 'evidence_generation_stale'
  }
  if (
    Date.parse(evidence.observedAt) > Date.parse(input.now) ||
    Date.parse(evidence.observedAt) < Date.parse(input.notBefore)
  ) return 'evidence_time_invalid'
  if (input.verifySourceEvidence?.(evidence) !== true) return 'evidence_source_unverified'
  return undefined
}
