import type {
  ActionReceiptId,
  AuthorizationCheckpointId,
  BusinessActionCardId,
  BusinessActionNoRepairId,
  BusinessActionPrivateEvidenceRefId,
  BusinessActionResultArtifactId,
  BusinessActionSupportRecordId,
  BusinessId,
  BuyerMandateId,
  CapabilityRequestId,
  CorrelationId,
  ExternalEvidenceEventId,
  GuardrailDecisionEvidenceId,
  OperationKey,
  OwnerId,
  ServiceId,
  SourceHash,
} from '@/modules/common/ids'

export const BusinessActionSlug = 'provision-paid-intake-endpoint' as const
export type BusinessActionSlug = typeof BusinessActionSlug

export const BusinessActionSlugValues = [BusinessActionSlug] as const

export const BusinessActionCardStatusValues = ['active', 'disabled', 'stale'] as const
export type BusinessActionCardStatus = (typeof BusinessActionCardStatusValues)[number]

export const BusinessActionCardPostureValues = ['proposal_only'] as const
export type BusinessActionCardPosture = (typeof BusinessActionCardPostureValues)[number]

export const BuyerMandateStatusValues = ['active', 'expired', 'revoked'] as const
export type BuyerMandateStatus = (typeof BuyerMandateStatusValues)[number]

export const CapabilityRequestStatusValues = [
  'proposed',
  'checkpoint_pending',
  'accepted',
  'refused',
  'clarification_required',
  'proof_gap',
  'expired',
] as const
export type CapabilityRequestStatus = (typeof CapabilityRequestStatusValues)[number]

export const AuthorizationCheckpointDecisionValues = [
  'accepted',
  'refused',
  'clarification_required',
  'proof_gap',
  'expired',
] as const
export type AuthorizationCheckpointDecision = (typeof AuthorizationCheckpointDecisionValues)[number]

export const BusinessActionGuardrailProviderValues = ['nemo_guardrails', 'nemotron'] as const
export type BusinessActionGuardrailProvider = (typeof BusinessActionGuardrailProviderValues)[number]

export const BusinessActionGuardrailDecisionValues = ['allow', 'block', 'refusal'] as const
export type BusinessActionGuardrailDecision = (typeof BusinessActionGuardrailDecisionValues)[number]

export const BusinessActionExternalEvidenceProviderValues = [
  'hermes',
  'stripe_test_mode',
  'link_cli_test_mode',
  'endpoint_host',
] as const
export type BusinessActionExternalEvidenceProvider = (typeof BusinessActionExternalEvidenceProviderValues)[number]

export const BusinessActionExternalEvidenceStatusValues = [
  'accepted',
  'duplicate',
  'rejected',
  'held_for_operator',
] as const
export type BusinessActionExternalEvidenceStatus = (typeof BusinessActionExternalEvidenceStatusValues)[number]

export const HermesEvidenceKindValues = ['scope', 'select', 'request', 'execute', 'report'] as const
export type HermesEvidenceKind = (typeof HermesEvidenceKindValues)[number]

export const BusinessActionResultArtifactRequirementValues = [
  'endpoint_descriptor',
  'json_schema',
  'private_endpoint_provisioning_payment_gate_ref',
] as const
export type BusinessActionResultArtifactRequirement = (typeof BusinessActionResultArtifactRequirementValues)[number]

export const BusinessActionResultArtifactStatusValues = ['complete', 'proof_gap'] as const
export type BusinessActionResultArtifactStatus = (typeof BusinessActionResultArtifactStatusValues)[number]

export const ActionReceiptOutcomeValues = [
  'success',
  'refused',
  'clarification_required',
  'proof_gap',
  'evidence_mismatch',
  'tampered',
  'expired',
  'stale_card',
  'unbound_provider_event',
] as const
export type ActionReceiptOutcome = (typeof ActionReceiptOutcomeValues)[number]

export const ReceiptReconstructionStatusValues = [
  'complete',
  'incomplete',
  'proof_gap',
  'tampered',
  'evidence_mismatch',
  'stale_source',
  'expired_mandate',
  'unbound_provider_event',
  'refused_no_consequence',
] as const
export type ReceiptReconstructionStatus = (typeof ReceiptReconstructionStatusValues)[number]

export const BusinessActionSupportStatusValues = ['open', 'resolved', 'no_repair'] as const
export type BusinessActionSupportStatus = (typeof BusinessActionSupportStatusValues)[number]

export const BusinessActionOperatorControlKeyValues = [
  'business_actions_enabled',
  'business_action_attempts_enabled',
] as const
export type BusinessActionOperatorControlKey = (typeof BusinessActionOperatorControlKeyValues)[number]

export const BusinessActionCardDefaults = {
  actionSlug: BusinessActionSlug,
  posture: 'proposal_only',
  callable: false,
  paymentRequired: false,
  ownerApprovalRequired: true,
  receiptRequired: true,
} as const

export type BusinessActionCurrency = 'aud' | 'usd'

export type BusinessActionCard = {
  id: BusinessActionCardId | string
  actionSlug: BusinessActionSlug
  version: number
  sourceHash: SourceHash | string
  status: BusinessActionCardStatus
  publicLabel: string
  serviceId?: ServiceId
  posture: BusinessActionCardPosture
  callable: false
  paymentRequired: false
  ownerApprovalRequired: true
  receiptRequired: true
  updatedAt: number
}

export type BuyerMandate = {
  id: BuyerMandateId
  buyerRef: string
  allowedBusinessId: BusinessId
  allowedActionSlug: BusinessActionSlug
  maxAmountCents?: number
  currency?: BusinessActionCurrency
  status: BuyerMandateStatus
  mandateHash: SourceHash
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  createdAt: number
  expiresAt: number
  revokedAt?: number
}

export type CapabilityRequest = {
  id: CapabilityRequestId
  cardId: BusinessActionCardId
  cardVersion: number
  cardHash: SourceHash
  mandateId: BuyerMandateId
  mandateHash: SourceHash
  actionSlug: BusinessActionSlug
  businessId: BusinessId
  serviceId?: ServiceId
  amountCents?: number
  currency?: BusinessActionCurrency
  requestHash: SourceHash
  status: CapabilityRequestStatus
  requestedBy: 'buyer' | 'hermes' | 'operator'
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  requestedAt: number
  expiresAt: number
}

export type AuthorizationCheckpoint = {
  id: AuthorizationCheckpointId
  requestId: CapabilityRequestId
  actionSlug: BusinessActionSlug
  businessId: BusinessId
  decision: AuthorizationCheckpointDecision
  reasonCode: string
  requestHash: SourceHash
  checkpointHash: SourceHash
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  ownerId?: OwnerId
  ownerDecisionRef?: string
  decidedAt: number
  expiresAt: number
}

export type GuardrailDecisionEvidence = {
  id: GuardrailDecisionEvidenceId
  requestId: CapabilityRequestId
  actionSlug: BusinessActionSlug
  policyHash: SourceHash
  requestHash: SourceHash
  provider: BusinessActionGuardrailProvider
  modelName: string
  modelVersion: string
  decision: BusinessActionGuardrailDecision
  privateTraceRefHash: SourceHash
  payloadHash: SourceHash
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  recordedAt: number
}

export type ExternalEvidenceEvent = {
  id: ExternalEvidenceEventId
  requestId: CapabilityRequestId
  checkpointId: AuthorizationCheckpointId
  actionSlug: BusinessActionSlug
  provider: BusinessActionExternalEvidenceProvider
  status: BusinessActionExternalEvidenceStatus
  providerRefHash: SourceHash
  payloadHash: SourceHash
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  amountCents?: number
  currency?: BusinessActionCurrency
  reason?: string
  receivedAt: number
}

export type HermesEvidenceEvent = ExternalEvidenceEvent & {
  provider: 'hermes'
  evidenceKind: HermesEvidenceKind
}

export type BusinessActionResultArtifact = {
  id: BusinessActionResultArtifactId
  requestId: CapabilityRequestId
  checkpointId: AuthorizationCheckpointId
  actionSlug: BusinessActionSlug
  status: BusinessActionResultArtifactStatus
  endpointDescriptorHash?: SourceHash
  jsonSchemaHash?: SourceHash
  privateEndpointProvisioningPaymentGateRefHash?: SourceHash
  artifactHash: SourceHash
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  recordedAt: number
  proofGapReason?: string
}

export type BusinessActionPrivateEvidenceRef = {
  id: BusinessActionPrivateEvidenceRefId
  requestId: CapabilityRequestId
  retentionClass: 'business_action_private_evidence'
  accessPolicy: 'owner_admin_operator_only'
  payloadHash: SourceHash
  privatePayloadRef?: string
  ttlExpiresAt: number
  redactedAt?: number
}

export type ActionReceipt = {
  id: ActionReceiptId
  requestId: CapabilityRequestId
  actionSlug: BusinessActionSlug
  outcome: ActionReceiptOutcome
  cardHash: SourceHash
  cardVersion: number
  mandateHash: SourceHash
  requestHash: SourceHash
  checkpointHash?: SourceHash
  policyHash?: SourceHash
  externalEvidenceRefHashes: readonly SourceHash[]
  guardrailEvidenceRefHashes: readonly SourceHash[]
  resultArtifactHash?: SourceHash
  previousReceiptHash?: SourceHash
  signatureRefHash: SourceHash
  reconstructionStatus: ReceiptReconstructionStatus
  payloadHash: SourceHash
  recordedAt: number
}

export type PublicActionReceiptReadback = {
  receiptId: ActionReceiptId
  actionSlug: BusinessActionSlug
  outcome: ActionReceiptOutcome
  reconstructionStatus: ReceiptReconstructionStatus
  cardVersion: number
  hashes: {
    cardHash: SourceHash
    mandateHash: SourceHash
    requestHash: SourceHash
    checkpointHash?: SourceHash
    resultArtifactHash?: SourceHash
  }
  labels: readonly string[]
  recordedAt: number
}

export type BusinessActionSupportRecord = {
  id: BusinessActionSupportRecordId
  actionSlug: BusinessActionSlug
  businessId: BusinessId
  status: BusinessActionSupportStatus
  reason: string
  evidenceRefs: readonly string[]
  claimDisablePath: BusinessActionOperatorControlKey
  operatorNextAction: string
  sourceHash: SourceHash
  correlationId: CorrelationId
  createdAt: number
  updatedAt: number
}

export type BusinessActionNoRepairRecord = {
  id: BusinessActionNoRepairId
  requestId: CapabilityRequestId
  reason: string
  evidenceRefs: readonly string[]
  noRepairHash: SourceHash
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  markedBy: string
  markedAt: number
}

export function isBusinessActionSlug(value: string): value is BusinessActionSlug {
  return (BusinessActionSlugValues as readonly string[]).includes(value)
}

export function isBusinessActionExternalEvidenceProvider(value: string): value is BusinessActionExternalEvidenceProvider {
  return (BusinessActionExternalEvidenceProviderValues as readonly string[]).includes(value)
}

export function isBusinessActionGuardrailProvider(value: string): value is BusinessActionGuardrailProvider {
  return (BusinessActionGuardrailProviderValues as readonly string[]).includes(value)
}
