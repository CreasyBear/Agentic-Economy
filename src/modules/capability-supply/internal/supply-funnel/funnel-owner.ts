import { z } from "zod";

import {
  callSourceAction,
  callSourceMutation,
  callSourceQuery,
  sourceAction,
  sourceMutation,
  sourceQuery,
} from "@/lib/server/convex-source";
import { sourceWriteAdmissionFromContext } from "@/lib/server/source-write-admission";
import { requireStrictClerkConsequenceProof } from "@/lib/server/clerk-consequence-proof";
import { sourceWriteRequestFromAdmission } from "@/modules/security/source-write-admission";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import {
  OWNER_SUPPLY_UNAVAILABLE_MESSAGE,
  type OwnerSupplyActionInput,
  type OwnerSupplyCommandResult,
  type OwnerSupplyFunnelReadback,
  type OwnerSupplyMaintenanceCommand,
  type OwnerSupplyMaintenanceSourceInput,
  type OwnerSellerCanaryPromotionResult,
  type OwnerSellerCanaryReadback,
  type SupplyFunnelStepCompletion,
} from "./types";

export const readOwnerSupplyQuery = sourceQuery<
  { businessId: string },
  OwnerSupplyFunnelReadback
>("capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel");
const probeAction = sourceAction<
  OwnerSupplyActionInput,
  SupplyFunnelStepCompletion
>("capabilitySupplyOwnerSupply:runOwnerSupplyReadiness");
const testAction = sourceAction<
  OwnerSupplyActionInput & {
    correlationId: string;
    sourceWrite: Awaited<ReturnType<typeof sourceWriteAdmissionFromContext>>;
    sourceWriteRequest: ReturnType<typeof sourceWriteRequestFromAdmission>;
  },
  SupplyFunnelStepCompletion
>("capabilitySupplyOwnerSupply:runOwnerSupplyTest");
const ownerSellerCanaryStatusQuery = sourceQuery<
  Omit<OwnerSupplyActionInput, "operationKey">,
  Exclude<OwnerSellerCanaryReadback, { kind: "error"; code: "source_unavailable" }>
>("capabilitySupplyOwnerCanary:readOwnerSellerOnboardingCanaryStatus");
const promoteOwnerSellerCanaryMutation = sourceMutation<
  Readonly<{
    businessId: string;
    canaryRef: string;
    operationKey: string;
    correlationId: string;
    sourceWrite: Awaited<ReturnType<typeof sourceWriteAdmissionFromContext>>;
    sourceWriteRequest: ReturnType<typeof sourceWriteRequestFromAdmission>;
  }>,
  Exclude<OwnerSellerCanaryPromotionResult, { kind: "refused"; code: "canary_target_mismatch" }>
>("catalog:promoteX402SellerCanary");
const withdrawMutation = sourceMutation<
  OwnerSupplyMaintenanceSourceInput,
  OwnerSupplyCommandResult
>("capabilitySupplyOwnerFunnel:withdrawOwnerCapability");
const refreshMutation = sourceMutation<
  OwnerSupplyMaintenanceSourceInput,
  OwnerSupplyCommandResult
>("capabilitySupplyOwnerFunnel:refreshOwnerCapability");
const republishMutation = sourceMutation<
  OwnerSupplyMaintenanceSourceInput,
  OwnerSupplyCommandResult
>("capabilitySupplyOwnerFunnel:republishOwnerCapability");

export const ownerSupplyReadInputSchema = z.strictObject({
  businessId: z.string().min(1),
  editorOfferingRef: z.string().min(1).optional(),
});
export const ownerSupplyActionInputSchema = z.strictObject({
  businessId: z.string().min(1),
  offeringRef: z.string().min(1),
  offeringRevision: z.number().int().positive(),
  offeringSourceHash: z.string().min(1),
  publicationRef: z.string().min(1),
  publicationRevision: z.number().int().positive(),
  operationKey: z.string().min(8).max(200),
});
export const ownerSupplyMaintenanceInputSchema = z.strictObject({
  businessId: z.string().min(1),
  offeringRef: z.string().min(1),
  offeringRevision: z.number().int().positive(),
  offeringSourceHash: z.string().min(1),
  publicationRef: z.string().min(1),
  publicationRevision: z.number().int().positive(),
  operationKey: z.string().min(8).max(200),
  correlationId: z.string().min(1).max(200),
  reasonCode: z.string().min(1).max(200),
  evidenceRefs: z.array(z.string().min(1)).max(64),
});
export const ownerSellerCanaryStatusInputSchema = ownerSupplyActionInputSchema.omit({
  operationKey: true,
});
export const ownerSellerCanaryPromotionInputSchema = ownerSellerCanaryStatusInputSchema.extend({
  canaryRef: z.string().min(1).max(200),
});

export async function readOwnerSupplyFunnel({
  data,
}: {
  data: z.infer<typeof ownerSupplyReadInputSchema>;
}): Promise<OwnerSupplyFunnelReadback> {
  try {
    return await callSourceQuery(readOwnerSupplyQuery, data);
  } catch {
    return {
      kind: "error",
      code: "source_unavailable",
      reason: OWNER_SUPPLY_UNAVAILABLE_MESSAGE,
    };
  }
}

export async function runOwnerSupplyReadiness({
  data,
}: {
  data: z.infer<typeof ownerSupplyActionInputSchema>;
}): Promise<SupplyFunnelStepCompletion> {
  return callSourceAction(probeAction, data);
}

export async function runOwnerSupplyTest({
  data,
  context,
}: {
  data: z.infer<typeof ownerSupplyActionInputSchema>;
  context: unknown;
}): Promise<SupplyFunnelStepCompletion> {
  const correlationId = `owner-supply-test:${data.businessId}:${data.offeringRef}`;
  const command = { ...data, correlationId };
  const sourceWrite = await sourceWriteAdmissionFromContext({
    context,
    command,
    scope: "catalog_publish",
    operationKey: data.operationKey,
    correlationId,
  });
  return callSourceAction(testAction, {
    ...command,
    sourceWrite,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
  });
}

export async function readOwnerSellerCanaryStatus({
  data,
}: {
  data: z.infer<typeof ownerSellerCanaryStatusInputSchema>;
}): Promise<OwnerSellerCanaryReadback> {
  try {
    return await callSourceQuery(ownerSellerCanaryStatusQuery, data);
  } catch {
    return {
      kind: "error",
      code: "source_unavailable",
      reason: OWNER_SUPPLY_UNAVAILABLE_MESSAGE,
    };
  }
}

export async function promoteOwnerSellerCanary({
  data,
  context,
}: {
  data: z.infer<typeof ownerSellerCanaryPromotionInputSchema>;
  context: unknown;
}): Promise<OwnerSellerCanaryPromotionResult> {
  const { canaryRef, ...target } = data;
  const current = await readOwnerSellerCanaryStatus({ data: target });
  if (
    current.kind !== "available"
    || current.canaryRef !== canaryRef
    || current.offeringRef !== data.offeringRef
    || current.offeringRevision !== data.offeringRevision
    || current.publicationRef !== data.publicationRef
    || current.publicationRevision !== data.publicationRevision
  ) return { kind: "refused", code: "canary_target_mismatch" };

  const identityDigest = canonicalDigest({
    kind: "owner_x402_seller_canary_promotion:v1",
    businessId: data.businessId,
    offeringRef: data.offeringRef,
    offeringRevision: data.offeringRevision,
    offeringSourceHash: data.offeringSourceHash,
    publicationRef: data.publicationRef,
    publicationRevision: data.publicationRevision,
    canaryRef,
  });
  const operationKey = `owner-supply:x402-promote:${identityDigest.slice("sha256:".length)}`;
  const correlationId = `owner-supply:${data.businessId}:${data.offeringRef}`;
  const command = {
    businessId: data.businessId,
    canaryRef,
    operationKey,
    correlationId,
  };
  const sourceWrite = await sourceWriteAdmissionFromContext({
    context,
    command,
    scope: "catalog_publish",
    operationKey,
    correlationId,
  });
  return callSourceMutation(promoteOwnerSellerCanaryMutation, {
    ...command,
    sourceWrite,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
  });
}

async function admitOwnerSupplyMaintenance(
  context: unknown,
  command: OwnerSupplyMaintenanceCommand,
  proof?: Awaited<ReturnType<typeof requireStrictClerkConsequenceProof>>,
): Promise<OwnerSupplyMaintenanceSourceInput> {
  const sourceWrite = await sourceWriteAdmissionFromContext({
    context,
    command,
    scope: "catalog_publish",
    operationKey: command.operationKey,
    correlationId: command.correlationId,
  });
  return {
    ...command,
    ...(proof === undefined ? {} : { proof }),
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  };
}

export async function recheckOwnerCapability({
  data,
  context,
}: {
  data: z.infer<typeof ownerSupplyMaintenanceInputSchema>;
  context: unknown;
}): Promise<OwnerSupplyCommandResult> {
  return await callSourceMutation(
    refreshMutation,
    await admitOwnerSupplyMaintenance(context, data),
  );
}

export async function withdrawOwnerCapability({
  data,
  context,
}: {
  data: z.infer<typeof ownerSupplyMaintenanceInputSchema>;
  context: unknown;
}): Promise<OwnerSupplyCommandResult> {
  return await callSourceMutation(
    withdrawMutation,
    await admitOwnerSupplyMaintenance(context, data),
  );
}

export async function republishOwnerCapability({
  data,
  context,
}: {
  data: z.infer<typeof ownerSupplyMaintenanceInputSchema>;
  context: unknown;
}): Promise<OwnerSupplyCommandResult> {
  const proof = await requireStrictClerkConsequenceProof(data.operationKey);
  return await callSourceMutation(
    republishMutation,
    await admitOwnerSupplyMaintenance(context, data, proof),
  );
}
