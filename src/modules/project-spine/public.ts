export const PROJECT_SPINE_DEFINITION_V1 = 'projectSpine_v1' as const
export const PROJECT_SPINE_DEFINITION_V2 = 'projectSpine_v2' as const
export const PROJECT_SPINE_LATEST_DEFINITION = PROJECT_SPINE_DEFINITION_V2

export type ProjectSpineDefinitionVersion =
  | typeof PROJECT_SPINE_DEFINITION_V1
  | typeof PROJECT_SPINE_DEFINITION_V2

export type ProjectSpineStatus =
  | 'awaiting_decision'
  | 'decision_received'
  | 'chasing'
  | 'completed'
  | 'failed'

export type ProjectSpineDecisionEvent = {
  generation: number
  decisionId: string
  decisionHash: string
}
