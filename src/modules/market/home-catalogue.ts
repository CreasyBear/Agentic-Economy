import { z } from "zod";

import { degrade } from "@/lib/observability/degrade";
import type { ToolCardViewModel } from "@/modules/market/tool-view-model";
import { readX402DirectoryServer } from "@/modules/market/x402-directory.functions";
import type { X402DirectoryEntry } from './x402-directory';

const HOME_CAPABILITY_LIMIT = 6;

const rootSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
});

export type RootSearchParams = {
  q?: string | undefined;
};

export type HomeCapabilityRead =
  | Readonly<{ kind: 'directory'; items: readonly X402DirectoryEntry[]; total?: number }>
  | Readonly<{
      kind: "ok";
      tools: readonly ToolCardViewModel[];
      matchedCount?: number;
    }>
  | Readonly<{ kind: "unavailable" }>;

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
    const page = await readX402DirectoryServer({ data: {} });
    if (page.kind !== 'ok') return { kind: 'unavailable' };
    return {
      kind: 'directory',
      ...(page.total === undefined ? {} : { total: page.total }),
      items: page.items.slice(0, HOME_CAPABILITY_LIMIT),
    };
  } catch (cause) {
    return degrade(cause, { kind: "unavailable" } as const, {
      site: "readHomeCapabilities",
      reason: "source_unavailable",
    });
  }
}
