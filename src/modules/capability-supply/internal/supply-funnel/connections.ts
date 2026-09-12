import { z } from "zod";

import {
  callSourceMutation,
  callSourceQuery,
  sourceMutation,
  sourceQuery,
} from "@/lib/server/convex-source";
import { sourceWriteAdmissionFromContext } from "@/lib/server/source-write-admission";
import { sourceWriteRequestFromAdmission } from "@/modules/security/source-write-admission";
import type { ProviderConnectionOwnerProjection } from "../../provider-connection";
import {
  inspectX402SellerEndpoint,
  type X402SellerEndpointMethod,
} from "../x402-seller-endpoint-inspector";
import {
  validX402SellerClaimTime,
  x402SellerClaimDigest,
  x402SellerClaimMessage,
} from "../x402-seller-claim";
import {
  canonicalEvmAddress,
  verifyEip191Message,
} from "../x402-evm-protocol";
import { OWNER_SUPPLY_UNAVAILABLE_MESSAGE } from "./types";
import { degradeBackend } from "@/lib/observability/degrade-backend";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import { requireStrictClerkConsequenceProof } from "@/lib/server/clerk-consequence-proof";
import type { OwnerProviderEarningsReadback } from './earnings-readback'

export type {
  OwnerProviderEarningsAccountReadback,
  OwnerProviderEarningsReadback,
} from './earnings-readback'

export type OwnerProviderConnectionCommandResult =
  | Readonly<{
      kind: "applied" | "duplicate";
      connection: ProviderConnectionOwnerProjection;
      commandDigest: string;
    }>
  | Readonly<{ kind: "refused"; code: string; correlationRef?: string }>;
export type OwnerProviderConnection = ProviderConnectionOwnerProjection;

const readOwnerProviderConnectionsQuery = sourceQuery<
  Record<string, never>,
  readonly ProviderConnectionOwnerProjection[]
>("capabilityProviderConnections:listOwner");
const authorizeProviderBusinessQuery = sourceQuery<
  { businessId: string },
  boolean
>("catalog:authorizeProviderBusiness");
const connectOwnerX402Mutation = sourceMutation<
  {
    businessId: string;
    resourceUrl: string;
    commandId: string;
    operationKey: string;
    correlationId: string;
    method: "GET" | "POST";
    observationDigest: string;
    payTo: string;
    claimExpiresAt: number;
    claimDigest: string;
    claimSignature: string;
    proof: Awaited<ReturnType<typeof requireStrictClerkConsequenceProof>>;
    evidenceRefs: readonly string[];
    sourceWrite: Awaited<ReturnType<typeof sourceWriteAdmissionFromContext>>;
    sourceWriteRequest: ReturnType<typeof sourceWriteRequestFromAdmission>;
  },
  OwnerProviderConnectionCommandResult
>("capabilityProviderConnections:connectX402Owner");
const checkOwnerX402Mutation = sourceMutation<
  {
    connectionRef: string;
    commandId: string;
    operationKey: string;
    correlationId: string;
    expectedAuthorityGeneration: number;
    expectedAuthorityDigest: string;
    method: "GET" | "POST";
    resourceUrl: string;
    payee: string;
    status: "healthy" | "unhealthy";
    checkedAt: number;
    observationDigest: string;
    reasonCode?: string;
    sourceWrite: Awaited<ReturnType<typeof sourceWriteAdmissionFromContext>>;
    sourceWriteRequest: ReturnType<typeof sourceWriteRequestFromAdmission>;
  },
  OwnerProviderConnectionCommandResult
>("capabilityProviderConnections:checkX402Owner");
const reconnectOwnerProviderConnectionMutation = sourceMutation<
  {
    connectionRef: string;
    commandId: string;
    expectedAuthorityGeneration: number;
    expectedAuthorityDigest: string;
    evidenceRefs: readonly string[];
  },
  OwnerProviderConnectionCommandResult
>("capabilityProviderConnections:reconnectOwner");
const revokeOwnerProviderConnectionMutation = sourceMutation<
  {
    connectionRef: string;
    commandId: string;
    expectedAuthorityGeneration: number;
    expectedAuthorityDigest: string;
    evidenceRefs: readonly string[];
  },
  OwnerProviderConnectionCommandResult
>("capabilityProviderConnections:revokeOwner");
const retryOwnerProviderConnectionCleanupMutation = sourceMutation<
  {
    connectionRef: string;
    commandId: string;
  },
  OwnerProviderConnectionCommandResult
>("capabilityProviderConnections:retryOwnerCleanup");
const readOwnerProviderEarningsQuery = sourceQuery<
  Record<string, never>,
  OwnerProviderEarningsReadback
>("moneyLedger:readOwnerProviderEarnings");

export const ownerConnectionCommandSchema = z.strictObject({
  connectionRef: z.string().min(1).max(300),
  commandId: z.string().min(1).max(256),
  expectedAuthorityGeneration: z.number().int().positive(),
  expectedAuthorityDigest: z.string().min(1).max(200),
});
export const connectOwnerX402InputSchema = z.strictObject({
  businessId: z.string().min(1),
  resourceUrl: z.url().max(2_048),
  method: z.enum(["GET", "POST"]),
  environment: z.enum(["sandbox", "production"]),
  claimExpiresAt: z.number().int().nonnegative(),
  claimSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  commandId: z.string().min(1).max(256),
});
export const inspectOwnerX402InputSchema = connectOwnerX402InputSchema.pick({
  businessId: true,
  resourceUrl: true,
  method: true,
  environment: true,
});
export const checkOwnerX402InputSchema = ownerConnectionCommandSchema.extend({
  environment: z.enum(["sandbox", "production"]),
});
export const retryOwnerProviderConnectionCleanupInputSchema =
  ownerConnectionCommandSchema.pick({ connectionRef: true, commandId: true });

export function filterOwnerSupplyAuthorityOptions<
  T extends Pick<
    ProviderConnectionOwnerProjection,
    "businessId" | "adapterId" | "credentialConfigured"
  >,
>(businessId: string, connections: readonly T[]): readonly T[] {
  return connections.filter(
    (connection) =>
      connection.businessId === businessId &&
      (connection.adapterId === "x402-fetch:v2" ||
        connection.credentialConfigured),
  );
}

export async function readOwnerProviderConnections(): Promise<
  readonly ProviderConnectionOwnerProjection[]
> {
  try {
    return await callSourceQuery(readOwnerProviderConnectionsQuery, {});
  } catch (cause) {
    degradeBackend(cause, undefined, {
      site: "readOwnerProviderConnections",
      reason: "source_unavailable",
    });
    throw new Error(OWNER_SUPPLY_UNAVAILABLE_MESSAGE, { cause });
  }
}

export async function connectOwnerX402({
  data,
  context,
}: {
  data: z.infer<typeof connectOwnerX402InputSchema>;
  context: unknown;
}): Promise<OwnerProviderConnectionCommandResult> {
  const proof = await requireStrictClerkConsequenceProof(data.commandId);
  try {
    if (!await callSourceQuery(authorizeProviderBusinessQuery, { businessId: data.businessId })) {
      return { kind: "refused", code: "authorization_denied" };
    }
    const inspection = await inspectX402SellerEndpoint({
      endpointUrl: data.resourceUrl,
      method: data.method,
      aeEnvironment: data.environment,
    });
    if (inspection.kind === "refused") {
      return { kind: "refused", code: `inspection_${inspection.reason}` };
    }
    if (inspection.payment.selection.kind !== "selected") {
      return {
        kind: "refused",
        code: `inspection_${inspection.payment.selection.kind}`,
      };
    }
    const selectedAlternativeId = inspection.payment.selection.alternativeId;
    const selected = inspection.payment.accepts.find(
      (candidate) => candidate.alternativeId === selectedAlternativeId,
    );
    const now = Date.now();
    const payTo = selected === undefined
      ? undefined
      : canonicalEvmAddress(selected.payTo);
    if (payTo === undefined || !validX402SellerClaimTime(data.claimExpiresAt, now)) {
      return { kind: "refused", code: "claim_invalid" };
    }
    const claim = {
      businessId: data.businessId,
      endpointUrl: inspection.endpoint.url,
      method: data.method,
      observationDigest: inspection.digest,
      payTo,
      expiresAt: data.claimExpiresAt,
    } as const;
    const claimVerified = await verifyEip191Message({
      address: claim.payTo,
      message: x402SellerClaimMessage(claim),
      signature: data.claimSignature,
    });
    if (!claimVerified) return { kind: "refused", code: "claim_invalid" };
    const command = {
      businessId: data.businessId,
      resourceUrl: inspection.endpoint.url,
      commandId: data.commandId,
      operationKey: data.commandId,
      correlationId: data.commandId,
      method: data.method,
      observationDigest: inspection.digest,
      payTo: claim.payTo,
      claimExpiresAt: data.claimExpiresAt,
      claimDigest: x402SellerClaimDigest(claim),
      claimSignature: data.claimSignature,
      proof,
      evidenceRefs: [`x402-endpoint-inspection:${inspection.digest}`],
    };
    const sourceWrite = await sourceWriteAdmissionFromContext({
      context,
      command,
      scope: "catalog_publish",
      operationKey: data.commandId,
      correlationId: data.commandId,
    });
    return await callSourceMutation(connectOwnerX402Mutation, {
      ...command,
      sourceWrite,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    });
  } catch (cause) {
    return degradeBackend(cause, { kind: "refused", code: "source_unavailable" }, {
      site: "connectOwnerX402",
      reason: "source_unavailable",
    });
  }
}

export async function inspectOwnerX402({
  data,
}: {
  data: z.infer<typeof inspectOwnerX402InputSchema>;
}) {
  if (!await callSourceQuery(authorizeProviderBusinessQuery, { businessId: data.businessId })) {
    return {
      kind: "refused" as const,
      reason: "authorization_denied" as const,
      action: "Sign in as the Provider owner before inspecting this endpoint.",
      probe: { observedAt: Date.now() },
    };
  }
  const inspection = await inspectX402SellerEndpoint({
    endpointUrl: data.resourceUrl,
    method: data.method as X402SellerEndpointMethod,
    aeEnvironment: data.environment,
  });
  if (inspection.kind === "refused" || inspection.payment.selection.kind !== "selected") {
    return inspection;
  }
  const selectedAlternativeId = inspection.payment.selection.alternativeId;
  const selected = inspection.payment.accepts.find(
    (candidate) => candidate.alternativeId === selectedAlternativeId,
  );
  const payTo = selected === undefined
    ? undefined
    : canonicalEvmAddress(selected.payTo);
  if (payTo === undefined) return inspection;
  const expiresAt = Date.now() + 10 * 60 * 1_000;
  const claim = {
    businessId: data.businessId,
    endpointUrl: inspection.endpoint.url,
    method: data.method,
    observationDigest: inspection.digest,
    payTo,
    expiresAt,
  } as const;
  return {
    ...inspection,
    claim: {
      payTo: claim.payTo,
      expiresAt,
      message: x402SellerClaimMessage(claim),
    },
  };
}

export async function checkOwnerX402({
  data,
  context,
}: {
  data: z.infer<typeof checkOwnerX402InputSchema>;
  context: unknown;
}): Promise<OwnerProviderConnectionCommandResult> {
  try {
    const connections = await readOwnerProviderConnections();
    const connection = connections.find((candidate) => candidate.connectionRef === data.connectionRef);
    const resourceUrl = connection?.grantedResources[0];
    if (connection === undefined
      || connection.adapterId !== "x402-fetch:v2"
      || connection.x402Method === undefined
      || connection.x402Payee === undefined
      || resourceUrl === undefined
      || connection.authorityGeneration !== data.expectedAuthorityGeneration
      || connection.authorityDigest !== data.expectedAuthorityDigest) {
      return { kind: "refused", code: "invalid_transition" };
    }
    const inspection = await inspectX402SellerEndpoint({
      endpointUrl: resourceUrl,
      method: connection.x402Method,
      aeEnvironment: data.environment,
    });
    const checkedAt = inspection.probe.observedAt;
    let status: "healthy" | "unhealthy" = "unhealthy";
    let reasonCode: string | undefined;
    let observationDigest: string;
    if (inspection.kind === "refused") {
      reasonCode = inspection.reason;
      observationDigest = canonicalDigest({
        version: "ae.x402-health-refusal:v1",
        resourceUrl,
        method: connection.x402Method,
        reason: inspection.reason,
        httpStatus: inspection.probe.httpStatus ?? null,
      });
    } else if (inspection.payment.selection.kind !== "selected") {
      reasonCode = `payment_${inspection.payment.selection.kind}`;
      observationDigest = inspection.digest;
    } else {
      const selectedAlternativeId = inspection.payment.selection.alternativeId;
      const selected = inspection.payment.accepts.find((candidate) =>
        candidate.alternativeId === selectedAlternativeId);
      observationDigest = inspection.digest;
      if (inspection.backend.method !== connection.x402Method
        || inspection.backend.resource !== resourceUrl) {
        reasonCode = "authority_target_changed";
      } else if (selected === undefined) {
        reasonCode = "payment_inconsistent";
      } else if (canonicalEvmAddress(selected.payTo) !== connection.x402Payee) {
        reasonCode = "payee_changed";
      } else {
        status = "healthy";
      }
    }
    const command = {
      connectionRef: connection.connectionRef,
      commandId: data.commandId,
      operationKey: data.commandId,
      correlationId: data.commandId,
      expectedAuthorityGeneration: connection.authorityGeneration,
      expectedAuthorityDigest: connection.authorityDigest,
      method: connection.x402Method,
      resourceUrl,
      payee: connection.x402Payee,
      status,
      checkedAt,
      observationDigest,
      ...(reasonCode === undefined ? {} : { reasonCode }),
    };
    const sourceWrite = await sourceWriteAdmissionFromContext({
      context,
      command,
      scope: "catalog_publish",
      operationKey: data.commandId,
      correlationId: data.commandId,
    });
    return await callSourceMutation(checkOwnerX402Mutation, {
      ...command,
      sourceWrite,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    });
  } catch (cause) {
    return degradeBackend(cause, { kind: "refused", code: "source_unavailable" }, {
      site: "checkOwnerX402",
      reason: "source_unavailable",
    });
  }
}

export async function reconnectOwnerProviderConnection({
  data,
}: {
  data: z.infer<typeof ownerConnectionCommandSchema>;
}): Promise<OwnerProviderConnectionCommandResult> {
  try {
    return await callSourceMutation(reconnectOwnerProviderConnectionMutation, {
      ...data,
      evidenceRefs: [],
    });
  } catch (cause) {
    return degradeBackend(cause, { kind: "refused", code: "source_unavailable" }, {
      site: "reconnectOwnerProviderConnection",
      reason: "source_unavailable",
    });
  }
}

export async function revokeOwnerProviderConnection({
  data,
}: {
  data: z.infer<typeof ownerConnectionCommandSchema>;
}): Promise<OwnerProviderConnectionCommandResult> {
  try {
    return await callSourceMutation(revokeOwnerProviderConnectionMutation, {
      ...data,
      evidenceRefs: [],
    });
  } catch (cause) {
    return degradeBackend(cause, { kind: "refused", code: "source_unavailable" }, {
      site: "revokeOwnerProviderConnection",
      reason: "source_unavailable",
    });
  }
}

export async function retryOwnerProviderConnectionCleanup({
  data,
}: {
  data: z.infer<typeof retryOwnerProviderConnectionCleanupInputSchema>;
}): Promise<OwnerProviderConnectionCommandResult> {
  try {
    return await callSourceMutation(
      retryOwnerProviderConnectionCleanupMutation,
      data,
    );
  } catch (cause) {
    return degradeBackend(cause, { kind: "refused", code: "source_unavailable" }, {
      site: "retryOwnerProviderConnectionCleanup",
      reason: "source_unavailable",
    });
  }
}

export async function readOwnerProviderEarnings(): Promise<OwnerProviderEarningsReadback> {
  try {
    return await callSourceQuery(readOwnerProviderEarningsQuery, {});
  } catch (cause) {
    return degradeBackend(cause, { kind: "error", code: "source_unavailable" }, {
      site: "readOwnerProviderEarnings",
      reason: "source_unavailable",
    });
  }
}
