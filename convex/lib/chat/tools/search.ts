import { createTool, type ToolCtx } from '@convex-dev/agent'
import type { ModelMessage } from 'ai'
import type { FunctionArgs } from 'convex/server'
import { z } from 'zod'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { deserializeToolSearchResult, type PublicToolDescriptor } from '@/modules/capability-supply/public'
import { chatSearchUse, latestUserRequest, readBelowMatch } from '@/modules/chat/search-presentation'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import { projectToolListChoices, projectToolSearchChoices } from '@/modules/registry/tool-choice-contracts'
import { isProductionToolChoice } from '@/modules/registry/public'
import { registryToolsListContract, registryToolsSearchContract } from '@/modules/registry/tool-action-contracts'
import { api, internal } from '../../../_generated/api'
import { descriptionFor, failure, type ReserveChatSearch, type ReserveChatTool } from './contracts'
import { projectedModelFacingOutput } from './output'

type CapabilitySearchFilters = FunctionArgs<typeof api.capabilitySupplyTools.search>['filters']

function operationSourceFilters(filters: z.infer<typeof registryToolsSearchContract.schema>['filters']): CapabilitySearchFilters | undefined {
  if (filters === undefined) return undefined
  return {
    ...(filters.networkId === undefined ? {} : { networkId: filters.networkId }),
    ...(filters.location === undefined ? {} : { location: filters.location }),
    ...(filters.effects === undefined ? {} : { effects: [...filters.effects] }),
    ...(filters.dataUse === undefined ? {} : { dataUse: [...filters.dataUse] }),
    ...(filters.currency === undefined ? {} : { currency: filters.currency }),
    ...(filters.maximumPrice === undefined ? {} : { maximumPrice: filters.maximumPrice }),
  }
}

export function createSearchTools(reserve: ReserveChatTool, reserveSearch: ReserveChatSearch) {
  const listContract = registryToolsListContract
  const searchContract = registryToolsSearchContract
  return {
    [CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.list']]: createTool({
      description: descriptionFor(listContract),
      inputSchema: listContract.schema,
      execute: async (ctx: ToolCtx, input: unknown, options: { messages?: ModelMessage[] }) => {
        const data = listContract.schema.parse(input)
        const denied = reserve('registry.tools.list')
        if (denied !== null) return denied
        const deniedSearch = reserveSearch('registry.tools.list', 'list', data.cursor, latestUserRequest(options.messages))
        if (deniedSearch !== null) return deniedSearch
        const filters = operationSourceFilters(data.filters)
        const result = await ctx.runAction(api.capabilityToolCatalog.search, {
          query: '',
          limit: data.limit,
          ...(data.source === undefined ? {} : { source: data.source }),
          ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
          ...(filters === undefined ? {} : { filters }),
        })
        return projectedModelFacingOutput(
          'registry.tools.list',
          listContract.outputSchema,
          () => projectToolListChoices(deserializeToolSearchResult(result), data.filters),
        )
      },
    }),
    [CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']]: createTool({
      description: descriptionFor(searchContract),
      inputSchema: searchContract.schema,
      execute: async (ctx: ToolCtx, input: unknown, options: { messages?: ModelMessage[] }) => {
        const data = searchContract.schema.parse(input)
        const denied = reserve('registry.tools.search')
        if (denied !== null) return denied
        const request = latestUserRequest(options.messages)
        const key = data.query.toLowerCase().replace(/\b(?:apis?|for|an?|the|in|of|me)\b/gu, ' ')
          .replace(/\b(\w+)s\b/gu, '$1').split(/\W+/u).filter(Boolean).sort().join(' ')
        const deniedSearch = reserveSearch('registry.tools.search', key, data.cursor, request)
        if (deniedSearch !== null) return deniedSearch
        const filters = operationSourceFilters(data.filters)
        const result = await ctx.runAction(
          api.capabilityToolCatalog.search,
          {
            query: data.query,
            limit: data.limit,
            ...(data.source === undefined ? {} : { source: data.source }),
            ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
            ...(filters === undefined ? {} : { filters }),
          },
        )
        try {
          const source = deserializeToolSearchResult(result)
          const presented = source.kind === 'ok' && source.items.length > 0
            ? await ctx.runAction(internal.capabilityToolCatalog.presentSearch, {
                result,
                query: data.query,
                ...(request === undefined ? {} : { request }),
              }).then((value) => ({
                result: deserializeToolSearchResult(value.result),
                use: chatSearchUse(value.use),
                belowMatch: readBelowMatch(value.belowMatch),
              })).catch((cause) => ({
                result: degradeBackend(cause, source, {
                  site: 'chatToolSearchRerank',
                  reason: 'source_unavailable',
                }),
                use: null,
                belowMatch: [] as const,
              }))
            : { result: source, use: null, belowMatch: [] as const }
          const explicitNonProduction = /\b(?:testnet|sepolia|degraded|demo|sandbox)\b/iu.test(request ?? '')
          const eligible = (tool: PublicToolDescriptor) =>
            explicitNonProduction || isProductionToolChoice(tool)
          const scores = presented.result.kind === 'ok' ? presented.result.ranking : []
          const suitable = new Set(scores.filter(({ score }) => score >= 0.5).map(({ toolRef }) => toolRef))
          const assessment = scores.length === 0 ? { verdict: 'degraded' as const, nearMisses: [] }
            : suitable.size === 0 ? { verdict: 'noMatch' as const, nearMisses: [] }
              : { verdict: 'matched' as const, nearMisses: [] }
          const narrowed = presented.result.kind === 'ok'
            ? { ...presented.result, items: presented.result.items.filter(tool => eligible(tool) && suitable.has(tool.toolRef)) } : presented.result
          return projectedModelFacingOutput(
            'registry.tools.search',
            searchContract.outputSchema,
            () => projectToolSearchChoices(narrowed, data.filters, assessment),
          )
        } catch (cause) {
          return degradeBackend(cause, failure('registry.tools.search', 'source_output_invalid'), {
            site: 'chatToolSearch', reason: 'invalid_response',
          })
        }
      },
    }),
  }
}
