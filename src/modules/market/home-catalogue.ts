import { z } from "zod";

import type { OperationCardViewModel } from "@/modules/market/operation-view-model";
import { readMarketRouteServer } from "@/modules/market/market.functions";

const HOME_CAPABILITY_LIMIT = 6;

const rootSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
});

export type RootSearchParams = {
  q?: string | undefined;
};

export type HomeCapabilityRead =
  | Readonly<{
      kind: "ok";
      operations: readonly OperationCardViewModel[];
      matchedCount: number;
    }>
  | Readonly<{ kind: "unavailable" }>;

/** Home never reads project authority. */
export async function loadRootRoute(
  _search: RootSearchParams,
): Promise<undefined> {
  return undefined;
}

export function validateRootSearch(
  search: Record<string, unknown>,
): RootSearchParams {
  const parsed = rootSearchSchema.parse(search);
  const query = parsed.q?.trim() ?? "";
  return {
    ...(query.length === 0 ? {} : { q: query }),
  };
}

export async function readHomeCapabilities(): Promise<HomeCapabilityRead> {
  try {
    const projection = await readMarketRouteServer({
      data: {
        window: "30d",
        availability: "routeable",
      },
    });
    if (projection.catalog.kind !== "ok") {
      return projection.catalog.kind === "unavailable"
        ? { kind: "unavailable" }
        : { kind: "ok", operations: [], matchedCount: 0 };
    }

    return {
      kind: "ok",
      matchedCount: projection.catalog.matchedCount,
      operations: projection.catalog.items.slice(0, HOME_CAPABILITY_LIMIT),
    };
  } catch {
    return { kind: "unavailable" };
  }
}
