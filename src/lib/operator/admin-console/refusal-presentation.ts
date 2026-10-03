import { ADMIN_ACCESS_REFUSED_COPY, type AnyAdminRefusalCode } from './contracts'

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
  copy: ADMIN_ACCESS_REFUSED_COPY,
  nextStep: 'Ask an Admin owner for access.',
}
const reverify: AdminRefusalPresentation = {
  certainty: 'not_applied',
  retry: 'same_key',
  copy: 'A fresh MFA claim is required for this guarded change.',
  nextStep: 'Complete MFA in Account security, then retry this command. No change was made.',
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
  account_not_found: noLongerActionable,
  treasury_configuration_unavailable: { certainty: 'not_applied', retry: 'new_key', copy: 'Treasury configuration needs attention.', nextStep: 'Restore the treasury configuration before reviewing resume again.' },
  treasury_observation_stale: { certainty: 'not_applied', retry: 'new_key', copy: 'The wallet observation is too old to resume payments.', nextStep: 'Wait for a fresh wallet observation, then review resume again.' },
  treasury_reconciliation_stale: { certainty: 'not_applied', retry: 'new_key', copy: 'Treasury reconciliation is too old to resume payments.', nextStep: 'Wait for a completed reconciliation, then review resume again.' },
  treasury_reconciliation_required: { certainty: 'not_applied', retry: 'new_key', copy: 'Treasury reconciliation must be resolved before payments resume.', nextStep: 'Review the treasury checks and unresolved Calls, then try again.' },
  treasury_capacity_unavailable: { certainty: 'not_applied', retry: 'new_key', copy: 'Treasury funds or the rolling spend limit cannot support new payments.', nextStep: 'Refill the treasury or wait for spend capacity, then review resume again.' },
  treasury_thresholds_invalid: {
    certainty: 'not_applied', retry: 'no',
    copy: 'The treasury thresholds are invalid.',
    nextStep: 'Use nonnegative USDC amounts with a positive target at least as high as the low-water mark.',
  },
  promotional_credit_invalid: {
    certainty: 'not_applied', retry: 'no',
    copy: 'The promotional credit amount or expiry is invalid.',
    nextStep: 'Check the amount and choose a future expiry before creating a new command.',
  },
  payments_not_ready: { certainty: 'not_applied', retry: 'new_key', copy: 'Payments are not ready to resume.', nextStep: 'Check Payment readiness in Admin overview. All checks must pass before reviewing resume again.' },
  environment_mismatch: {
    certainty: 'not_applied', retry: 'no',
    copy: 'This workspace is not in the current payment environment.',
    nextStep: 'Review the deployment and workspace before creating a new command.',
  },
  proof_stale: stalePolicyProof,
  proof_replayed: refusedPolicyProof,
  authority_mismatch: refusedPolicyProof,
  commercial_policy_deployment_profile_invalid: {
    certainty: 'not_applied', retry: 'new_key',
    copy: 'The current custody maximum cannot support the proposed treasury buffer.',
    nextStep: 'Restore a valid custody cap at least as high as the policy floor, then review and submit a new command.',
  },
  approval_required: approvalRequired,
  approval_not_found: noLongerActionable,
  approval_same_actor: noLongerActionable,
  approval_digest_mismatch: changedTarget,
  approval_expired: {
    certainty: 'not_applied',
    retry: 'no',
    copy: 'This approval expired without changing the target.',
    nextStep: 'Review the current target and create a new proposal. The expired proposal remains in Audit.',
  },
  approval_already_resolved: noLongerActionable,
  approval_actor_not_owner_admin: approvalActorNotOwner,
} satisfies Record<AnyAdminRefusalCode, AdminRefusalPresentation>
