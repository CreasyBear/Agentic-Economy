import type { PublicOwnerClaimField, PublicOwnerClaimFlowInput } from './public'

export type TextClaimField = Exclude<PublicOwnerClaimField, 'firstRequestMode'>

export const emptyPublicOwnerClaimInput = {
  businessName: '',
  category: '',
  suburb: '',
  stateTerritory: '',
  requestedSlug: '',
  publishedPhone: '',
  ownerMessage: '',
  sourceLabel: '',
  serviceName: '',
  serviceCategory: '',
  serviceSummary: '',
  serviceArea: '',
  hoursOrUnknown: '',
  photoUrl: '',
  responseTimeMinutes: '',
  firstRequestMode: 'not_available_yet',
  publicDisclosure: '',
  noContactReason: '',
} satisfies PublicOwnerClaimFlowInput

export type ClaimDraftSnapshot = Readonly<{
  value: PublicOwnerClaimFlowInput
  factsConfirmed: boolean
  dirtyFields: readonly PublicOwnerClaimField[]
}>

export type ClaimDraftState = Readonly<{
  phase: 'awaiting_storage' | 'ready'
  value: PublicOwnerClaimFlowInput
  factsConfirmed: boolean
  dirtyFields: ReadonlySet<PublicOwnerClaimField>
}>

export const initialClaimDraftState: ClaimDraftState = {
  phase: 'awaiting_storage',
  value: emptyPublicOwnerClaimInput,
  factsConfirmed: false,
  dirtyFields: new Set(),
}

export type ClaimDraftEvent =
  | Readonly<{ type: 'hydrate'; snapshot?: ClaimDraftSnapshot }>
  | Readonly<{ type: 'edit_text'; field: TextClaimField; value: string }>
  | Readonly<{
      type: 'edit_first_request_mode'
      value: PublicOwnerClaimFlowInput['firstRequestMode']
    }>
  | Readonly<{ type: 'set_facts_confirmed'; value: boolean }>
  | Readonly<{ type: 'import'; value: PublicOwnerClaimFlowInput }>
  | Readonly<{
      type: 'replace_from_form'
      value: PublicOwnerClaimFlowInput
      dirtyFields: readonly PublicOwnerClaimField[]
    }>

export function reduceClaimDraft(state: ClaimDraftState, event: ClaimDraftEvent): ClaimDraftState {
  switch (event.type) {
    case 'hydrate': {
      if (event.snapshot === undefined) return { ...state, phase: 'ready' }
      return {
        phase: 'ready',
        value: mergeClaimInputPreservingDirty(state.value, event.snapshot.value, state.dirtyFields),
        factsConfirmed: event.snapshot.factsConfirmed,
        dirtyFields: new Set([...event.snapshot.dirtyFields, ...state.dirtyFields]),
      }
    }
    case 'edit_text':
      return {
        ...state,
        value: { ...state.value, [event.field]: event.value },
        dirtyFields: new Set([...state.dirtyFields, event.field]),
      }
    case 'edit_first_request_mode':
      return {
        ...state,
        value: { ...state.value, firstRequestMode: event.value },
        dirtyFields: new Set([...state.dirtyFields, 'firstRequestMode']),
      }
    case 'set_facts_confirmed':
      return { ...state, factsConfirmed: event.value }
    case 'import':
      return {
        ...state,
        value: mergeClaimInputPreservingDirty(state.value, event.value, state.dirtyFields),
        factsConfirmed: false,
      }
    case 'replace_from_form':
      return {
        ...state,
        value: event.value,
        dirtyFields: new Set([...state.dirtyFields, ...event.dirtyFields]),
      }
  }
}

export function snapshotClaimDraft(state: ClaimDraftState): ClaimDraftSnapshot | undefined {
  if (state.phase !== 'ready') return undefined
  return {
    value: state.value,
    factsConfirmed: state.factsConfirmed,
    dirtyFields: [...state.dirtyFields],
  }
}

function mergeClaimInputPreservingDirty(
  current: PublicOwnerClaimFlowInput,
  incoming: PublicOwnerClaimFlowInput,
  dirtyFields: ReadonlySet<PublicOwnerClaimField>,
): PublicOwnerClaimFlowInput {
  const next = { ...incoming }
  for (const field of dirtyFields) next[field] = current[field] as never
  return next
}
