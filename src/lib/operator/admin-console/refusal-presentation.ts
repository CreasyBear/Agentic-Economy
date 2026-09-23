import type { AnyAdminRefusalCode } from './contracts'

type AdminRefusalPresentation = Readonly<{
  certainty: 'not_applied' | 'unknown'
  retry: 'same_key' | 'new_key' | 'no'
  copy: string
  nextStep: string
}>

const refreshAuthorization: AdminRefusalPresentation = {
  certainty: 'not_applied',
  retry: 'new_key',
  copy: 'Command authorization expired or is unavailable.',
  nextStep: 'Refresh authorization and submit a new operation key.',
}
const invalidAuthorization: AdminRefusalPresentation = {
  certainty: 'not_applied',
  retry: 'no',
  copy: 'This command could not be verified.',
  nextStep: 'Check command authorization; do not repeat the unchanged request.',
}
const noAuthority: AdminRefusalPresentation = {
  certainty: 'not_applied',
  retry: 'no',
  copy: 'Your account does not have the Admin role for this action.',
  nextStep: 'Ask an Admin owner for access.',
}
const reverify: AdminRefusalPresentation = {
  certainty: 'not_applied',
  retry: 'same_key',
  copy: 'Reverify before making this change.',
  nextStep: 'Complete Clerk reverification, then resubmit.',
}
const correctEvidence: AdminRefusalPresentation = {
  certainty: 'not_applied',
  retry: 'new_key',
  copy: 'A valid reason and evidence are required.',
  nextStep: 'Correct the named field, then resubmit.',
}
const keyConflict: AdminRefusalPresentation = {
  certainty: 'not_applied',
  retry: 'new_key',
  copy: 'This operation key belongs to another command.',
  nextStep: 'Review the previous receipt and use a new key for a corrected command.',
}
const changedTarget: AdminRefusalPresentation = {
  certainty: 'not_applied',
  retry: 'new_key',
  copy: 'The reviewed record changed or expired.',
  nextStep: 'Reload evidence and create a new command or proposal.',
}
const noLongerActionable: AdminRefusalPresentation = {
  certainty: 'not_applied',
  retry: 'no',
  copy: 'This target is no longer actionable.',
  nextStep: 'Open the current object or proposal and follow its stated status.',
}
const refusedPolicyProof: AdminRefusalPresentation = {
  certainty: 'not_applied',
  retry: 'no',
  copy: 'The commercial-policy proof was refused.',
  nextStep: 'Reverify for stale proof; otherwise inspect policy and authority evidence.',
}
const stalePolicyProof: AdminRefusalPresentation = {
  ...refusedPolicyProof,
  retry: 'new_key',
}
const approvalRequired: AdminRefusalPresentation = {
  certainty: 'not_applied',
  retry: 'no',
  copy: 'This change requires a second Admin approval.',
  nextStep: 'Create a proposal for another Admin owner to review.',
}
const approvalActorNotOwner: AdminRefusalPresentation = {
  certainty: 'not_applied',
  retry: 'no',
  copy: 'Only an Admin owner may approve this proposal.',
  nextStep: 'Ask an Admin owner to review the proposal.',
}

// A refused receipt is issued before an effect, or commits as a terminal refusal.
// A lost response after commit is not a refusal: recover it with the same operation key.
export const ADMIN_REFUSAL_PRESENTATION = {
  missing_membership: noAuthority,
  inactive_membership: noAuthority,
  action_not_allowed: noAuthority,
  missing_source_write_admission: invalidAuthorization,
  missing_source_write_secret: invalidAuthorization,
  source_write_crypto_unavailable: refreshAuthorization,
  source_write_scope_mismatch: invalidAuthorization,
  source_write_key_family_mismatch: invalidAuthorization,
  unknown_source_write_key_id: invalidAuthorization,
  invalid_source_write_key_id: invalidAuthorization,
  source_write_operation_mismatch: invalidAuthorization,
  source_write_correlation_mismatch: invalidAuthorization,
  source_write_command_mismatch: invalidAuthorization,
  missing_source_write_request: invalidAuthorization,
  invalid_source_write_request: invalidAuthorization,
  source_write_method_mismatch: invalidAuthorization,
  source_write_origin_mismatch: invalidAuthorization,
  source_write_target_origin_mismatch: invalidAuthorization,
  source_write_path_mismatch: invalidAuthorization,
  source_write_query_mismatch: invalidAuthorization,
  source_write_body_mismatch: invalidAuthorization,
  invalid_source_write_body_digest: invalidAuthorization,
  stale_source_write_admission: refreshAuthorization,
  invalid_source_write_signature: invalidAuthorization,
  mfa_reverification_required: reverify,
  idempotency_conflict: keyConflict,
  target_changed: changedTarget,
  admin_invalid_reason: correctEvidence,
  admin_missing_evidence: correctEvidence,
  business_not_found: noLongerActionable,
  suppression_unchanged: noLongerActionable,
  dispute_not_found: noLongerActionable,
  dispute_already_closed: noLongerActionable,
  principal_not_found: noLongerActionable,
  membership_already_active: noLongerActionable,
  membership_not_found: noLongerActionable,
  last_owner_admin: noLongerActionable,
  publication_not_found: noLongerActionable,
  source_authority_not_reviewable: noLongerActionable,
  policy_not_found: noLongerActionable,
  proof_stale: stalePolicyProof,
  proof_replayed: refusedPolicyProof,
  authority_mismatch: refusedPolicyProof,
  approval_required: approvalRequired,
  approval_not_found: noLongerActionable,
  approval_same_actor: noLongerActionable,
  approval_digest_mismatch: changedTarget,
  approval_expired: changedTarget,
  approval_already_resolved: noLongerActionable,
  approval_actor_not_owner_admin: approvalActorNotOwner,
} satisfies Record<AnyAdminRefusalCode, AdminRefusalPresentation>
