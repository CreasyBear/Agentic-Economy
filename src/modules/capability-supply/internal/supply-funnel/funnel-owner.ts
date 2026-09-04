import { z } from "zod";

import {
  callSourceMutation,
  sourceMutation,
  sourceQuery,
} from "@/lib/server/convex-source";
import { sourceWriteAdmissionFromContext } from "@/lib/server/source-write-admission";
import { requireStrictClerkConsequenceProof } from "@/lib/server/clerk-consequence-proof";
import { sourceWriteRequestFromAdmission } from "@/modules/security/source-write-admission";
import {
  type OwnerSupplyCommandResult,
  type OwnerSupplyFunnelReadback,
  type OwnerSupplyMaintenanceCommand,
  type OwnerSupplyMaintenanceSourceInput,
} from "./types";

export const readOwnerSupplyQuery = sourceQuery<
  { businessId: string },
  OwnerSupplyFunnelReadback
>("capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel");
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
