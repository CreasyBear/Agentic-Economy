"use node"

import { v } from "convex/values";
import type { FunctionArgs, RegisteredAction } from "convex/server";

import { probeRegistryEntryForAdmission } from "@/modules/market/registry-graduation";
import { defaultDnsResolver, isPublicHttpTarget } from "@/modules/network-guard/public";
import { sendGuardedHttpRequest } from "@/modules/network-guard/server";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const resultValue = v.union(
  v.object({
    kind: v.literal("graduated"),
    documentId: v.string(),
    publicationRef: v.string(),
    published: v.boolean(),
  }),
  v.object({ kind: v.literal("refused"), documentId: v.string(), reason: v.string() }),
  v.object({ kind: v.literal("not_found") }),
  v.object({ kind: v.literal("source_changed") }),
  v.object({ kind: v.literal("unavailable") }),
);

type GraduationArgs = {
  documentId: string;
  expectedSourceDigest: string;
  expectedGeneration?: string;
};
type CandidateResult =
  | { kind: "found"; candidate: Parameters<typeof probeRegistryEntryForAdmission>[0] }
  | { kind: "not_found" | "source_changed" | "unavailable" };
type GraduationResult =
  | { kind: "graduated"; documentId: string; publicationRef: string; published: boolean }
  | { kind: "refused"; documentId: string; reason: string }
  | { kind: "not_found" | "source_changed" | "unavailable" };

export const run: RegisteredAction<"internal", GraduationArgs, GraduationResult> = internalAction({
  args: {
    documentId: v.string(),
    expectedSourceDigest: v.string(),
    expectedGeneration: v.optional(v.string()),
  },
  returns: resultValue,
  handler: async (ctx, args): Promise<GraduationResult> => {
    const selected: CandidateResult = await ctx.runQuery(
      internal.marketExternalRegistry.admissionCandidate,
      args,
    );
    if (selected.kind !== "found") return selected;
    const result = await probeRegistryEntryForAdmission(selected.candidate, {
      validateTarget: async (url) => isPublicHttpTarget(url, defaultDnsResolver),
      send: sendGuardedHttpRequest,
    });
    if (result.kind === "refused") return result;

    const current: CandidateResult = await ctx.runQuery(
      internal.marketExternalRegistry.admissionCandidate,
      args,
    );
    if (current.kind !== "found") return current;

    const reconciled: { published: number } = await ctx.runMutation(internal.facilitatorDiscovery.reconcile, {
      items: [structuredClone(result.draft)] as FunctionArgs<typeof internal.facilitatorDiscovery.reconcile>["items"],
      complete: false,
      deadlineAt: Date.now() + 30_000,
    });
    return {
      kind: "graduated" as const,
      documentId: result.documentId,
      publicationRef: result.draft.offering.offeringId,
      published: reconciled.published === 1,
    };
  },
});

type SweepArgs = {
  generation: string;
  candidates?: { documentId: string; sourceDigest: string }[];
  cursor?: string | null;
};
type SweepResult = {
  kind: "advanced" | "complete" | "stale_generation";
  attempted: number;
  graduated: number;
};

const sweepResultValue = v.object({
  kind: v.union(
    v.literal("advanced"),
    v.literal("complete"),
    v.literal("stale_generation"),
  ),
  attempted: v.number(),
  graduated: v.number(),
});

export const sweep: RegisteredAction<"internal", SweepArgs, SweepResult> = internalAction({
  args: {
    generation: v.string(),
    candidates: v.optional(v.array(v.object({
      documentId: v.string(),
      sourceDigest: v.string(),
    }))),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: sweepResultValue,
  handler: async (ctx, args): Promise<SweepResult> => {
    if (args.candidates === undefined) {
      return { kind: "complete", attempted: 0, graduated: 0 };
    }
    if (args.candidates.length > 100) {
      throw new Error("registry_graduation_cohort_too_large");
    }
    const selected: {
      kind: "stale_generation";
    } | {
      kind: "page";
      candidates: { documentId: string; sourceDigest: string }[];
      isDone: boolean;
      continueCursor: string;
    } = await ctx.runQuery(internal.marketExternalRegistry.admissionCandidates, {
      generation: args.generation,
      cursor: null,
      limit: 1,
    });
    if (selected.kind === "stale_generation") {
      return { kind: "stale_generation", attempted: 0, graduated: 0 };
    }
    const step = args.candidates.slice(0, 4);
    let graduated = 0;
    for (const candidate of step) {
      const result: GraduationResult = await ctx.runAction(
        internal.marketRegistryGraduation.run,
        {
          documentId: candidate.documentId,
          expectedSourceDigest: candidate.sourceDigest,
          expectedGeneration: args.generation,
        },
      );
      if (result.kind === "graduated" && result.published) graduated += 1;
    }
    const remaining = args.candidates.slice(step.length);
    if (remaining.length > 0) {
      await ctx.scheduler.runAfter(1_000, internal.marketRegistryGraduation.sweep, {
        generation: args.generation,
        candidates: remaining,
      });
    }
    return {
      kind: remaining.length === 0 ? "complete" : "advanced",
      attempted: step.length,
      graduated,
    };
  },
});
