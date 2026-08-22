import { z } from "zod";

import { canonicalDigest } from "../../src/modules/common/canonical-digest";
import {
  jsonValueSchema,
  type JsonValue,
} from "../../src/modules/capability-contract/public";
import {
  operationDetailOutputSchema,
  preparePublicationDraft,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
  type PreparedPublicationMaterial,
  type PublicOperationDescriptor,
} from "../../src/modules/capability-supply/public";
import {
  sourceAction,
  sourceMutation,
  sourceQuery,
  type ConvexSourceTransport,
} from "../../src/lib/server/convex-source";
import {
  sourceWriteAdmissionFromContext,
  sourceWriteRequestFromAdmission,
} from "../../src/lib/server/source-write-admission";
import type { ExactAmount } from "../../src/modules/money/public";
import {
  fixtureSchema,
  selectedOperationSchema,
  boundedRefSchema,
  digestSchema,
  operationRefSchema,
} from "./operation-gateway-production-smoke-receipt";
import {
  GatewaySmokeError,
  gatewaySmokeFailureWithCleanup,
} from "./operation-gateway-production-smoke-receipt";
import {
  parseGatewayInvocationResponse,
  requestJson,
  type GatewayInvocationObservation,
} from "./operation-gateway-production-smoke-invocation";
import type { StrictCreditActivityView } from "./operation-gateway-production-smoke-money";

export type GatewayOwnerFixtureIdentity = Omit<
  z.infer<typeof fixtureSchema>,
  "cleanup"
> &
  Readonly<{ businessId: string; businessName: string }>;
export type GatewayOwnerFixtureCleanup = z.infer<typeof fixtureSchema>["cleanup"];
export type HostedOwnerAuthority = z.infer<
  typeof selectedOperationSchema
>["ownerAuthority"];
export type HostedOwnerRuntime = Readonly<{
  createFixture: () => Promise<GatewayOwnerFixtureIdentity>;
  replayMcp: (
    operation: PublicOperationDescriptor,
    idempotencyKey: string,
  ) => Promise<GatewayInvocationObservation>;
  readActivity: (invocationRef: string) => Promise<StrictCreditActivityView>;
  readAuthority: (operationRef: string) => Promise<HostedOwnerAuthority>;
  withdraw: (
    operationRef: string,
  ) => Promise<Readonly<{ kind: "refused"; code: "operation_withdrawn" }>>;
  retireOffering: () => Promise<GatewayOwnerFixtureCleanup>;
}>;

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

export function ownerSourceForRun(
  options: Readonly<{
    runId: string;
    ownerQuery: string;
    ownerOpenApiDocument: Readonly<Record<string, JsonValue>>;
    ownerOpenApiPath: string;
    ownerOpenApiMethod: "get" | "post";
    input: Readonly<Record<string, JsonValue>>;
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
    version: "pricing:v2";
    unit: "call";
    paidAmount: ExactAmount;
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
        amount: { currency: "USD", units: "0", exponent: 2 },
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
            label: "Operation result",
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
        authority: { kind: "keyless" },
        registrationEvidenceRefs: [ids.evidenceRef],
        requestTimeoutMs: 5_000,
      },
      evidenceRefs: [ids.evidenceRef],
    };
  return {
    ids,
    source,
    pricingConfig: {
      version: "pricing:v2",
      unit: "call",
      paidAmount: { currency: "USD", units: "0", exponent: 2 },
    },
  };
}

export async function prepareOwnerPublicationMaterial(
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
  if (offering.presentation.price.kind !== "fixed")
    throw new GatewaySmokeError("gateway_smoke_owner_source_price_invalid");
  const prepared = await preparePublicationDraft({
    source: options.source,
    sourceRevision: options.sourceRevision,
    pricingConfig: {
      version: "pricing:v2",
      unit: "call",
      paidAmount: offering.presentation.price.amount,
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
    readActivity: (
      invocationRef: string,
    ) => Promise<StrictCreditActivityView>;
  }>,
): Readonly<{
  owner: HostedOwnerRuntime;
  readWithdrawnOperation: (
    operationRef: string,
  ) => Promise<Readonly<{ kind: "refused"; code: "operation_withdrawn" }>>;
}> {
  const { context, transport } = options;
  const controlBusinessId = options.controlBusinessId;
  const currentOwnerCatalogQuery = sourceQuery<Record<string, never>, unknown>(
    "catalog:getCurrentOwnerPublicCatalog",
  );
  const createOfferingMutation = sourceMutation<Record<string, unknown>, unknown>(
    "catalog:createBusinessOffering",
  );

  const withdrawMutation = sourceMutation<Record<string, unknown>, unknown>(
    "capabilitySupplyOwnerFunnel:withdrawOwnerCapability",
  );
  const retireOfferingMutation = sourceMutation<
    Record<string, unknown>,
    unknown
  >("catalog:changeBusinessOfferingStatus");
  const publishMutation = sourceMutation<Record<string, unknown>, unknown>(
    "capabilitySupply:publishPreparedCapability",
  );
  const readinessAction = sourceAction<Record<string, unknown>, unknown>(
    "capabilitySupplyOwnerSupply:runOwnerSupplyReadiness",
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
  const retirePartialOffering =
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
      const offeringRevision = z
        .number()
        .int()
        .positive()
        .parse(beforeOfferings[0].revision);
      const beforeOffering = beforeOfferings[0];
      if (beforeOffering.status !== "retired") {
        const operationKey = `ae-release-smoke:${options.runId}:retire-partial:${offeringRevision}`;
        const command = {
          businessId: current.businessId,
          offeringRef: current.offeringRef,
          expectedRevision: offeringRevision,
          status: "retired" as const,
          operationKey,
          correlationId: operationKey,
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
          ).mutation(retireOfferingMutation, {
            ...command,
            sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
            sourceWrite,
          }),
        );
        if (result?.kind !== "ok")
          throw new GatewaySmokeError(
            "gateway_smoke_owner_partial_offering_retire_refused",
          );
      }
      const after = await ownerSupplyReadback(current.businessId);
      const afterOfferings = after.offerings
        .map(record)
        .filter((candidate) => candidate?.offeringRef === current.offeringRef);
      if (
        afterOfferings.length !== 1 ||
        afterOfferings[0]?.name !== options.runId ||
        afterOfferings[0].status !== "retired" ||
        afterOfferings[0].revision !== offeringRevision ||
        (current.offeringSourceHash !== undefined &&
          afterOfferings[0].sourceHash !== current.offeringSourceHash)
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_partial_cleanup_readback_invalid",
        );
      partialOffering = undefined;
      return { publicationState: "withdrawn", offeringStatus: "retired" };
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
        input: options.input,
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
      const offeringRef = boundedRefSchema.parse(
        `offering:${businessId}:${material.ids.capabilityId}`,
      );
      const before = await ownerSupplyReadback(businessId);
      if (
        before.offerings
          .map(record)
          .some((candidate) => candidate?.offeringRef === offeringRef)
      )
        throw new GatewaySmokeError("gateway_smoke_owner_fixture_preexisting");
      const createOfferingOperationKey = `ae-release-smoke:${options.runId}:offering:create`;
      const createOfferingCommand = {
        businessId,
        offeringRef,
        facts: {
          name: options.runId,
          category: "release-smoke",
          summary: `Run-scoped release smoke operation ${options.runId}.`,
          serviceAreaSummary: "Production release smoke.",
          availabilitySummary: "Available only for this release smoke run.",
        },
        operationKey: createOfferingOperationKey,
        correlationId: createOfferingOperationKey,
      };
      const createOfferingSourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command: createOfferingCommand,
        scope: "catalog_publish",
        operationKey: createOfferingOperationKey,
        correlationId: createOfferingOperationKey,
        env: options.env,
      });
      const createdOffering = record(
        await (await transport()).mutation(createOfferingMutation, {
          ...createOfferingCommand,
          sourceWriteRequest: sourceWriteRequestFromAdmission(
            createOfferingSourceWrite,
          ),
          sourceWrite: createOfferingSourceWrite,
        }),
      );
      if (
        createdOffering?.kind !== "ok" ||
        createdOffering.resultRef !== offeringRef ||
        createdOffering.currentRevision !== 1
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_offering_create_refused",
        );
      const publishOfferingOperationKey = `ae-release-smoke:${options.runId}:offering:publish`;
      const publishOfferingCommand = {
        businessId,
        offeringRef,
        expectedRevision: 1,
        status: "published" as const,
        operationKey: publishOfferingOperationKey,
        correlationId: publishOfferingOperationKey,
      };
      const publishOfferingSourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command: publishOfferingCommand,
        scope: "catalog_publish",
        operationKey: publishOfferingOperationKey,
        correlationId: publishOfferingOperationKey,
        env: options.env,
      });
      const publishedOffering = record(
        await (await transport()).mutation(retireOfferingMutation, {
          ...publishOfferingCommand,
          sourceWriteRequest: sourceWriteRequestFromAdmission(
            publishOfferingSourceWrite,
          ),
          sourceWrite: publishOfferingSourceWrite,
        }),
      );
      if (publishedOffering?.kind !== "ok")
        throw new GatewaySmokeError("gateway_smoke_owner_offering_publish_refused");
      partialOffering = { businessId, offeringRef, offeringRevision: 1 };
      const afterCatalog = await ownerSupplyReadback(businessId);
      const offerings = afterCatalog.offerings
        .map(record)
        .filter(
          (candidate) =>
            candidate?.offeringRef === offeringRef &&
            candidate.name === options.runId &&
            candidate.status === "published",
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
        input: options.input,
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
        typeof published.operationRef !== "string" ||
        !operationRefSchema.safeParse(published.operationRef).success
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
      const operationRef = operationRefSchema.parse(published.operationRef);
      const createdFixture: GatewayOwnerFixtureIdentity = {
        businessId,
        businessName,
        offeringRef,
        offeringRevision,
        offeringSourceHash,
        publicationRef,
        publicationRevision,
        operationRef,
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
      const readinessOperationKey = `ae-release-smoke:${options.runId}:readiness`;
      const readiness = record(
        await (
          await transport()
        ).action(readinessAction, {
          businessId,
          offeringRef,
          offeringRevision,
          offeringSourceHash,
          publicationRef,
          publicationRevision,
          operationKey: readinessOperationKey,
        }),
      );
      if (
        readiness?.step !== "readiness" ||
        readiness.state !== "completed" ||
        readiness.offeringRef !== offeringRef ||
        readiness.revision !== offeringRevision ||
        readiness.publicationRef !== publicationRef ||
        readiness.operationRef !== operationRef
      )
        throw new GatewaySmokeError("gateway_smoke_owner_readiness_refused");
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
            typeof publication.operationRef !== "string"
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
            operationRef: operationRefSchema.parse(publication.operationRef),
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
          await readWithdrawnOperation(fixture.operationRef);
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
          await retirePartialOffering();
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
    operationRef: string,
  ): Promise<HostedOwnerAuthority> => {
    const currentFixture = fixture;
    if (
      currentFixture === undefined ||
      currentFixture.operationRef !== operationRef
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
      offering.status !== "published" ||
      offering.revision !== currentFixture.offeringRevision ||
      offering.sourceHash !== currentFixture.offeringSourceHash ||
      publication?.publicationRef !== currentFixture.publicationRef ||
      publication.publicationRevision !== currentFixture.publicationRevision ||
      publication.operationRef !== currentFixture.operationRef ||
      publication.state !== "current"
    )
      throw new GatewaySmokeError("gateway_smoke_owner_authority_unavailable");
    const source = record(publication.source);
    const contractRef = record(publication.contractRef);
    const binding = record(publication.binding);
    if (record(binding?.authority)?.kind !== "keyless")
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
    operationRef: string,
  ): Promise<Readonly<{ kind: "refused"; code: "operation_withdrawn" }>> => {
    const currentFixture = fixture;
    if (
      currentFixture === undefined ||
      currentFixture.operationRef !== operationRef
    ) {
      throw new GatewaySmokeError(
        "gateway_smoke_owner_withdraw_identity_missing",
      );
    }
    const authority = await readAuthority(operationRef);
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
    if (beforeOffering.status !== "retired") {
      const operationKey = `ae-release-smoke:${options.runId}:retire:${currentFixture.offeringRevision}`;
      const command = {
        businessId: currentFixture.businessId,
        offeringRef: currentFixture.offeringRef,
        expectedRevision: currentFixture.offeringRevision,
        status: "retired" as const,
        operationKey,
        correlationId: operationKey,
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
        ).mutation(retireOfferingMutation, {
          ...command,
          sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
          sourceWrite,
        }),
      );
      if (result?.kind !== "ok")
        throw new GatewaySmokeError("gateway_smoke_owner_retire_refused");
    }
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
      afterOffering.status !== "retired" ||
      afterOffering.sourceHash !== currentFixture.offeringSourceHash ||
      afterPublication.publicationRef !== currentFixture.publicationRef ||
      afterPublication.state !== "withdrawn"
    )
      throw new GatewaySmokeError(
        "gateway_smoke_owner_cleanup_readback_invalid",
      );
    fixture = undefined;
    return { publicationState: "withdrawn", offeringStatus: "retired" };
  };

  const readWithdrawnOperation = async (
    operationRef: string,
  ): Promise<Readonly<{ kind: "refused"; code: "operation_withdrawn" }>> => {
    const response = await requestJson(
      options.fetch,
      `${options.baseUrl}/api/v1/market-operations/detail`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ operationRef }),
      },
      "",
    );
    const detail = operationDetailOutputSchema.safeParse(response.body);
    if (
      response.status === 200 &&
      detail.success &&
      detail.data.kind === "unavailable" &&
      detail.data.operationRef === operationRef &&
      detail.data.reason === "publisher_withdrew"
    )
      return { kind: "refused", code: "operation_withdrawn" };
    throw new GatewaySmokeError(
      "gateway_smoke_withdrawn_operation_not_source_attributed",
    );
  };

  const owner: HostedOwnerRuntime = {
    createFixture,
    replayMcp: async (operation, idempotencyKey) => {
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
              name: "ae_operation_invoke",
              arguments: {
                operationRef: operation.operationRef,
                input: options.input,
                idempotencyKey,
              },
            },
          }),
        },
        options.apiKey,
      );
      const envelope = record(response.body);
      const result = record(envelope?.result);
      return parseGatewayInvocationResponse(
        {
          status: response.status,
          body: result?.structuredContent ?? result?.content,
        },
        operation.operationRef,
      );
    },
    readActivity: options.readActivity,
    readAuthority,
    withdraw,
    retireOffering,
  };
  return { owner, readWithdrawnOperation };
}
