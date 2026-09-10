import { z } from "zod";

import { canonicalDigest } from "../../src/modules/common/canonical-digest";
import { stableStringify } from "../../src/modules/common/stable-hash";
import {
  jsonValueSchema,
  type JsonValue,
} from "../../src/modules/capability-contract/public";
import { callInputSchema } from "../../src/modules/capability-execution/call-contracts";
import {
  preparePublicationDraft,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
  type PreparedPublicationMaterial,
} from "../../src/modules/capability-supply/public";
import { toolChoiceDescribeOutputSchema } from "../../src/modules/registry/tool-choice-contracts";
import {
  sourceMutation,
  sourceQuery,
  type ConvexSourceTransport,
} from "../../src/lib/server/convex-source";
import {
  sourceWriteAdmissionFromContext,
  sourceWriteRequestFromAdmission,
} from "../../src/lib/server/source-write-admission";
import {
  fixtureSchema,
  selectedOperationSchema,
  boundedRefSchema,
  digestSchema,
  operationRefSchema,
} from "./tool-gateway-production-smoke-receipt";
import {
  GatewaySmokeError,
  gatewaySmokeFailureWithCleanup,
} from "./tool-gateway-production-smoke-receipt";
import {
  parseGatewayCallResponse,
  requestJson,
  type GatewayCallTarget,
  type GatewayCallObservation,
  type GatewayHttpResponse,
  type GatewayToolQuote,
} from "./tool-gateway-production-smoke-call";

export type GatewayOwnerFixtureIdentity = Omit<
  z.infer<typeof fixtureSchema>,
  "cleanup"
> &
  Readonly<{ businessId: string; businessName: string }>;
export type GatewayOwnerFixtureCleanup = z.infer<
  typeof fixtureSchema
>["cleanup"];
export type HostedOwnerAuthority = z.infer<
  typeof selectedOperationSchema
>["ownerAuthority"];
export type HostedOwnerRuntime = Readonly<{
  createFixture: () => Promise<GatewayOwnerFixtureIdentity>;
  replayMcp: (
    tool: GatewayCallTarget,
    quote: GatewayToolQuote,
    idempotencyKey: string,
  ) => Promise<GatewayCallObservation>;
  readAuthority: (toolRef: string) => Promise<HostedOwnerAuthority>;
  readWithdrawnTool: (
    toolRef: string,
  ) => Promise<Readonly<{ kind: "refused"; code: "operation_withdrawn" }>>;
  preflightCredential: () => Promise<void>;
  revokeCredential: (
    toolRef: string | undefined,
    input: Readonly<Record<string, JsonValue>>,
  ) => Promise<
    Readonly<{
      kind: "refused";
      code: "authentication_required";
      credentialDigest: string;
    }>
  >;
  withdraw: (
    toolRef: string,
  ) => Promise<Readonly<{ kind: "refused"; code: "operation_withdrawn" }>>;
  retireOffering: () => Promise<GatewayOwnerFixtureCleanup>;
}>;

function mcpRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}

export function parseGatewayMcpCallResponse(
  response: GatewayHttpResponse,
  expectedToolRef?: string,
): GatewayCallObservation {
  const envelope = mcpRecord(response.body);
  if (envelope?.error !== undefined)
    return {
      kind: "unknown",
      code: "mcp_rpc_error",
      status: response.status,
      retryable: response.status >= 500,
    };
  const result = mcpRecord(envelope?.result);
  if (result?.isError === true) {
    const failure = mcpRecord(result.structuredContent);
    return {
      kind: "unknown",
      code:
        typeof failure?.code === "string" ? failure.code : "mcp_tool_error",
      status: response.status,
      retryable: failure?.retryable === true || response.status >= 500,
    };
  }
  if (response.status < 200 || response.status >= 300)
    return {
      kind: "unknown",
      code: "http_error",
      status: response.status,
      retryable: response.status >= 500,
    };
  const structuredContent = mcpRecord(result?.structuredContent);
  if (
    structuredContent === undefined ||
    !("result" in structuredContent)
  )
    return {
      kind: "unknown",
      code: "malformed_mcp_result",
      status: response.status,
      retryable: false,
    };
  return parseGatewayCallResponse(
    { status: response.status, body: structuredContent.result },
    expectedToolRef,
  );
}

function jsonObjectValue(
  value: JsonValue | undefined,
): Readonly<Record<string, JsonValue>> | undefined {
  if (value === undefined) return undefined;
  const parsed = z.record(z.string(), jsonValueSchema).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

type OwnerFixtureIds = Readonly<{
  capabilityOfferingId: string;
  bindingId: string;
  capabilityId: string;
  sourceRevision: string;
  evidenceRef: string;
}>;

function ownerFixtureIds(runId: string): OwnerFixtureIds {
  const suffix = canonicalDigest({
    format: "ae-release-smoke-owner-fixture:v1",
    runId,
  }).slice("sha256:".length);
  return {
    capabilityOfferingId: `capability:ae-release-smoke:${suffix}`,
    bindingId: `binding:ae-release-smoke:${suffix}`,
    capabilityId: `release-smoke.${suffix.slice(0, 48)}`,
    sourceRevision: `ae-release-smoke:${runId}:source:${suffix.slice(0, 16)}`,
    evidenceRef: `ae-release-smoke:${runId}:owner-source`,
  };
}

const OWNER_OPENAPI_OPERATION_ID_PLACEHOLDER =
  "__AE_RELEASE_SMOKE_OPERATION_ID__";
const OWNER_OPENAPI_OPERATION_METHODS: Record<string, true> = {
  get: true,
  post: true,
  put: true,
  patch: true,
  delete: true,
  options: true,
  head: true,
  trace: true,
};

function ownerOpenApiDocumentForRun(
  document: Readonly<Record<string, JsonValue>>,
  path: string,
  method: "get" | "post",
  runId: string,
): Readonly<Record<string, JsonValue>> {
  const paths = jsonObjectValue(document.paths);
  if (paths === undefined)
    throw new GatewaySmokeError("gateway_smoke_owner_openapi_paths_missing");
  let operationCount = 0;
  let selectedOperation: Readonly<Record<string, JsonValue>> | undefined;
  for (const [candidatePath, value] of Object.entries(paths)) {
    const pathItem = jsonObjectValue(value);
    if (pathItem === undefined) continue;
    for (const candidateMethod of Object.keys(
      OWNER_OPENAPI_OPERATION_METHODS,
    )) {
      if (!(candidateMethod in pathItem)) continue;
      operationCount += 1;
      if (candidatePath === path && candidateMethod === method)
        selectedOperation = jsonObjectValue(pathItem[candidateMethod]);
    }
  }
  if (
    operationCount !== 1 ||
    selectedOperation === undefined ||
    selectedOperation.operationId !== OWNER_OPENAPI_OPERATION_ID_PLACEHOLDER
  ) {
    throw new GatewaySmokeError(
      "gateway_smoke_owner_openapi_operation_not_exact",
    );
  }
  const selectedPathItem = jsonObjectValue(paths[path]);
  if (selectedPathItem === undefined)
    throw new GatewaySmokeError(
      "gateway_smoke_owner_openapi_operation_not_exact",
    );
  const parsed = jsonValueSchema.safeParse({
    ...document,
    paths: {
      ...paths,
      [path]: {
        ...selectedPathItem,
        [method]: {
          ...selectedOperation,
          operationId: `ae-release-smoke:${runId}`,
        },
      },
    },
  });
  if (!parsed.success)
    throw new GatewaySmokeError("gateway_smoke_owner_openapi_document_invalid");
  const object = z.record(z.string(), jsonValueSchema).safeParse(parsed.data);
  if (!object.success)
    throw new GatewaySmokeError("gateway_smoke_owner_openapi_document_invalid");
  return object.data;
}

function ownerSourceForRun(
  options: Readonly<{
    runId: string;
    ownerQuery: string;
    ownerOpenApiDocument: Readonly<Record<string, JsonValue>>;
    ownerOpenApiPath: string;
    ownerOpenApiMethod: "get" | "post";
    origin?: Readonly<{
      kind: "catalog_offering";
      offeringRef: string;
      offeringRevision: number;
      offeringSourceHash: string;
    }>;
  }>,
): Readonly<{
  ids: OwnerFixtureIds;
  source: Extract<CapabilityPublicationImport, { kind: "openapi_http" }>;
  pricingConfig: Readonly<{
    version: "pricing:v3";
    kind: "fixed_aud";
    currency: "AUD";
    exponent: 6;
    amountUnits: string;
  }>;
}> {
  const ownerOpenApiDocument = ownerOpenApiDocumentForRun(
    options.ownerOpenApiDocument,
    options.ownerOpenApiPath,
    options.ownerOpenApiMethod,
    options.runId,
  );
  const ids = ownerFixtureIds(options.runId);
  const offering: CapabilityPublicationOfferingDraft = {
    offeringId: ids.capabilityOfferingId,
    networkId: "ae:public",
    origin: options.origin ?? { kind: "standalone" },
    presentation: {
      label: options.runId,
      summary: `Run-scoped release smoke operation ${options.runId}`,
      price: {
        kind: "fixed",
        amount: { currency: "AUD", units: "0", exponent: 6 },
      },
      materialTerms: [],
      commercialRelationship: {
        kind: "none",
        summary: "No commercial influence.",
        influencesEligibility: false,
        influencesInclusion: false,
        influencesOrder: false,
        evidenceRefs: [ids.evidenceRef],
      },
    },
    searchTerms: [
      "owner",
      "release",
      "smoke",
      options.ownerQuery,
      ids.capabilityId,
    ],
    registrationEvidenceRefs: [ids.evidenceRef],
  };
  const source: Extract<CapabilityPublicationImport, { kind: "openapi_http" }> =
    {
      kind: "openapi_http",
      document: ownerOpenApiDocument,
      operation: {
        path: options.ownerOpenApiPath,
        method: options.ownerOpenApiMethod,
      },
      fixedQuery: [],
      contract: {
        capabilityId: ids.capabilityId,
        version: 1,
        name: options.runId,
        description: `Disposable release smoke owner operation ${options.runId}.`,
        customerAnnotations: [
          {
            annotationId: "input",
            document: "input",
            pointer: "",
            label: "Request input",
            role: "request",
          },
          {
            annotationId: "output",
            document: "output",
            pointer: "",
            label: "Tool result",
            role: "completion_evidence",
          },
        ],
        dataUse: [
          {
            effectId: "release-smoke-owner",
            inputPointer: "/",
            classification: "public",
            phase: "execution",
            recipient: { kind: "selected_binding" },
            purposes: ["release_smoke"],
          },
        ],
        effects: [
          {
            effectId: "release-smoke-owner",
            class: "data_release",
            authority: "explicit",
            reversibility: "irreversible",
          },
        ],
        evidence: [
          { evidenceId: "output", outputPointer: "", purpose: "completion" },
        ],
        lifecycle: { idempotency: "required", recovery: "retry_safe" },
      },
      commercial: {
        offering,
        bindingId: ids.bindingId,
        authority: { kind: "public_upstream" },
        registrationEvidenceRefs: [ids.evidenceRef],
        requestTimeoutMs: 5_000,
      },
      evidenceRefs: [ids.evidenceRef],
    };
  return {
    ids,
    source,
    pricingConfig: {
      version: "pricing:v3",
      kind: "fixed_aud",
      currency: "AUD",
      exponent: 6,
      amountUnits: "0",
    },
  };
}

async function prepareOwnerPublicationMaterial(
  options: Readonly<{
    source: CapabilityPublicationImport;
    sourceRevision: string;
    evidenceRefs: readonly string[];
  }>,
): Promise<PreparedPublicationMaterial> {
  const offering =
    options.source.kind === "ae_envelope"
      ? options.source.offering
      : options.source.commercial.offering;
  // `presentation.price` is optional and being retired (Well 4, decision
  // D7); this owner fixture always sets a fixed-price presentation, so an
  // undefined price is itself invalid.
  const price = offering.presentation.price;
  if (
    price === undefined ||
    price.kind !== "fixed" ||
    price.amount.currency !== "AUD" ||
    price.amount.exponent !== 6
  )
    throw new GatewaySmokeError("gateway_smoke_owner_source_price_invalid");
  const prepared = await preparePublicationDraft({
    source: options.source,
    sourceRevision: options.sourceRevision,
    pricingConfig: {
      version: "pricing:v3",
      kind: "fixed_aud",
      currency: "AUD",
      exponent: 6,
      amountUnits: price.amount.units,
    },
    evidenceRefs: options.evidenceRefs,
  });
  if (prepared.kind === "refused")
    throw new GatewaySmokeError(
      `gateway_smoke_owner_publication_prepare_${prepared.reason}`,
    );
  return prepared.prepared;
}

export function createHostedOwnerRuntime(
  options: Readonly<{
    env: Record<string, string | undefined>;
    baseUrl: string;
    apiKey: string;
    fetch: typeof globalThis.fetch;
    input: Readonly<Record<string, JsonValue>>;
    ownerQuery: string;
    ownerOpenApiDocument: Readonly<Record<string, JsonValue>>;
    ownerOpenApiPath: string;
    ownerOpenApiMethod: "get" | "post";
    runId: string;
    controlBusinessId: string;
    transport: () => Promise<ConvexSourceTransport>;
    context: unknown;
    preflightCredential: () => Promise<void>;
    revokeCredential: HostedOwnerRuntime["revokeCredential"];
  }>,
): HostedOwnerRuntime {
  const { context, transport } = options;
  const controlBusinessId = options.controlBusinessId;
  const currentOwnerCatalogQuery = sourceQuery<Record<string, never>, unknown>(
    "catalog:getCurrentOwnerPublicCatalog",
  );
  const saveIntegrationDraftMutation = sourceMutation<
    Record<string, unknown>,
    unknown
  >("capabilitySupplyOwnerFunnel:saveOwnerSupplyIntegrationDraft");

  const withdrawMutation = sourceMutation<Record<string, unknown>, unknown>(
    "capabilitySupplyOwnerFunnel:withdrawOwnerCapability",
  );
  const publishMutation = sourceMutation<Record<string, unknown>, unknown>(
    "capabilitySupply:publishPreparedCapability",
  );
  const ownerSupplyQuery = sourceQuery<Record<string, unknown>, unknown>(
    "capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel",
  );
  const record = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value))
      : undefined;
  const ownerSupplyReadback = async (
    businessId: string,
  ): Promise<
    Readonly<Record<string, unknown> & { offerings: readonly unknown[] }>
  > => {
    const result = record(
      await (await transport()).query(ownerSupplyQuery, { businessId }),
    );
    const offerings = result?.offerings;
    if (
      result?.kind !== "available" ||
      result.businessId !== businessId ||
      !Array.isArray(offerings)
    )
      throw new GatewaySmokeError("gateway_smoke_owner_supply_unavailable");
    return { ...result, offerings };
  };
  let fixture: GatewayOwnerFixtureIdentity | undefined;
  let partialOffering:
    | Readonly<{
        businessId: string;
        offeringRef: string;
        offeringRevision: number;
        offeringSourceHash?: string;
      }>
    | undefined;
  let publicationMayExist = false;
  const verifyPartialDraftIsNotRouteable =
    async (): Promise<GatewayOwnerFixtureCleanup> => {
      const current = partialOffering;
      if (current === undefined)
        throw new GatewaySmokeError(
          "gateway_smoke_owner_partial_offering_missing",
        );
      const before = await ownerSupplyReadback(current.businessId);
      const beforeOfferings = before.offerings
        .map(record)
        .filter((candidate) => candidate?.offeringRef === current.offeringRef);
      if (
        beforeOfferings.length !== 1 ||
        beforeOfferings[0]?.name !== options.runId ||
        typeof beforeOfferings[0].revision !== "number" ||
        !Number.isSafeInteger(beforeOfferings[0].revision) ||
        beforeOfferings[0].revision < 1 ||
        (current.offeringSourceHash !== undefined &&
          beforeOfferings[0].sourceHash !== current.offeringSourceHash)
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_partial_offering_identity_changed",
        );
      if (beforeOfferings[0]?.publication !== undefined)
        throw new GatewaySmokeError(
          "gateway_smoke_owner_partial_draft_became_routeable",
        );
      partialOffering = undefined;
      return { publicationState: "not_created", supplierState: "Draft" };
    };
  const createFixture = async (): Promise<GatewayOwnerFixtureIdentity> => {
    if (fixture !== undefined)
      throw new GatewaySmokeError(
        "gateway_smoke_owner_fixture_already_created",
      );
    try {
      const material = ownerSourceForRun({
        runId: options.runId,
        ownerQuery: options.ownerQuery,
        ownerOpenApiDocument: options.ownerOpenApiDocument,
        ownerOpenApiPath: options.ownerOpenApiPath,
        ownerOpenApiMethod: options.ownerOpenApiMethod,
      });
      const currentCatalog = record(
        await (await transport()).query(currentOwnerCatalogQuery, {}),
      );
      const currentBusiness = record(currentCatalog?.catalog);
      if (
        currentCatalog?.kind !== "available" ||
        currentBusiness === undefined ||
        typeof currentBusiness.businessId !== "string" ||
        typeof currentBusiness.name !== "string"
      ) {
        throw new GatewaySmokeError("gateway_smoke_owner_business_required");
      }
      const businessId = boundedRefSchema.parse(currentBusiness.businessId);
      const businessName = boundedRefSchema.parse(currentBusiness.name);
      if (businessId === controlBusinessId)
        throw new GatewaySmokeError(
          "gateway_smoke_owner_control_business_identity_collision",
        );
      const sourceDescriptor = {
        kind: "openapi" as const,
        definitionUrl: new URL(
          "/.well-known/ae-release-smoke-openapi.json",
          options.baseUrl,
        ).toString(),
        environment: "production" as const,
      };
      const sourceSelector = {
        serverUrl: options.baseUrl,
        path: options.ownerOpenApiPath,
        method: options.ownerOpenApiMethod,
      };
      const sourceDigest = canonicalDigest(
        ownerOpenApiDocumentForRun(
          options.ownerOpenApiDocument,
          options.ownerOpenApiPath,
          options.ownerOpenApiMethod,
          options.runId,
        ),
      );
      const candidateRef = canonicalDigest({
        sourceDigest,
        selector: sourceSelector,
      });
      const saveDraftOperationKey = `ae-release-smoke:${options.runId}:source-selection`;
      const saveDraftCommand = {
        businessId,
        title: options.runId,
        description: `Run-scoped release smoke Tool ${options.runId}.`,
        category: "release-smoke",
        sourceKind: "openapi" as const,
        sourceDescriptorJson: stableStringify(sourceDescriptor),
        sourceDigest,
        sourceRevision: `openapi:${sourceDigest}`,
        candidateRef,
        sourceSelectorJson: stableStringify(sourceSelector),
        operationKey: saveDraftOperationKey,
        correlationId: saveDraftOperationKey,
      };
      const saveDraftSourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command: saveDraftCommand,
        scope: "catalog_publish",
        operationKey: saveDraftOperationKey,
        correlationId: saveDraftOperationKey,
        env: options.env,
      });
      const savedDraft = record(
        await (
          await transport()
        ).mutation(saveIntegrationDraftMutation, {
          ...saveDraftCommand,
          sourceWriteRequest:
            sourceWriteRequestFromAdmission(saveDraftSourceWrite),
          sourceWrite: saveDraftSourceWrite,
        }),
      );
      if (
        (savedDraft?.kind !== "saved" && savedDraft?.kind !== "replayed") ||
        typeof savedDraft.offeringRef !== "string"
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_source_selection_refused",
        );
      const offeringRef = boundedRefSchema.parse(savedDraft.offeringRef);
      partialOffering = { businessId, offeringRef, offeringRevision: 1 };
      const afterCatalog = await ownerSupplyReadback(businessId);
      const offerings = afterCatalog.offerings
        .map(record)
        .filter(
          (candidate) =>
            candidate?.offeringRef === offeringRef &&
            candidate.name === options.runId &&
            candidate.status === "draft",
        );
      if (
        offerings.length !== 1 ||
        offerings[0] === undefined ||
        typeof offerings[0].revision !== "number" ||
        !Number.isSafeInteger(offerings[0].revision) ||
        offerings[0].revision < 1 ||
        typeof offerings[0].sourceHash !== "string" ||
        !digestSchema.safeParse(offerings[0].sourceHash).success
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_catalog_readback_invalid",
        );
      const offeringRevision = z
        .number()
        .int()
        .positive()
        .parse(offerings[0].revision);
      const offeringSourceHash = digestSchema.parse(offerings[0].sourceHash);
      partialOffering = {
        businessId,
        offeringRef,
        offeringRevision,
        offeringSourceHash,
      };
      const durableMaterial = ownerSourceForRun({
        runId: options.runId,
        ownerQuery: options.ownerQuery,
        ownerOpenApiDocument: options.ownerOpenApiDocument,
        ownerOpenApiPath: options.ownerOpenApiPath,
        ownerOpenApiMethod: options.ownerOpenApiMethod,
        origin: {
          kind: "catalog_offering",
          offeringRef,
          offeringRevision,
          offeringSourceHash,
        },
      });
      const prepared = await prepareOwnerPublicationMaterial({
        source: durableMaterial.source,
        sourceRevision: durableMaterial.ids.sourceRevision,
        evidenceRefs: [durableMaterial.ids.evidenceRef],
      });
      const publicationOperationKey = `ae-release-smoke:${options.runId}:publication`;
      const publicationCommand = {
        businessId,
        offeringRef,
        revision: offeringRevision,
        sourceHash: offeringSourceHash,
        runtimeEnvironment: "production" as const,
        prepared,
        operationKey: publicationOperationKey,
        correlationId: publicationOperationKey,
        reasonCode: "release_smoke_create",
        evidenceRefs: [material.ids.evidenceRef],
      };
      const publicationSourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command: publicationCommand,
        scope: "catalog_publish",
        operationKey: publicationOperationKey,
        correlationId: publicationOperationKey,
        env: options.env,
      });
      publicationMayExist = true;
      const published = record(
        await (
          await transport()
        ).mutation(publishMutation, {
          ...publicationCommand,
          sourceWriteRequest: sourceWriteRequestFromAdmission(
            publicationSourceWrite,
          ),
          sourceWrite: publicationSourceWrite,
        }),
      );
      if (
        published !== undefined &&
        published.kind !== "published" &&
        published.kind !== "replayed"
      )
        publicationMayExist = false;
      if (
        published === undefined ||
        (published.kind !== "published" && published.kind !== "replayed") ||
        typeof published.publicationRef !== "string" ||
        typeof published.publicationRevision !== "number" ||
        typeof published.toolRef !== "string" ||
        !operationRefSchema.safeParse(published.toolRef).success
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_publication_create_refused",
        );
      const publicationRef = boundedRefSchema.parse(published.publicationRef);
      const publicationRevision = z
        .number()
        .int()
        .positive()
        .parse(published.publicationRevision);
      const toolRef = operationRefSchema.parse(published.toolRef);
      const createdFixture: GatewayOwnerFixtureIdentity = {
        businessId,
        businessName,
        offeringRef,
        offeringRevision,
        offeringSourceHash,
        publicationRef,
        publicationRevision,
        operationRef: toolRef,
      };
      fixture = createdFixture;
      partialOffering = undefined;
      publicationMayExist = false;
      if (
        published.offeringId !== material.ids.capabilityOfferingId ||
        published.bindingId !== material.ids.bindingId ||
        published.sourceDigest !== prepared.sourceDigest
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_publication_create_refused",
        );
      return createdFixture;
    } catch (error) {
      const cleanupFailures: unknown[] = [];
      if (
        fixture === undefined &&
        publicationMayExist &&
        partialOffering !== undefined
      ) {
        try {
          const current = partialOffering;
          const readback = await ownerSupplyReadback(current.businessId);
          const candidates = readback.offerings
            .map(record)
            .filter(
              (candidate) =>
                candidate?.offeringRef === current.offeringRef &&
                candidate.name === options.runId,
            );
          const candidate = candidates.length === 1 ? candidates[0] : undefined;
          const publication = record(candidate?.publication);
          if (
            candidate === undefined ||
            typeof candidate.revision !== "number" ||
            typeof candidate.sourceHash !== "string" ||
            typeof publication?.publicationRef !== "string" ||
            typeof publication.publicationRevision !== "number" ||
            typeof publication.toolRef !== "string"
          )
            throw new GatewaySmokeError(
              "gateway_smoke_owner_publication_cleanup_identity_unavailable",
            );
          fixture = {
            businessId: current.businessId,
            businessName: boundedRefSchema.parse(
              record(readback.business)?.name,
            ),
            offeringRef: current.offeringRef,
            offeringRevision: z
              .number()
              .int()
              .positive()
              .parse(candidate.revision),
            offeringSourceHash: digestSchema.parse(candidate.sourceHash),
            publicationRef: boundedRefSchema.parse(publication.publicationRef),
            publicationRevision: z
              .number()
              .int()
              .positive()
              .parse(publication.publicationRevision),
            operationRef: operationRefSchema.parse(publication.toolRef),
          };
          partialOffering = undefined;
          publicationMayExist = false;
        } catch {
          cleanupFailures.push(
            new GatewaySmokeError(
              "gateway_smoke_owner_publication_cleanup_identity_unavailable",
            ),
          );
        }
      }
      if (fixture !== undefined) {
        try {
          await withdraw(fixture.operationRef);
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
        try {
          await readWithdrawnTool(fixture.operationRef);
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
        try {
          await retireOffering();
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
      } else if (partialOffering !== undefined) {
        try {
          await verifyPartialDraftIsNotRouteable();
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
      }
      if (cleanupFailures.length > 0)
        throw gatewaySmokeFailureWithCleanup(error, cleanupFailures);
      fixture = undefined;
      partialOffering = undefined;
      throw error;
    }
  };
  const readAuthority = async (
    toolRef: string,
  ): Promise<HostedOwnerAuthority> => {
    const currentFixture = fixture;
    if (
      currentFixture === undefined ||
      currentFixture.operationRef !== toolRef
    )
      throw new GatewaySmokeError("gateway_smoke_owner_authority_unavailable");
    const result = await ownerSupplyReadback(currentFixture.businessId);
    const business = record(result.business);
    if (business?.name !== currentFixture.businessName)
      throw new GatewaySmokeError("gateway_smoke_owner_authority_unavailable");
    const candidates = result.offerings
      .map(record)
      .filter(
        (offering) => offering?.offeringRef === currentFixture.offeringRef,
      );
    if (candidates.length !== 1)
      throw new GatewaySmokeError("gateway_smoke_owner_authority_ambiguous");
    const offering = candidates[0];
    const publication = record(offering?.publication);
    if (
      offering?.name !== options.runId ||
      offering.revision !== currentFixture.offeringRevision ||
      offering.sourceHash !== currentFixture.offeringSourceHash ||
      publication?.publicationRef !== currentFixture.publicationRef ||
      publication.publicationRevision !== currentFixture.publicationRevision ||
      publication.toolRef !== currentFixture.operationRef ||
      publication.state !== "current"
    )
      throw new GatewaySmokeError("gateway_smoke_owner_authority_unavailable");
    const source = record(publication.source);
    const contractRef = record(publication.contractRef);
    const binding = record(publication.binding);
    if (record(binding?.authority)?.kind !== "public_upstream")
      throw new GatewaySmokeError("gateway_smoke_owner_authority_malformed");
    const parsed = z
      .strictObject({
        businessName: boundedRefSchema,
        offeringName: boundedRefSchema,
        publicationRef: boundedRefSchema,
        sourceDigest: digestSchema,
        contractDigest: digestSchema,
        bindingId: boundedRefSchema,
        bindingDigest: digestSchema,
        offeringRevision: z.number().int().positive(),
        offeringSourceHash: digestSchema,
        publicationRevision: z.number().int().positive(),
      })
      .safeParse({
        businessName: business.name,
        offeringName: offering.name,
        publicationRef: publication.publicationRef,
        sourceDigest: source?.digest,
        contractDigest: contractRef?.contractDigest,
        bindingId: binding?.bindingId,
        bindingDigest: binding?.bindingDigest,
        offeringRevision: offering.revision,
        offeringSourceHash: offering.sourceHash,
        publicationRevision: publication.publicationRevision,
      });
    if (!parsed.success)
      throw new GatewaySmokeError("gateway_smoke_owner_authority_malformed");
    return parsed.data;
  };
  const withdraw = async (
    toolRef: string,
  ): Promise<Readonly<{ kind: "refused"; code: "operation_withdrawn" }>> => {
    const currentFixture = fixture;
    if (
      currentFixture === undefined ||
      currentFixture.operationRef !== toolRef
    ) {
      throw new GatewaySmokeError(
        "gateway_smoke_owner_withdraw_identity_missing",
      );
    }
    const authority = await readAuthority(toolRef);
    if (
      authority.publicationRef !== currentFixture.publicationRef ||
      authority.publicationRevision !== currentFixture.publicationRevision ||
      authority.offeringRevision !== currentFixture.offeringRevision ||
      authority.offeringSourceHash !== currentFixture.offeringSourceHash
    )
      throw new GatewaySmokeError(
        "gateway_smoke_owner_withdraw_identity_changed",
      );
    const operationKey = `ae-release-smoke:${options.runId}:withdraw:${currentFixture.publicationRevision}`;
    const command = {
      businessId: currentFixture.businessId,
      offeringRef: currentFixture.offeringRef,
      offeringRevision: currentFixture.offeringRevision,
      offeringSourceHash: currentFixture.offeringSourceHash,
      publicationRef: currentFixture.publicationRef,
      publicationRevision: currentFixture.publicationRevision,
      operationKey,
      correlationId: operationKey,
      reasonCode: "release_smoke_withdraw",
      evidenceRefs: [`ae-release-smoke:${options.runId}:owner-source`],
    };
    const sourceWrite = await sourceWriteAdmissionFromContext({
      context,
      command,
      scope: "catalog_publish",
      operationKey,
      correlationId: operationKey,
      env: options.env,
    });
    const result = record(
      await (
        await transport()
      ).mutation(withdrawMutation, {
        ...command,
        sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
        sourceWrite,
      }),
    );
    if (result?.kind !== "withdrawn")
      throw new GatewaySmokeError("gateway_smoke_owner_withdraw_refused");
    return { kind: "refused", code: "operation_withdrawn" };
  };

  const retireOffering = async (): Promise<GatewayOwnerFixtureCleanup> => {
    const currentFixture = fixture;
    if (currentFixture === undefined)
      throw new GatewaySmokeError("gateway_smoke_owner_fixture_missing");
    const before = await ownerSupplyReadback(currentFixture.businessId);
    const beforeOffering = before.offerings
      .map(record)
      .find(
        (candidate) => candidate?.offeringRef === currentFixture.offeringRef,
      );
    const beforePublication = record(beforeOffering?.publication);
    if (
      beforeOffering === undefined ||
      beforePublication === undefined ||
      beforeOffering.name !== options.runId ||
      beforeOffering.revision !== currentFixture.offeringRevision ||
      beforeOffering.sourceHash !== currentFixture.offeringSourceHash ||
      beforePublication.publicationRef !== currentFixture.publicationRef ||
      beforePublication.state !== "withdrawn"
    )
      throw new GatewaySmokeError(
        "gateway_smoke_owner_cleanup_identity_changed",
      );
    const after = await ownerSupplyReadback(currentFixture.businessId);
    const afterOffering = after.offerings
      .map(record)
      .find(
        (candidate) => candidate?.offeringRef === currentFixture.offeringRef,
      );
    const afterPublication = record(afterOffering?.publication);
    if (
      afterOffering === undefined ||
      afterPublication === undefined ||
      afterOffering.status !== "draft" ||
      afterOffering.sourceHash !== currentFixture.offeringSourceHash ||
      afterPublication.publicationRef !== currentFixture.publicationRef ||
      afterPublication.state !== "withdrawn"
    )
      throw new GatewaySmokeError(
        "gateway_smoke_owner_cleanup_readback_invalid",
      );
    fixture = undefined;
    return { publicationState: "withdrawn", supplierState: "Paused" };
  };

  const readWithdrawnTool = async (
    toolRef: string,
  ): Promise<Readonly<{ kind: "refused"; code: "operation_withdrawn" }>> => {
    const response = await requestJson(
      options.fetch,
      `${options.baseUrl}/api/v1/market-tools/describe`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ toolRef }),
      },
      "",
    );
    const detail = toolChoiceDescribeOutputSchema.safeParse(response.body);
    if (
      response.status === 200 &&
      detail.success &&
      detail.data.kind === "unavailable" &&
      detail.data.toolRef === toolRef &&
      detail.data.reason === "publisher_withdrew"
    )
      return { kind: "refused", code: "operation_withdrawn" };
    throw new GatewaySmokeError(
      "gateway_smoke_withdrawn_tool_not_source_attributed",
    );
  };

  const owner: HostedOwnerRuntime = {
    createFixture,
    replayMcp: async (tool, quote, idempotencyKey) => {
      if (quote.toolRef !== tool.toolRef)
        throw new GatewaySmokeError("gateway_smoke_mcp_quote_tool_mismatch");
      const input = callInputSchema.safeParse({
        quoteRef: quote.quoteRef,
        idempotencyKey,
      });
      if (!input.success)
        throw new GatewaySmokeError("gateway_smoke_call_input_invalid");
      const response = await requestJson(
        options.fetch,
        `${options.baseUrl}/mcp`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: idempotencyKey,
            method: "tools/call",
            params: {
              name: "ae_tool_call",
              arguments: input.data,
            },
          }),
        },
        options.apiKey,
      );
      return parseGatewayMcpCallResponse(response, tool.toolRef);
    },
    readAuthority,
    readWithdrawnTool,
    preflightCredential: options.preflightCredential,
    revokeCredential: options.revokeCredential,
    withdraw,
    retireOffering,
  };
  return owner;
}
