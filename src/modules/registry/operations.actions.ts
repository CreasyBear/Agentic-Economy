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

export const registryOperationsSearchAction = defineAction({
  ...registryOperationsSearchContract,
  run: async ({ data }) => readCapabilityOperationSearch(data),
})

export const registryOperationsDetailAction = defineAction({
  ...registryOperationsDetailContract,
  run: async ({ data }) => readCapabilityOperationDetail(data),
})

export const registryOperationsCompareAction = defineAction({
  ...registryOperationsCompareContract,
  run: async ({ data }) => readCapabilityOperationCompare(data),
})

export const registryOperationsInspectPlanAction = defineAction({
  ...registryOperationsInspectPlanContract,
  run: async ({ data }) => readCapabilityOperationInspectPlan(data),
})
