export const FollowUpIntentValues = [
  'refine_search',
  'filter_known',
  'compare_known',
  'inquiry_handoff',
  'explain_boundary',
  'unsupported',
] as const

export const AnswerTurnStatusValues = ['pending', 'complete', 'stopped', 'error'] as const

export const AnswerTurnReservationStateValues = [
  'reserved',
  'finalized',
  'stopped',
] as const
export const AnswerTurnCheckpointRouteValues = [
  'tool_search',
  'frozen_filter',
  'frozen_compare',
  'inquiry_handoff',
  'boundary_explain',
  'unsupported',
  'rationale',
  'safety_refusal',
] as const
export type AnswerTurnCheckpointRoute = (typeof AnswerTurnCheckpointRouteValues)[number]


export const AnswerToolCallStatusValues = ['complete', 'error', 'refused'] as const
export type AnswerToolCallStatus = (typeof AnswerToolCallStatusValues)[number]

export const AnswerToolIdValues = [
  'registry.search',
  'registry.detail',
  'web.discover',
  'registry.operations.search',
  'registry.operations.detail',
  'registry.operations.compare',
  'registry.operations.inspectPlan',
  'operation.execute',
  'operation.invoke',
] as const
