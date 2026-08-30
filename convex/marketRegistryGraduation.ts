"use node"

import { v } from "convex/values";
import type { FunctionArgs, RegisteredAction } from "convex/server";

import { probeRegistryEntryForAdmission } from "@/modules/market/registry-graduation";
import { defaultDnsResolver, isPublicHttpTarget } from "@/modules/network-guard/public";
import { sendGuardedHttpRequest } from "@/modules/network-guard/server";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  bindWorkloadCronActionContext,
  parseWorkloadCronSnapshot,
  workloadCronSnapshotValue,
} from "./workloadCron";

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
  workload: unknown;
};
type CandidateResult =
  | { kind: "found"; candidate: Parameters<typeof probeRegistryEntryForAdmission>[0] }
  | { kind: "not_found" | "source_changed" | "unavailable" };
type GraduationResult =
  | { kind: "graduated"; documentId: string; publicationRef: string; published: boolean }
  | { kind: "refused"; documentId: string; reason: string }
  | { kind: "not_found" | "source_changed" | "unavailable" };

const publicationRefusalReason = (error: unknown): string | undefined => {
  const detail = error instanceof Error ? error.message : String(error);
  return detail.includes("facilitator_discovery_publication_prepare_failed")
    ? "publication_prepare_failed"
    : undefined;
};

export const run: RegisteredAction<"internal", GraduationArgs, GraduationResult> = internalAction({
  args: {
    documentId: v.string(),
    expectedSourceDigest: v.string(),
    expectedGeneration: v.optional(v.string()),
    workload: workloadCronSnapshotValue,
  },
  returns: resultValue,
  handler: async (ctx, args): Promise<GraduationResult> => {
    const workload = await ctx.runQuery(internal.workloadCron.reconcile, {
      name: "refresh Agentic Economy API registry",
      snapshot: parseWorkloadCronSnapshot(args.workload),
    });
    const authorized = bindWorkloadCronActionContext(ctx, {
      name: "refresh Agentic Economy API registry",
      snapshot: workload,
    });
    const candidateArgs = {
      documentId: args.documentId,
      expectedSourceDigest: args.expectedSourceDigest,
      ...(args.expectedGeneration === undefined ? {} : { expectedGeneration: args.expectedGeneration }),
    };
    const selected: CandidateResult = await ctx.runQuery(
      internal.marketExternalRegistry.admissionCandidate,
      candidateArgs,
    );
    if (selected.kind !== "found") return selected;
    const result = await probeRegistryEntryForAdmission(selected.candidate, {
      validateTarget: async (url) => isPublicHttpTarget(url, defaultDnsResolver),
      send: sendGuardedHttpRequest,
    });
    if (result.kind === "refused") return result;

    const current: CandidateResult = await ctx.runQuery(
      internal.marketExternalRegistry.admissionCandidate,
      candidateArgs,
    );
    if (current.kind !== "found") return current;

    let reconciled: { published: number };
    try {
      reconciled = await authorized.runMutation(internal.facilitatorDiscovery.reconcile, {
        items: [structuredClone(result.draft)] as FunctionArgs<typeof internal.facilitatorDiscovery.reconcile>["items"],
        complete: false,
        deadlineAt: Date.now() + 30_000,
        workload,
      });
    } catch (error) {
      const reason = publicationRefusalReason(error);
      if (reason === undefined) throw error;
      return { kind: "refused", documentId: result.documentId, reason };
    }
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
  workload: unknown;
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
    workload: workloadCronSnapshotValue,
  },
  returns: sweepResultValue,
  handler: async (ctx, args): Promise<SweepResult> => {
    const workload = await ctx.runQuery(internal.workloadCron.reconcile, {
      name: "refresh Agentic Economy API registry",
      snapshot: parseWorkloadCronSnapshot(args.workload),
    });
    if (args.candidates !== undefined && args.candidates.length > 100) {
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
      cursor: args.candidates === undefined ? (args.cursor ?? null) : null,
      limit: args.candidates === undefined ? 4 : 1,
    });
    if (selected.kind === "stale_generation") {
      return { kind: "stale_generation", attempted: 0, graduated: 0 };
    }
    const candidates = args.candidates ?? selected.candidates;
    const step = candidates.slice(0, 4);
    let graduated = 0;
    for (const candidate of step) {
      let result: GraduationResult;
      try {
        result = await ctx.runAction(
          internal.marketRegistryGraduation.run,
          {
            documentId: candidate.documentId,
            expectedSourceDigest: candidate.sourceDigest,
            ...(args.candidates === undefined ? {} : { expectedGeneration: args.generation }),
            workload,
          },
        );
      } catch (error) {
        const reason = publicationRefusalReason(error);
        if (reason === undefined) throw error;
        result = { kind: "refused", documentId: candidate.documentId, reason };
      }
      if (result.kind === "graduated" && result.published) graduated += 1;
      if (result.kind === "refused") {
        console.info(JSON.stringify({
          event: "REGISTRY_GRADUATION_CANDIDATE_REFUSED",
          documentId: result.documentId,
          reason: result.reason,
        }));
      }
    }
    const remaining = candidates.slice(step.length);
    if (remaining.length > 0) {
      await ctx.scheduler.runAfter(1_000, internal.marketRegistryGraduation.sweep, {
        generation: args.generation,
        candidates: remaining,
        cursor: args.cursor ?? null,
        workload,
      });
    } else if (args.candidates === undefined && !selected.isDone) {
      await ctx.scheduler.runAfter(1_000, internal.marketRegistryGraduation.sweep, {
        generation: args.generation,
        cursor: selected.continueCursor,
        workload,
      });
    }
    return {
      kind: remaining.length === 0 && (args.candidates !== undefined || selected.isDone)
        ? "complete"
        : "advanced",
      attempted: step.length,
      graduated,
    };
  },
});
