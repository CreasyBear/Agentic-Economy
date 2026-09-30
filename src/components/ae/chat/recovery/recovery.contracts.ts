// Invariant: every recovered failure reason has safe plain-language copy and typed actions, following chat's existing view-model contracts.
export const chatRecoveryReasons = [
  'anonymous_message_limit',
  'anonymous_size_limit',
  'chat_unavailable',
  'chat_model_unconfigured',
  'chat_stream_failed',
  'rate_limited',
  'thread_busy',
  'generation_failed',
  'generation_timed_out',
  'outcome_unknown',
  'stream_disconnected',
  'network_offline',
  'history_unavailable',
  'funding_failed',
  'approval_failed',
  'approval_expired',
  'approval_verification_required',
  'private_thread_locked',
  'source_output_invalid',
  'result_too_large',
  'tool_limit',
  'execute_limit',
  'search_limit',
  'search_repeated',
  'paging_not_requested',
  'turn_stopped',
  'tool_unavailable',
  'source_unavailable',
  'source_capacity_exceeded',
  'setup_required',
  'temporarily_unavailable',
  'readiness_expired',
  'publisher_withdrew',
  'under_review',
  'updated_terms_require_review',
  'not_supported_by_ae',
  'tool_not_found',
  'mapping_unavailable',
  'mapping_incompatible',
  'mapping_cycle',
  'operation_not_keyless',
  'operation_not_executable',
  'input_invalid',
  'endpoint_invalid',
  'tool_not_current',
  'tool_not_ready',
  'tool_unsupported',
  'grant_not_found',
  'budget_exceeded',
  'insufficient_balance',
  'treasury_capacity_unavailable',
  'pricing_setup_required',
  'commercial_policy_unavailable',
  'inspection_unavailable',
  'operation_ref_invalid',
  'operation_not_found',
  'grant_revoked',
  'grant_expired',
  'grant_generation_stale',
  'environment_mismatch',
  'concurrency_limited',
  'idempotency_conflict',
  'invocation_runtime_unavailable',
  'authority_reader_unavailable',
  'authority_required',
  'authority_denied',
  'provider_refused',
  'provider_output_invalid',
  'pre_release_failed',
  'payment_lane_not_brokered',
  'reconciliation_required',
  'invocation_not_found',
  'invocation_cancelled',
  'lease_not_current',
  'operation_not_current',
  'operation_not_ready',
  'operation_unsupported',
  'result_invalid',
] as const

export type ChatRecoveryReason = (typeof chatRecoveryReasons)[number]
export type RecoveryActionKind = 'retry' | 'edit' | 'add_credit' | 'browse_tools' | 'sign_in' | 'review_access' | 'check_status' | 'new_chat'

export type ChatRecoveryAction = Readonly<{
  kind: RecoveryActionKind
  label: string
  href?: string
}>

export type ChatRecoveryView = Readonly<{
  reason: ChatRecoveryReason | 'unknown'
  message: string
  actions: readonly ChatRecoveryAction[]
}>

export type RecoveryNoticeProps = Readonly<{
  reason: string | undefined
  onRetry?: () => void
  onEdit?: () => void
  onAddCredit?: () => void
  onNewChat?: () => void
  callRefs?: readonly string[]
  statusHref?: string
  className?: string
}>
