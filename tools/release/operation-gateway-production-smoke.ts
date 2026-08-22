import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { canonicalDigest } from "../../src/modules/common/canonical-digest";

import {
  jsonValueSchema,
  validateJsonSchema,
  type JsonValue,
} from "../../src/modules/capability-contract/public";
import {
  readStripeMoneyProviderConfig,
} from "../../src/lib/server/stripe-money-provider";
import {
  CreditActivityViewSchema,
  isMoneyRefusal,
  StrictLivePayoutReceiptSchema,
  accountRefForProvider,
  addExactAmounts,
  compareExactAmounts,
  rescaleExactAmount,
  subtractExactAmounts,
} from "../../src/modules/money/public";
import {
  APPROVED_EXTERNAL_MOVEMENT_CAP,
  MAX_REF_LENGTH,
  required,
  sameAmount,
  zeroAmount,
} from "./operation-gateway-production-smoke-receipt";
import {
  GatewaySmokeError,
  buildGatewayProductionSmokeReceipt,
  gatewaySmokeFailureWithCleanup,
  parseGatewayTopupPreparationText,
  receiptPathFromArguments,
  resolveGatewayReceiptPath,
  smokeErrorCode,
  writeGatewayProductionSmokeReceipt,
  writeGatewayTopupPreparationArtifact,
  type GatewayProductionSmokeReceipt,
  type GatewayProductionSmokeReceiptMaterial,
  type GatewayTopupPreparationArtifact,
} from "./operation-gateway-production-smoke-receipt";
import {
  buildConservation,
  buildGatewayPayoutReceipt,
  buildOperationCharge,
  completedCallReceipt,
  topupReceipt,
} from "./operation-gateway-production-smoke-money";
import {
  assertGatewayInvocationReplayParity,
  assertGatewayPaidCompletion,
  invokeGatewayOperation,
  pollGatewayOperation,
  readFreshProcessGatewayStatus,
  readGatewayCompletionMetadata,
  requireCompletedInvocation,
  stableIdempotencyKey,
} from "./operation-gateway-production-smoke-invocation";
import {
  discoverGatewayServices,
  discoverOperation,
  matchGatewayServiceOperation,
} from "./operation-gateway-production-smoke-discovery";
import {
  createHostedRuntimeFromEnvironment,
  requireHostedUrl,
  type GatewayOwnerFixtureCleanup,
  type GatewayOwnerFixtureIdentity,
  type HostedMoneyRuntime,
  type HostedOwnerRuntime,
} from "./operation-gateway-production-smoke-hosted-runtime";
import { resolveVercelProtectionBypassSecret } from "./vercel-protection-bypass";

export type {
  HostedMoneyRuntime,
  HostedOwnerRuntime,
} from "./operation-gateway-production-smoke-hosted-runtime";

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

export {
  discoverGatewayServices,
  gatewayOperationRejectionReason,
  matchGatewayServiceOperation,
} from "./operation-gateway-production-smoke-discovery";
export type {
  GatewayServiceDiscovery,
  GatewayServiceOperation,
} from "./operation-gateway-production-smoke-discovery";
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

const MAX_JOB_QUERY_LENGTH = 200;
const MAX_INPUT_JSON_BYTES = 64 * 1024;
const MAX_OWNER_OPENAPI_DOCUMENT_BYTES = 256 * 1024;

const boundedInputSchema = z.record(
  z.string().trim().min(1).max(200),
  jsonValueSchema,
);

const ownerOpenApiMethodSchema = z.enum(["get", "post"]);

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
  await ownerRuntime.preflightCredential();
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
      await moneyRuntime.readControlActivity(ownerInitial.invocationRef),
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
    await ownerRuntime.readWithdrawnOperation(createdFixture.operationRef);
    const cleanupReadback = await ownerRuntime.retireOffering();
    cleanup = cleanupReadback;
    const revoked = await ownerRuntime.revokeCredential(
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
      await ownerRuntime.revokeCredential(
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
      await ownerRuntime.readWithdrawnOperation(createdFixture.operationRef);
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
