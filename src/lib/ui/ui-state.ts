export const AE_UI_STATES = [
  'loading',
  'empty',
  'draft',
  'saving',
  'saved',
  'pending',
  'succeeded',
  'refused',
  'stale',
  'unavailable',
  'outcome_unknown',
] as const

export type AeUiState = (typeof AE_UI_STATES)[number]

export type AeUiStateTone = 'neutral' | 'positive' | 'warning' | 'danger'

export type AeRecoveryActionKind =
  | 'retry_read'
  | 'retry_confirmed_no_dispatch'
  | 'reload_status'
  | 'escalate'

export type AeUiStatePresentation = Readonly<{
  label: string
  title: string
  description: string
  tone: AeUiStateTone
  role: 'status' | 'alert'
  live: 'polite' | 'assertive'
  recoveryActions: readonly AeRecoveryActionKind[]
}>

export const AE_UI_STATE_PRESENTATIONS = {
  loading: {
    label: 'Loading',
    title: 'Loading current state',
    description: 'Waiting for the authoritative source.',
    tone: 'neutral',
    role: 'status',
    live: 'polite',
    recoveryActions: [],
  },
  empty: {
    label: 'Empty',
    title: 'Nothing recorded yet',
    description: 'No current records match this view.',
    tone: 'neutral',
    role: 'status',
    live: 'polite',
    recoveryActions: [],
  },
  draft: {
    label: 'Draft',
    title: 'Draft',
    description: 'Changes are local until saved.',
    tone: 'neutral',
    role: 'status',
    live: 'polite',
    recoveryActions: [],
  },
  saving: {
    label: 'Saving',
    title: 'Saving',
    description: 'The current draft is being saved.',
    tone: 'neutral',
    role: 'status',
    live: 'polite',
    recoveryActions: [],
  },
  saved: {
    label: 'Saved',
    title: 'Saved',
    description: 'The current draft is stored.',
    tone: 'positive',
    role: 'status',
    live: 'polite',
    recoveryActions: [],
  },
  pending: {
    label: 'Pending',
    title: 'Pending',
    description: 'The request was accepted and is not final.',
    tone: 'neutral',
    role: 'status',
    live: 'polite',
    recoveryActions: ['reload_status'],
  },
  succeeded: {
    label: 'Succeeded',
    title: 'Succeeded',
    description: 'The requested action completed.',
    tone: 'positive',
    role: 'status',
    live: 'polite',
    recoveryActions: [],
  },
  refused: {
    label: 'Refused',
    title: 'Request refused',
    description: 'The request did not proceed. Review the reason before retrying.',
    tone: 'danger',
    role: 'alert',
    live: 'assertive',
    recoveryActions: ['retry_confirmed_no_dispatch', 'escalate'],
  },
  stale: {
    label: 'Stale',
    title: 'Details may be stale',
    description: 'A newer authoritative state may exist. Refresh before acting.',
    tone: 'warning',
    role: 'status',
    live: 'polite',
    recoveryActions: ['retry_read'],
  },
  unavailable: {
    label: 'Unavailable',
    title: 'Temporarily unavailable',
    description: 'The current source could not be reached. No newer state is claimed.',
    tone: 'warning',
    role: 'alert',
    live: 'assertive',
    recoveryActions: ['retry_read', 'escalate'],
  },
  outcome_unknown: {
    label: 'Outcome unknown',
    title: 'Outcome unknown',
    description: 'Dispatch may have occurred. Reload status or reconcile before acting again.',
    tone: 'warning',
    role: 'alert',
    live: 'assertive',
    recoveryActions: ['reload_status', 'escalate'],
  },
} as const satisfies Record<AeUiState, AeUiStatePresentation>

export function getAeUiStatePresentation(state: AeUiState): AeUiStatePresentation {
  return AE_UI_STATE_PRESENTATIONS[state]
}
