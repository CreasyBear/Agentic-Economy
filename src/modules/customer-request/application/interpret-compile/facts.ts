import {
  sameCapabilityContractRef,
  isBoundedJsonValue,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { ProposedRequestAction, RequestFact, RequestFactSource } from '@/modules/customer-request/evaluation'
import type { ResolvedCapabilitySelection } from '@/modules/customer-request/semantic-interpreter'

/** Convex Infer snapshots use plain strings; rebound facts restore branded keys. */
export type StoredFactLike = Readonly<{
  contractRef: Readonly<{ capabilityId: string; version: number; contractDigest: string }>
  selectionKey: string
  inputKey: string
  inputPointer: string
  schemaIdentity: string
  value: unknown
  source: RequestFactSource
}>

export type ContractFactRequirementLike = Readonly<{
  kind: 'contract_fact'
  requirementKey: string
  targets: readonly Readonly<{
    contractRef: Readonly<{ capabilityId: string; version: number; contractDigest: string }>
    selectionKey: string
    inputKey: string
    inputPointer: string
    schemaIdentity: string
  }>[]
}>

export function bindRequirementAnswer(
  requirement: ContractFactRequirementLike,
  value: unknown,
  models: readonly CapabilityDecisionModel[],
  requestRevision: number,
): readonly RequestFact[] | undefined {
  if (!isBoundedJsonValue(value)) return undefined
  const facts: RequestFact[] = []
  for (const target of requirement.targets) {
    const model = models.find((candidate) => sameCapabilityContractRef(candidate.contractRef, target.contractRef))
    const semantic = model?.inputs.find((candidate) => candidate.key === target.inputKey
      && candidate.inputPointer === target.inputPointer && candidate.schemaIdentity === target.schemaIdentity)
    if (model === undefined || semantic === undefined || model.selectionKey !== target.selectionKey) return undefined
    const assessment = model.assessInput({
      contractRef: model.contractRef, selectionKey: model.selectionKey, stage: 'option_selection',
      facts: [{ input: semantic.key, inputPointer: semantic.inputPointer, value }],
    })
    if (assessment.kind === 'incompatible') return undefined
    facts.push({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      inputKey: semantic.key,
      inputPointer: semantic.inputPointer,
      schemaIdentity: semantic.schemaIdentity,
      value,
      source: {
        kind: 'customer',
        assertionRef: `assertion:${canonicalDigest({
          requirementKey: requirement.requirementKey, requestRevision, contractRef: model.contractRef,
          inputKey: semantic.key, value,
        })}`,
      },
    })
  }
  return facts
}

export function rebindStoredFacts(
  stored: readonly StoredFactLike[],
  models: readonly CapabilityDecisionModel[],
): readonly RequestFact[] {
  return stored.flatMap((fact) => {
    const model = models.find((candidate) => sameCapabilityContractRef(candidate.contractRef, fact.contractRef))
    const semantic = model?.inputs.find((input) => input.key === fact.inputKey
      && input.inputPointer === fact.inputPointer && input.schemaIdentity === fact.schemaIdentity)
    if (
      model === undefined
      || semantic === undefined
      || model.selectionKey !== fact.selectionKey
      || !isBoundedJsonValue(fact.value)
    ) {
      return []
    }
    return [{
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      inputKey: semantic.key,
      inputPointer: semantic.inputPointer,
      schemaIdentity: semantic.schemaIdentity,
      value: fact.value,
      source: fact.source,
    }]
  })
}

export function rebindPlanSelections(
  actions: readonly Pick<ProposedRequestAction, 'contractRef' | 'selectionKey' | 'semanticDigest'>[],
  facts: readonly RequestFact[],
  models: readonly CapabilityDecisionModel[],
): readonly ResolvedCapabilitySelection[] | undefined {
  const selections = actions.flatMap((action) => {
    const model = models.find((candidate) => (
      sameCapabilityContractRef(candidate.contractRef, action.contractRef)
      && candidate.selectionKey === action.selectionKey
      && candidate.semanticDigest === action.semanticDigest
    ))
    if (model === undefined) return []
    return [{
      selectionKey: model.selectionKey,
      contractRef: model.contractRef,
      facts: facts.filter((fact) => fact.selectionKey === model.selectionKey
        && sameCapabilityContractRef(fact.contractRef, model.contractRef)),
    }]
  })
  return selections.length === actions.length ? selections : undefined
}
