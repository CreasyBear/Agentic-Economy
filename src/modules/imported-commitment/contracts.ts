export type ImportedCommitmentActor = Readonly<{
  principalRef: string
  callerRef: string
}>

export type ImportedCommitmentValidity =
  | Readonly<{ kind: 'valid_until'; validUntil: number }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'withdrawn'; withdrawnAt: number; evidenceRefs: readonly string[] }>

export type ImportedCommitmentTerm = Readonly<{
  name: string
  value: string
  unit?: string
}>

export type ImportedCommitmentClaim = Readonly<{
  claimRef: string
  principalRef: string
  importedBy: Readonly<{ callerRef: string }>
  issuer: Readonly<{ ref: string; name?: string }>
  observer: Readonly<{ ref: string; name?: string }>
  subject: Readonly<{ kind: string; ref: string }>
  commitmentKind: string
  terms: readonly ImportedCommitmentTerm[]
  source: Readonly<{
    system: string
    reference: string
    digest: string
  }>
  observedAt: number
  assertedAt?: number
  validity: ImportedCommitmentValidity
  evidenceRefs: readonly string[]
  verification: 'imported_unverified'
  observationPosture: 'imported_claim_only'
  claimDigest: string
}>

export type ImportedCommitmentSourceRecord = Readonly<{
  claim: ImportedCommitmentClaim
  /** Action-specific source custody only. Neutral Request/control records never receive these bytes. */
  sourceBytes: readonly number[]
}>

export type ImportedCommitmentReferenceIdentity = Readonly<{
  kind: 'imported_commitment_reference'
  claimRef: string
  claimDigest: string
  principalRef: string
  issuerRef: string
  observerRef: string
  subject: Readonly<{ kind: string; ref: string }>
  commitmentKind: string
  source: Readonly<{ system: string; reference: string; digest: string }>
  observedAt: number
  assertedAt?: number
  validity: ImportedCommitmentValidity
  evidenceRefs: readonly string[]
  verification: 'imported_unverified'
  observationPosture: 'imported_claim_only'
  authority: 'none'
  effect: 'none'
  providerAdmission: 'not_established'
}>

export type ImportedCommitmentRowPort = Readonly<{
  load(claimRef: string): ImportedCommitmentSourceRecord | null
  insert(record: ImportedCommitmentSourceRecord): void
}>
