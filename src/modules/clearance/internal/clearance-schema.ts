import { z } from 'zod'

export const ClearanceCredentialCustodyStatusValues = [
  'gateway_held',
  'gateway_resolved_from_vault',
  'unsafe_agent_visible',
  'agent_has_raw_credential',
  'no_mutation_credential',
  'unknown',
] as const
export type ClearanceCredentialCustodyStatus = (typeof ClearanceCredentialCustodyStatusValues)[number]

export const ClearanceEnforcementModeValues = [
  'reference_fixture',
  'customer_gateway_adapter',
  'provider_gateway',
  'hosted_control_plane_only',
  'unknown',
] as const
export type ClearanceEnforcementMode = (typeof ClearanceEnforcementModeValues)[number]

export const ClearanceActionClassValues = ['contact_follow_up', 'business_action'] as const
export type ClearanceActionClass = (typeof ClearanceActionClassValues)[number]

export const ClearanceSignaturePostureValues = ['local_hmac', 'unsigned', 'external_signature', 'unverified'] as const
export type ClearanceSignaturePosture = (typeof ClearanceSignaturePostureValues)[number]

export const ClearanceSignedRecordKindValues = ['greenlight', 'receipt'] as const
export type ClearanceSignedRecordKind = (typeof ClearanceSignedRecordKindValues)[number]

export const ClearanceGatewayCheckStatusValues = ['accepted', 'rejected', 'proof_gap'] as const
export type ClearanceGatewayCheckStatus = (typeof ClearanceGatewayCheckStatusValues)[number]

export const ClearanceIsolationStateStatusValues = ['available', 'isolated', 'proof_gap'] as const
export type ClearanceIsolationStateStatus = (typeof ClearanceIsolationStateStatusValues)[number]

export const clearanceCredentialCustodyStatusSchema = z.enum(ClearanceCredentialCustodyStatusValues)
export const clearanceEnforcementModeSchema = z.enum(ClearanceEnforcementModeValues)
export const clearanceActionClassSchema = z.enum(ClearanceActionClassValues)
export const clearanceSignaturePostureSchema = z.enum(ClearanceSignaturePostureValues)
export const clearanceSignedRecordKindSchema = z.enum(ClearanceSignedRecordKindValues)
export const clearanceGatewayCheckStatusSchema = z.enum(ClearanceGatewayCheckStatusValues)
export const clearanceIsolationStateStatusSchema = z.enum(ClearanceIsolationStateStatusValues)

export const clearanceActionContractPostureSchema = z.strictObject({
  actionClass: clearanceActionClassSchema,
  credentialCustodyStatus: clearanceCredentialCustodyStatusSchema,
  enforcementMode: clearanceEnforcementModeSchema,
})
export type ClearanceActionContractPosture = z.infer<typeof clearanceActionContractPostureSchema>

export function clearanceActionContractPostureFor(actionClass: ClearanceActionClass): ClearanceActionContractPosture {
  return {
    actionClass,
    credentialCustodyStatus: 'no_mutation_credential',
    enforcementMode: 'customer_gateway_adapter',
  }
}

export function isUnsafeCredentialCustodyStatus(status: ClearanceCredentialCustodyStatus): boolean {
  return status === 'unsafe_agent_visible' || status === 'agent_has_raw_credential' || status === 'unknown'
}
