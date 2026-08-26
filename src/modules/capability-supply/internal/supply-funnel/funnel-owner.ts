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
import { sourceWriteRequestFromAdmission } from "@/modules/security/source-write-admission";
import {
  OWNER_SUPPLY_UNAVAILABLE_MESSAGE,
  type OwnerSupplyActionInput,
  type OwnerSupplyCommandResult,
  type OwnerSupplyFunnelReadback,
  type OwnerSupplyMaintenanceCommand,
  type OwnerSupplyMaintenanceSourceInput,
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
  OwnerSupplyActionInput,
  SupplyFunnelStepCompletion
>("capabilitySupplyOwnerSupply:runOwnerSupplyTest");
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
}: {
  data: z.infer<typeof ownerSupplyActionInputSchema>;
}): Promise<SupplyFunnelStepCompletion> {
  return callSourceAction(testAction, data);
}

async function admitOwnerSupplyMaintenance(
  context: unknown,
  command: OwnerSupplyMaintenanceCommand,
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
  return await callSourceMutation(
    republishMutation,
    await admitOwnerSupplyMaintenance(context, data),
  );
}
