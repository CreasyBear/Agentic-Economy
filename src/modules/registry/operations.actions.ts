import { defineAction } from '@/modules/common/action'
import {
  registryOperationsCompareContract,
  registryOperationsDetailContract,
  registryOperationsInspectPlanContract,
  registryOperationsSearchContract,
} from './operation-action-contracts'

export const registryOperationsSearchAction = defineAction({
  ...registryOperationsSearchContract,
  run: async ({ data }) => (await import('@/modules/capability-supply/operation-source')).readCapabilityOperationSearch(data),
})

export const registryOperationsDetailAction = defineAction({
  ...registryOperationsDetailContract,
  run: async ({ data }) => (await import('@/modules/capability-supply/operation-source')).readCapabilityOperationDetail(data),
})

export const registryOperationsCompareAction = defineAction({
  ...registryOperationsCompareContract,
  run: async ({ data }) => (await import('@/modules/capability-supply/operation-source')).readCapabilityOperationCompare(data),
})

export const registryOperationsInspectPlanAction = defineAction({
  ...registryOperationsInspectPlanContract,
  run: async ({ data }) => (await import('@/modules/capability-supply/operation-source')).readCapabilityOperationInspectPlan(data),
})
