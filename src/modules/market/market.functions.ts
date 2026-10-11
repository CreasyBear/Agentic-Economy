import { getRequest } from '@tanstack/react-start/server'
import { awaitBoundedRead as awaitMarketRead, BROWSER_READ_TIMEOUT_MS as MARKET_READ_TIMEOUT_MS, SOURCE_READ_TIMEOUT_MS as MARKET_SOURCE_TIMEOUT_MS } from '@/lib/bounded-read'
import { createServerFn } from "@tanstack/react-start";
import { degrade } from '@/lib/observability/degrade'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { z } from "zod";
import {
  savedToolRemoveInputSchema, savedToolSaveInputSchema,
  type SavedToolRemoveResult, type SavedToolSaveResult, type SavedToolsListResult,
} from './saved-tools.contracts'
import { SEARCH_QUERY_MAX_LENGTH } from "@/modules/common/search-query";
import { jevDiscoveryRecipient } from "@/modules/decision-engine/public";
import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'

import { marketWindowSchema } from "./contracts";
import { loadMarketRouteData, marketUsesHostDirectory, resolveMarketView, type MarketSearch, type MarketRouteReadOptions } from './market-route-data'
import { readMarketRouteProjection } from "./server";

const inputSchema = z.object({
  window: marketWindowSchema,
  query: z.string().max(SEARCH_QUERY_MAX_LENGTH).optional(),
  availability: z.enum(["routeable", "setup_required", "unavailable"]).optional(),
  cursor: z.string().max(2_000).optional(),
});
const chatRecipientQuery = sourceQuery<Record<string, never>, Readonly<{ label: string; host: string }> | null>('chatAnonymous:recipient')

export const readMarketRouteServer = createServerFn({ method: "GET" })
  .validator((data) => inputSchema.parse(data))
  .handler(
    async ({ data }) =>
      await readMarketRouteProjection(data.window, {
        ...(data.query === undefined ? {} : { query: data.query }),
        ...(data.availability === undefined
          ? {}
          : { availability: data.availability }),
        ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
      }),
  );
export const readMarketDiscoveryRecipientServer = createServerFn({ method: "GET" })
  .handler(() => jevDiscoveryRecipient() ?? null);
export const readMarketChatRecipientServer = createServerFn({ method: 'GET' })
  .handler(async () => {
    if (!process.env.CONVEX_URL?.trim() && !process.env.VITE_CONVEX_URL?.trim()) return null
    const signal = AbortSignal.any([getRequest().signal, AbortSignal.timeout(MARKET_SOURCE_TIMEOUT_MS)])
    return await awaitMarketRead(() => callPublicSourceQuery(chatRecipientQuery, {}, { signal }), signal)
  })

/** The x402 directory's own freshness state, the same value registry list and the developer routes return. */
export const readMarketCatalogueFreshnessServer = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { readDirectoryFreshnessField } = await import('./x402-directory-index.server')
    return (await readDirectoryFreshnessField(Date.now(), { signal: AbortSignal.any([getRequest().signal, AbortSignal.timeout(MARKET_SOURCE_TIMEOUT_MS)]) })).state
  })

/** Catalogue stays authoritative; disclosure and head metadata are independent. */
export async function loadMarketPageRouteData(deps: MarketSearch, options: MarketRouteReadOptions = {}) {
  const deadline = AbortSignal.timeout(MARKET_READ_TIMEOUT_MS)
  const signal = options.signal === undefined ? deadline : AbortSignal.any([options.signal, deadline])
  const read = <T>(fetch: () => Promise<T>) => awaitMarketRead(fetch, signal)
  const showHosts = marketUsesHostDirectory(deps)
  const showDirectory = resolveMarketView(deps) !== 'discover' && !showHosts
  const [data, canonicalBaseUrl, jevRecipient, chatRecipient, freshness] = await Promise.all([
    loadMarketRouteData(deps, options),
    read(() => readCanonicalBaseUrlServer({ signal })).catch(cause => { if (options.signal?.aborted) throw cause; return degrade(cause, undefined, { site: 'marketCanonicalUrl', reason: 'source_unavailable' }) }),
    showHosts ? null : read(() => readMarketDiscoveryRecipientServer({ signal })).catch(cause => { if (options.signal?.aborted) throw cause; return degrade(cause, null, { site: 'marketDiscoveryRecipient', reason: 'source_unavailable' }) }),
    showDirectory ? read(() => readMarketChatRecipientServer({ signal })).catch(cause => { if (options.signal?.aborted) throw cause; return degrade(cause, null, { site: 'marketChatRecipient', reason: 'source_unavailable' }) }) : null,
    read(() => readMarketCatalogueFreshnessServer()).catch(cause => { if (options.signal?.aborted) throw cause; return degrade(cause, undefined, { site: 'marketCatalogueFreshness', reason: 'source_unavailable' }) }),
  ])
  options.signal?.throwIfAborted()
  return { ...data, canonicalBaseUrl, jevRecipient, chatRecipient, freshness }
}

/** Convex derives the account from the signed-in session and rechecks current authority. */
export const listSavedToolsForOwner = createServerFn({ method: 'GET' })
  .handler(async (): Promise<SavedToolsListResult> => {
    const { listSavedToolsOwner } = await import('@/lib/server/saved-tools-api')
    return await listSavedToolsOwner()
  })

export const saveToolForOwner = createServerFn({ method: 'POST' })
  .validator(data => savedToolSaveInputSchema.parse(data))
  .handler(async ({ data }): Promise<SavedToolSaveResult> => {
    const { saveSavedToolOwner } = await import('@/lib/server/saved-tools-api')
    return await saveSavedToolOwner(data)
  })

export const removeToolForOwner = createServerFn({ method: 'POST' })
  .validator(data => savedToolRemoveInputSchema.parse(data))
  .handler(async ({ data }): Promise<SavedToolRemoveResult> => {
    const { removeSavedToolOwner } = await import('@/lib/server/saved-tools-api')
    return await removeSavedToolOwner(data)
  })

export {
  loadMarketRouteData,
  marketDocumentTitle,
  marketLoaderDeps,
  validateMarketSearch,
  parseMarketCompareRefs,
  toggleMarketCompareRef,
  marketCompareParam,
  carryMarketCompare,
  type MarketSearch,
  type MarketCanonicalSearchPage,
} from './market-route-data'
