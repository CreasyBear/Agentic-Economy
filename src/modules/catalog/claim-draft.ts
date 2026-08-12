import type { BusinessContext } from '@/modules/business/public'
import type { PublicOwnerClaimField, PublicOwnerClaimFlowInput } from './public'

export type BusinessContextTextField =
  | 'providerWebsite'
  | 'providerIdentifier'
  | 'suburb'
  | 'stateTerritory'
  | 'publishedPhone'

export type TextClaimField = Exclude<PublicOwnerClaimField, 'businessContext' | 'firstRequestMode'> | BusinessContextTextField
export type ClaimDraftField = TextClaimField | Extract<PublicOwnerClaimField, 'businessContext' | 'firstRequestMode'>

export const emptyPublicOwnerClaimInput = {
  businessContext: {
    kind: 'local_human',
    suburb: '',
    stateTerritory: '',
    publishedPhone: '',
  },
  businessName: '',
  category: '',
  requestedSlug: '',
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
  dirtyFields: readonly ClaimDraftField[]
}>

export type ClaimDraftState = Readonly<{
  phase: 'awaiting_storage' | 'ready'
  value: PublicOwnerClaimFlowInput
  factsConfirmed: boolean
  dirtyFields: ReadonlySet<ClaimDraftField>
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
      type: 'edit_business_context_kind'
      value: BusinessContext['kind']
    }>
  | Readonly<{
      type: 'edit_first_request_mode'
      value: PublicOwnerClaimFlowInput['firstRequestMode']
    }>
  | Readonly<{ type: 'set_facts_confirmed'; value: boolean }>
  | Readonly<{ type: 'import'; value: PublicOwnerClaimFlowInput }>
  | Readonly<{
      type: 'replace_from_form'
      value: PublicOwnerClaimFlowInput
      dirtyFields: readonly ClaimDraftField[]
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
        value: updateClaimTextField(state.value, event.field, event.value),
        dirtyFields: new Set([...state.dirtyFields, event.field]),
      }
    case 'edit_business_context_kind':
      return {
        ...state,
        value: {
          ...state.value,
          businessContext: event.value === 'programmable_provider'
            ? { kind: 'programmable_provider', website: '', providerIdentifier: '' }
            : { kind: 'local_human', suburb: '', stateTerritory: '', publishedPhone: '' },
        },
        dirtyFields: new Set([...state.dirtyFields, 'businessContext']),
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
export function hasClaimDraftContent(snapshot: ClaimDraftSnapshot): boolean {
  if (snapshot.factsConfirmed || snapshot.dirtyFields.length > 0) return true

  const context = snapshot.value.businessContext
  if (context.kind !== emptyPublicOwnerClaimInput.businessContext.kind) return true
  if (context.kind === 'local_human' && (
    context.suburb.trim().length > 0
    || context.stateTerritory.trim().length > 0
    || (context.publishedPhone ?? '').trim().length > 0
  )) {
    return true
  }

  return Object.entries(snapshot.value).some(
    ([field, entry]) =>
      typeof entry === 'string'
      && entry.trim().length > 0
      && entry !== emptyPublicOwnerClaimInput[field as keyof PublicOwnerClaimFlowInput],
  )
}

function mergeClaimInputPreservingDirty(
  current: PublicOwnerClaimFlowInput,
  incoming: PublicOwnerClaimFlowInput,
  dirtyFields: ReadonlySet<ClaimDraftField>,
): PublicOwnerClaimFlowInput {
  let next = incoming
  for (const field of dirtyFields) {
    if (field === 'businessContext') {
      next = { ...next, businessContext: current.businessContext }
    } else if (field === 'firstRequestMode') {
      next = { ...next, firstRequestMode: current.firstRequestMode }
    } else {
      next = updateClaimTextField(next, field, readClaimTextField(current, field))
    }
  }
  return next
}

export function readClaimTextField(input: PublicOwnerClaimFlowInput, field: TextClaimField): string {
  const context = input.businessContext
  switch (field) {
    case 'providerWebsite':
      return context.kind === 'programmable_provider' ? context.website : ''
    case 'providerIdentifier':
      return context.kind === 'programmable_provider' ? context.providerIdentifier : ''
    case 'suburb':
      return context.kind === 'local_human' ? context.suburb : ''
    case 'stateTerritory':
      return context.kind === 'local_human' ? context.stateTerritory : ''
    case 'publishedPhone':
      return context.kind === 'local_human' ? context.publishedPhone ?? '' : ''
    default:
      return input[field]
  }
}

export function updateClaimTextField(
  input: PublicOwnerClaimFlowInput,
  field: TextClaimField,
  value: string,
): PublicOwnerClaimFlowInput {
  const context = input.businessContext
  switch (field) {
    case 'providerWebsite':
      return context.kind === 'programmable_provider'
        ? { ...input, businessContext: { ...context, website: value } }
        : input
    case 'providerIdentifier':
      return context.kind === 'programmable_provider'
        ? { ...input, businessContext: { ...context, providerIdentifier: value } }
        : input
    case 'suburb':
      return context.kind === 'local_human'
        ? { ...input, businessContext: { ...context, suburb: value } }
        : input
    case 'stateTerritory':
      return context.kind === 'local_human'
        ? { ...input, businessContext: { ...context, stateTerritory: value } }
        : input
    case 'publishedPhone':
      return context.kind === 'local_human'
        ? { ...input, businessContext: { ...context, publishedPhone: value } }
        : input
    default:
      return { ...input, [field]: value }
  }
}
