import { createClerkClient } from "@clerk/backend";
import Stripe from "stripe";
import { mkdir, open, readFile, unlink, link } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { canonicalDigest } from "../../src/modules/common/canonical-digest";

import { MARKET_OPERATIONS_INVOKE_SCOPE } from "../../src/modules/agent-access/contract";
import {
  jsonValueSchema,
  validateJsonSchema,
  type JsonValue,
} from "../../src/modules/capability-contract/public";
import { OPERATION_INVOKE_HTTP_PATH } from "../../src/modules/capability-execution/operation-invoke-entry";
import {
  createAuthenticatedSourceTransport,
  sourceAction,
  sourceMutation,
  sourceQuery,
  type ConvexSourceTransport,
} from "../../src/lib/server/convex-source";
import {
  sourceWriteAdmissionFromContext,
  sourceWriteRequestFromAdmission,
} from "../../src/lib/server/source-write-admission";
import {
  preparePublicationDraft,
  operationDetailOutputSchema,
  operationSearchOutputSchema,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
  type PreparedPublicationMaterial,
  type PublicOperationDescriptor,
} from "../../src/modules/capability-supply/public";
import {
  beginCreditTopupThroughSource,
  readCreditPaymentThroughSource as readTopupPaymentThroughSource,
  runOwnerPayoutTransferThroughSource,
  readOwnerPayoutTransferThroughSource,
} from "../../src/modules/money/server";
import {
  readStripeMoneyProviderConfig,
  readStripeTransfersByGroup,
  verifyStripeMoneyWebhook,
} from "../../src/lib/server/stripe-money-provider";
import { PublicServicesApiSchemaVersion } from "../../src/modules/registry/public";
import {
  CreditAccountViewSchema,
  CreditActivityViewSchema,
  exactAmountSchema,
  isMoneyRefusal,
  KeyUsageViewSchema,
  StrictLivePayoutReceiptSchema,
  accountRefForOwner,
  accountRefForProvider,
  addExactAmounts,
  calculateCreditTopupFinancials,
  compareExactAmounts,
  productionCreditTopupConfig,
  rescaleExactAmount,
  subtractExactAmounts,
  type ExactAmount,
  type StrictLivePayoutReceipt,
} from "../../src/modules/money/public";
import {
  APPROVED_EXTERNAL_MOVEMENT_CAP,
  MAX_ENDPOINT_COUNT,
  MAX_REF_LENGTH,
  MAX_SERVICE_COUNT,
  MAX_SERVICE_PAGES,
  SERVICES_PAGE_LIMIT,
  authenticationSchema,
  boundedRefSchema,
  digestSchema,
  fixtureSchema,
  operationRefSchema,
  required,
  sameAmount,
  selectedOperationSchema,
  topupPreparationSchema,
  topupProviderEventSchema,
  topupWebhookReplaySchema,
  zeroAmount,
} from "./operation-gateway-production-smoke-receipt";
import {
  GatewayProductionSmokeReceiptMaterialSchema,
  GatewayProductionSmokeReceiptSchema,
  GatewaySmokeError,
  buildGatewayProductionSmokeReceipt,
  gatewaySmokeFailureWithCleanup,
  parseGatewayProductionSmokeReceiptText,
  parseGatewayTopupPreparationText,
  receiptPathFromArguments,
  resolveGatewayReceiptPath,
  smokeErrorCode,
  writeGatewayProductionSmokeReceipt,
  writeGatewayTopupPreparationArtifact,
  type GatewayPayoutProviderTransferReadback,
  type GatewayProductionSmokeReceipt,
  type GatewayProductionSmokeReceiptMaterial,
  type GatewayTopupObservation,
  type GatewayTopupPreparationArtifact,
  type GatewayTopupProviderEvent,
  type GatewayTopupWebhookReplay,
  type HostedTopupReadback,
} from "./operation-gateway-production-smoke-receipt";
import {
  buildConservation,
  buildGatewayPayoutReceipt,
  buildOperationCharge,
  completedCallReceipt,
  parseGatewayOwnerProviderEarnings,
  sanitizeGatewayPayoutProviderTransfers,
  topupReceipt,
  type HostedMoneySnapshot,
  type StrictCreditActivityView,
} from "./operation-gateway-production-smoke-money";
import {
  assertGatewayInvocationReplayParity,
  assertGatewayPaidCompletion,
  invokeGatewayOperation,
  parseGatewayInvocationResponse,
  pollGatewayOperation,
  readFreshProcessGatewayStatus,
  readGatewayCompletionMetadata,
  requestJson,
  requireCompletedInvocation,
  stableIdempotencyKey,
  type GatewayHttpResponse,
  type GatewayInvocationObservation,
} from "./operation-gateway-production-smoke-invocation";

export {
  assertGatewayInvocationReplayParity,
  assertGatewayPaidCompletion,
  invokeGatewayOperation,
  parseFreshProcessGatewayStatusOutput,
  parseGatewayInvocationResponse,
  pollGatewayOperation,
  readFreshProcessGatewayStatus,
  readGatewayCompletionMetadata,
  readGatewayStatus,
} from "./operation-gateway-production-smoke-invocation";
export type {
  GatewayCompletedOperation,
  GatewayInvocationObservation,
  GatewayPendingOperation,
  GatewaySmokeUnknown,
} from "./operation-gateway-production-smoke-invocation";

export {
  buildGatewayPayoutReceipt,
  parseGatewayOwnerProviderEarnings,
  sanitizeGatewayPayoutProviderTransfers,
} from "./operation-gateway-production-smoke-money";

export {
  GatewayPayoutProviderTransferReadbackSchema,
  GatewayPayoutReceiptSchema,
  GatewayProductionSmokeReceiptMaterialSchema,
  GatewayProductionSmokeReceiptSchema,
  GatewaySmokeError,
  buildGatewayProductionSmokeReceipt,
  gatewaySmokeFailureWithCleanup,
  parseGatewayProductionSmokeReceiptText,
  parseGatewayTopupPreparationText,
  receiptPathFromArguments,
  resolveGatewayReceiptPath,
  smokeErrorCode,
  writeGatewayProductionSmokeReceipt,
  writeGatewayTopupPreparationArtifact,
} from "./operation-gateway-production-smoke-receipt";
export type {
  GatewayPayoutProviderTransferReadback,
  GatewayPayoutReceipt,
  GatewayProductionSmokeReceipt,
  GatewayProductionSmokeReceiptMaterial,
  GatewayTopupObservation,
  GatewayTopupPreparationArtifact,
  GatewayTopupProviderEvent,
  GatewayTopupWebhookReplay,
  HostedTopupReadback,
} from "./operation-gateway-production-smoke-receipt";

import { resolveVercelProtectionBypassSecret } from "./vercel-protection-bypass";

const MAX_JOB_QUERY_LENGTH = 200;
const MAX_INPUT_JSON_BYTES = 64 * 1024;
const MAX_TOPUP_EVENT_PAGES = 10;
const STRIPE_REQUEST_TIMEOUT_MS = 15_000;






const MAX_OWNER_OPENAPI_DOCUMENT_BYTES = 256 * 1024;
const MAX_TOPUP_WEBHOOK_RAW_BODY_BYTES = 256 * 1024;
const MAX_TOPUP_WEBHOOK_SIGNATURE_BYTES = 4 * 1024;



const boundedInputSchema = z.record(
  z.string().trim().min(1).max(200),
  jsonValueSchema,
);

const ownerOpenApiMethodSchema = z.enum(["get", "post"]);

const serviceEndpointIdentitySchema = z.object({
  ae: z.object({
    operationRef: operationRefSchema.optional(),
    offeringRef: boundedRefSchema,
    authentication: authenticationSchema,
  }),
});
const serviceIdentitySchema = z.object({
  id: boundedRefSchema,
  endpoints: z.array(serviceEndpointIdentitySchema).max(MAX_ENDPOINT_COUNT),
});
const servicesPageSchema = z.object({
  kind: z.literal("ok"),
  schemaVersion: z.literal(PublicServicesApiSchemaVersion),
  services: z.array(serviceIdentitySchema).max(SERVICES_PAGE_LIMIT),
  isDone: z.boolean(),
  continueCursor: z.string().max(512),
});
type GatewayOwnerFixtureIdentity = Omit<
  z.infer<typeof fixtureSchema>,
  "cleanup"
> &
  Readonly<{ businessId: string; businessName: string }>;
type GatewayOwnerFixtureCleanup = z.infer<typeof fixtureSchema>["cleanup"];
type HostedOwnerAuthority = z.infer<
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
type RunOwnedClerkKeyProof = Readonly<{
  rawSecret: string;
  credentialId: string;
  ownerUserId: string;
  runId: string;
  lifecycle: "active";
  scopes: readonly [typeof MARKET_OPERATIONS_INVOKE_SCOPE];
}>;

export type HostedMoneyRuntime = Readonly<{
  mode: "live";
  principalId: string;
  accountRef: string;
  businessId: string;
  credentialId: string;
  topupIdempotencyKey: string;
  topupChargeAmount: ExactAmount;
  beginTopup: () => Promise<GatewayTopupPreparationArtifact>;
  payoutRef: string;
  payoutIdempotencyKey: string;
  readSnapshot: () => Promise<HostedMoneySnapshot>;
  readProviderTransfers: (
    payoutRef: string,
  ) => Promise<GatewayPayoutProviderTransferReadback>;
  observeTopup: (
    expected: GatewayTopupPreparationArtifact,
  ) => Promise<GatewayTopupObservation>;
  readControlActivity: (
    invocationRef: string,
  ) => Promise<StrictCreditActivityView>;
  beginPayout: (
    input: Readonly<{
      payoutRef: string;
      idempotencyKey: string;
      amount: ExactAmount;
    }>,
  ) => Promise<StrictLivePayoutReceipt>;
  readPayout: (
    input: Readonly<{ payoutRef: string; idempotencyKey: string }>,
  ) => Promise<StrictLivePayoutReceipt>;
  readWithdrawnOperation: (
    operationRef: string,
  ) => Promise<Readonly<{ kind: "refused"; code: "operation_withdrawn" }>>;
  preflightCredential: () => Promise<void>;
  revokeCredential: (
    operationRef: string | undefined,
    input: Readonly<Record<string, JsonValue>>,
  ) => Promise<
    Readonly<{
      kind: "refused";
      code: "authentication_required";
      credentialDigest: string;
    }>
  >;
}>;
export type GatewaySmokeConfig = Readonly<{
  baseUrl: string;
  jobQuery: string;
  ownerQuery: string;
  input: Readonly<Record<string, JsonValue>>;
  apiKey: string;
  releaseApiKey: string;
  deploymentId: string;
  sourceRevision: string;
  runId: string;
  approvedAt: number;
  topupStage: "prepare" | "complete";
  topupPreparationPath?: string;
  topupPreparation?: GatewayTopupPreparationArtifact;
  ownerOpenApiDocument: Readonly<Record<string, JsonValue>>;
  ownerOpenApiPath: string;
  ownerOpenApiMethod: "get" | "post";
  runtimeEnvironment: Readonly<Record<string, string | undefined>>;
  owner: HostedOwnerRuntime;
  money: HostedMoneyRuntime;
  receiptPath?: string;
  expectedConvexDeploymentId?: string;
  expectedConvexUrl?: string;
  bypassSecret?: string;
  fetch: typeof globalThis.fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  maxStatusWaitMs?: number;
  statusDelayMs?: number;
}>;

export type GatewayServiceOperation = Readonly<{
  serviceId: string;
  offeringRef: string;
  authentication: z.infer<typeof authenticationSchema>;
}>;
export type GatewayServiceDiscovery = Readonly<{
  operations: ReadonlyMap<string, GatewayServiceOperation>;
  serviceCount: number;
  endpointCount: number;
}>;
export async function discoverGatewayServices(
  config: Pick<GatewaySmokeConfig, "baseUrl" | "fetch">,
): Promise<GatewayServiceDiscovery> {
  const operations = new Map<string, GatewayServiceOperation>();
  let serviceCount = 0;
  let endpointCount = 0;
  let cursor: string | undefined;

  for (let pageNumber = 0; pageNumber < MAX_SERVICE_PAGES; pageNumber += 1) {
    const url = new URL("/api/v1/services", config.baseUrl);
    url.searchParams.set("limit", String(SERVICES_PAGE_LIMIT));
    if (cursor !== undefined) url.searchParams.set("cursor", cursor);
    const response = await requestJson(
      config.fetch,
      url.href,
      { method: "GET", headers: { accept: "application/json" } },
      "",
    );
    const parsed = servicesPageSchema.safeParse(response.body);
    if (response.status < 200 || response.status >= 300 || !parsed.success)
      throw new GatewaySmokeError("gateway_smoke_services_page_malformed");

    serviceCount += parsed.data.services.length;
    endpointCount += parsed.data.services.reduce(
      (total, service) => total + service.endpoints.length,
      0,
    );
    if (serviceCount > MAX_SERVICE_COUNT || endpointCount > MAX_ENDPOINT_COUNT)
      throw new GatewaySmokeError("gateway_smoke_services_count_limit");

    for (const service of parsed.data.services) {
      for (const endpoint of service.endpoints) {
        const operationRef = endpoint.ae.operationRef;
        if (operationRef === undefined) continue;
        if (operations.has(operationRef))
          throw new GatewaySmokeError(
            "gateway_smoke_service_operation_link_ambiguous",
          );
        operations.set(operationRef, {
          serviceId: service.id,
          offeringRef: endpoint.ae.offeringRef,
          authentication: endpoint.ae.authentication,
        });
      }
    }

    if (parsed.data.isDone) return { operations, serviceCount, endpointCount };
    const nextCursor = parsed.data.continueCursor.trim();
    if (nextCursor.length === 0 || nextCursor === cursor)
      throw new GatewaySmokeError("gateway_smoke_services_cursor_invalid");
    cursor = nextCursor;
  }

  throw new GatewaySmokeError("gateway_smoke_services_page_limit_exceeded");
}

export function matchGatewayServiceOperation(
  discovery: GatewayServiceDiscovery,
  operation: PublicOperationDescriptor,
  role: "owner" | "control",
): GatewayServiceOperation {
  const linked = discovery.operations.get(operation.operationRef);
  if (linked === undefined)
    throw new GatewaySmokeError(
      `gateway_smoke_${role}_operation_service_link_missing`,
    );
  if (linked.offeringRef !== operation.offering.offeringRef)
    throw new GatewaySmokeError(
      `gateway_smoke_${role}_service_offering_mismatch`,
    );
  if (
    canonicalDigest(linked.authentication) !==
    canonicalDigest(operation.authentication)
  )
    throw new GatewaySmokeError(
      `gateway_smoke_${role}_service_authentication_mismatch`,
    );
  if (role === "owner" && linked.authentication.kind !== "keyless")
    throw new GatewaySmokeError("gateway_smoke_owner_operation_not_keyless");
  if (
    role === "control" &&
    linked.authentication.kind !== "platform_credential" &&
    linked.authentication.kind !== "x402"
  )
    throw new GatewaySmokeError(
      "gateway_smoke_control_operation_authentication_unsupported",
    );
  return linked;
}

export function gatewaySmokeConfigFromEnvironment(
  env: Record<string, string | undefined>,
  receiptPath?: string,
): GatewaySmokeConfig {
  if (env.AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND?.trim() !== "true")
    throw new Error("AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND must equal true");
  const apiKey = required(
    env.AE_GATEWAY_SMOKE_API_KEY,
    "AE_GATEWAY_SMOKE_API_KEY",
  );
  const releaseApiKey = required(
    env.AE_GATEWAY_SMOKE_RELEASE_API_KEY,
    "AE_GATEWAY_SMOKE_RELEASE_API_KEY",
  );
  const topupStage = z
    .enum(["prepare", "complete"])
    .parse(env.AE_GATEWAY_SMOKE_TOPUP_STAGE ?? "complete");
  if (
    env.AE_GATEWAY_SMOKE_TOPUP_WEBHOOK_RAW_BODY !== undefined ||
    env.AE_GATEWAY_SMOKE_TOPUP_WEBHOOK_SIGNATURE !== undefined ||
    env.AE_GATEWAY_SMOKE_TOPUP_EXTERNAL_REF !== undefined
  )
    throw new Error("gateway_smoke_retained_webhook_capture_forbidden");
  const baseUrl = requireHostedUrl(
    env.AE_GATEWAY_SMOKE_BASE_URL,
    "AE_GATEWAY_SMOKE_BASE_URL",
  );
  const jobQuery = required(
    env.AE_GATEWAY_SMOKE_JOB_QUERY,
    "AE_GATEWAY_SMOKE_JOB_QUERY",
  );
  const ownerQuery = required(
    env.AE_GATEWAY_SMOKE_OWNER_QUERY ?? jobQuery,
    "AE_GATEWAY_SMOKE_OWNER_QUERY",
  );
  if (
    jobQuery.length > MAX_JOB_QUERY_LENGTH ||
    ownerQuery.length > MAX_JOB_QUERY_LENGTH
  )
    throw new Error("gateway smoke query exceeds the bounded length");
  const raw = required(
    env.AE_GATEWAY_SMOKE_INPUT_JSON,
    "AE_GATEWAY_SMOKE_INPUT_JSON",
  );
  if (new TextEncoder().encode(raw).byteLength > MAX_INPUT_JSON_BYTES)
    throw new Error("AE_GATEWAY_SMOKE_INPUT_JSON exceeds the bounded size");
  let inputValue: unknown;
  try {
    inputValue = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("AE_GATEWAY_SMOKE_INPUT_JSON must be valid JSON");
  }
  const input = boundedInputSchema.parse(inputValue);
  const ownerOpenApiDocumentRaw = requiredBoundedSecret(
    env.AE_GATEWAY_SMOKE_OWNER_OPENAPI_DOCUMENT_JSON,
    "AE_GATEWAY_SMOKE_OWNER_OPENAPI_DOCUMENT_JSON",
    MAX_OWNER_OPENAPI_DOCUMENT_BYTES,
  );
  let ownerOpenApiDocumentValue: unknown;
  try {
    ownerOpenApiDocumentValue = JSON.parse(ownerOpenApiDocumentRaw) as unknown;
  } catch {
    throw new Error(
      "AE_GATEWAY_SMOKE_OWNER_OPENAPI_DOCUMENT_JSON must be valid JSON",
    );
  }
  const ownerOpenApiDocument = boundedInputSchema.parse(
    ownerOpenApiDocumentValue,
  );
  const ownerOpenApiPath = required(
    env.AE_GATEWAY_SMOKE_OWNER_OPENAPI_PATH,
    "AE_GATEWAY_SMOKE_OWNER_OPENAPI_PATH",
  );
  if (
    !ownerOpenApiPath.startsWith("/") ||
    ownerOpenApiPath.length > MAX_REF_LENGTH
  )
    throw new Error(
      "AE_GATEWAY_SMOKE_OWNER_OPENAPI_PATH must be a bounded absolute path",
    );
  const ownerOpenApiMethod = ownerOpenApiMethodSchema.parse(
    required(
      env.AE_GATEWAY_SMOKE_OWNER_OPENAPI_METHOD,
      "AE_GATEWAY_SMOKE_OWNER_OPENAPI_METHOD",
    ),
  );
  const sourceRevision = required(
    env.AE_RELEASE_SOURCE_REVISION,
    "AE_RELEASE_SOURCE_REVISION",
  );
  const deploymentId = required(
    env.AE_RELEASE_DEPLOYMENT_ID,
    "AE_RELEASE_DEPLOYMENT_ID",
  );
  const runId = required(
    env.AE_GATEWAY_SMOKE_RUN_ID,
    "AE_GATEWAY_SMOKE_RUN_ID",
  );
  const approvedAtRaw = required(
    env.AE_GATEWAY_SMOKE_APPROVED_AT,
    "AE_GATEWAY_SMOKE_APPROVED_AT",
  );
  const approvedAt = Number(approvedAtRaw);
  if (!Number.isSafeInteger(approvedAt) || approvedAt <= 0)
    throw new Error(
      "AE_GATEWAY_SMOKE_APPROVED_AT must be a positive epoch millisecond timestamp",
    );
  const topupPreparationPath =
    env.AE_GATEWAY_SMOKE_TOPUP_PREPARATION_PATH?.trim();
  if (topupPreparationPath !== undefined && topupPreparationPath.length === 0)
    throw new Error(
      "AE_GATEWAY_SMOKE_TOPUP_PREPARATION_PATH must not be empty",
    );
  if (!/^[a-f0-9]{40}$/u.test(sourceRevision))
    throw new Error(
      "AE_RELEASE_SOURCE_REVISION must be a 40-character lowercase Git revision",
    );
  if (
    !new RegExp(
      `^ae-release-smoke:${sourceRevision}:[A-Za-z0-9._-]{1,64}$`,
      "u",
    ).test(runId)
  )
    throw new Error(
      "AE_GATEWAY_SMOKE_RUN_ID must bind the release revision and a unique run token",
    );
  const bypassSecret = resolveVercelProtectionBypassSecret(env);
  const runtimes = createHostedRuntimeFromEnvironment({
    env,
    baseUrl,
    apiKey,
    fetch: globalThis.fetch,
    input,
    ownerQuery,
    ownerOpenApiDocument,
    ownerOpenApiPath,
    ownerOpenApiMethod,
    runId,
    approvedAt,
  });
  return {
    baseUrl,
    runId,
    jobQuery,
    ownerQuery,
    input,
    apiKey,
    releaseApiKey,
    sourceRevision,
    deploymentId,
    approvedAt,
    topupStage,
    ...(topupPreparationPath === undefined ? {} : { topupPreparationPath }),
    ownerOpenApiDocument,
    ownerOpenApiPath,
    ownerOpenApiMethod,
    runtimeEnvironment: env,
    owner: runtimes.owner,
    money: runtimes.money,
    ...(receiptPath === undefined ? {} : { receiptPath }),
    expectedConvexDeploymentId: required(
      env.AE_RELEASE_CONVEX_DEPLOYMENT_ID,
      "AE_RELEASE_CONVEX_DEPLOYMENT_ID",
    ),
    expectedConvexUrl: requireHostedUrl(
      env.AE_RELEASE_CONVEX_URL,
      "AE_RELEASE_CONVEX_URL",
    ),
    ...(bypassSecret === undefined ? {} : { bypassSecret }),
    fetch: globalThis.fetch,
  };
}
function hostedGatewayDeploymentIdentity(config: GatewaySmokeConfig) {
  return {
    sourceRevision: config.sourceRevision,
    vercelDeploymentId: config.deploymentId,
    vercelUrl: config.baseUrl,
    productionUrl: config.baseUrl,
    convexDeploymentId: config.expectedConvexDeploymentId ?? config.deploymentId,
    convexUrl: config.expectedConvexUrl ?? config.baseUrl,
    convexSourceRevision: config.sourceRevision,
  };
}
export async function runGatewayProductionSmoke(
  config: GatewaySmokeConfig,
): Promise<GatewayProductionSmokeReceipt> {
  const stripeConfig = readStripeMoneyProviderConfig(
    config.runtimeEnvironment,
    "live",
  );
  if (isMoneyRefusal(stripeConfig) || stripeConfig.mode !== "live")
    throw new GatewaySmokeError("stripe_setup_required");
  const release = hostedGatewayDeploymentIdentity(config);
  const ownerRuntime = config.owner;
  const moneyRuntime = config.money;
  if (moneyRuntime.mode !== "live")
    throw new GatewaySmokeError("stripe_setup_required");
  await moneyRuntime.preflightCredential();
  let createdFixture: GatewayOwnerFixtureIdentity | undefined;
  let controlOperationRef: string | undefined;
  let withdrawn:
    Readonly<{ kind: "refused"; code: "operation_withdrawn" }> | undefined;
  let cleanup: GatewayOwnerFixtureCleanup | undefined;
  let primaryFailure: unknown;
  let smokeReceipt: GatewayProductionSmokeReceipt | undefined;
  try {
    createdFixture = await ownerRuntime.createFixture();
    if (createdFixture.businessId.length === 0)
      throw new GatewaySmokeError(
        "gateway_smoke_owner_fixture_business_identity_missing",
      );
    const observedAt = config.now?.() ?? Date.now();
    const services = await discoverGatewayServices(config);
    const owner = await discoverOperation(
      config,
      config.ownerQuery,
      observedAt,
      "owner",
    );
    const control = await discoverOperation(
      config,
      config.jobQuery,
      observedAt,
      "control",
    );
    const ownerService = matchGatewayServiceOperation(services, owner, "owner");
    const controlService = matchGatewayServiceOperation(
      services,
      control,
      "control",
    );
    if (control.commercial.price.kind !== "fixed")
      throw new GatewaySmokeError("gateway_smoke_control_price_not_fixed");
    if (
      owner.operationRef !== createdFixture.operationRef ||
      owner.offering.offeringRef !== createdFixture.offeringRef ||
      owner.business.businessId !== createdFixture.businessId
    )
      throw new GatewaySmokeError(
        "gateway_smoke_owner_publication_identity_mismatch",
      );
    if (control.business.businessId === createdFixture.businessId)
      throw new GatewaySmokeError(
        "gateway_smoke_owner_control_business_identity_collision",
      );
    controlOperationRef = control.operationRef;
    if (control.business.businessId !== moneyRuntime.businessId)
      throw new GatewaySmokeError(
        "gateway_smoke_control_business_identity_mismatch",
      );
    const controlPrice = rescaleExactAmount(
      control.commercial.price.amount,
      APPROVED_EXTERNAL_MOVEMENT_CAP.exponent,
    );
    const movementBeforeControl = subtractExactAmounts(
      APPROVED_EXTERNAL_MOVEMENT_CAP,
      moneyRuntime.topupChargeAmount,
    );
    if (
      controlPrice === undefined ||
      movementBeforeControl === undefined ||
      compareExactAmounts(
        moneyRuntime.topupChargeAmount,
        APPROVED_EXTERNAL_MOVEMENT_CAP,
      ) === undefined ||
      compareExactAmounts(
        moneyRuntime.topupChargeAmount,
        APPROVED_EXTERNAL_MOVEMENT_CAP,
      ) === 1 ||
      compareExactAmounts(controlPrice, movementBeforeControl) === undefined ||
      compareExactAmounts(controlPrice, movementBeforeControl) === 1
    )
      throw new GatewaySmokeError(
        "gateway_smoke_control_price_exceeds_approved_movement",
      );
    if (!validateJsonSchema(control.contract.inputJsonSchema, config.input))
      throw new GatewaySmokeError(
        "gateway_smoke_input_does_not_match_operation_schema",
      );
    const ownerAuthority = await ownerRuntime.readAuthority(owner.operationRef);
    if (ownerAuthority.publicationRef !== createdFixture.publicationRef)
      throw new GatewaySmokeError(
        "gateway_smoke_owner_publication_ref_mismatch",
      );

    const baseline = await moneyRuntime.readSnapshot();
    if (
      baseline.buyer.principalId !== moneyRuntime.principalId ||
      baseline.usage.credentialId !== moneyRuntime.credentialId ||
      baseline.supplier.businessId !== moneyRuntime.businessId
    )
      throw new GatewaySmokeError("gateway_smoke_money_identity_mismatch");
    if (
      !sameAmount(baseline.buyer.balance, zeroAmount(baseline.buyer.balance)) ||
      baseline.usage.callCount !== 0 ||
      baseline.usage.paidCallCount !== 0 ||
      baseline.usage.freeCallCount !== 0 ||
      !sameAmount(
        baseline.usage.grossSpend,
        zeroAmount(baseline.usage.grossSpend),
      ) ||
      baseline.usage.states.length !== 0
    )
      throw new GatewaySmokeError("gateway_smoke_money_baseline_not_zero");
    if (
      !sameAmount(
        baseline.supplier.grossAccrual,
        zeroAmount(baseline.supplier.grossAccrual),
      ) ||
      !sameAmount(baseline.supplier.rake, zeroAmount(baseline.supplier.rake)) ||
      !sameAmount(
        baseline.supplier.providerNet,
        zeroAmount(baseline.supplier.providerNet),
      ) ||
      !sameAmount(
        baseline.supplier.paidOut,
        zeroAmount(baseline.supplier.paidOut),
      ) ||
      !sameAmount(baseline.supplier.held, zeroAmount(baseline.supplier.held)) ||
      !sameAmount(
        baseline.supplier.recoveryDue,
        zeroAmount(baseline.supplier.recoveryDue),
      )
    )
      throw new GatewaySmokeError(
        "gateway_smoke_control_supplier_not_isolated",
      );
    const principalDigest = canonicalDigest({
      principalId: moneyRuntime.principalId,
    });

    if (
      config.topupStage !== "complete" ||
      config.topupPreparation === undefined
    )
      throw new GatewaySmokeError("gateway_smoke_topup_preparation_required");
    const topupObservation = await moneyRuntime.observeTopup(
      config.topupPreparation,
    );
    const topup = topupObservation.readback;
    const topupProviderEvent = topupObservation.providerEvent;
    const topupWebhookReplay = topupObservation.webhookReplay;
    if (!sameAmount(topup.chargeAmount, moneyRuntime.topupChargeAmount))
      throw new GatewaySmokeError(
        "gateway_smoke_topup_charge_readback_mismatch",
      );
    if (
      topup.externalRef !== config.topupPreparation.externalRef ||
      topup.topupCommandRef !== config.topupPreparation.commandRef ||
      topup.idempotencyKey !== config.topupPreparation.idempotencyKey
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_preparation_binding_mismatch",
      );
    if (
      !sameAmount(topupProviderEvent.amount, topup.chargeAmount) ||
      topupProviderEvent.stripeEventId !== topup.stripeEventId ||
      topupProviderEvent.externalRef !== topup.externalRef ||
      topupProviderEvent.commandRef !== topup.topupCommandRef ||
      topupProviderEvent.runId !== config.runId
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_provider_event_binding_mismatch",
      );
    const topupAfter = await moneyRuntime.readSnapshot();
    if (
      !sameAmount(topup.buyerBalanceBefore, baseline.buyer.balance) ||
      !sameAmount(topup.buyerBalanceAfter, topupAfter.buyer.balance)
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_balance_readback_mismatch",
      );

    const ownerKey = stableIdempotencyKey(
      config.runId,
      owner.operationRef,
      config.input,
    );
    const ownerInitial = requireCompletedInvocation(
      await pollGatewayOperation(
        config,
        await invokeGatewayOperation(config, owner, ownerKey),
      ),
      owner.operationRef,
      "owner_http",
    );
    const afterOwner = await moneyRuntime.readSnapshot();
    const ownerActivity = CreditActivityViewSchema.parse(
      await ownerRuntime.readActivity(ownerInitial.invocationRef),
    );
    const ownerReplay = requireCompletedInvocation(
      await pollGatewayOperation(
        config,
        await ownerRuntime.replayMcp(owner, ownerKey),
      ),
      owner.operationRef,
      "owner_mcp_replay",
    );
    assertGatewayInvocationReplayParity(ownerInitial, ownerReplay);
    const afterReplay = await moneyRuntime.readSnapshot();
    if (
      canonicalDigest(afterReplay.usage) !==
        canonicalDigest(afterOwner.usage) ||
      !sameAmount(afterReplay.buyer.balance, afterOwner.buyer.balance) ||
      !sameAmount(
        afterReplay.supplier.providerNet,
        afterOwner.supplier.providerNet,
      )
    )
      throw new GatewaySmokeError(
        "gateway_smoke_owner_replay_moved_usage_or_money",
      );

    const controlKey = stableIdempotencyKey(
      config.runId,
      control.operationRef,
      config.input,
    );
    const controlInitial = requireCompletedInvocation(
      await pollGatewayOperation(
        config,
        await invokeGatewayOperation(config, control, controlKey),
      ),
      control.operationRef,
      "control_http",
    );
    assertGatewayPaidCompletion(control, controlInitial);
    const afterControl = await moneyRuntime.readSnapshot();
    const controlActivity = CreditActivityViewSchema.parse(
      await moneyRuntime.readControlActivity(controlInitial.invocationRef),
    );
    const controlReplay = requireCompletedInvocation(
      await pollGatewayOperation(
        config,
        await invokeGatewayOperation(config, control, controlKey),
      ),
      control.operationRef,
      "control_replay",
    );
    assertGatewayInvocationReplayParity(controlInitial, controlReplay);
    const fresh = requireCompletedInvocation(
      await readFreshProcessGatewayStatus(config, controlInitial.invocationRef),
      control.operationRef,
      "control_fresh_status",
    );
    assertGatewayInvocationReplayParity(controlInitial, fresh);
    const afterControlReplay = await moneyRuntime.readSnapshot();
    if (
      canonicalDigest(afterControlReplay.usage) !==
        canonicalDigest(afterControl.usage) ||
      !sameAmount(
        afterControlReplay.buyer.balance,
        afterControl.buyer.balance,
      ) ||
      !sameAmount(
        afterControlReplay.supplier.providerNet,
        afterControl.supplier.providerNet,
      )
    )
      throw new GatewaySmokeError(
        "gateway_smoke_control_replay_moved_usage_or_money",
      );

    const ownerMeta = await readGatewayCompletionMetadata(
      config,
      ownerInitial.invocationRef,
      owner.operationRef,
    );
    const controlMeta = await readGatewayCompletionMetadata(
      config,
      controlInitial.invocationRef,
      control.operationRef,
    );
    const operationCharge = buildOperationCharge(
      controlActivity,
      controlMeta,
      afterReplay,
      afterControl,
      principalDigest,
    );
    const totalExternalMovement = addExactAmounts(
      moneyRuntime.topupChargeAmount,
      operationCharge.providerNetAccrual,
    );
    if (
      compareExactAmounts(
        operationCharge.buyerDebit,
        APPROVED_EXTERNAL_MOVEMENT_CAP,
      ) === undefined ||
      compareExactAmounts(
        operationCharge.buyerDebit,
        APPROVED_EXTERNAL_MOVEMENT_CAP,
      ) === 1 ||
      compareExactAmounts(
        operationCharge.providerNetAccrual,
        APPROVED_EXTERNAL_MOVEMENT_CAP,
      ) === undefined ||
      compareExactAmounts(
        operationCharge.providerNetAccrual,
        APPROVED_EXTERNAL_MOVEMENT_CAP,
      ) === 1 ||
      totalExternalMovement === undefined ||
      compareExactAmounts(
        totalExternalMovement,
        APPROVED_EXTERNAL_MOVEMENT_CAP,
      ) === undefined ||
      compareExactAmounts(
        totalExternalMovement,
        APPROVED_EXTERNAL_MOVEMENT_CAP,
      ) === 1
    )
      throw new GatewaySmokeError(
        "gateway_smoke_external_movement_exceeds_approved_cap",
      );
    const payoutInput = {
      payoutRef: moneyRuntime.payoutRef,
      idempotencyKey: moneyRuntime.payoutIdempotencyKey,
      amount: operationCharge.providerNetAccrual,
    };
    const providerTransfersBeforePayout =
      await moneyRuntime.readProviderTransfers(payoutInput.payoutRef);
    const payoutInitial = StrictLivePayoutReceiptSchema.parse(
      await moneyRuntime.beginPayout(payoutInput),
    );
    const afterPayout = await moneyRuntime.readSnapshot();
    const providerTransfersAfterInitialPayout =
      await moneyRuntime.readProviderTransfers(payoutInput.payoutRef);
    const payoutReplay = StrictLivePayoutReceiptSchema.parse(
      await moneyRuntime.beginPayout(payoutInput),
    );
    const afterPayoutReplay = await moneyRuntime.readSnapshot();
    const providerTransfersAfterReplay =
      await moneyRuntime.readProviderTransfers(payoutInput.payoutRef);
    const payoutReadback = StrictLivePayoutReceiptSchema.parse(
      await moneyRuntime.readPayout({
        payoutRef: payoutInput.payoutRef,
        idempotencyKey: payoutInput.idempotencyKey,
      }),
    );
    if (
      canonicalDigest(payoutReadback) !== canonicalDigest(payoutInitial) ||
      canonicalDigest(payoutReadback) !== canonicalDigest(payoutReplay) ||
      payoutReadback.payoutRef !== payoutInput.payoutRef ||
      payoutReadback.supplierBusinessId !== control.business.businessId ||
      payoutReadback.payoutAccountRef !==
        accountRefForProvider(
          control.business.businessId,
          moneyRuntime.topupChargeAmount.currency,
        ) ||
      payoutReadback.stripeAccountDigest !==
        payoutInitial.stripeAccountDigest ||
      payoutReadback.stripeTransferDigest !==
        payoutInitial.stripeTransferDigest ||
      payoutReadback.transferEvidenceDigest !==
        payoutInitial.transferEvidenceDigest ||
      !sameAmount(
        payoutReadback.providerNetAmount,
        operationCharge.providerNetAccrual,
      ) ||
      !sameAmount(
        payoutReadback.providerHeldBefore,
        afterControl.supplier.held,
      ) ||
      !sameAmount(
        payoutReadback.providerHeldAfter,
        afterPayout.supplier.held,
      ) ||
      !sameAmount(
        payoutReadback.providerPaidBefore,
        afterControl.supplier.paidOut,
      ) ||
      !sameAmount(
        payoutReadback.providerPaidAfter,
        afterPayout.supplier.paidOut,
      )
    )
      throw new GatewaySmokeError(
        "gateway_smoke_payout_durable_readback_identity_mismatch",
      );
    if (
      canonicalDigest(afterPayoutReplay.usage) !==
        canonicalDigest(afterPayout.usage) ||
      !sameAmount(afterPayoutReplay.buyer.balance, afterPayout.buyer.balance) ||
      !sameAmount(afterPayoutReplay.supplier.held, afterPayout.supplier.held) ||
      !sameAmount(
        afterPayoutReplay.supplier.paidOut,
        afterPayout.supplier.paidOut,
      )
    )
      throw new GatewaySmokeError("gateway_smoke_payout_replay_changed");
    if (
      !sameAmount(afterPayout.supplier.held, payoutInitial.providerHeldAfter) ||
      !sameAmount(afterPayout.supplier.paidOut, payoutInitial.providerPaidAfter)
    )
      throw new GatewaySmokeError("gateway_smoke_payout_readback_mismatch");
    const actualPaidOut = subtractExactAmounts(
      afterPayout.supplier.paidOut,
      afterControl.supplier.paidOut,
    );
    if (
      actualPaidOut === undefined ||
      !sameAmount(actualPaidOut, operationCharge.providerNetAccrual) ||
      !sameAmount(
        payoutInitial.providerNetAmount,
        operationCharge.providerNetAccrual,
      ) ||
      !sameAmount(
        payoutInitial.providerPaidBefore,
        afterControl.supplier.paidOut,
      )
    )
      throw new GatewaySmokeError("gateway_smoke_payout_readback_mismatch");
    const actualExternalMovement = addExactAmounts(
      moneyRuntime.topupChargeAmount,
      actualPaidOut,
    );
    if (
      actualExternalMovement === undefined ||
      compareExactAmounts(
        actualExternalMovement,
        APPROVED_EXTERNAL_MOVEMENT_CAP,
      ) === undefined ||
      compareExactAmounts(
        actualExternalMovement,
        APPROVED_EXTERNAL_MOVEMENT_CAP,
      ) === 1
    )
      throw new GatewaySmokeError(
        "gateway_smoke_external_movement_exceeds_approved_cap",
      );
    const payout = buildGatewayPayoutReceipt({
      payout: payoutReadback,
      payoutReplay,
      providerTransfersBeforePayout,
      providerTransfersAfterInitialPayout,
      providerTransfersAfterReplay,
    });

    const withdrawnReadback = await ownerRuntime.withdraw(
      createdFixture.operationRef,
    );
    withdrawn = withdrawnReadback;
    await moneyRuntime.readWithdrawnOperation(createdFixture.operationRef);
    const cleanupReadback = await ownerRuntime.retireOffering();
    cleanup = cleanupReadback;
    const revoked = await moneyRuntime.revokeCredential(
      control.operationRef,
      config.input,
    );
    const conservation = buildConservation(operationCharge, payout);
    const material: GatewayProductionSmokeReceiptMaterial = {
      schemaVersion: 1,
      kind: "operation_gateway_production_smoke",
      status: "passed",
      observedAt: new Date(observedAt).toISOString(),
      deployment: {
        sourceRevision: release.sourceRevision,
        vercelDeploymentId: release.vercelDeploymentId,
        vercelUrl: release.vercelUrl,
        productionUrl: release.productionUrl,
        convexDeploymentId: release.convexDeploymentId,
        convexUrl: release.convexUrl,
        convexSourceRevision: release.convexSourceRevision,
      },
      smokeOwnership: {
        runId: config.runId,
        namespace: "ae-release-smoke",
        businessId: createdFixture.businessId,
        businessName: createdFixture.businessName,
        businessCreated: true,
        offeringRef: createdFixture.offeringRef,
        publicationRef: createdFixture.publicationRef,
        ownerPrincipalDigest: principalDigest,
      },
      fixture: {
        offeringRef: createdFixture.offeringRef,
        offeringRevision: createdFixture.offeringRevision,
        offeringSourceHash: createdFixture.offeringSourceHash,
        publicationRef: createdFixture.publicationRef,
        publicationRevision: createdFixture.publicationRevision,
        operationRef: createdFixture.operationRef,
        cleanup: cleanupReadback,
      },
      discovery: {
        query: config.jobQuery,
        detailObservedAt: observedAt,
        serviceCount: services.serviceCount,
        endpointCount: services.endpointCount,
        ownerServiceId: ownerService.serviceId,
        ownerOfferingRef: ownerService.offeringRef,
        ownerOperationRef: owner.operationRef,
        ownerAuthentication: owner.authentication,
        controlServiceId: controlService.serviceId,
        controlOfferingRef: controlService.offeringRef,
        controlBusinessId: control.business.businessId,
        controlOperationRef: control.operationRef,
        controlAuthentication: control.authentication,
        ownerAuthority: {
          businessName: ownerAuthority.businessName,
          offeringName: ownerAuthority.offeringName,
          offeringRevision: ownerAuthority.offeringRevision,
          offeringSourceHash: ownerAuthority.offeringSourceHash,
          publicationRef: ownerAuthority.publicationRef,
          publicationRevision: ownerAuthority.publicationRevision,
          sourceDigest: ownerAuthority.sourceDigest,
          contractDigest: ownerAuthority.contractDigest,
          bindingId: ownerAuthority.bindingId,
          bindingDigest: ownerAuthority.bindingDigest,
        },
      },
      calls: {
        ownerHttp: completedCallReceipt(
          ownerInitial,
          ownerMeta,
          "http",
          ownerService.serviceId,
          principalDigest,
          config.input,
        ),
        ownerMcpReplay: completedCallReceipt(
          ownerReplay,
          ownerMeta,
          "mcp",
          ownerService.serviceId,
          principalDigest,
          config.input,
        ),
        controlHttp: completedCallReceipt(
          controlInitial,
          controlMeta,
          "http",
          controlService.serviceId,
          principalDigest,
          config.input,
        ),
      },
      usage: {
        baseline: baseline.usage,
        afterOwner: afterOwner.usage,
        afterReplay: afterReplay.usage,
        final: afterPayout.usage,
        ownerActivity,
        controlActivity,
        replayAdditionalMeteredCalls: 0,
        buyer: {
          baseline: baseline.buyer,
          afterOwner: afterOwner.buyer,
          afterReplay: afterReplay.buyer,
          afterControl: afterControl.buyer,
        },
        supplier: {
          baseline: baseline.supplier,
          afterControl: afterControl.supplier,
          afterPayout: afterPayout.supplier,
        },
      },
      money: {
        topup: topupReceipt(topup, topupProviderEvent, topupWebhookReplay),
        operationCharge,
        payout,
        conservation,
      },
      refusals: {
        withdrawnOperationCode: withdrawnReadback.code,
        revokedKeyCode: revoked.code,
        revokedCredentialDigest: revoked.credentialDigest,
      },
      claimBoundary:
        "one_smoke_owned_publication_one_owner_operation_one_paid_control_operation_one_live_topup_one_live_payout",
    };
    smokeReceipt = buildGatewayProductionSmokeReceipt(material);
  } catch (error) {
    primaryFailure = error;
  }
  const cleanupFailures: unknown[] = [];
  if (primaryFailure !== undefined) {
    try {
      await moneyRuntime.revokeCredential(
        controlOperationRef ?? createdFixture?.operationRef,
        config.input,
      );
    } catch (error) {
      cleanupFailures.push(error);
    }
  }
  if (createdFixture !== undefined && cleanup === undefined) {
    if (withdrawn === undefined) {
      try {
        withdrawn = await ownerRuntime.withdraw(createdFixture.operationRef);
      } catch (error) {
        cleanupFailures.push(error);
      }
    }
    try {
      await moneyRuntime.readWithdrawnOperation(createdFixture.operationRef);
    } catch (error) {
      cleanupFailures.push(error);
    }
    try {
      cleanup = await ownerRuntime.retireOffering();
    } catch (error) {
      cleanupFailures.push(error);
    }
  }
  if (cleanupFailures.length > 0) {
    if (primaryFailure !== undefined)
      throw gatewaySmokeFailureWithCleanup(primaryFailure, cleanupFailures);
    throw new GatewaySmokeError(
      "gateway_smoke_cleanup_failed",
      cleanupFailures.map(smokeErrorCode),
    );
  }
  if (primaryFailure !== undefined) throw primaryFailure;
  if (smokeReceipt === undefined)
    throw new GatewaySmokeError("gateway_smoke_receipt_not_built");
  return smokeReceipt;
}

async function discoverOperation(
  config: GatewaySmokeConfig,
  query: string,
  observedAt: number,
  role: "owner" | "control",
): Promise<PublicOperationDescriptor> {
  const response = await requestJson(
    config.fetch,
    `${config.baseUrl}/api/v1/market-operations/search`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, limit: 20 }),
    },
    "",
  );
  const search = operationSearchOutputSchema.safeParse(response.body);
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !search.success ||
    search.data.kind !== "ok"
  )
    throw new GatewaySmokeError("gateway_smoke_search_result_malformed");
  for (const candidate of search.data.items) {
    if (role === "owner" && candidate.authentication.kind !== "keyless")
      continue;
    if (role === "control" && candidate.authentication.kind === "keyless")
      continue;
    if (
      role === "control" &&
      gatewayOperationRejectionReason(candidate, observedAt) !== undefined
    )
      continue;
    const detail = await requestJson(
      config.fetch,
      `${config.baseUrl}/api/v1/market-operations/detail`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ operationRef: candidate.operationRef }),
      },
      "",
    );
    const found = operationDetailOutputSchema.safeParse(detail.body);
    if (
      detail.status >= 200 &&
      detail.status < 300 &&
      found.success &&
      found.data.kind === "found" &&
      found.data.operation.operationRef === candidate.operationRef &&
      found.data.operation.availability.posture === "routeable" &&
      found.data.operation.availability.validUntil !== undefined &&
      found.data.operation.availability.validUntil > observedAt &&
      found.data.operation.provenance.publisher === "provider_owned" &&
      (role === "owner" ||
        gatewayOperationRejectionReason(found.data.operation, observedAt) ===
          undefined)
    )
      return found.data.operation;
  }
  throw new GatewaySmokeError(`gateway_smoke_${role}_operation_not_found`);
}
export function gatewayOperationRejectionReason(
  operation: PublicOperationDescriptor,
  observedAt = Date.now(),
): string | undefined {
  if (operation.availability.posture !== "routeable")
    return "gateway_smoke_candidate_not_routeable";
  if (
    operation.availability.validUntil === undefined ||
    operation.availability.validUntil <= observedAt
  )
    return "gateway_smoke_candidate_stale";
  if (
    operation.provenance.publisher !== "provider_owned" &&
    operation.provenance.publisher !== "observed_external"
  )
    return "gateway_smoke_candidate_not_provider_owned_or_observed";
  if (operation.commercial.price.kind !== "fixed")
    return "gateway_smoke_candidate_price_not_fixed";
  if (operation.commercial.price.amount.units === "0")
    return "gateway_smoke_candidate_free";
  if (rescaleExactAmount(operation.commercial.price.amount, 2) === undefined)
    return "gateway_smoke_candidate_price_not_cent_exact";
  if (
    operation.commercial.priceEvidence?.priceDigest === undefined ||
    !digestSchema.safeParse(operation.commercial.priceEvidence.priceDigest)
      .success
  )
    return "gateway_smoke_candidate_price_evidence_missing";
  return undefined;
}
export function selectGatewayOperation(
  search: unknown,
  observedAt = Date.now(),
): PublicOperationDescriptor {
  const parsed = operationSearchOutputSchema.safeParse(search);
  if (!parsed.success || parsed.data.kind !== "ok")
    throw new GatewaySmokeError("gateway_smoke_search_result_malformed");
  for (const candidate of parsed.data.items)
    if (gatewayOperationRejectionReason(candidate, observedAt) === undefined)
      return candidate;
  throw new GatewaySmokeError(
    "gateway_smoke_no_current_paid_provider_operation",
  );
}
export function parseGatewayOperationDetail(
  response: GatewayHttpResponse,
  expectedOperationRef: string,
  observedAt = Date.now(),
): PublicOperationDescriptor {
  if (response.status < 200 || response.status >= 300)
    throw new GatewaySmokeError(`gateway_smoke_detail_http_${response.status}`);
  const parsed = operationDetailOutputSchema.safeParse(response.body);
  if (
    !parsed.success ||
    parsed.data.kind !== "found" ||
    parsed.data.operation.operationRef !== expectedOperationRef
  )
    throw new GatewaySmokeError("gateway_smoke_detail_result_malformed");
  const rejection = gatewayOperationRejectionReason(
    parsed.data.operation,
    observedAt,
  );
  if (rejection !== undefined) throw new GatewaySmokeError(rejection);
  return parsed.data.operation;
}
function requireHostedUrl(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0)
    throw new Error(`${name} is required`);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL`);
  }
  if (
    url.protocol !== "https:" ||
    /(?:localhost|127\.0\.0\.1|::1|\.local$)/iu.test(url.hostname)
  )
    throw new Error(`${name} must be hosted over HTTPS`);
  return url.toString().replace(/\/$/u, "");
}

function requiredBoundedSecret(
  value: string | undefined,
  name: string,
  maxBytes: number,
): string {
  if (value === undefined || value.trim().length === 0)
    throw new Error(`${name} is required`);
  if (new TextEncoder().encode(value).byteLength > maxBytes)
    throw new Error(`${name} exceeds the bounded size`);
  return value;
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

function createHostedRuntimeFromEnvironment(
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
    approvedAt: number;
  }>,
): Readonly<{ owner: HostedOwnerRuntime; money: HostedMoneyRuntime }> {
  const convexUrl = requireHostedUrl(
    options.env.AE_RELEASE_CONVEX_URL,
    "AE_RELEASE_CONVEX_URL",
  );
  const clerkSecretKey = required(
    options.env.CLERK_SECRET_KEY,
    "CLERK_SECRET_KEY",
  );
  const ownerSessionId = required(
    options.env.AE_GATEWAY_SMOKE_OWNER_CLERK_SESSION_ID,
    "AE_GATEWAY_SMOKE_OWNER_CLERK_SESSION_ID",
  );
  const ownerUserId = required(
    options.env.AE_GATEWAY_SMOKE_OWNER_CLERK_USER_ID,
    "AE_GATEWAY_SMOKE_OWNER_CLERK_USER_ID",
  );
  const controlBusinessId = required(
    options.env.AE_GATEWAY_SMOKE_CONTROL_BUSINESS_ID,
    "AE_GATEWAY_SMOKE_CONTROL_BUSINESS_ID",
  );
  const credentialId = required(
    options.env.AE_GATEWAY_SMOKE_CREDENTIAL_ID,
    "AE_GATEWAY_SMOKE_CREDENTIAL_ID",
  );
  const principalId = `clerk_api_key:${credentialId}`;
  const currency = required(
    options.env.AE_GATEWAY_SMOKE_CURRENCY ?? "USD",
    "AE_GATEWAY_SMOKE_CURRENCY",
  );
  const accountRef = accountRefForOwner(ownerUserId, currency);
  const topupIdempotencyKey = `${options.runId}:topup`;
  const payoutRef = required(
    options.env.AE_GATEWAY_SMOKE_PAYOUT_REF,
    "AE_GATEWAY_SMOKE_PAYOUT_REF",
  );
  const payoutIdempotencyKey = required(
    options.env.AE_GATEWAY_SMOKE_PAYOUT_IDEMPOTENCY_KEY,
    "AE_GATEWAY_SMOKE_PAYOUT_IDEMPOTENCY_KEY",
  );
  if (
    payoutRef !== `${options.runId}:payout` ||
    payoutIdempotencyKey !== `${options.runId}:payout`
  )
    throw new GatewaySmokeError("gateway_smoke_money_run_identity_mismatch");
  const amountRaw = required(
    options.env.AE_GATEWAY_SMOKE_TOPUP_AMOUNT_JSON,
    "AE_GATEWAY_SMOKE_TOPUP_AMOUNT_JSON",
  );
  let parsedTopupAmount: unknown;
  try {
    parsedTopupAmount = JSON.parse(amountRaw) as unknown;
  } catch {
    throw new GatewaySmokeError("gateway_smoke_topup_amount_invalid");
  }
  const topupConfig = productionCreditTopupConfig();
  const accountTemplate = topupConfig.minimumByCurrency[currency];
  const parsedAmount = exactAmountSchema.safeParse(parsedTopupAmount);
  const financials =
    accountTemplate === undefined || !parsedAmount.success
      ? undefined
      : calculateCreditTopupFinancials({
          amount: parsedAmount.data,
          accountCurrency: accountTemplate.currency,
          accountExponent: accountTemplate.exponent,
          config: topupConfig,
        });
  if (financials === undefined)
    throw new GatewaySmokeError("gateway_smoke_topup_amount_invalid");
  const topupAmount = financials.amount;
  const chargeAmount = financials.chargeAmount;
  if (
    compareExactAmounts(chargeAmount, APPROVED_EXTERNAL_MOVEMENT_CAP) ===
      undefined ||
    compareExactAmounts(chargeAmount, APPROVED_EXTERNAL_MOVEMENT_CAP) === 1
  )
    throw new GatewaySmokeError(
      "gateway_smoke_topup_charge_exceeds_approved_cap",
    );
  const stripeConfig = readStripeMoneyProviderConfig(options.env, "live");
  if (isMoneyRefusal(stripeConfig) || stripeConfig.mode !== "live")
    throw new GatewaySmokeError("stripe_setup_required");
  const stripe = new Stripe(stripeConfig.secretKey, {
    apiVersion: Stripe.API_VERSION,
    maxNetworkRetries: 0,
    timeout: STRIPE_REQUEST_TIMEOUT_MS,
    typescript: true,
  });

  const clerk = createClerkClient({ secretKey: clerkSecretKey });
  let credentialProofPromise: Promise<RunOwnedClerkKeyProof> | undefined;
  const credentialProof = async (): Promise<RunOwnedClerkKeyProof> => {
    credentialProofPromise ??= (async () => {
      const key = await clerk.apiKeys.verify(options.apiKey).catch(() => {
        throw new GatewaySmokeError("gateway_smoke_api_key_identity_invalid");
      });
      const session = await clerk.sessions.getSession(ownerSessionId);
      if (session.status !== "active" || session.userId !== ownerUserId)
        throw new GatewaySmokeError("gateway_smoke_owner_session_invalid");
      if (
        key.id !== credentialId ||
        key.subject !== ownerUserId ||
        key.name !== options.runId ||
        key.revoked ||
        key.expired ||
        key.scopes.length !== 1 ||
        key.scopes[0] !== MARKET_OPERATIONS_INVOKE_SCOPE
      )
        throw new GatewaySmokeError("gateway_smoke_api_key_identity_invalid");
      return {
        rawSecret: options.apiKey,
        credentialId: key.id,
        ownerUserId: key.subject,
        runId: key.name,
        lifecycle: "active",
        scopes: [MARKET_OPERATIONS_INVOKE_SCOPE],
      };
    })();
    return await credentialProofPromise;
  };
  const preflightCredential = async (): Promise<void> => {
    await credentialProof();
  };
  let transportPromise: Promise<ConvexSourceTransport> | undefined;
  const transport = async () => {
    transportPromise ??= (async () => {
      await credentialProof();
      const token = await clerk.sessions.getToken(ownerSessionId);
      return await createAuthenticatedSourceTransport({
        env: { ...options.env, CONVEX_URL: convexUrl },
        authObject: { isAuthenticated: true, getToken: async () => token.jwt },
        fetch: options.fetch,
      });
    })();
    return await transportPromise;
  };
  const context = {
    sourceWriteRequest: {
      method: "POST",
      initiatorOrigin: new URL(options.baseUrl).origin,
      targetOrigin: new URL(options.baseUrl).origin,
      targetPath: "/api/v1/release/operation-gateway",
      targetQuery: "",
      bodyDigest: "none",
    },
  };
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
  const accountQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:readCreditAccount",
  );
  const usageQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:readKeyUsage",
  );
  const activityQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:listCreditActivity",
  );
  const earningsQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:readOwnerProviderEarnings",
  );
  const topupQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:readCreditTopupCommand",
  );

  const readSnapshot = async (): Promise<HostedMoneySnapshot> => {
    const client = await transport();
    const [accountResult, usageResult, earningsResult] = await Promise.all([
      client.query(accountQuery, { principalId, currency }),
      client.query(usageQuery, { principalId, credentialId, currency }),
      client.query(earningsQuery, {}),
    ]);
    const account = record(accountResult);
    const usage = record(usageResult);
    if (account?.kind !== "ok" || usage?.kind !== "ok")
      throw new GatewaySmokeError("gateway_smoke_money_source_refused");
    const accountFields = { ...account };
    const usageFields = { ...usage };
    delete accountFields.kind;
    delete usageFields.kind;
    return {
      buyer: CreditAccountViewSchema.parse(accountFields),
      usage: KeyUsageViewSchema.parse(usageFields),
      supplier: parseGatewayOwnerProviderEarnings(
        earningsResult,
        controlBusinessId,
        currency,
      ),
    };
  };

  const readActivity = async (
    invocationRef: string,
  ): Promise<StrictCreditActivityView> => {
    const result = record(
      await (
        await transport()
      ).query(activityQuery, {
        principalId,
        credentialId,
        currency,
        paginationOpts: { numItems: 100, cursor: null },
      }),
    );
    const page = Array.isArray(result?.page) ? result.page : [];
    const matches = page.flatMap((item) => {
      const parsed = CreditActivityViewSchema.safeParse(item);
      return parsed.success && parsed.data.invocationRef === invocationRef
        ? [parsed.data]
        : [];
    });
    if (matches.length !== 1 || matches[0] === undefined) {
      throw new GatewaySmokeError(
        "gateway_smoke_money_activity_missing_or_ambiguous",
      );
    }
    return matches[0];
  };

  const readProviderTransfers = async (
    transferGroup: string,
  ): Promise<GatewayPayoutProviderTransferReadback> => {
    const transfers = await readStripeTransfersByGroup({
      config: stripeConfig,
      client: stripe,
      transferGroup,
    });
    if (isMoneyRefusal(transfers))
      throw new GatewaySmokeError(`gateway_smoke_payout_${transfers.code}`);
    return sanitizeGatewayPayoutProviderTransfers(
      transferGroup,
      transfers.map(({ transferId }) => transferId),
    );
  };

  const topupReadback = async (
    input: Readonly<{ externalRef: string; idempotencyKey: string }>,
  ): Promise<HostedTopupReadback> => {
    const payment = await readTopupPaymentThroughSource(input, context, {
      env: options.env,
      mode: "live",
      config: stripeConfig,
    });
    if (!("evidence" in payment))
      throw new GatewaySmokeError(`gateway_smoke_topup_${payment.code}`);
    if (
      payment.evidence.status !== "succeeded" ||
      payment.evidence.externalRef !== input.externalRef
    ) {
      throw new GatewaySmokeError("gateway_smoke_topup_payment_not_succeeded");
    }
    const result = record(await (await transport()).query(topupQuery, input));
    const command = record(result?.command);
    if (
      result?.kind !== "accepted" ||
      command === undefined ||
      command.state !== "succeeded"
    ) {
      throw new GatewaySmokeError("gateway_smoke_topup_command_missing");
    }
    const readString = (key: string): string => {
      const value = command[key];
      if (typeof value !== "string" || value.length === 0) {
        throw new GatewaySmokeError(`gateway_smoke_topup_${key}_missing`);
      }
      return value;
    };
    const readOptionalString = (key: string): string | undefined => {
      const value = command[key];
      return typeof value === "string" && value.length > 0 ? value : undefined;
    };
    if (
      readString("principalId") !== principalId ||
      readString("accountRef") !== accountRef ||
      readString("externalRef") !== input.externalRef ||
      readString("idempotencyKey") !== input.idempotencyKey
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_command_identity_mismatch",
      );
    const checkoutSessionDigest = readString("checkoutSessionDigest");
    const paymentIntentDigest = readOptionalString("paymentIntentDigest");
    const paymentId = readOptionalString("paymentId");
    if (
      readString("requestDigest") !== payment.evidence.requestDigest ||
      readString("metadataDigest") !== payment.evidence.metadataDigest ||
      readString("evidenceDigest") !== payment.evidence.evidenceDigest ||
      readString("providerEvidenceRef") !== payment.evidence.evidenceRef ||
      checkoutSessionDigest !== payment.evidence.checkoutSessionDigest ||
      paymentIntentDigest !== payment.evidence.paymentIntentDigest ||
      paymentId !== payment.evidence.paymentId
    )
      throw new GatewaySmokeError("gateway_smoke_topup_evidence_mismatch");
    const amount = (key: string): ExactAmount =>
      exactAmountSchema.parse({
        currency: readString("currency"),
        units: readString(key),
        exponent: command.exponent,
      });
    const checkoutCreatedAt = command.createdAt;
    if (
      !Number.isSafeInteger(checkoutCreatedAt) ||
      Number(checkoutCreatedAt) <= 0
    ) {
      throw new GatewaySmokeError("gateway_smoke_topup_created_at_missing");
    }
    return {
      topupCommandRef: readString("commandRef"),
      buyerPrincipalDigest: canonicalDigest({ principalId }),
      paymentEvidenceRef: payment.evidence.evidenceRef,
      paymentEvidenceDigest: payment.evidence.evidenceDigest,
      paymentRequestDigest: payment.evidence.requestDigest,
      paymentMetadataDigest: payment.evidence.metadataDigest,
      checkoutSessionDigest,
      ...(paymentIntentDigest === undefined ? {} : { paymentIntentDigest }),
      ...(paymentId === undefined ? {} : { paymentId }),
      externalRef: input.externalRef,
      idempotencyKey: input.idempotencyKey,
      stripeEventId: readString("appliedStripeEventId"),
      stripePayloadDigest: readString("appliedPayloadDigest"),
      transactionRef: readString("appliedTransactionRef"),
      creditAmount: amount("amountUnits"),
      processingFee: amount("processingFeeUnits"),
      chargeAmount: amount("chargeAmountUnits"),
      checkoutCreatedAt: Number(checkoutCreatedAt),
      buyerBalanceBefore: exactAmountSchema.parse(command.buyerBalanceBefore),
      buyerBalanceAfter: exactAmountSchema.parse(command.buyerBalanceAfter),
    };
  };

  const beginTopup = async (): Promise<GatewayTopupPreparationArtifact> => {
    const begun = await beginCreditTopupThroughSource(
      {
        principalId,
        amount: topupAmount,
        idempotencyKey: topupIdempotencyKey,
      },
      context,
      {
        env: options.env,
        mode: "live",
        config: stripeConfig,
        resolveOwnerId: async () => ownerUserId,
      },
    );
    if (begun.kind !== "ok")
      throw new GatewaySmokeError(`gateway_smoke_topup_${begun.code}`);
    const evidence = begun.session.evidence;
    if (
      evidence.status !== "pending" ||
      evidence.observedAt < options.approvedAt ||
      !sameAmount(evidence.amount, chargeAmount)
    )
      throw new GatewaySmokeError("gateway_smoke_topup_preparation_invalid");
    return topupPreparationSchema.parse({
      schemaVersion: 1,
      kind: "operation_gateway_topup_preparation",
      status: "awaiting_payment",
      sourceRevision: required(
        options.env.AE_RELEASE_SOURCE_REVISION,
        "AE_RELEASE_SOURCE_REVISION",
      ),
      runId: options.runId,
      approvedAt: new Date(options.approvedAt).toISOString(),
      checkoutCreatedAt: new Date(evidence.observedAt).toISOString(),
      commandRef: begun.commandRef,
      externalRef: evidence.externalRef,
      idempotencyKey: topupIdempotencyKey,
      creditAmount: topupAmount,
      chargeAmount,
      paymentRequestDigest: evidence.requestDigest,
      paymentMetadataDigest: evidence.metadataDigest,
      checkoutSessionDigest: evidence.checkoutSessionDigest,
      operatorAction:
        "complete_the_stripe_checkout_before_dispatching_complete",
    });
  };

  const readTopupWebhookCapture = async (
    externalRef: string,
    stripeEventId: string,
    checkoutCreatedAt: number,
  ): Promise<Readonly<{ rawBody: string; signature: string }>> => {
    let startingAfter: string | undefined;
    const created = Math.floor(checkoutCreatedAt / 1_000);
    try {
      for (let page = 0; page < MAX_TOPUP_EVENT_PAGES; page += 1) {
        const events = await stripe.events.list({
          types: [
            "checkout.session.completed",
            "checkout.session.async_payment_succeeded",
          ],
          created: { gte: created },
          limit: 100,
          ...(startingAfter === undefined
            ? {}
            : { starting_after: startingAfter }),
        });
        for (const event of events.data) {
          if (event.id !== stripeEventId) continue;
          const eventObject = record(event.data.object);
          if (eventObject?.id !== externalRef) continue;
          if (!event.livemode)
            throw new GatewaySmokeError(
              "gateway_smoke_topup_webhook_event_mode_mismatch",
            );
          const rawBody = JSON.stringify(event);
          if (
            new TextEncoder().encode(rawBody).byteLength >
            MAX_TOPUP_WEBHOOK_RAW_BODY_BYTES
          )
            throw new GatewaySmokeError(
              "gateway_smoke_topup_webhook_event_too_large",
            );
          const signature = stripe.webhooks.generateTestHeaderString({
            payload: rawBody,
            secret: stripeConfig.webhookSecret,
          });
          if (
            new TextEncoder().encode(signature).byteLength >
            MAX_TOPUP_WEBHOOK_SIGNATURE_BYTES
          )
            throw new GatewaySmokeError(
              "gateway_smoke_topup_webhook_signature_too_large",
            );
          return { rawBody, signature };
        }
        if (!events.has_more || events.data.length === 0) break;
        const last = events.data[events.data.length - 1];
        if (last === undefined || last.id === startingAfter) break;
        startingAfter = last.id;
      }
    } catch (error) {
      if (error instanceof GatewaySmokeError) throw error;
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_event_lookup_failed",
      );
    }
    throw new GatewaySmokeError("gateway_smoke_topup_webhook_event_not_found");
  };

  const observeTopup = async (
    expected: GatewayTopupPreparationArtifact,
  ): Promise<GatewayTopupObservation> => {
    const sourceRevision = required(
      options.env.AE_RELEASE_SOURCE_REVISION,
      "AE_RELEASE_SOURCE_REVISION",
    );
    if (
      expected.sourceRevision !== sourceRevision ||
      expected.runId !== options.runId ||
      expected.idempotencyKey !== topupIdempotencyKey ||
      new Date(expected.approvedAt).getTime() !== options.approvedAt ||
      !sameAmount(expected.creditAmount, topupAmount) ||
      !sameAmount(expected.chargeAmount, chargeAmount)
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_preparation_identity_mismatch",
      );

    const readback = await topupReadback(expected);
    if (
      readback.topupCommandRef !== expected.commandRef ||
      readback.paymentRequestDigest !== expected.paymentRequestDigest ||
      readback.paymentMetadataDigest !== expected.paymentMetadataDigest ||
      readback.checkoutSessionDigest !== expected.checkoutSessionDigest ||
      readback.checkoutCreatedAt !==
        new Date(expected.checkoutCreatedAt).getTime()
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_preparation_binding_mismatch",
      );

    const { rawBody, signature } = await readTopupWebhookCapture(
      expected.externalRef,
      readback.stripeEventId,
      readback.checkoutCreatedAt,
    );
    const verified = await verifyStripeMoneyWebhook({
      rawBody,
      signature,
      config: stripeConfig,
      mode: "live",
      client: stripe,
    });
    if (
      isMoneyRefusal(verified) ||
      verified.kind !== "checkout" ||
      verified.status !== "paid" ||
      verified.externalRef !== expected.externalRef ||
      verified.commandRef !== readback.topupCommandRef ||
      verified.stripeEventId !== readback.stripeEventId ||
      verified.payloadDigest !== readback.stripePayloadDigest
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_identity_or_verification_failed",
      );

    const providerEvent = topupProviderEventSchema.parse({
      status: "observed",
      stripeEventId: verified.stripeEventId,
      eventType: verified.eventType,
      externalRef: verified.externalRef,
      commandRef: verified.commandRef,
      runId: expected.runId,
      observedAt: new Date(verified.observedAt).toISOString(),
      amount: verified.amount,
    });

    const buyerBeforeReplay = await readSnapshot();
    if (
      !sameAmount(buyerBeforeReplay.buyer.balance, readback.buyerBalanceAfter)
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_replay_before_balance_mismatch",
      );
    const bypassSecret = resolveVercelProtectionBypassSecret(options.env);
    const postWebhookReplay = async (): Promise<
      Readonly<{
        status: number;
        replay: Record<string, unknown> | undefined;
      }>
    > => {
      const response = await options.fetch(
        `${options.baseUrl}/api/stripe/webhook`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "stripe-signature": signature,
            ...(bypassSecret === undefined
              ? {}
              : { "x-vercel-protection-bypass": bypassSecret }),
          },
          body: rawBody,
        },
      );
      let responseBody: unknown;
      try {
        responseBody = JSON.parse(await response.text()) as unknown;
      } catch {
        throw new GatewaySmokeError(
          "gateway_smoke_topup_webhook_replay_response_malformed",
        );
      }
      return { status: response.status, replay: record(responseBody) };
    };
    const firstReplay = await postWebhookReplay();
    const secondReplay = await postWebhookReplay();
    const assertReplay = (
      result: Readonly<{
        status: number;
        replay: Record<string, unknown> | undefined;
      }>,
    ): void => {
      if (
        result.status !== 200 ||
        result.replay?.kind !== "accepted" ||
        result.replay.status !== "replayed" ||
        result.replay.appliedRef !== readback.transactionRef
      )
        throw new GatewaySmokeError(
          "gateway_smoke_topup_webhook_replay_not_confirmed",
        );
    };
    assertReplay(firstReplay);
    assertReplay(secondReplay);
    const replay = secondReplay.replay;
    if (replay === undefined)
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_replay_not_confirmed",
      );

    const buyerAfterReplay = await readSnapshot();
    const creditDelta = subtractExactAmounts(
      buyerAfterReplay.buyer.balance,
      buyerBeforeReplay.buyer.balance,
    );
    if (
      creditDelta === undefined ||
      !sameAmount(creditDelta, zeroAmount(creditDelta))
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_replay_changed_credit",
      );
    const replayReadback = await topupReadback(expected);
    if (
      replayReadback.transactionRef !== readback.transactionRef ||
      replayReadback.stripeEventId !== readback.stripeEventId ||
      replayReadback.stripePayloadDigest !== readback.stripePayloadDigest ||
      !sameAmount(
        replayReadback.buyerBalanceBefore,
        readback.buyerBalanceBefore,
      ) ||
      !sameAmount(
        replayReadback.buyerBalanceAfter,
        buyerAfterReplay.buyer.balance,
      )
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_replay_readback_mismatch",
      );
    const webhookReplay = topupWebhookReplaySchema.parse({
      status: "replayed",
      signatureVerified: true,
      stripeEventId: verified.stripeEventId,
      stripePayloadDigest: verified.payloadDigest,
      rawBodyDigest: canonicalDigest(rawBody),
      signatureDigest: canonicalDigest({
        format: "stripe-signature:v1",
        signature,
      }),
      commandRef: readback.topupCommandRef,
      transactionRef: readback.transactionRef,
      appliedRef: replay.appliedRef,
      buyerBalanceBefore: buyerBeforeReplay.buyer.balance,
      buyerBalanceAfter: buyerAfterReplay.buyer.balance,
      creditDelta,
    });
    return { readback, providerEvent, webhookReplay };
  };

  const payoutReadback = async (
    input: Readonly<{
      payoutRef: string;
      idempotencyKey: string;
      amount?: ExactAmount;
    }>,
    begin: boolean,
  ): Promise<StrictLivePayoutReceipt> => {
    const result = begin
      ? await runOwnerPayoutTransferThroughSource(
          {
            businessId: controlBusinessId,
            currency,
            payoutRef: input.payoutRef,
            amount: exactAmountSchema.parse(input.amount),
            idempotencyKey: input.idempotencyKey,
          },
          context,
        )
      : await readOwnerPayoutTransferThroughSource(
          {
            businessId: controlBusinessId,
            currency,
            payoutRef: input.payoutRef,
            idempotencyKey: input.idempotencyKey,
          },
          context,
        );
    if (result.kind !== "ok")
      throw new GatewaySmokeError(`gateway_smoke_payout_${result.code}`);
    const transfer = record(result.transfer);
    if (
      transfer === undefined ||
      transfer.state !== "paid" ||
      transfer.transferStatus !== "succeeded" ||
      typeof transfer.stripeTransferId !== "string" ||
      typeof transfer.evidenceDigest !== "string"
    )
      throw new GatewaySmokeError(
        "gateway_smoke_payout_transfer_not_succeeded",
      );
    return StrictLivePayoutReceiptSchema.parse({
      payoutRef: transfer.payoutRef,
      payoutCommandId: transfer.payoutCommandId,
      supplierBusinessId: controlBusinessId,
      payoutAccountRef: accountRefForProvider(controlBusinessId, currency),
      stripeAccountDigest: canonicalDigest({
        format: "stripe-account:v1",
        destinationAccountId: transfer.destinationAccountId,
      }),
      stripeTransferDigest: canonicalDigest({
        format: "stripe-transfer:v1",
        transferId: transfer.stripeTransferId,
      }),
      transferEvidenceDigest: transfer.evidenceDigest,
      providerNetAmount: transfer.amount,
      providerHeldBefore: transfer.providerHeldBefore,
      providerHeldAfter: transfer.providerHeldAfter,
      providerPaidBefore: transfer.providerPaidBefore,
      providerPaidAfter: transfer.providerPaidAfter,
      replayAdditionalDebits: 0,
    });
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

  let revokePromise:
    | Promise<
        Readonly<{
          kind: "refused";
          code: "authentication_required";
          credentialDigest: string;
        }>
      >
    | undefined;
  const revokeCredential = async (
    operationRef: string | undefined,
    input: Readonly<Record<string, JsonValue>>,
  ): Promise<
    Readonly<{
      kind: "refused";
      code: "authentication_required";
      credentialDigest: string;
    }>
  > => {
    revokePromise ??= (async () => {
      const proof = await credentialProof();
      const revoked = await clerk.apiKeys.revoke({
        apiKeyId: proof.credentialId,
        revocationReason: "Agentic Economy release smoke completed",
      });
      const current = await clerk.apiKeys.get(proof.credentialId);
      if (
        revoked.id !== proof.credentialId ||
        !revoked.revoked ||
        current.id !== proof.credentialId ||
        !current.revoked
      ) {
        throw new GatewaySmokeError(
          "gateway_smoke_api_key_revocation_unconfirmed",
        );
      }
      if (operationRef !== undefined) {
        const idempotencyKey = `ae-release-smoke:revoked:${canonicalDigest({ credentialId: proof.credentialId, operationRef })}`;
        const response = await requestJson(
          options.fetch,
          `${options.baseUrl}${OPERATION_INVOKE_HTTP_PATH}`,
          {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              authorization: `Bearer ${options.apiKey}`,
            },
            body: JSON.stringify({ operationRef, input, idempotencyKey }),
          },
          options.apiKey,
        );
        const problem = record(response.body);
        if (
          response.status !== 401 ||
          problem?.code !== "authentication_required"
        ) {
          throw new GatewaySmokeError("gateway_smoke_revoked_key_not_refused");
        }
      }
      return {
        kind: "refused",
        code: "authentication_required",
        credentialDigest: canonicalDigest({
          credentialId: proof.credentialId,
        }),
      };
    })();
    return await revokePromise;
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
    readActivity,
    readAuthority,
    withdraw,
    retireOffering,
  };
  const money: HostedMoneyRuntime = {
    mode: "live",
    principalId,
    accountRef,
    businessId: controlBusinessId,
    readWithdrawnOperation,
    preflightCredential,
    revokeCredential,
    credentialId,
    topupIdempotencyKey,
    topupChargeAmount: chargeAmount,
    payoutRef,
    payoutIdempotencyKey,
    readSnapshot,
    readProviderTransfers,
    beginTopup,
    observeTopup,
    readControlActivity: readActivity,
    beginPayout: async (input) => await payoutReadback(input, true),
    readPayout: async (input) => await payoutReadback(input, false),
  };
  return { owner, money };
}


export async function main(
  env: Record<string, string | undefined> = process.env,
  args: readonly string[] = process.argv.slice(2),
): Promise<GatewayProductionSmokeReceipt | GatewayTopupPreparationArtifact> {
  const path = receiptPathFromArguments(args, env);
  if (path === undefined)
    throw new GatewaySmokeError("gateway_smoke_receipt_argument_required");
  const config = gatewaySmokeConfigFromEnvironment(env, path);
  if (config.topupStage === "prepare") {
    const preparation = await config.money.beginTopup();
    const written = await writeGatewayTopupPreparationArtifact(
      preparation,
      path,
    );
    process.stdout.write(
      `Hosted Operation gateway top-up prepared; artifact=${resolveGatewayReceiptPath(path)}; checkout=${preparation.externalRef}; amount=${preparation.chargeAmount.currency}:${preparation.chargeAmount.units}\n`,
    );
    return written;
  }
  const preparationPath = config.topupPreparationPath;
  if (preparationPath === undefined)
    throw new GatewaySmokeError(
      "gateway_smoke_topup_preparation_path_required",
    );
  const preparation = parseGatewayTopupPreparationText(
    await readFile(resolveGatewayReceiptPath(preparationPath), "utf8"),
  );
  const receipt = await runGatewayProductionSmoke({
    ...config,
    topupPreparation: preparation,
    receiptPath: path,
  });
  const written = await writeGatewayProductionSmokeReceipt(receipt, path);
  process.stdout.write(
    `Hosted Operation gateway smoke passed; receipt=${resolveGatewayReceiptPath(path)}\n`,
  );
  return written;
}
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main();
  } catch (error) {
    const cleanup =
      error instanceof GatewaySmokeError && error.cleanupCodes.length > 0
        ? `; cleanup=${error.cleanupCodes.join(",")}`
        : "";
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}${cleanup}\n`,
    );
    process.exitCode = 1;
  }
}
