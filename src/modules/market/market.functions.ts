import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SEARCH_QUERY_MAX_LENGTH } from "@/modules/common/search-query";
import { jevDiscoveryRecipient } from "@/modules/decision-engine/public";
import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'

import { marketWindowSchema } from "./contracts";
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
  .handler(async () => await callPublicSourceQuery(chatRecipientQuery, {}))

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
