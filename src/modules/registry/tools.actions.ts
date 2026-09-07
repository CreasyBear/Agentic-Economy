import { defineAction } from '@/modules/common/action'
import {
  registryToolsCompareContract,
  registryToolsDescribeContract,
  registryToolsListContract,
  registryToolsSearchContract,
} from './tool-action-contracts'
import {
  readCapabilityToolCompare,
  readCapabilityToolDetail,
  readCapabilityToolSearch,
} from '@/modules/capability-supply/tool-source'
import type { ToolSearchFilters } from '@/modules/capability-supply/public'
import {
  projectToolCompareChoices,
  projectToolDescription,
  projectToolListChoices,
  projectToolSearchChoices,
} from './tool-choice-contracts'

function sourceFilters(filters: {
  networkId?: string | undefined
  location?: string | undefined
  effects?: readonly ('data_release' | 'financial_exposure' | 'external_state_change')[] | undefined
  dataUse?: readonly ('public' | 'personal' | 'sensitive' | 'credential')[] | undefined
  healthStatus?: readonly ('operational' | 'degraded' | 'unverified')[] | undefined
  currency?: string | undefined
  maximumPrice?: { currency: string; units: string; exponent: number } | undefined
} | undefined): ToolSearchFilters | undefined {
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

export const registryToolsListAction = defineAction({
  ...registryToolsListContract,
  run: async ({ data }) => {
    const filters = sourceFilters(data.filters)
    return projectToolListChoices(await readCapabilityToolSearch({
      query: '',
      limit: data.limit,
      ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
      ...(filters === undefined ? {} : { filters }),
    }), data.filters)
  },
})

export const registryToolsSearchAction = defineAction({
  ...registryToolsSearchContract,
  run: async ({ data }) => {
    const filters = sourceFilters(data.filters)
    return projectToolSearchChoices(await readCapabilityToolSearch({
      query: data.query,
      limit: data.limit,
      ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
      ...(filters === undefined ? {} : { filters }),
    }), data.filters)
  },
})

export const registryToolsDescribeAction = defineAction({
  ...registryToolsDescribeContract,
  run: async ({ data }) => projectToolDescription(await readCapabilityToolDetail(data)),
})

export const registryToolsCompareAction = defineAction({
  ...registryToolsCompareContract,
  run: async ({ data }) => projectToolCompareChoices(await readCapabilityToolCompare(data)),
})
