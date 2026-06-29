const brand = Symbol('ae.brand')

export type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name
}

export type OwnerId = Brand<string, 'OwnerId'>
export type BusinessId = Brand<string, 'BusinessId'>
export type ServiceId = Brand<string, 'ServiceId'>
export type ClaimId = Brand<string, 'ClaimId'>
export type Slug = Brand<string, 'Slug'>
export type OperationKey = Brand<string, 'OperationKey'>
export type CorrelationId = Brand<string, 'CorrelationId'>
export type SourceHash = Brand<string, 'SourceHash'>
export type AuditEventId = Brand<string, 'AuditEventId'>
export type BillingOperationId = Brand<string, 'BillingOperationId'>
export type BillingReceiptId = Brand<string, 'BillingReceiptId'>
export type BillingProviderEventId = Brand<string, 'BillingProviderEventId'>
export type BillingReconciliationId = Brand<string, 'BillingReconciliationId'>
export type BillingOfferId = Brand<string, 'BillingOfferId'>
export type BillingSupportRecordId = Brand<string, 'BillingSupportRecordId'>
export type NotificationDispatchId = Brand<string, 'NotificationDispatchId'>
export type NotificationDispatchAttemptId = Brand<string, 'NotificationDispatchAttemptId'>
export type NotificationWebhookEventId = Brand<string, 'NotificationWebhookEventId'>
export type BusinessActionCardId = Brand<string, 'BusinessActionCardId'>
export type BuyerMandateId = Brand<string, 'BuyerMandateId'>
export type CapabilityRequestId = Brand<string, 'CapabilityRequestId'>
export type AuthorizationCheckpointId = Brand<string, 'AuthorizationCheckpointId'>
export type GuardrailDecisionEvidenceId = Brand<string, 'GuardrailDecisionEvidenceId'>
export type ExternalEvidenceEventId = Brand<string, 'ExternalEvidenceEventId'>
export type BusinessActionResultArtifactId = Brand<string, 'BusinessActionResultArtifactId'>
export type ActionReceiptId = Brand<string, 'ActionReceiptId'>
export type BusinessActionPrivateEvidenceRefId = Brand<string, 'BusinessActionPrivateEvidenceRefId'>
export type BusinessActionSupportRecordId = Brand<string, 'BusinessActionSupportRecordId'>
export type BusinessActionNoRepairId = Brand<string, 'BusinessActionNoRepairId'>

export type BrandedId =
  | OwnerId
  | BusinessId
  | ServiceId
  | ClaimId
  | Slug
  | OperationKey
  | CorrelationId
  | SourceHash
  | AuditEventId
  | BillingOperationId
  | BillingReceiptId
  | BillingProviderEventId
  | BillingReconciliationId
  | BillingOfferId
  | BillingSupportRecordId
  | NotificationDispatchId
  | NotificationDispatchAttemptId
  | NotificationWebhookEventId
  | BusinessActionCardId
  | BuyerMandateId
  | CapabilityRequestId
  | AuthorizationCheckpointId
  | GuardrailDecisionEvidenceId
  | ExternalEvidenceEventId
  | BusinessActionResultArtifactId
  | ActionReceiptId
  | BusinessActionPrivateEvidenceRefId
  | BusinessActionSupportRecordId
  | BusinessActionNoRepairId

export function brandNonEmpty<Value extends string, Name extends string>(value: Value, label: Name): Brand<Value, Name> {
  if (value.trim().length === 0) {
    throw new Error(`${label} cannot be empty`)
  }

  return value as Brand<Value, Name>
}
