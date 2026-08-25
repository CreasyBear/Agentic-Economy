import { z } from "zod";

import { jsonValueSchema } from "@/modules/capability-contract/public";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import { isRecord } from "@/modules/common/is-record";
import {
  callSourceMutation,
  callSourceQuery,
  sourceMutation,
} from "@/lib/server/convex-source";
import { sourceWriteAdmissionFromContext } from "@/lib/server/source-write-admission";
import {
  SourceWriteAdmissionError,
  sourceWriteRequestFromAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from "@/modules/security/source-write-admission";
import {
  preflightOpenApiHttpDocument,
  type CapabilityPublicationImport,
  type OpenApiDocumentPreflightResult,
} from "../publication-importers";
import {
  preparePublicationDraft,
  publicationMaterialContainsCredential,
  type PreparedPublicationMaterial,
  type PreparePublicationDraftRefusal,
  type PublishPreparedCapabilityCommandResult,
} from "../publication";
import { dereferenceOpenApiSchema } from "../schema-deref";
import { ownerPublicationImport } from "./publication-import";
import { readOwnerSupplyQuery } from "./funnel-owner";
import type { OwnerSupplyOfferingReadback, OwnerSupplyFunnelReadback } from "./types";

export type OwnerSupplyPreflightResult = Readonly<
  | {
      kind: "prepared";
      prepared: PreparedPublicationMaterial;
      summary: Readonly<{
        sourceKind: string;
        sourceRevision: string;
        sourceDigest: string;
        priceDigest: string;
        preparedDigest: string;
      }>;
    }
  | {
      kind: "refused";
      reason:
        | PreparePublicationDraftRefusal
        | "catalog_offering_invalid"
        | "source_unavailable"
        | "authorization_denied";
    }
>;
export type OwnerSupplyAdmissionResult =
  | PublishPreparedCapabilityCommandResult
  | Extract<OwnerSupplyPreflightResult, { kind: "refused" }>;
export type OwnerOpenApiDocumentPreflightResult =
  | OpenApiDocumentPreflightResult
  | Readonly<{
      kind: "refused";
      reason: "authorization_denied" | "source_unavailable";
    }>;

type SourceWriteFields = Readonly<{
  sourceWrite: SourceWriteAdmission;
  sourceWriteRequest: SourceWriteAdmissionRequest;
}>;
type OwnerSupplyPreparedCommand = Readonly<{
  businessId: string;
  offeringRef: string;
  revision: number;
  sourceHash: string;
  runtimeEnvironment: "production";
  prepared: PreparedPublicationMaterial;
  operationKey: string;
  correlationId: string;
  reasonCode: string;
  evidenceRefs: readonly string[];
}>;
type OwnerSupplyPreparedInput = OwnerSupplyPreparedCommand & SourceWriteFields;

const publishMutation = sourceMutation<
  OwnerSupplyPreparedInput,
  PublishPreparedCapabilityCommandResult
>("capabilitySupply:publishPreparedCapability");

const ownerSourceSchema = z.record(z.string(), jsonValueSchema);
export const preflightOwnerCapabilityInputSchema = z.strictObject({
  businessId: z.string().min(1),
  offeringRef: z.string().min(1),
  offeringRevision: z.number().int().positive(),
  source: ownerSourceSchema,
  evidenceRefs: z.array(z.string().min(1)).max(64),
});
export const ownerOpenApiDocumentPreflightInputSchema = z.strictObject({
  businessId: z.string().min(1),
  offeringRef: z.string().min(1),
  offeringRevision: z.number().int().positive(),
  document: ownerSourceSchema,
});
export const ownerSupplyAdmissionInputSchema = z.strictObject({
  businessId: z.string().min(1),
  offeringRef: z.string().min(1),
  offeringRevision: z.number().int().positive(),
  offeringSourceHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  source: ownerSourceSchema,
  operationKey: z.string().min(8).max(200),
  correlationId: z.string().min(1).max(200),
  reasonCode: z.string().min(1).max(200),
  evidenceRefs: z.array(z.string().min(1)).max(64),
});

function ownerPublicationEndpoint(
  source: CapabilityPublicationImport,
): Readonly<{ url: string; method: "GET" | "POST" }> | undefined {
  switch (source.kind) {
    case "ae_envelope":
      return undefined;
    case "openapi_http": {
      if (
        !isRecord(source.document) ||
        !Array.isArray(source.document.servers) ||
        source.document.servers.length !== 1
      )
        return undefined;
      const server = source.document.servers[0];
      if (!isRecord(server) || typeof server.url !== "string") return undefined;
      try {
        return {
          url: new URL(
            source.operation.path.replace(/^\/+/, ""),
            server.url.endsWith("/") ? server.url : `${server.url}/`,
          ).toString(),
          method: source.operation.method.toUpperCase() as "GET" | "POST",
        };
      } catch {
        return undefined;
      }
    }
    case "mcp":
      return { url: source.serverUrl, method: "POST" };
    case "agent_plugin_mcp": {
      if (!isRecord(source.manifest) || !isRecord(source.manifest.mcpServers))
        return undefined;
      const server = source.manifest.mcpServers[source.serverName];
      if (!isRecord(server) || typeof server.url !== "string") return undefined;
      return { url: server.url, method: "POST" };
    }
    case "x402": {
      if (
        !isRecord(source.resource) ||
        typeof source.resource.resourceUrl !== "string"
      )
        return undefined;
      const method =
        source.resource.method === undefined ? "POST" : source.resource.method;
      return method === "GET" || method === "POST"
        ? { url: source.resource.resourceUrl, method }
        : undefined;
    }
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

function canonicalOwnerEndpoint(value: string): string | undefined {
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "https:" ? endpoint.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function ownerPublicationWithCatalogOrigin(
  source: CapabilityPublicationImport,
  offering: OwnerSupplyOfferingReadback,
): CapabilityPublicationImport | undefined {
  const endpoint = ownerPublicationEndpoint(source);
  const endpointUrl =
    endpoint === undefined ? undefined : canonicalOwnerEndpoint(endpoint.url);
  if (
    endpoint === undefined ||
    endpointUrl === undefined ||
    offering.sourceHash === undefined
  )
    return undefined;
  if (source.kind === "ae_envelope") return undefined;
  const path = offering.accessPaths.find(
    (candidate) =>
      candidate.status === "published" &&
      candidate.offeringSourceHash === offering.sourceHash &&
      candidate.descriptor.kind === "external_operation" &&
      canonicalOwnerEndpoint(candidate.descriptor.url) === endpointUrl &&
      candidate.descriptor.method?.trim().toUpperCase() === endpoint.method,
  );
  if (path === undefined) return undefined;
  return {
    ...source,
    commercial: {
      ...source.commercial,
      offering: {
        ...source.commercial.offering,
        origin: {
          kind: "catalog_offering",
          offeringRef: offering.offeringRef,
          offeringRevision: offering.revision,
          offeringSourceHash: offering.sourceHash,
          declaredAccessPathRef: path.accessPathRef,
          accessPathSourceHash: path.sourceHash,
        },
      },
    },
  };
}

async function prepareOwnerPublicationSource(
  data: Readonly<{
    businessId: string;
    offeringRef: string;
    offeringRevision: number;
    source: Record<string, unknown>;
    evidenceRefs: readonly string[];
  }>,
): Promise<OwnerSupplyPreflightResult> {
  try {
    if (
      new TextEncoder().encode(JSON.stringify(data.source)).byteLength > 300_000
    ) {
      return { kind: "refused", reason: "source_too_large" };
    }
  } catch {
    return { kind: "refused", reason: "source_invalid" };
  }
  const imported = ownerPublicationImport(data.source);
  if (
    imported === undefined ||
    publicationMaterialContainsCredential(imported.source)
  )
    return { kind: "refused", reason: "source_invalid" };
  const readback = await callSourceQuery(readOwnerSupplyQuery, {
    businessId: data.businessId,
  });
  if (readback.kind === "incomplete")
    return { kind: "refused", reason: "source_unavailable" };
  const offering =
    readback.kind === "available"
      ? readback.offerings.find(
          (candidate) =>
            candidate.offeringRef === data.offeringRef &&
            candidate.revision === data.offeringRevision,
        )
      : undefined;
  const sourced =
    offering === undefined
      ? undefined
      : ownerPublicationWithCatalogOrigin(imported.source, offering);
  if (sourced === undefined)
    return { kind: "refused", reason: "catalog_offering_invalid" };
  const prepared = await preparePublicationDraft({
    source: sourced,
    sourceRevision: imported.sourceRevision,
    pricingConfig: imported.pricingConfig,
    evidenceRefs: data.evidenceRefs,
    derefSchema: dereferenceOpenApiSchema,
  });
  if (prepared.kind === "refused") return prepared;
  return {
    kind: "prepared",
    prepared: prepared.prepared,
    summary: {
      sourceKind: prepared.prepared.sourceKind,
      sourceRevision: prepared.prepared.sourceRevision,
      sourceDigest: prepared.prepared.sourceDigest,
      priceDigest: prepared.prepared.priceDigest,
      preparedDigest: canonicalDigest(prepared.prepared),
    },
  };
}

export async function preflightOwnerOpenApiDocument({
  data,
}: {
  data: z.infer<typeof ownerOpenApiDocumentPreflightInputSchema>;
}): Promise<OwnerOpenApiDocumentPreflightResult> {
  let readback: OwnerSupplyFunnelReadback;
  try {
    readback = await callSourceQuery(readOwnerSupplyQuery, {
      businessId: data.businessId,
    });
  } catch {
    return { kind: "refused", reason: "source_unavailable" };
  }
  if (readback.kind === "error") {
    return {
      kind: "refused",
      reason:
        readback.code === "unauthenticated"
          ? "authorization_denied"
          : "source_unavailable",
    };
  }
  if (readback.kind === "incomplete") {
    return { kind: "refused", reason: "source_unavailable" };
  }
  if (
    readback.kind !== "available" ||
    !readback.offerings.some(
      (offering) =>
        offering.offeringRef === data.offeringRef &&
        offering.revision === data.offeringRevision,
    )
  )
    return { kind: "refused", reason: "authorization_denied" };
  try {
    return await preflightOpenApiHttpDocument(
      data.document,
      dereferenceOpenApiSchema,
    );
  } catch {
    return { kind: "refused", reason: "source_unavailable" };
  }
}

export async function preflightOwnerCapability({
  data,
}: {
  data: z.infer<typeof preflightOwnerCapabilityInputSchema>;
}): Promise<OwnerSupplyPreflightResult> {
  return await prepareOwnerPublicationSource({
    businessId: data.businessId,
    offeringRef: data.offeringRef,
    offeringRevision: data.offeringRevision,
    source: data.source,
    evidenceRefs: data.evidenceRefs,
  });
}

export async function admitOwnerCapability({
  data,
  context,
}: {
  data: z.infer<typeof ownerSupplyAdmissionInputSchema>;
  context: unknown;
}): Promise<OwnerSupplyAdmissionResult> {
  const prepared = await prepareOwnerPublicationSource({
    businessId: data.businessId,
    offeringRef: data.offeringRef,
    offeringRevision: data.offeringRevision,
    source: data.source,
    evidenceRefs: data.evidenceRefs,
  });
  if (prepared.kind === "refused") return prepared;
  const command: OwnerSupplyPreparedCommand = {
    businessId: data.businessId,
    offeringRef: data.offeringRef,
    revision: data.offeringRevision,
    sourceHash: data.offeringSourceHash,
    runtimeEnvironment: "production",
    prepared: prepared.prepared,
    operationKey: data.operationKey,
    correlationId: data.correlationId,
    reasonCode: data.reasonCode,
    evidenceRefs: data.evidenceRefs,
  };
  try {
    const sourceWrite = await sourceWriteAdmissionFromContext({
      context,
      command,
      scope: "catalog_publish",
      operationKey: command.operationKey,
      correlationId: command.correlationId,
    });
    return callSourceMutation(publishMutation, {
      ...command,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    });
  } catch (error) {
    if (error instanceof SourceWriteAdmissionError)
      return { kind: "refused", reason: "authorization_denied" };
    throw error;
  }
}
