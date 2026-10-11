export type InteractiveAuthorityErrorCode =
  | 'identity_invalid'
  | 'authority_conflict'
  | 'binding_missing'
  | 'binding_ambiguous'
  | 'binding_inactive'
  | 'binding_untrusted'
  | 'credential_missing'
  | 'credential_ambiguous'
  | 'credential_mismatch'
  | 'credential_type_invalid'
  | 'credential_not_current'
  | 'session_not_current'
  | 'session_evidence_unavailable'
  | 'session_revocation_uninitialized'
  | 'authority_fact_invalid'
  | 'principal_missing'
  | 'principal_ambiguous'
  | 'principal_inactive'
  | 'principal_kind_invalid'
  | 'account_access_missing'
  | 'account_access_ambiguous'
  | 'account_missing'
  | 'account_ambiguous'
  | 'account_inactive'
  | 'ownership_missing'
  | 'ownership_ambiguous'
  | 'ownership_mismatch'
  | 'correlation_ref_invalid'
  | 'policy_revision_conflict'
  | 'preference_revision_conflict'
  | 'threshold_invalid'
  | 'event_kind_invalid'
  | 'payload_invalid'
  | 'mfa_required'
  | 'step_up_required'
  | 'personal_account_retired'
  | 'customer_abn_invalid'
  | 'legal_name_invalid'
  | 'billing_address_invalid'
  | 'tax_facts_revision_conflict'
  | 'tax_facts_correlation_mismatch'
  | 'legal_customer_unavailable'
  | 'legal_customer_rebinding_blocked'
  | 'workspace_confirmation_mismatch'
  | 'workspace_has_unsettled_obligations'
  | 'workspace_has_positive_credit_balance'
  | 'successor_not_active_member'
  | 'successor_same_as_incumbent'
  | 'successor_principal_inactive'
  | 'successor_not_human'
  | 'account_revision_conflict'
  | 'ownership_revision_conflict'
  | 'account_lifecycle_transition_forbidden'
  | 'workspace_already_closed'
  | 'directory_principal_missing'
  | 'idempotency_conflict'
  | 'funding_amount_invalid'
  | 'payment_mandate_missing'
  | 'monthly_spend_budget_units_invalid'
  | 'monthly_spend_budget_revision_conflict'
  | 'monthly_spend_budget_correlation_mismatch'
  | 'authority_mismatch'
  | 'payment_binding_invalid'
  | 'payment_binding_revision_conflict'
  | 'funding_command_not_found'
  | 'funding_command_not_receiptable'

export class InteractiveAuthorityError extends Error {
  readonly code: InteractiveAuthorityErrorCode
  readonly fences?: readonly string[]

  constructor(
    code: InteractiveAuthorityErrorCode,
    options?: Readonly<{ fences?: readonly string[] }>,
  ) {
    super(code)
    this.name = 'InteractiveAuthorityError'
    this.code = code
    if (options?.fences !== undefined) {
      this.fences = options.fences
    }
  }
}
