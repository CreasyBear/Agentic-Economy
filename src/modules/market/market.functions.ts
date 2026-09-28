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
import { loadMarketRouteData, type MarketSearch } from './market-route-data'
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
    return await callPublicSourceQuery(chatRecipientQuery, {})
  })

/** Catalogue stays authoritative; disclosure and head metadata are independent. */
export async function loadMarketPageRouteData(deps: MarketSearch) {
  const [data, canonicalBaseUrl, jevRecipient, chatRecipient] = await Promise.all([
    loadMarketRouteData(deps),
    readCanonicalBaseUrlServer().catch(cause => degrade(cause, undefined, { site: 'marketCanonicalUrl', reason: 'source_unavailable' })),
    readMarketDiscoveryRecipientServer().catch(cause => degrade(cause, null, { site: 'marketDiscoveryRecipient', reason: 'source_unavailable' })),
    readMarketChatRecipientServer().catch(cause => degrade(cause, null, { site: 'marketChatRecipient', reason: 'source_unavailable' })),
  ])
  return { ...data, canonicalBaseUrl, jevRecipient, chatRecipient }
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
} from './market-route-data'
