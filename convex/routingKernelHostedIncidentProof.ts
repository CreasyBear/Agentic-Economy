import { type Infer, v } from "convex/values";

import { createExecutionRequestDigest } from "@/modules/routing-kernel/runtime";

import { api, internal } from "./_generated/api";
import { action } from "./_generated/server";
import { createRegisteredRoutingKernel } from "./routingKernel";

const scope = v.object({ networkId: v.string(), bindingId: v.string() });
const canaryPlan = v.object({
  quoteId: v.string(),
  quoteDigest: v.string(),
  authorizationRef: v.string(),
  requestDigest: v.string(),
  bindingId: v.string(),
  capabilityContractId: v.string(),
  maximumSpendMinor: v.number(),
  currency: v.string(),
  allowedDataFields: v.array(v.string()),
});

const preparationResult = v.union(
  v.object({ kind: v.literal("refused"), reason: v.string() }),
  v.object({
    kind: v.literal("preparation_incomplete"), reason: v.string(), proofId: v.string(),
    freezeOrderId: v.string(), recoveryGrantId: v.string(), scope,
  }),
  v.object({
    kind: v.literal("prepared"),
    proofId: v.string(),
    caller: v.object({ agentId: v.string(), principalId: v.string() }),
    freezeOrderId: v.string(),
    recoveryGrantId: v.string(),
    sourceGrantId: v.string(),
    scope,
    canaryPlan,
    idempotencyKey: v.string(),
    data: v.object({ scenario: v.string() }),
  }),
);

/**
 * Creates an exact, externally approvable canary plan against a real admitted binding.
 * The provider/data egress freeze is issued before the quote and authorization used by
 * the plan, so the quote carries the active incident epoch and cannot be a pre-freeze artifact.
 */
export const prepare = action({
  args: {
    proofId: v.string(),
    sourceGrantId: v.string(),
    caller: v.optional(
      v.object({ agentId: v.string(), principalId: v.string() }),
    ),
  },
  returns: preparationResult,
  handler: async (ctx, args): Promise<Infer<typeof preparationResult>> => {
    const operator = await ctx.runMutation(
      api.routingKernelIncidentControl.requireIncidentOperator,
      {},
    );
    if (operator.kind !== "allowed")
      return { kind: "refused" as const, reason: "authorization_denied" };
    const caller = args.caller ?? {
      agentId: `agent:hosted-incident-proof:${args.proofId}`,
      principalId: "principal:hosted-incident-proof",
    };
    const now = Date.now();
    const sourceGrant = await ctx.runQuery(
      internal.routingKernelAgentGrants.resolve,
      { agentId: caller.agentId, networkId: "registered-businesses", now },
    );
    if (
      sourceGrant === null || sourceGrant.grantId !== args.sourceGrantId ||
      sourceGrant.principalId !== caller.principalId || sourceGrant.maximumSpendMinor < 250 ||
      sourceGrant.currency !== "AUD" || !sourceGrant.allowedDataFields.includes("scenario") ||
      sourceGrant.allowedRecipientBindingIds === undefined || sourceGrant.allowedDisclosurePurposes === undefined
    ) return { kind: "refused" as const, reason: "source_grant_invalid" };
    const kernel = createRegisteredRoutingKernel(ctx);
    const discovery = await kernel.operations.route({
      caller,
      networkId: "registered-businesses",
      query: "book a shipping label",
      constraints: { currency: "AUD", maximumSpendMinor: 250 },
    });
    if (discovery.kind !== "quoted")
      return {
        kind: "refused" as const,
        reason: `discovery:${discovery.reason}`,
      };
    const bindingId = discovery.quote.selectedGraph.bindingId;
    const selectedStep = discovery.quote.selectedGraph.steps[0];
    if (selectedStep === undefined)
      return { kind: "refused" as const, reason: "selected_graph_empty" };
    if (!sourceGrant.allowedRecipientBindingIds.includes(bindingId)
      || !sourceGrant.allowedDisclosurePurposes.includes(selectedStep.capabilityContractId)) {
      return { kind: "refused" as const, reason: "source_grant_scope_mismatch" };
    }
    const budget = await ctx.runQuery(
      internal.routingKernelAgentGrants.resolveBudgetAuthority,
      { sourceGrantId: args.sourceGrantId, networkId: discovery.quote.networkId, now },
    );
    const dataBudget = await ctx.runQuery(
      internal.routingKernelAgentGrants.resolveDataAuthorizationBudget,
      { sourceGrantId: args.sourceGrantId, networkId: discovery.quote.networkId, now },
    );
    if (budget === null || dataBudget === null
      || budget.agentId !== caller.agentId || budget.principalId !== caller.principalId
      || dataBudget.agentId !== caller.agentId || dataBudget.principalId !== caller.principalId) {
      return { kind: "refused" as const, reason: "authority_resolution_failed" };
    }
    const scopeValue = { networkId: discovery.quote.networkId, bindingId };
    const freezeOrderId = `freeze:hosted-proof:${args.proofId}`;
    const recoveryGrantId = `recovery:hosted-proof:${args.proofId}`;
    const freeze = await ctx.runMutation(
      api.routingKernelIncidentControl.issueFreeze,
      {
        freezeOrderId,
        incidentId: `incident:hosted-proof:${args.proofId}`,
        reason: "Hosted two-admin canary and recovery proof.",
        scope: scopeValue,
        blockedActions: ["provider_release", "data_release"],
      },
    );
    if (freeze.kind !== "freeze_issued")
      return { kind: "refused" as const, reason: `freeze:${freeze.reason}` };

    const routed = await kernel.operations.route({
      caller,
      networkId: discovery.quote.networkId,
      query: "book a shipping label",
      constraints: { currency: "AUD", maximumSpendMinor: 250 },
    });
    if (routed.kind !== "quoted")
      return {
        kind: "preparation_incomplete" as const,
        reason: `post_freeze_route:${routed.reason}`,
        proofId: args.proofId, freezeOrderId, recoveryGrantId, scope: scopeValue,
      };
    if (routed.quote.selectedGraph.bindingId !== bindingId) {
      return {
        kind: "preparation_incomplete" as const,
        reason: "post_freeze_binding_changed",
        proofId: args.proofId, freezeOrderId, recoveryGrantId, scope: scopeValue,
      };
    }
    const allowedDataFields = ["scenario"];
    const authorization = await kernel.authority.authorize({
      quoteId: routed.quote.quoteId,
      quoteDigest: routed.quote.quoteDigest,
      principalId: caller.principalId,
      agentId: caller.agentId,
      budgetAuthorityRef: budget.budgetAuthorityRef,
      budgetMaximumGrossMinor: budget.maximumGrossMinor,
      dataAuthorizationBudgetRef: dataBudget.dataAuthorizationBudgetRef,
      protectedFieldSetId: dataBudget.protectedFieldSetId,
      dataBudgetMaximumAttempts: dataBudget.maximumAttempts,
      dataBudgetMaximumExposures: dataBudget.maximumExposures,
      allowedRecipientBindingIds: dataBudget.permittedRecipientBindingIds,
      allowedDisclosurePurposes: dataBudget.permittedPurposes,
      maximumDisclosureAttempts: dataBudget.maximumAttempts,
      maximumDisclosureExposures: dataBudget.maximumExposures,
      maximumSpendMinor: 250,
      currency: "AUD",
      expiresAt: now + 10 * 60_000,
      allowedDataFields,
    });
    const data = { scenario: "success" };
    const requestDigest = createExecutionRequestDigest(
      {
        quoteId: routed.quote.quoteId,
        quoteDigest: routed.quote.quoteDigest,
        authorizationRef: authorization.authorizationRef,
        executionPurpose: "incident_canary",
        canaryRecoveryGrantId: recoveryGrantId,
      },
      data,
    );
    const postFreezeStep = routed.quote.selectedGraph.steps[0];
    if (postFreezeStep === undefined)
      return { kind: "preparation_incomplete" as const, reason: "selected_graph_empty", proofId: args.proofId, freezeOrderId, recoveryGrantId, scope: scopeValue };
    return {
      kind: "prepared" as const,
      proofId: args.proofId,
      caller,
      freezeOrderId,
      recoveryGrantId,
      sourceGrantId: args.sourceGrantId,
      scope: scopeValue,
      canaryPlan: {
        quoteId: routed.quote.quoteId,
        quoteDigest: routed.quote.quoteDigest,
        authorizationRef: authorization.authorizationRef,
        requestDigest,
        bindingId,
        capabilityContractId: postFreezeStep.capabilityContractId,
        maximumSpendMinor: 250,
        currency: "AUD",
        allowedDataFields,
      },
      idempotencyKey: `hosted-proof:${args.proofId}`,
      data,
    };
  },
});

const completionResult = v.union(
  v.object({ kind: v.literal("refused"), reason: v.string() }),
  v.object({
    kind: v.literal("completed"),
    rootRunId: v.string(),
    canaryRunFactId: v.string(),
    reconformanceFactId: v.string(),
    reconstructionCheckpointId: v.string(),
    evidenceSnapshotDigest: v.string(),
    state: v.literal("completed"),
  }),
);

/** Materializes signed recovery evidence after the external agent executes the approved canary. */
export const recordExternalRun = action({
  args: {
    proofId: v.string(),
    freezeOrderId: v.string(),
    recoveryGrantId: v.string(),
    scope,
    rootRunId: v.string(),
  },
  returns: completionResult,
  handler: async (ctx, args): Promise<Infer<typeof completionResult>> => {
    const canaryRunFactId = `canary-run:hosted-proof:${args.proofId}`;
    const canary = await ctx.runMutation(
      api.routingKernelIncidentControl.recordCanaryRun,
      {
        canaryRunFactId,
        recoveryGrantId: args.recoveryGrantId,
        rootRunId: args.rootRunId,
      },
    );
    if (canary.kind !== "canary_run_recorded")
      return {
        kind: "refused" as const,
        reason: `canary_fact:${canary.reason}`,
      };

    const drain = await ctx.runQuery(
      internal.routingKernelIncidentControl.readIncidentDrainStatus,
      { freezeOrderId: args.freezeOrderId },
    );
    if (drain?.status !== "complete")
      return { kind: "refused" as const, reason: "drain_pending" };

    const reconformanceFactId = `reconformance:hosted-proof:${args.proofId}`;
    const reconformance = await ctx.runMutation(
      api.routingKernelIncidentControl.recordCanaryReconformance,
      { reconformanceFactId, freezeOrderId: args.freezeOrderId, canaryRunFactId },
    );
    if (reconformance.kind !== "reconformance_recorded")
      return { kind: "refused" as const, reason: `reconformance:${reconformance.reason}` };
    const reconstructionCheckpointId = `checkpoint:hosted-proof:${args.proofId}`;
    const reconstruction = await ctx.runMutation(
      api.routingKernelIncidentControl.recordReconstructionCheckpoint,
      {
        checkpointId: reconstructionCheckpointId,
        scope: args.scope,
      },
    );
    if (
      reconstruction.kind !== "reconstruction_recorded" ||
      !reconstruction.projectionMatches
    ) {
      return {
        kind: "refused" as const,
        reason:
          reconstruction.kind === "reconstruction_refused"
            ? `reconstruction:${reconstruction.reason}`
            : "reconstruction:projection_mismatch",
      };
    }
    return {
      kind: "completed" as const,
      rootRunId: args.rootRunId,
      state: "completed" as const,
      canaryRunFactId,
      reconformanceFactId,
      reconstructionCheckpointId,
      evidenceSnapshotDigest: reconformance.evidenceSnapshotDigest,
    };
  },
});
