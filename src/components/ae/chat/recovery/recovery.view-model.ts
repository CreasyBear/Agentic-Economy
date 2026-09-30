// Invariant: known failures only show safe next steps, following the chat's existing pure option projections.
import { chatRecoveryReasons } from './recovery.contracts'
import type { ChatRecoveryAction, ChatRecoveryReason, ChatRecoveryView } from './recovery.contracts'

type RecoveryCopy = Omit<ChatRecoveryView, 'reason'>

const retry: ChatRecoveryAction = { kind: 'retry', label: 'Try again' }
const edit: ChatRecoveryAction = { kind: 'edit', label: 'Edit message' }
const newChat: ChatRecoveryAction = { kind: 'new_chat', label: 'Start a new chat', href: '/t/new' }
const addCredit: ChatRecoveryAction = { kind: 'add_credit', label: 'Add credit' }
const browseTools: ChatRecoveryAction = { kind: 'browse_tools', label: 'Try another Tool', href: '/market' }
const signIn: ChatRecoveryAction = { kind: 'sign_in', label: 'Sign in', href: '/sign-in?redirect_url=%2Ft%2Fnew' }
const reviewAccess: ChatRecoveryAction = { kind: 'review_access', label: 'Review account access', href: '/agent-access' }
const checkStatus: ChatRecoveryAction = { kind: 'check_status', label: 'Check call status' }

const copies = {
  anonymous_message_limit: { message: 'This browser chat has reached its message limit. Sign in to keep going, or start a new chat.', actions: [signIn, newChat] },
  anonymous_size_limit: { message: 'This browser chat is full. Sign in to keep going, or start a new chat.', actions: [signIn, newChat] },
  chat_unavailable: { message: 'Chat is temporarily unavailable. Your message is still here.', actions: [retry, edit, newChat] },
  chat_model_unconfigured: { message: 'Chat is temporarily unavailable. Your message is still here.', actions: [retry, edit, newChat] },
  chat_stream_failed: { message: 'The response could not finish. Your message is still here.', actions: [retry, edit, newChat] },
  rate_limited: { message: 'Chat is busy right now. Wait a little, then try again.', actions: [retry, edit, browseTools] },
  thread_busy: { message: 'This conversation is still responding. Wait for it to finish or start a new chat.', actions: [newChat] },
  generation_failed: { message: 'The response could not finish. Your message is still here.', actions: [retry, edit, newChat] },
  generation_timed_out: { message: 'This response took too long. Try again or edit your message.', actions: [retry, edit, newChat] },
  outcome_unknown: { message: 'We could not confirm whether that action finished. Check its status before trying again.', actions: [checkStatus, newChat] },
  stream_disconnected: { message: 'The connection dropped before this response finished. Reconnect, then try again.', actions: [retry, edit, newChat] },
  network_offline: { message: 'You are offline. Your draft stays here; reconnect to continue.', actions: [retry, edit] },
  history_unavailable: { message: 'Chat history could not load. Retry or start a new chat.', actions: [retry, newChat] },
  funding_failed: { message: 'Credit could not be added. Check your balance, then try again.', actions: [retry, addCredit] },
  approval_failed: { message: 'This approval did not go through. Check its status before trying again.', actions: [checkStatus] },
  approval_verification_required: { message: 'Verify your identity in account security, then approve this Call again.', actions: [reviewAccess, checkStatus] },
  approval_expired: { message: 'This approval expired. Request a fresh Quote or choose another Tool.', actions: [browseTools] },
  private_thread_locked: { message: 'Sign in to return to this conversation.', actions: [signIn] },
  source_output_invalid: { message: 'The Tool could not return a usable result. Try another Tool.', actions: [browseTools] },
  result_too_large: { message: 'The result was too large to show here. Try another Tool.', actions: [browseTools] },
  tool_limit: { message: 'This chat has reached its action limit. Start a new chat to continue.', actions: [newChat] },
  execute_limit: { message: 'This chat has reached its action limit. Start a new chat to continue.', actions: [newChat] },
  search_limit: { message: 'This chat has reached its search limit. Start a new chat to continue.', actions: [newChat] },
  search_repeated: { message: 'This search has already run. Try another Tool or start a new chat.', actions: [browseTools, newChat] },
  paging_not_requested: { message: 'More results are not available yet. Search again to refresh them.', actions: [retry, edit] },
  turn_stopped: { message: 'The response was stopped. Continue when you are ready.', actions: [retry, edit, newChat] },
  tool_unavailable: { message: 'This Tool is unavailable right now. Try another Tool.', actions: [browseTools] },
  source_unavailable: { message: 'This Tool is unavailable right now. Try another Tool.', actions: [browseTools] },
  source_capacity_exceeded: { message: 'This Tool is busy right now. Wait a moment or try another Tool.', actions: [retry, browseTools] },
  setup_required: { message: 'This Tool needs setup before it can run. Review account access or choose another Tool.', actions: [reviewAccess, browseTools] },
  temporarily_unavailable: { message: 'This Tool is unavailable right now. Try another Tool.', actions: [browseTools] },
  readiness_expired: { message: 'This Tool’s details need to be reviewed before it can run. Choose another Tool or review it again.', actions: [browseTools] },
  publisher_withdrew: { message: 'This Tool is no longer available. Try another Tool.', actions: [browseTools] },
  under_review: { message: 'This Tool is being reviewed and cannot run right now. Try another Tool.', actions: [browseTools] },
  updated_terms_require_review: { message: 'This Tool’s terms changed. Review them before running it again.', actions: [browseTools] },
  not_supported_by_ae: { message: 'This Tool cannot run in chat. Try another Tool.', actions: [browseTools] },
  tool_not_found: { message: 'This Tool could not be found. Try another Tool.', actions: [browseTools] },
  mapping_unavailable: { message: 'This Tool is unavailable right now. Try another Tool.', actions: [browseTools] },
  mapping_incompatible: { message: 'This Tool cannot run with its current setup. Try another Tool.', actions: [browseTools] },
  mapping_cycle: { message: 'This Tool could not be run. Try another Tool.', actions: [browseTools] },
  operation_not_keyless: { message: 'This Tool needs access you have not connected. Review account access or choose another Tool.', actions: [reviewAccess, browseTools] },
  operation_not_executable: { message: 'This Tool cannot run in chat. Try another Tool.', actions: [browseTools] },
  input_invalid: { message: 'The Tool did not accept these inputs. Edit your message or choose another Tool.', actions: [edit, browseTools] },
  endpoint_invalid: { message: 'This Tool could not be run with its current setup. Try another Tool.', actions: [browseTools] },
  tool_not_current: { message: 'This Tool has changed. Review its current details before running it again.', actions: [browseTools] },
  tool_not_ready: { message: 'This Tool is not ready to run yet. Try another Tool.', actions: [browseTools] },
  tool_unsupported: { message: 'This Tool cannot run in chat. Try another Tool.', actions: [browseTools] },
  grant_not_found: { message: 'Your account needs access before this Tool can run. Review account access.', actions: [reviewAccess] },
  budget_exceeded: { message: 'This Tool is over your current spending limit. Review account access before trying again.', actions: [reviewAccess] },
  insufficient_balance: { message: 'There is not enough credit to run this Tool. Add credit, then try again.', actions: [addCredit] },
  payments_paused: { message: 'Paid Tool purchases are temporarily paused. You can keep searching and comparing Tools.', actions: [browseTools] },
  payments_admins_only: { message: 'Paid Tool purchases are currently available to Admins only. You can keep searching and comparing Tools.', actions: [browseTools] },
  treasury_capacity_unavailable: { message: 'This Tool cannot be run right now. Try another Tool.', actions: [browseTools] },
  pricing_setup_required: { message: 'This Tool is not ready to run right now. Try another Tool.', actions: [browseTools] },
  commercial_policy_unavailable: { message: 'This Tool cannot be run right now. Try another Tool.', actions: [browseTools] },
  inspection_unavailable: { message: 'This Tool could not be reviewed right now. Try another Tool.', actions: [browseTools] },
  operation_ref_invalid: { message: 'This Tool could not be identified. Choose another Tool.', actions: [browseTools] },
  operation_not_found: { message: 'This Tool could not be found. Choose another Tool.', actions: [browseTools] },
  operation_not_current: { message: 'This Tool has changed. Review its current details before running it again.', actions: [browseTools] },
  operation_not_ready: { message: 'This Tool is not ready to run yet. Try another Tool.', actions: [browseTools] },
  operation_unsupported: { message: 'This Tool cannot run in chat. Try another Tool.', actions: [browseTools] },
  result_invalid: { message: 'This Tool returned a result that could not be used. Try another Tool.', actions: [browseTools] },
  grant_revoked: { message: 'Your access to this Tool has changed. Review account access.', actions: [reviewAccess] },
  grant_expired: { message: 'Your access to this Tool has expired. Review account access.', actions: [reviewAccess] },
  grant_generation_stale: { message: 'Your access to this Tool needs to be refreshed. Review account access.', actions: [reviewAccess] },
  environment_mismatch: { message: 'This Tool is not available to your account. Try another Tool.', actions: [browseTools] },
  concurrency_limited: { message: 'Too many actions are running at once. Wait a moment, then try again.', actions: [retry, newChat] },
  idempotency_conflict: { message: 'A matching action may already be running. Check its status before trying again.', actions: [checkStatus, newChat] },
  invocation_runtime_unavailable: { message: 'This Tool could not start. Try another Tool.', actions: [browseTools] },
  authority_reader_unavailable: { message: 'Your account access could not be checked. Review account access before trying again.', actions: [reviewAccess] },
  authority_required: { message: 'Your account needs approval before this Tool can run. Review account access.', actions: [reviewAccess] },
  authority_denied: { message: 'This action was not approved. Review account access or choose another Tool.', actions: [reviewAccess, browseTools] },
  provider_refused: { message: 'This Tool could not complete the request. Try another Tool.', actions: [browseTools] },
  provider_output_invalid: { message: 'This Tool returned a result that could not be used. Try another Tool.', actions: [browseTools] },
  pre_release_failed: { message: 'This Tool could not complete the request. Try another Tool.', actions: [browseTools] },
  payment_lane_not_brokered: { message: 'This Tool cannot be run from chat. Try another Tool.', actions: [browseTools] },
  reconciliation_required: { message: 'We could not confirm whether that action finished. Check its status before trying again.', actions: [checkStatus, newChat] },
  invocation_not_found: { message: 'This action could not be found. Check its status or start a new chat.', actions: [checkStatus, newChat] },
  invocation_cancelled: { message: 'This action was cancelled. Continue when you are ready.', actions: [retry, edit, newChat] },
  lease_not_current: { message: 'This action expired before it finished. Check its status before trying again.', actions: [checkStatus, newChat] },
} satisfies Record<ChatRecoveryReason, RecoveryCopy>

export function readChatRecoveryReason(value: string | undefined): ChatRecoveryReason | 'unknown' {
  if (value === undefined) return 'unknown'
  for (const reason of chatRecoveryReasons) if (reason === value) return reason
  return 'unknown'
}

export function projectChatRecovery(value: string | undefined): ChatRecoveryView {
  const reason = readChatRecoveryReason(value)
  if (reason === 'unknown') return { reason, message: 'Something went wrong. Try again.', actions: [retry, newChat] }
  return { reason, ...copies[reason] }
}

