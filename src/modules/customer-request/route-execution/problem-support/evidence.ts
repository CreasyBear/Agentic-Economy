import { canonicalDigest } from '@/modules/common/canonical-digest'

export type AttemptEvidenceItem = Readonly<{
  evidenceId: string
  outputPointer: string
  schemaIdentity: string
  valueDigest: string
}>

export type LabeledEvidence = Readonly<{ receiptRef: string; label: string }>

export function evidenceReceiptRef(
  attemptRef: string,
  evidence: AttemptEvidenceItem,
): string {
  return `evidence:${canonicalDigest({ attemptRef, evidence })}`
}

export function buildAttemptEvidenceLabelMap(
  attemptRef: string,
  evidence: readonly AttemptEvidenceItem[] | undefined,
): Map<string, string> {
  return new Map((evidence ?? []).map((item, index) => [
    evidenceReceiptRef(attemptRef, item),
    `Result evidence ${index + 1}`,
  ]))
}

export function labelAttemptEvidence(
  attempt: Readonly<{
    attemptRef: string
    evidence?: readonly AttemptEvidenceItem[]
  }>,
  receiptRefs: readonly string[],
): LabeledEvidence[] {
  const available = buildAttemptEvidenceLabelMap(attempt.attemptRef, attempt.evidence)
  return receiptRefs.flatMap((receiptRef) => {
    const label = available.get(receiptRef)
    return label === undefined ? [] : [{ receiptRef, label }]
  })
}

export function labeledAvailableEvidence(
  attempt: Readonly<{
    attemptRef: string
    evidence?: readonly AttemptEvidenceItem[]
  }>,
): LabeledEvidence[] {
  return [...buildAttemptEvidenceLabelMap(attempt.attemptRef, attempt.evidence).entries()]
    .map(([receiptRef, label]) => ({ receiptRef, label }))
}
