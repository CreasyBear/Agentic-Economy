export {
  identifier,
  jsonValueSchema,
  isBoundedJsonValue,
  containsRemoteSchemaReference,
} from './internal/json-value'
export type { JsonValue } from './internal/json-value'

export {
  CAPABILITY_CONTRACT_FORMAT,
  defineCapabilityContract,
  parseCapabilityContractJson,
  sameCapabilityContractRef,
} from './internal/define-contract'
export type {
  CapabilityContract,
  CapabilityContractDocument,
  CapabilityContractRef,
  CapabilityInputExample,
} from './internal/define-contract'

export {
  validateJsonSchema,
  resolvePointedSchema,
  rehydratePointedSchemaIdentity,
  samePointedSchema,
} from './internal/pointed-schema'
export type { PointedSchemaIdentity } from './internal/pointed-schema'

export {
  rehydrateCapabilitySelectionKey,
  rehydrateCapabilityInputKey,
  projectCapabilityInputValueSchema,
  projectCapabilityInputValueSchemas,
  openCapabilityDecisionModel,
} from './internal/decision-model'
export type {
  CapabilitySelectionKey,
  CapabilityInputKey,
  CapabilityDataUseDeclarationKey,
  CapabilityInputStage,
  CapabilityInputSemantic,
  CapabilityEvidenceSemantic,
  CapabilityValidationIssue,
  CapabilityDocumentValidation,
  CapabilityInputFact,
  CapabilityInputAssessment,
  CapabilityPreparationDataUse,
  CapabilityPreparationDraft,
  CapabilityPreparationProjection,
  CapabilityDecisionModel,
} from './internal/decision-model'
