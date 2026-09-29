import type { ActionCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'
import {
  deserializeToolSearchResult,
  PublicToolRegistrySchemaVersion,
  type PublicToolDescriptor,
  type ToolSearchResult,
} from '@/modules/capability-supply/public'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import {
  projectToolSearchChoices,
  type SearchResult,
  type ToolChoiceSearchOutput,
} from '@/modules/registry/tool-choice-contracts'
import { isProductionToolChoice } from '@/modules/registry/public'
import { registryToolsSearchContract } from '@/modules/registry/tool-action-contracts'
import { projectedModelFacingOutput } from './output'
import { CHAT_NO_RESULT_ANSWER, chatSearchResolution } from './step'
import { callableFirst, suitableListing } from './suitability'

type SearchTurn = Readonly<{ turnRef: string; threadId: string; promptMessageId: string }>

function emptyResult(query: string): ToolSearchResult {
  return {
    kind: 'no_candidates', schemaVersion: PublicToolRegistrySchemaVersion, query,
    appliedFilters: {}, ranking: [], navigation: [],
  }
}

/** Same indexed catalogue read as Market search, without waiting for the model or the ranker. */
export async function retrieveImmediateTools(
  ctx: ActionCtx,
  query: string,
  searchTurn?: SearchTurn,
): Promise<ToolChoiceSearchOutput | null> {
  const trimmed = query.trim().slice(0, SEARCH_QUERY_MAX_LENGTH)
  if (trimmed.length === 0) return null
  try {
    const admitted = deserializeToolSearchResult(await ctx.runAction(internal.capabilityToolCatalog.searchInternal, {
      source: 'current', query: trimmed, limit: 8,
    }))
    const keepDemo = /\b(?:testnet|sepolia|degraded|demo|sandbox)\b/iu.test(trimmed)
    const admittedItems = admitted.kind === 'ok'
      ? admitted.items.filter((tool: PublicToolDescriptor) =>
        (keepDemo || isProductionToolChoice(tool)) && suitableListing(trimmed, tool.listing.label, tool.summary))
      : []
    const narrowed: ToolSearchResult = admitted.kind === 'ok'
      ? { ...admitted, items: admittedItems }
      : admitted.kind === 'unavailable' ? admitted : emptyResult(trimmed)
    const room = Math.max(1, 8 - admittedItems.length)
    const directory = await ctx.runQuery(internal.x402DirectoryIndex.searchCompactInternal, {
      query: trimmed,
      paginationOpts: { cursor: null, numItems: room },
      access: 'external_listing',
    }).catch(cause => degradeBackend(cause, { kind: 'unavailable' as const, reason: 'source_unavailable' }, {
      site: 'chatImmediateBazaar', reason: 'source_unavailable',
    }))
    const external: SearchResult[] = directory.kind === 'unavailable' ? [] : directory.page.flatMap(row => {
      if (row.source !== 'coinbase' || row.toolRef !== undefined) return []
      if (!suitableListing(trimmed, row.title, row.summary)) return []
      const actionClass = ['retrieve','transform','analyze','create','mutate','other','unclassified'].includes(row.actionClass) ? row.actionClass : 'unclassified' as const
      const objectClass = ['web','document','image','location','chain','data','other','unclassified'].includes(row.objectClass) ? row.objectClass : 'unclassified' as const
      return [{
        id: row.id, source: 'coinbase' as const, access: 'external_listing' as const,
        title: Array.from(row.title).slice(0, 72).join(''),
        summary: Array.from(row.summary).slice(0, 100).join(''),
        provider: Array.from(row.provider).slice(0, 48).join(''),
        actionClass, objectClass,
        ...(row.category === undefined ? {} : { category: Array.from(row.category).slice(0, 80).join('') }),
        readiness: 'unverified' as const, price: { kind: 'unavailable' as const },
        detailRef: row.id,
        next: [{ action: 'describe-external' as const, args: { id: row.id }, authority: 'public' as const }],
      }]
    })
    const admittedNext = narrowed.kind === 'ok' && narrowed.pagination.hasMore ? narrowed.pagination.nextCursor : undefined
    const pagination = admittedNext !== undefined
      ? { limit: 8, nextCursor: admittedNext, hasMore: true }
      : directory.kind !== 'unavailable' && !directory.isDone
        ? { limit: 8, nextCursor: `x402:${directory.continueCursor}`, hasMore: true }
        : { limit: 8, hasMore: false }
    const projected = projectedModelFacingOutput('registry.tools.search', registryToolsSearchContract.outputSchema, () => {
      const choices = projectToolSearchChoices(narrowed, undefined, {
        verdict: admittedItems.length > 0 ? 'matched' : 'noMatch', nearMisses: [],
      }, undefined, 8, {
        query: trimmed, source: 'all',
        complete: admittedNext === undefined && (directory.kind === 'unavailable' || directory.isDone),
        external, externalExamined: directory.kind === 'unavailable' ? 0 : directory.page.length,
        pagination,
        ...(directory.kind === 'unavailable' ? {} : { generation: directory.coverage.generation, completedAt: directory.coverage.completedAt }),
      })
      const output = choices.kind === 'match' && admittedItems.length === 0
        ? { ...choices, kind: 'scoped' as const, reason: 'External listings require inspection before choosing a Tool.' }
        : choices
      if (output.kind !== 'match' && output.kind !== 'scoped') return output
      return { ...output, results: callableFirst(output.results) }
    })
    if (typeof projected !== 'object' || projected === null || !('kind' in projected) || projected.kind === 'chat_tool_refused') {
      throw new Error(`catalogue_projection_${JSON.stringify(projected).slice(0, 180)}`)
    }
    const page = projected as ToolChoiceSearchOutput
    const cursor = page.pagination.nextCursor
    if (searchTurn === undefined || cursor === undefined || !page.pagination.hasMore) return page
    const token = await ctx.runMutation(internal.chatTurns.issueSearchPage, {
      ...searchTurn, query: trimmed, cursor, inputJson: JSON.stringify({ source: 'all', limit: 8 }),
    })
    return {
      ...page,
      pagination: { ...page.pagination, nextCursor: token },
      next: page.next.map(action => action.action === 'next-page'
        ? { ...action, args: { ...action.args, cursor: token } } : action),
    }
  } catch (cause) {
    degradeBackend(cause, undefined, { site: 'chatImmediateSearch', reason: 'source_unavailable' })
    throw cause
  }
}

export function immediateSearchToolName(): string {
  return CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']
}

export function catalogueFact(output: ToolChoiceSearchOutput): string {
  return chatSearchResolution([{ toolResults: [{ toolName: immediateSearchToolName(), output }] }]) ?? CHAT_NO_RESULT_ANSWER
}

/** Model prose may explain the retrieved cards, but it may not invent an operation id. */
export function explanationUsable(text: string, output: ToolChoiceSearchOutput): boolean {
  const answer = text.trim()
  if (answer.length < 35 || /couldn't finish the answer/iu.test(answer)) return false
  if (/[｜▁]|<\|(?:begin|end)|\b(?:let me|i(?:'ll| will) (?:check|search|look))\b/iu.test(answer)) return false
  const allowed = new Set<string>(output.kind === 'match' || output.kind === 'scoped'
    ? output.results.flatMap(result => result.toolRef === undefined ? [] : [result.toolRef]) : [])
  return (answer.match(/operation:v1:[0-9a-f]{64}/gu) ?? []).every(ref => allowed.has(ref))
}
