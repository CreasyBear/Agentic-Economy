import { defineAction } from '@/modules/common/action'
import {
  registryOperationsCompareContract,
  registryOperationsDescribeContract,
  registryOperationsListContract,
  registryOperationsSearchContract,
} from './operation-action-contracts'
import {
  readCapabilityOperationCompare,
  readCapabilityOperationDetail,
  readCapabilityOperationSearch,
} from '@/modules/capability-supply/operation-source'
import type { OperationSearchFilters } from '@/modules/capability-supply/public'
import {
  projectOperationCompareChoices,
  projectOperationDescription,
  projectOperationListChoices,
  projectOperationSearchChoices,
} from './operation-choice-contracts'

function sourceFilters(filters: {
  networkId?: string | undefined
  location?: string | undefined
  effects?: readonly ('data_release' | 'financial_exposure' | 'external_state_change')[] | undefined
  dataUse?: readonly ('public' | 'personal' | 'sensitive' | 'credential')[] | undefined
  healthStatus?: readonly ('operational' | 'degraded' | 'unverified')[] | undefined
  currency?: string | undefined
  maximumPrice?: { currency: string; units: string; exponent: number } | undefined
} | undefined): OperationSearchFilters | undefined {
  if (filters === undefined) return undefined
  return {
    ...(filters.networkId === undefined ? {} : { networkId: filters.networkId }),
    ...(filters.location === undefined ? {} : { location: filters.location }),
    ...(filters.effects === undefined ? {} : { effects: filters.effects }),
    ...(filters.dataUse === undefined ? {} : { dataUse: filters.dataUse }),
    ...(filters.currency === undefined ? {} : { currency: filters.currency }),
    ...(filters.maximumPrice === undefined ? {} : { maximumPrice: filters.maximumPrice }),
  }
}

export const registryOperationsListAction = defineAction({
  ...registryOperationsListContract,
  run: async ({ data }) => {
    const filters = sourceFilters(data.filters)
    return projectOperationListChoices(await readCapabilityOperationSearch({
      query: '',
      limit: data.limit,
      ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
      ...(filters === undefined ? {} : { filters }),
    }), data.filters)
  },
})

export const registryOperationsSearchAction = defineAction({
  ...registryOperationsSearchContract,
  run: async ({ data }) => {
    const filters = sourceFilters(data.filters)
    return projectOperationSearchChoices(await readCapabilityOperationSearch({
      query: data.query,
      limit: data.limit,
      ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
      ...(filters === undefined ? {} : { filters }),
    }), data.filters)
  },
})

export const registryOperationsDescribeAction = defineAction({
  ...registryOperationsDescribeContract,
  run: async ({ data }) => projectOperationDescription(await readCapabilityOperationDetail(data)),
})

export const registryOperationsCompareAction = defineAction({
  ...registryOperationsCompareContract,
  run: async ({ data }) => projectOperationCompareChoices(await readCapabilityOperationCompare(data)),
})
