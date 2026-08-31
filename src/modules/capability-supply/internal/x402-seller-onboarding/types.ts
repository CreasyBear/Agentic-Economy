export const X402_SELLER_ONBOARDING_STATES = [
  'draft',
  'claim_pending',
  'claimed',
  'claim_failed',
  'admitted',
  'canary_pending',
  'canary_failed',
  'reconciliation_required',
  'published',
  'stale',
  'withdrawn',
] as const

export type X402SellerOnboardingState = typeof X402_SELLER_ONBOARDING_STATES[number]

/** The exact seller, Operation revision, route, payment lane, and contract AE verified. */
export type X402SellerIdentity = Readonly<{
  accountRef: string
  businessId: string
  offeringRef: string
  offeringRevision: number
  offeringSourceHash: string
  resourceUrl: string
  method: string
  network: string
  asset: string
  payTo: string
  providerAmount: string
  scheme: string
  maxTimeoutSeconds: number
  transferMethod?: string
  paymentFlow?: string
  sourceDigest: string
  contractDigest: string
  pricingDigest: string
}>

export type X402CanaryPaymentOutcome = 'accepted' | 'settled' | 'failed' | 'ambiguous'

export type X402CanaryEvidence = Readonly<{
  canaryRef: string
  paymentOutcome: X402CanaryPaymentOutcome
  paid: boolean
  paymentEvidenceDigest: string
  contractValid: boolean
  usable: boolean
  resultEvidenceDigest: string
}>

export type X402SellerOnboardingCommandReceipt = Readonly<{
  commandId: string
  commandDigest: string
}>

export type X402SellerOnboarding = Readonly<{
  onboardingRef: string
  identity: X402SellerIdentity
  identityDigest: string
  state: X402SellerOnboardingState
  claimEvidenceDigest?: string
  admissionEvidenceDigest?: string
  activeCanaryRef?: string
  canaryEvidence?: X402CanaryEvidence
  observedDriftDigest?: string
  withdrawalEvidenceDigest?: string
  commandReceipts: readonly X402SellerOnboardingCommandReceipt[]
  createdAt: number
  updatedAt: number
}>

type ExpectedIdentity = Readonly<{
  commandId: string
  expectedIdentityDigest: string
}>

export type CreateX402SellerOnboardingCommand = Readonly<{
  kind: 'create'
  commandId: string
  onboardingRef: string
  identity: X402SellerIdentity
}>

export type X402SellerOnboardingCommand =
  | (ExpectedIdentity & Readonly<{ kind: 'request_claim' }>)
  | (ExpectedIdentity & Readonly<{
      kind: 'record_claim'
      outcome: 'verified' | 'failed'
      evidenceDigest: string
    }>)
  | (ExpectedIdentity & Readonly<{ kind: 'admit'; evidenceDigest: string }>)
  | (ExpectedIdentity & Readonly<{ kind: 'request_canary'; canaryRef: string }>)
  | (ExpectedIdentity & Readonly<{ kind: 'record_canary' } & X402CanaryEvidence>)
  | (ExpectedIdentity & Readonly<{ kind: 'record_reconciliation' } & X402CanaryEvidence>)
  | (ExpectedIdentity & Readonly<{ kind: 'observe_identity'; observedIdentity: X402SellerIdentity }>)
  | (ExpectedIdentity & Readonly<{ kind: 'withdraw'; evidenceDigest: string }>)

export type X402SellerOnboardingRefusal =
  | 'already_exists'
  | 'identity_mismatch'
  | 'integrity_failure'
  | 'invalid_command'
  | 'invalid_identity'
  | 'invalid_time'
  | 'invalid_transition'
  | 'operation_key_conflict'

export type X402SellerOnboardingResult =
  | Readonly<{ kind: 'applied'; onboarding: X402SellerOnboarding }>
  | Readonly<{ kind: 'replayed'; onboarding: X402SellerOnboarding }>
  | Readonly<{ kind: 'refused'; reason: X402SellerOnboardingRefusal }>
