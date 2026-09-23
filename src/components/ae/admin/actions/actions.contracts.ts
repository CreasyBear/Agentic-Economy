import { z } from 'zod'

import type {
  AdminActionInput,
  AdminApprovalIntent,
  AdminCommandAction,
  AdminCommandReceipt,
  AdminSuccessCodeByAction,
  AdminReasonCodeByAction,
} from '@/lib/operator/admin-console/contracts'
import type { AdminRole } from '@/modules/security/public'

export type AdminCommandRequest = z.output<typeof adminCommandRequestSchema>

export type AdminActionSheetProps = {
  [A in AdminCommandAction]: Readonly<{
    action: A
    input: AdminActionInput[A] | Extract<AdminCommandRequest, { action: A }>['input']
    targetRefs: readonly { label: string; value: string; href?: string }[]
    currentStateDigest?: string
    open: boolean
    onOpenChange: (open: boolean) => void
    approval?: AdminApprovalIntent
    initialReasonCode?: AdminReasonCodeByAction[A]
    initialEvidenceRefs?: readonly string[]
  }>
}[AdminCommandAction]

export type AdminActionSheetPhase = 'reason' | 'evidence' | 'proof' | 'preview' | 'confirm' | 'submitting' | 'receipt'
export type AdminActionSheetReceipt = AdminCommandReceipt<AdminCommandAction>
export type AdminActionSheetState = Readonly<{
  phase: AdminActionSheetPhase
  reasonCode: string
  evidenceRefs: readonly string[]
  typedEvidence: string
  receipt: AdminActionSheetReceipt | null
  error: string | null
  approval: AdminApprovalIntent
}>
export type AdminActionSheetController = AdminActionSheetState & Readonly<{
  role: AdminRole | null
  allowed: boolean
  clerkFvaAbsent: boolean
  setReason: (value: string) => void
  setEvidence: (value: string, selected: boolean) => void
  setTypedEvidence: (value: string) => void
  next: () => void
  back: () => void
  submit: (intent?: AdminApprovalIntent) => Promise<void>
  retry: (newKey: boolean) => Promise<void>
  edit: () => void
}>

export type ReasonSelectProps = Readonly<{
  action: AdminCommandAction
  value: string
  onChange: (value: string) => void
}>
export type EvidenceRefsPickerProps = Readonly<{
  targetRefs: AdminActionSheetProps['targetRefs']
  selected: readonly string[]
  typedEvidence: string
  onToggle: (value: string, selected: boolean) => void
  onType: (value: string) => void
  readOnly?: boolean
}>
export type AuditPreviewProps = Readonly<{
  action: AdminCommandAction
  targetRefs: AdminActionSheetProps['targetRefs']
  reasonCode: string
  evidenceRefs: readonly string[]
  approval: AdminApprovalIntent
}>
export type ReceiptViewProps = Readonly<{
  receipt: AdminActionSheetReceipt
  onPropose: () => void
  onRetry: (newKey: boolean) => void
  onEdit: () => void
  allowEdit: boolean
}>

export const ADMIN_ACTION_COPY = {
  set_business_suppression: 'Change Business suppression',
  close_removal_dispute: 'Close removal dispute',
  grant_admin_membership: 'Grant Admin membership',
  revoke_admin_membership: 'Revoke Admin membership',
  verify_capability_source_authority: 'Verify source authority',
  change_commercial_policy: 'Change commercial policy',
} satisfies Record<AdminCommandAction, string>

export const ADMIN_REASON_OPTIONS = {
  set_business_suppression: ['policy_violation', 'legal_notice', 'provider_request', 'fraud_suspected', 'suppression_lifted_after_review'],
  close_removal_dispute: ['upheld', 'refused', 'withdrawn_by_requester'],
  grant_admin_membership: ['onboarding', 'role_change'],
  revoke_admin_membership: ['offboarding', 'role_change', 'compromise_suspected'],
  verify_capability_source_authority: ['evidence_verified', 'evidence_insufficient'],
  change_commercial_policy: ['pricing_update', 'correction'],
} as const satisfies { [A in AdminCommandAction]: readonly AdminReasonCodeByAction[A][] }
export const ADMIN_REASON_LABELS: Record<AdminReasonCodeByAction[AdminCommandAction], string> = {
  policy_violation: 'Policy violation',
  legal_notice: 'Legal notice',
  provider_request: 'Provider request',
  fraud_suspected: 'Suspected fraud',
  suppression_lifted_after_review: 'Suppression lifted after review',
  upheld: 'Upheld',
  refused: 'Refuse the removal request',
  withdrawn_by_requester: 'Withdrawn by requester',
  onboarding: 'Onboarding',
  role_change: 'Role change',
  offboarding: 'Offboarding',
  compromise_suspected: 'Suspected compromise',
  evidence_verified: 'Evidence verified',
  evidence_insufficient: 'Evidence insufficient',
  pricing_update: 'Pricing update',
  correction: 'Correction',
}

const commercialControlSchema = z.discriminatedUnion('family', [
  z.strictObject({ family: z.literal('commercial_perimeter'), sellerModel: z.literal('principal_reseller'), customerSegment: z.literal('business_only'), customerCryptoEntitlement: z.literal(false) }),
  z.strictObject({ family: z.literal('tax'), serviceFeeTaxBps: z.number(), callTaxBps: z.number().optional(), taxInvoiceIssuance: z.enum(['disabled_pending_approval', 'enabled']) }),
  z.strictObject({ family: z.literal('accounting_client_money'), minimumFundingPrincipalUnits: z.string(), maximumFundingPrincipalUnits: z.string(), fundingIncrementUnits: z.string(), legalCustomerMaximumAccessibleUnits: z.string(), balanceClassification: z.literal('customer_contract_liability') }),
  z.strictObject({ family: z.literal('privacy_retention'), evidenceRetentionDays: z.number(), legalHoldSupported: z.literal(true) }),
  z.strictObject({ family: z.literal('treasury_custody'), treasuryAsset: z.literal('USDC'), treasuryExponent: z.literal(6), minimumBufferUnits: z.string(), ledgerAuthority: z.literal('formance_community'), formanceLedgerVersion: z.string(), formanceGatewayVersion: z.string(), formanceSchemaVersion: z.string(), maximumSdkIntegerUnits: z.string(), architectureReviewCumulativeUnits: z.string(), deploymentClass: z.enum(['local_ci', 'synthetic_vps_fixture', 'real_money']), postgresProtection: z.enum(['disposable_fixture', 'managed_pitr']), recoveryPointObjectiveMinutes: z.number(), recoveryTimeObjectiveMinutes: z.number() }),
  z.strictObject({ family: z.literal('operations'), fundingServiceFeeBps: z.number(), buyerPricingMarginBps: z.number(), commitmentTtlMs: z.number(), formanceSdkVersion: z.string(), formanceSdkArtifactDigest: z.string(), backupControl: z.enum(['disposable_fixture', 'postgres_pitr']), restoreControl: z.enum(['disposable_rehearsed', 'production_rehearsed']), dailyCloseControl: z.enum(['not_required_fixture', 'human_signed']) }),
])

const approvalSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('execute') }),
  z.strictObject({ kind: z.literal('propose') }),
  z.strictObject({ kind: z.literal('approve'), proposalRef: z.string().min(1) }),
])

const sharedCommand = {
  operationKey: z.string().min(1),
  correlationId: z.string().min(1),
  evidenceRefs: z.array(z.string().trim().min(1)).min(1),
  expectedStateDigest: z.string().optional(),
  approval: approvalSchema,
}

export const adminCommandRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ ...sharedCommand, action: z.literal('set_business_suppression'), input: z.strictObject({ businessId: z.string().min(1), intent: z.enum(['suppress', 'unsuppress']) }), reasonCode: z.enum(ADMIN_REASON_OPTIONS.set_business_suppression) }),
  z.strictObject({ ...sharedCommand, action: z.literal('close_removal_dispute'), input: z.strictObject({ disputeId: z.string().min(1) }), reasonCode: z.enum(ADMIN_REASON_OPTIONS.close_removal_dispute) }),
  z.strictObject({ ...sharedCommand, action: z.literal('grant_admin_membership'), input: z.strictObject({ targetClerkUserId: z.string().min(1), targetTokenIdentifier: z.string().min(1), role: z.enum(['owner_admin', 'support', 'reviewer']) }), reasonCode: z.enum(ADMIN_REASON_OPTIONS.grant_admin_membership) }),
  z.strictObject({ ...sharedCommand, action: z.literal('revoke_admin_membership'), input: z.strictObject({ targetClerkUserId: z.string().min(1), targetTokenIdentifier: z.string().optional() }), reasonCode: z.enum(ADMIN_REASON_OPTIONS.revoke_admin_membership) }),
  z.strictObject({ ...sharedCommand, action: z.literal('verify_capability_source_authority'), input: z.strictObject({ publicationRef: z.string().min(1), expectedRevision: z.number().int(), expectedSourceDigest: z.string().min(1) }), reasonCode: z.enum(ADMIN_REASON_OPTIONS.verify_capability_source_authority) }),
  z.strictObject({ ...sharedCommand, action: z.literal('change_commercial_policy'), input: z.strictObject({ changeKind: z.enum(['activate', 'replace', 'suspend']), family: z.enum(['commercial_perimeter', 'tax', 'accounting_client_money', 'privacy_retention', 'treasury_custody', 'operations']), environment: z.enum(['sandbox', 'production']), policyRef: z.string().min(1), expectedCurrentPolicyRef: z.string().optional(), revision: z.number().int(), effectiveAt: z.number(), expiresAt: z.number(), control: commercialControlSchema }), reasonCode: z.enum(ADMIN_REASON_OPTIONS.change_commercial_policy) }),
])

export function parseAdminProposalCommand(action: AdminCommandAction, commandJson: string): AdminCommandRequest | null {
  let command: unknown
  try {
    command = JSON.parse(commandJson)
  } catch {
    return null
  }
  const material = z.strictObject({
    input: z.unknown(),
    reasonCode: z.string(),
    evidenceRefs: z.array(z.string()),
    expectedStateDigest: z.string().optional(),
  }).safeParse(command)
  if (!material.success) return null
  const candidate = adminCommandRequestSchema.safeParse({
    action,
    ...material.data,
    operationKey: 'proposal-validation',
    correlationId: 'proposal-validation',
    approval: { kind: 'execute' },
  })
  return candidate.success ? candidate.data : null
}

export const ADMIN_SUCCESS_COPY = {
  business_suppressed: 'Business suppressed',
  business_unsuppressed: 'Business suppression lifted',
  dispute_closed: 'Removal dispute closed',
  membership_granted: 'Admin membership granted',
  membership_revoked: 'Admin membership revoked',
  source_authority_verified: 'Source authority verified',
  source_authority_insufficient: 'Source authority not verified',
  commercial_policy_changed: 'Commercial policy changed',
} satisfies Record<AdminSuccessCodeByAction[AdminCommandAction], string>

export const ADMIN_ACTION_SHEET_COPY = {
  title: 'Review Admin command',
  description: 'Review the current record and evidence before submitting this change.',
  reason: 'Reason',
  selectReason: 'Select a reason',
  confirmEffect: 'This command cannot be undone from this page. Check the target before confirming.',
  proofNotice: 'Clerk will request reverification if your session needs it.',
  fvaUnavailable: 'Reverification is not configured for this deployment. Guarded actions will refuse until it is.',
  noEvidence: 'Add a verified evidence reference before continuing.',
  proposalUnavailable: 'This proposal cannot be reviewed because its command material is unavailable.',
  evidence: 'Evidence references',
  otherEvidence: 'Other evidence reference',
  selectEvidence: 'Select at least one evidence reference.',
  review: 'Review command',
  reverify: 'Reverify identity',
  continue: 'Continue',
  back: 'Back',
  submit: 'Submit command',
  confirm: 'Confirm irreversible change',
  processing: 'Submitting command…',
  retry: 'Retry',
  edit: 'Edit command',
  propose: 'Propose instead',
  permission: 'Your account does not have the Admin role for this action.',
  unavailable: 'Command outcome could not be confirmed. Review the current record before retrying.',
  approval: 'Approval intent',
  operation: 'Operation',
  close: 'Close',
  effectReference: 'Effect reference',
  auditReference: 'Audit reference',
  proposalReference: 'Proposal reference',
  proposalExpiry: (value: string) => `Expires ${value} Perth time.`,
} as const

export const SOURCE_AUTHORITY_REVIEW_COPY = {
  title: 'Review source authority',
  description: 'Confirm this exact publication only after independently verifying that the Provider controls the source.',
  source: 'Source',
  digest: 'Source digest',
  publication: 'Publication',
  revision: 'Revision',
  toolReference: 'Tool reference',
  open: 'Verify source authority',
} as const

export const ADMIN_AUDIT_ACTION_COPY = {
  membershipTitle: 'Admin membership',
  membershipDescription: 'Manage Admin access after checking the target and evidence.',
  approvalActionsTitle: 'Approve pending actions',
  approvalActionsDescription: 'Review the exact proposed command before approving.',
  targetClerkUserId: 'Clerk user ID',
  targetTokenIdentifier: 'Token identifier',
  role: 'Admin role',
  chooseRole: 'Choose a role',
  grant: 'Grant Admin membership',
  revoke: 'Revoke Admin membership',
  approve: 'Approve',
  approvalLoading: 'Loading pending approvals…',
  approvalDenied: 'Your account does not have the Admin role for this action.',
  proposal: 'Proposal',
  approvalUnavailable: 'Pending approvals could not be loaded. Try again later.',
  targetLabels: { businessId: 'Business ID', policyRef: 'Policy reference' },
  roleLabels: { owner_admin: 'Admin owner', support: 'Support', reviewer: 'Reviewer' },
} as const
