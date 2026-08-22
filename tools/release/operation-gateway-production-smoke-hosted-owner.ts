import { z } from "zod";

import { canonicalDigest } from "../../src/modules/common/canonical-digest";
import {
  jsonValueSchema,
  type JsonValue,
} from "../../src/modules/capability-contract/public";
import {
  preparePublicationDraft,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
  type PreparedPublicationMaterial,
  type PublicOperationDescriptor,
} from "../../src/modules/capability-supply/public";
import type { ExactAmount } from "../../src/modules/money/public";
import {
  fixtureSchema,
  selectedOperationSchema,
} from "./operation-gateway-production-smoke-receipt";
import { GatewaySmokeError } from "./operation-gateway-production-smoke-receipt";
import type { GatewayInvocationObservation } from "./operation-gateway-production-smoke-invocation";
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
