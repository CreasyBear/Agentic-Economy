import { defineAction } from '@/modules/common/action'
import {
  registryOperationsCompareContract,
  registryOperationsDetailContract,
  registryOperationsInspectPlanContract,
  registryOperationsSearchContract,
} from './operation-action-contracts'
import {
  readCapabilityOperationCompare,
  readCapabilityOperationDetail,
  readCapabilityOperationInspectPlan,
  readCapabilityOperationSearch,
} from '@/modules/capability-supply/operation-source'
import {
  projectOperationCompareChoices,
  projectOperationSearchChoices,
} from './operation-choice-contracts'

export const registryOperationsSearchAction = defineAction({
  ...registryOperationsSearchContract,
  run: async ({ data }) => projectOperationSearchChoices(await readCapabilityOperationSearch(data)),
})

export const registryOperationsDetailAction = defineAction({
  ...registryOperationsDetailContract,
  run: async ({ data }) => readCapabilityOperationDetail(data),
})

export const registryOperationsCompareAction = defineAction({
  ...registryOperationsCompareContract,
  run: async ({ data }) => projectOperationCompareChoices(await readCapabilityOperationCompare(data)),
})

export const registryOperationsInspectPlanAction = defineAction({
  ...registryOperationsInspectPlanContract,
  run: async ({ data }) => readCapabilityOperationInspectPlan(data),
})
