import { createClerkClient } from "@clerk/backend";
import Stripe from "stripe";
import { execFile } from "node:child_process";
import { mkdir, open, readFile, unlink, link } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { canonicalDigest } from "../../src/modules/common/canonical-digest";
import { canonicalProviderWebsite } from "../../src/modules/business/public";

import { MARKET_OPERATIONS_INVOKE_SCOPE } from "../../src/modules/agent-access/contract";
import {
  jsonValueSchema,
  validateJsonSchema,
  type JsonValue,
} from "../../src/modules/capability-contract/public";
import {
  operationInvokeRecoveryResultSchema,
  operationInvokeStatusResultSchema,
} from "../../src/modules/capability-execution/operation-recovery.actions";
import {
  operationInvokeResultSchema,
  operationInvokeUsageSchema,
  type OperationInvokeResult,
  type OperationInvokeUsageSummary,
} from "../../src/modules/capability-execution/operation-invoke-contracts";
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
import { evaluateLiveMoneyGate } from "../../src/modules/money/public";
import { PublicServicesApiSchemaVersion } from "../../src/modules/registry/public";
import {
  CreditAccountViewSchema,
  CreditActivityViewSchema,
  exactAmountSchema,
  isMoneyRefusal,
  KeyUsageViewSchema,
  ProviderEarningsViewSchema,
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
import { verifyHostedCustomerRequestRelease } from "./verify-customer-request-release";
import { resolveVercelProtectionBypassSecret } from "./vercel-protection-bypass";

const MAX_JOB_QUERY_LENGTH = 200;
const MAX_INPUT_JSON_BYTES = 64 * 1024;
const MAX_STATUS_WAIT_MS = 60_000;
const MAX_TOPUP_EVENT_PAGES = 10;
const STRIPE_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_STATUS_DELAY_MS = 250;
const MAX_STATUS_DELAY_MS = 2_000;
const MAX_REF_LENGTH = 500;
const FRESH_STATUS_PROCESS_TIMEOUT_MS = 15_000;
const MAX_FRESH_STATUS_STDOUT_BYTES = 64 * 1024;
const MAX_FRESH_STATUS_STDERR_BYTES = 16 * 1024;
const RELEASE_RECEIPT_DIRECTORY = "output/release";
const SERVICES_PAGE_LIMIT = 50;
const MAX_SERVICE_PAGES = 100;
const MAX_SERVICE_COUNT = SERVICES_PAGE_LIMIT * MAX_SERVICE_PAGES;
const MAX_ENDPOINT_COUNT = 50_000;
const MAX_PROVIDER_TRANSFER_COUNT = 100;
const MAX_OWNER_OPENAPI_DOCUMENT_BYTES = 256 * 1024;
const MAX_TOPUP_WEBHOOK_RAW_BODY_BYTES = 256 * 1024;
const MAX_TOPUP_WEBHOOK_SIGNATURE_BYTES = 4 * 1024;
const boundedRefSchema = z.string().trim().min(1).max(MAX_REF_LENGTH);
const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const operationRefSchema = z.string().regex(/^operation:v1:[0-9a-f]{64}$/u);
const boundedInputSchema = z.record(
  z.string().trim().min(1).max(200),
  jsonValueSchema,
);
const APPROVED_EXTERNAL_MOVEMENT_CAP: ExactAmount = Object.freeze({
  currency: "USD",
  units: "600",
  exponent: 2,
});
const ownerOpenApiMethodSchema = z.enum(["get", "post"]);
const authenticationSchema = z.union([
  z.strictObject({ kind: z.literal("keyless") }),
  z.strictObject({
    kind: z.literal("platform_credential"),
    scheme: z.literal("api_key"),
    in: z.enum(["query", "header"]),
    name: boundedRefSchema,
  }),
  z.strictObject({
    kind: z.literal("platform_credential"),
    scheme: z.literal("bearer"),
  }),
  z.strictObject({ kind: z.literal("x402") }),
  z.strictObject({ kind: z.literal("unknown") }),
]);
const strictCallReceiptSchema = z.strictObject({
  transport: z.enum(["http", "mcp"]),
  serviceId: boundedRefSchema,
  principalDigest: digestSchema,
  operationRef: operationRefSchema,
  invocationRef: boundedRefSchema,
  attemptRef: boundedRefSchema,
  terminalState: z.literal("completed"),
  effectGeneration: z.number().int().positive(),
  inputDigest: digestSchema,
  outputDigest: digestSchema,
  evidenceDigest: boundedRefSchema,
  usageDigest: digestSchema,
  charge: z.strictObject({
    activityRef: boundedRefSchema,
    chargeState: z.enum(["free_tier", "paid"]),
    grossAmount: exactAmountSchema,
    priceDigest: digestSchema,
  }),
});
const selectedOperationSchema = z.strictObject({
  query: boundedRefSchema,
  detailObservedAt: z.number().int().nonnegative(),
  serviceCount: z.number().int().nonnegative().max(MAX_SERVICE_COUNT),
  endpointCount: z.number().int().nonnegative().max(MAX_ENDPOINT_COUNT),
  ownerServiceId: boundedRefSchema,
  ownerOfferingRef: boundedRefSchema,
  ownerOperationRef: operationRefSchema,
  ownerAuthentication: authenticationSchema,
  controlServiceId: boundedRefSchema,
  controlOfferingRef: boundedRefSchema,
  controlBusinessId: boundedRefSchema,
  controlOperationRef: operationRefSchema,
  controlAuthentication: authenticationSchema,
  ownerAuthority: z.strictObject({
    businessName: boundedRefSchema,
    offeringName: boundedRefSchema,
    offeringRevision: z.number().int().positive(),
    offeringSourceHash: digestSchema,
    publicationRef: boundedRefSchema,
    publicationRevision: z.number().int().positive(),
    sourceDigest: digestSchema,
    contractDigest: digestSchema,
    bindingId: boundedRefSchema,
    bindingDigest: digestSchema,
  }),
});
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
const ownerProviderPayoutReadbackSchema = z.strictObject({
  kind: z.literal("ok"),
  businessId: boundedRefSchema,
  accountState: z.enum([
    "missing",
    "not_started",
    "onboarding_started",
    "submitted",
    "restricted",
    "ready",
  ]),
  payoutState: z
    .enum([
      "review",
      "held_kyc",
      "held_threshold",
      "transfer_pending",
      "paid",
      "reversed",
      "failed",
      "outcome_unknown",
    ])
    .optional(),
  payoutRef: boundedRefSchema.optional(),
  payoutCommandId: boundedRefSchema.optional(),
  idempotencyKey: boundedRefSchema.optional(),
  stripeTransferId: boundedRefSchema.optional(),
  transferStatus: z
    .enum(["pending", "succeeded", "failed", "reversed", "outcome_unknown"])
    .optional(),
  providerRecoveryDeadlineAt: z.number().finite().optional(),
  recoveryState: z
    .enum(["provider_id", "idempotency_key", "admin_intervention"])
    .optional(),
  stripeAccountId: boundedRefSchema.optional(),
  accountVersion: z.number().int().nonnegative().optional(),
  lastStripeEventId: boundedRefSchema.optional(),
  lastStripePayloadDigest: boundedRefSchema.optional(),
  providerObjectDigest: boundedRefSchema.optional(),
  providerNet: exactAmountSchema,
  destinationAccountId: boundedRefSchema.optional(),
  requestDigest: boundedRefSchema.optional(),
  evidenceDigest: boundedRefSchema.optional(),
  providerHeldBefore: exactAmountSchema.optional(),
  providerHeldAfter: exactAmountSchema.optional(),
  providerPaidBefore: exactAmountSchema.optional(),
  providerPaidAfter: exactAmountSchema.optional(),
  minimumPayout: exactAmountSchema,
  evidence: z.literal("source"),
});
const ownerProviderEarningsReadbackSchema = z.strictObject({
  kind: z.literal("available"),
  businessId: boundedRefSchema,
  accountsTruncated: z.boolean(),
  accounts: z.array(
    z.strictObject({
      currency: boundedRefSchema,
      earnings: ProviderEarningsViewSchema.extend({ kind: z.literal("ok") }),
      payout: ownerProviderPayoutReadbackSchema,
    }),
  ),
});
const topupProviderEventSchema = z.strictObject({
  status: z.literal("observed"),
  stripeEventId: boundedRefSchema,
  eventType: z.enum([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
  ]),
  externalRef: boundedRefSchema,
  commandRef: boundedRefSchema,
  runId: boundedRefSchema,
  observedAt: z.iso.datetime(),
  amount: exactAmountSchema,
});
const topupPreparationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("operation_gateway_topup_preparation"),
  status: z.literal("awaiting_payment"),
  sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  runId: boundedRefSchema,
  approvedAt: z.iso.datetime(),
  checkoutCreatedAt: z.iso.datetime(),
  commandRef: boundedRefSchema,
  externalRef: boundedRefSchema,
  idempotencyKey: boundedRefSchema,
  creditAmount: exactAmountSchema,
  chargeAmount: exactAmountSchema,
  paymentRequestDigest: digestSchema,
  paymentMetadataDigest: digestSchema,
  checkoutSessionDigest: digestSchema,
  operatorAction: z.literal(
    "complete_the_stripe_checkout_before_dispatching_complete",
  ),
});
const topupWebhookReplaySchema = z.strictObject({
  status: z.literal("replayed"),
  signatureVerified: z.literal(true),
  stripeEventId: boundedRefSchema,
  stripePayloadDigest: digestSchema,
  rawBodyDigest: digestSchema,
  signatureDigest: digestSchema,
  commandRef: boundedRefSchema,
  transactionRef: boundedRefSchema,
  appliedRef: boundedRefSchema,
  buyerBalanceBefore: exactAmountSchema,
  buyerBalanceAfter: exactAmountSchema,
  creditDelta: exactAmountSchema,
});
const topupReceiptSchema = z.strictObject({
  topupCommandRef: boundedRefSchema,
  buyerPrincipalDigest: digestSchema,
  paymentEvidenceRef: boundedRefSchema,
  paymentEvidenceDigest: digestSchema,
  paymentRequestDigest: digestSchema,
  paymentMetadataDigest: digestSchema,
  checkoutSessionDigest: digestSchema,
  paymentIntentDigest: digestSchema.optional(),
  paymentId: boundedRefSchema.optional(),
  idempotencyKey: boundedRefSchema,
  externalRef: boundedRefSchema,
  stripeEventId: boundedRefSchema,
  stripePayloadDigest: digestSchema,
  transactionRef: boundedRefSchema,
  creditAmount: exactAmountSchema,
  processingFee: exactAmountSchema,
  chargeAmount: exactAmountSchema,
  buyerBalanceBefore: exactAmountSchema,
  buyerBalanceAfter: exactAmountSchema,
  providerEvent: topupProviderEventSchema,
  webhookReplay: topupWebhookReplaySchema,
});
const operationChargeReceiptSchema = z.strictObject({
  controlInvocationRef: boundedRefSchema,
  controlAttemptRef: boundedRefSchema,
  buyerPrincipalDigest: digestSchema,
  supplierBusinessId: boundedRefSchema,
  activityRef: boundedRefSchema,
  transactionRef: boundedRefSchema,
  buyerDebit: exactAmountSchema,
  supplierGrossAccrual: exactAmountSchema,
  aeRake: exactAmountSchema,
  providerNetAccrual: exactAmountSchema,
});
export const GatewayPayoutProviderTransferReadbackSchema = z.strictObject({
  payoutRef: boundedRefSchema,
  count: z.number().int().nonnegative().max(MAX_PROVIDER_TRANSFER_COUNT),
  transferIdsDigest: digestSchema,
  transferIdDigests: z.array(digestSchema).max(MAX_PROVIDER_TRANSFER_COUNT),
});
export const GatewayPayoutReceiptSchema = StrictLivePayoutReceiptSchema.extend({
  providerTransfers: z.strictObject({
    beforePayout: GatewayPayoutProviderTransferReadbackSchema,
    afterInitialPayout: GatewayPayoutProviderTransferReadbackSchema,
    afterReplay: GatewayPayoutProviderTransferReadbackSchema,
  }),
});
const conservationReceiptSchema = z.strictObject({
  buyerDebit: exactAmountSchema,
  supplierGrossAccrual: exactAmountSchema,
  aeRake: exactAmountSchema,
  providerNet: exactAmountSchema,
  paidOut: exactAmountSchema,
  held: exactAmountSchema,
});

const fixtureSchema = z.strictObject({
  offeringRef: boundedRefSchema,
  offeringRevision: z.number().int().positive(),
  offeringSourceHash: digestSchema,
  publicationRef: boundedRefSchema,
  publicationRevision: z.number().int().positive(),
  operationRef: operationRefSchema,
  cleanup: z.strictObject({
    publicationState: z.literal("withdrawn"),
    offeringStatus: z.literal("retired"),
  }),
});
export const GatewayProductionSmokeReceiptMaterialSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("operation_gateway_production_smoke"),
  status: z.literal("passed"),
  observedAt: z.iso.datetime(),
  deployment: z.strictObject({
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
    vercelDeploymentId: boundedRefSchema,
    vercelUrl: z.url().startsWith("https://"),
    productionUrl: z.url().startsWith("https://"),
    convexDeploymentId: boundedRefSchema,
    convexUrl: z.url().startsWith("https://"),
    convexSourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
  }),
  smokeOwnership: z.strictObject({
    runId: boundedRefSchema,
    namespace: z.literal("ae-release-smoke"),
    businessId: boundedRefSchema,
    businessName: boundedRefSchema,
    businessCreated: z.literal(true),
    offeringRef: boundedRefSchema,
    publicationRef: boundedRefSchema,
    ownerPrincipalDigest: digestSchema,
  }),
  fixture: fixtureSchema,
  discovery: selectedOperationSchema,
  calls: z.strictObject({
    ownerHttp: strictCallReceiptSchema,
    ownerMcpReplay: strictCallReceiptSchema,
    controlHttp: strictCallReceiptSchema,
  }),
  usage: z.strictObject({
    baseline: KeyUsageViewSchema,
    afterOwner: KeyUsageViewSchema,
    afterReplay: KeyUsageViewSchema,
    final: KeyUsageViewSchema,
    ownerActivity: CreditActivityViewSchema,
    controlActivity: CreditActivityViewSchema,
    replayAdditionalMeteredCalls: z.literal(0),
    buyer: z.strictObject({
      baseline: CreditAccountViewSchema,
      afterOwner: CreditAccountViewSchema,
      afterReplay: CreditAccountViewSchema,
      afterControl: CreditAccountViewSchema,
    }),
    supplier: z.strictObject({
      baseline: ProviderEarningsViewSchema,
      afterControl: ProviderEarningsViewSchema,
      afterPayout: ProviderEarningsViewSchema,
    }),
  }),
  money: z.strictObject({
    topup: topupReceiptSchema,
    operationCharge: operationChargeReceiptSchema,
    payout: GatewayPayoutReceiptSchema,
    conservation: conservationReceiptSchema,
  }),
  refusals: z.strictObject({
    withdrawnOperationCode: z.literal("operation_withdrawn"),
    revokedKeyCode: z.literal("authentication_required"),
    revokedCredentialDigest: digestSchema,
  }),
  claimBoundary: z.literal(
    "one_smoke_owned_publication_one_owner_operation_one_paid_control_operation_one_live_topup_one_live_payout",
  ),
});
export type GatewayProductionSmokeReceiptMaterial = z.infer<
  typeof GatewayProductionSmokeReceiptMaterialSchema
>;
export const GatewayProductionSmokeReceiptSchema =
  GatewayProductionSmokeReceiptMaterialSchema.extend({
    receiptDigest: digestSchema,
  }).superRefine((receipt, context) => {
    const { receiptDigest, ...material } = receipt;
    const issue = (path: (string | number)[], message: string): void =>
      context.addIssue({ code: z.ZodIssueCode.custom, path, message });
    const { ownerHttp, ownerMcpReplay, controlHttp } = receipt.calls;
    const { ownerActivity, controlActivity } = receipt.usage;
    const principalDigest = receipt.smokeOwnership.ownerPrincipalDigest;
    if (canonicalDigest(material) !== receiptDigest)
      issue(["receiptDigest"], "receipt digest mismatch");
    if (
      receipt.deployment.convexSourceRevision !==
      receipt.deployment.sourceRevision
    )
      issue(
        ["deployment", "convexSourceRevision"],
        "gateway_smoke_receipt_convex_revision_mismatch",
      );
    if (
      ownerHttp.transport !== "http" ||
      ownerMcpReplay.transport !== "mcp" ||
      controlHttp.transport !== "http"
    )
      issue(["calls"], "transport provenance mismatch");
    if (
      ownerHttp.operationRef !== receipt.discovery.ownerOperationRef ||
      ownerMcpReplay.operationRef !== receipt.discovery.ownerOperationRef ||
      controlHttp.operationRef !== receipt.discovery.controlOperationRef
    )
      issue(["calls"], "operation identity mismatch");
    if (
      receipt.discovery.ownerServiceId === receipt.discovery.controlServiceId ||
      receipt.discovery.ownerOperationRef ===
        receipt.discovery.controlOperationRef ||
      receipt.smokeOwnership.businessId === receipt.discovery.controlBusinessId
    )
      issue(["discovery"], "owner and control identities collide");
    if (
      receipt.smokeOwnership.offeringRef !==
        receipt.discovery.ownerOfferingRef ||
      receipt.smokeOwnership.publicationRef !==
        receipt.discovery.ownerAuthority.publicationRef
    )
      issue(["smokeOwnership"], "owner publication identity mismatch");
    if (
      receipt.fixture.offeringRef !== receipt.smokeOwnership.offeringRef ||
      receipt.fixture.publicationRef !==
        receipt.smokeOwnership.publicationRef ||
      receipt.fixture.operationRef !== receipt.discovery.ownerOperationRef ||
      receipt.fixture.offeringRevision !==
        receipt.discovery.ownerAuthority.offeringRevision ||
      receipt.fixture.offeringSourceHash !==
        receipt.discovery.ownerAuthority.offeringSourceHash ||
      receipt.fixture.publicationRevision !==
        receipt.discovery.ownerAuthority.publicationRevision
    )
      issue(["fixture"], "created fixture identity does not join discovery");
    if (
      receipt.smokeOwnership.businessCreated !== true ||
      receipt.discovery.ownerAuthority.businessName !==
        receipt.smokeOwnership.businessName ||
      receipt.discovery.ownerAuthority.offeringName !==
        receipt.smokeOwnership.runId
    )
      issue(["discovery", "ownerAuthority"], "owner fixture marker mismatch");
    if (
      ownerHttp.invocationRef !== ownerMcpReplay.invocationRef ||
      ownerHttp.outputDigest !== ownerMcpReplay.outputDigest ||
      ownerHttp.evidenceDigest !== ownerMcpReplay.evidenceDigest ||
      ownerHttp.usageDigest !== ownerMcpReplay.usageDigest
    )
      issue(["calls", "ownerMcpReplay"], "owner replay result changed");
    if (
      ownerHttp.serviceId !== receipt.discovery.ownerServiceId ||
      ownerMcpReplay.serviceId !== receipt.discovery.ownerServiceId ||
      controlHttp.serviceId !== receipt.discovery.controlServiceId
    )
      issue(["calls"], "service identity mismatch");
    if (
      receipt.discovery.ownerAuthentication.kind !== "keyless" ||
      (receipt.discovery.controlAuthentication.kind !== "platform_credential" &&
        receipt.discovery.controlAuthentication.kind !== "x402")
    )
      issue(["discovery"], "authentication evidence mismatch");
    if (
      ownerHttp.charge.chargeState !== "free_tier" ||
      ownerMcpReplay.charge.chargeState !== "free_tier" ||
      controlHttp.charge.chargeState !== "paid"
    )
      issue(["calls"], "call charge-state mismatch");
    if (
      ownerHttp.principalDigest !== principalDigest ||
      ownerMcpReplay.principalDigest !== principalDigest ||
      controlHttp.principalDigest !== principalDigest ||
      receipt.money.topup.buyerPrincipalDigest !== principalDigest ||
      receipt.money.operationCharge.buyerPrincipalDigest !== principalDigest
    )
      issue(["calls"], "principal identity mismatch");
    if (
      !new RegExp(
        `^ae-release-smoke:${receipt.deployment.sourceRevision}:[A-Za-z0-9._-]{1,64}$`,
        "u",
      ).test(receipt.smokeOwnership.runId)
    )
      issue(["smokeOwnership", "runId"], "run identity mismatch");
    if (
      receipt.money.topup.idempotencyKey !==
        `${receipt.smokeOwnership.runId}:topup` ||
      receipt.money.payout.payoutRef !==
        `${receipt.smokeOwnership.runId}:payout`
    )
      issue(["money"], "money idempotency namespace mismatch");
    const expectedTopup = calculateCreditTopupFinancials({
      amount: receipt.money.topup.creditAmount,
      accountCurrency: receipt.money.topup.creditAmount.currency,
      accountExponent: receipt.money.topup.creditAmount.exponent,
      config: productionCreditTopupConfig(),
    });
    const expectedTopupFee = expectedTopup?.processingFee;
    if (
      expectedTopup === undefined ||
      expectedTopupFee === undefined ||
      !sameAmount(expectedTopupFee, receipt.money.topup.processingFee) ||
      !sameAmount(expectedTopup.chargeAmount, receipt.money.topup.chargeAmount)
    )
      issue(["money", "topup"], "top-up financials mismatch");
    const assertApprovedCap = (
      amount: ExactAmount,
      path: (string | number)[],
      message: string,
    ): void => {
      const comparison = compareExactAmounts(
        amount,
        APPROVED_EXTERNAL_MOVEMENT_CAP,
      );
      if (comparison === undefined || comparison === 1) issue(path, message);
    };
    assertApprovedCap(
      receipt.money.topup.chargeAmount,
      ["money", "topup", "chargeAmount"],
      "top-up external charge exceeds approved movement cap",
    );
    assertApprovedCap(
      receipt.calls.controlHttp.charge.grossAmount,
      ["calls", "controlHttp", "charge", "grossAmount"],
      "control price exceeds approved movement cap",
    );
    assertApprovedCap(
      receipt.money.operationCharge.buyerDebit,
      ["money", "operationCharge", "buyerDebit"],
      "control source debit exceeds approved movement cap",
    );
    assertApprovedCap(
      receipt.money.payout.providerNetAmount,
      ["money", "payout", "providerNetAmount"],
      "payout exceeds approved movement cap",
    );
    const paidOut = subtractAmount(
      receipt.money.payout.providerPaidAfter,
      receipt.money.payout.providerPaidBefore,
    );
    const externalMovement =
      paidOut === undefined
        ? undefined
        : addExactAmounts(receipt.money.topup.chargeAmount, paidOut);
    if (
      externalMovement === undefined ||
      compareExactAmounts(externalMovement, APPROVED_EXTERNAL_MOVEMENT_CAP) ===
        1
    )
      issue(
        ["money"],
        "total external money movement exceeds approved USD 6.00",
      );
    const baselineBuyer = receipt.usage.buyer.baseline;
    const baselineUsage = receipt.usage.baseline;
    if (
      !sameAmount(baselineBuyer.balance, zeroAmount(baselineBuyer.balance)) ||
      baselineBuyer.pendingTopup !== undefined ||
      baselineBuyer.autoRecharge.enabled ||
      !sameAmount(
        baselineBuyer.autoRecharge.threshold,
        zeroAmount(baselineBuyer.autoRecharge.threshold),
      ) ||
      !sameAmount(
        baselineBuyer.autoRecharge.rechargeAmount,
        zeroAmount(baselineBuyer.autoRecharge.rechargeAmount),
      )
    )
      issue(
        ["usage", "buyer", "baseline"],
        "buyer baseline balance is not exact zero or has pending spend",
      );
    if (
      baselineUsage.callCount !== 0 ||
      baselineUsage.paidCallCount !== 0 ||
      baselineUsage.freeCallCount !== 0 ||
      !sameAmount(
        baselineUsage.grossSpend,
        zeroAmount(baselineUsage.grossSpend),
      ) ||
      baselineUsage.states.length !== 0
    )
      issue(["usage", "baseline"], "buyer baseline usage is not exact zero");
    if (
      principalDigest !==
      canonicalDigest({ principalId: receipt.usage.buyer.baseline.principalId })
    )
      issue(
        ["smokeOwnership", "ownerPrincipalDigest"],
        "buyer principal digest mismatch",
      );
    if (
      ownerActivity.invocationRef !== ownerHttp.invocationRef ||
      ownerActivity.attemptRef !== ownerHttp.attemptRef ||
      ownerActivity.operationKey !== ownerHttp.operationRef ||
      ownerActivity.serviceRef !== ownerHttp.serviceId ||
      ownerActivity.offeringRef !== receipt.discovery.ownerOfferingRef ||
      ownerActivity.businessId !== receipt.smokeOwnership.businessId ||
      ownerActivity.activityRef !== ownerHttp.charge.activityRef ||
      ownerActivity.chargeState !== "free_tier" ||
      !sameAmount(ownerActivity.grossAmount, ownerHttp.charge.grossAmount) ||
      ownerActivity.priceDigest !== ownerHttp.charge.priceDigest
    )
      issue(["usage", "ownerActivity"], "owner activity binding mismatch");
    if (
      controlActivity.invocationRef !== controlHttp.invocationRef ||
      controlActivity.attemptRef !== controlHttp.attemptRef ||
      controlActivity.operationKey !== controlHttp.operationRef ||
      controlActivity.serviceRef !== controlHttp.serviceId ||
      controlActivity.offeringRef !== receipt.discovery.controlOfferingRef ||
      controlActivity.businessId !== receipt.discovery.controlBusinessId ||
      controlActivity.activityRef !== controlHttp.charge.activityRef ||
      controlActivity.transactionRef !==
        receipt.money.operationCharge.transactionRef ||
      controlActivity.chargeState !== "paid" ||
      !sameAmount(
        controlActivity.grossAmount,
        controlHttp.charge.grossAmount,
      ) ||
      controlActivity.priceDigest !== controlHttp.charge.priceDigest
    )
      issue(["usage", "controlActivity"], "control activity binding mismatch");
    const credentialId = receipt.usage.baseline.credentialId;
    if (
      receipt.usage.afterOwner.credentialId !== credentialId ||
      receipt.usage.afterReplay.credentialId !== credentialId ||
      receipt.usage.final.credentialId !== credentialId ||
      ownerActivity.credentialId !== credentialId ||
      controlActivity.credentialId !== credentialId
    )
      issue(["usage"], "credential identity mismatch");
    if (
      receipt.refusals.revokedCredentialDigest !==
      canonicalDigest({ credentialId })
    )
      issue(
        ["refusals", "revokedCredentialDigest"],
        "revoked credential identity mismatch",
      );
    if (
      receipt.usage.afterOwner.callCount !==
        receipt.usage.baseline.callCount + 1 ||
      receipt.usage.afterOwner.freeCallCount !==
        receipt.usage.baseline.freeCallCount + 1 ||
      receipt.usage.afterOwner.paidCallCount !==
        receipt.usage.baseline.paidCallCount
    )
      issue(["usage", "afterOwner"], "owner usage delta mismatch");
    if (
      canonicalDigest(receipt.usage.afterReplay) !==
        canonicalDigest(receipt.usage.afterOwner) ||
      receipt.usage.final.callCount !==
        receipt.usage.afterReplay.callCount + 1 ||
      receipt.usage.final.paidCallCount !==
        receipt.usage.afterReplay.paidCallCount + 1 ||
      receipt.usage.final.freeCallCount !==
        receipt.usage.afterReplay.freeCallCount
    )
      issue(["usage", "afterReplay"], "control or replay usage delta mismatch");
    const ownerGrossSpend = subtractAmount(
      receipt.usage.afterOwner.grossSpend,
      receipt.usage.baseline.grossSpend,
    );
    const replayGrossSpend = subtractAmount(
      receipt.usage.afterReplay.grossSpend,
      receipt.usage.afterOwner.grossSpend,
    );
    const controlGrossSpend = subtractAmount(
      receipt.usage.final.grossSpend,
      receipt.usage.afterReplay.grossSpend,
    );
    if (
      ownerGrossSpend === undefined ||
      replayGrossSpend === undefined ||
      controlGrossSpend === undefined ||
      !sameAmount(ownerGrossSpend, zeroAmount(ownerGrossSpend)) ||
      !sameAmount(replayGrossSpend, zeroAmount(replayGrossSpend)) ||
      !sameAmount(controlGrossSpend, controlHttp.charge.grossAmount)
    )
      issue(["usage"], "usage gross-spend delta mismatch");
    if (
      receipt.usage.replayAdditionalMeteredCalls !== 0 ||
      receipt.money.payout.replayAdditionalDebits !== 0
    )
      issue(["money"], "replay moved money or usage");
    const providerEvent = receipt.money.topup.providerEvent;
    if (
      providerEvent.status !== "observed" ||
      providerEvent.stripeEventId !== receipt.money.topup.stripeEventId ||
      providerEvent.externalRef !== receipt.money.topup.externalRef ||
      providerEvent.commandRef !== receipt.money.topup.topupCommandRef ||
      providerEvent.runId !== receipt.smokeOwnership.runId ||
      !sameAmount(providerEvent.amount, receipt.money.topup.chargeAmount)
    )
      issue(
        ["money", "topup", "providerEvent"],
        "top-up provider event identity mismatch",
      );
    const webhookReplay = receipt.money.topup.webhookReplay;
    const replayCreditDelta = subtractAmount(
      webhookReplay.buyerBalanceAfter,
      webhookReplay.buyerBalanceBefore,
    );
    if (
      webhookReplay.status !== "replayed" ||
      webhookReplay.signatureVerified !== true ||
      webhookReplay.stripeEventId !== receipt.money.topup.stripeEventId ||
      webhookReplay.stripePayloadDigest !==
        receipt.money.topup.stripePayloadDigest ||
      webhookReplay.commandRef !== receipt.money.topup.topupCommandRef ||
      webhookReplay.transactionRef !== receipt.money.topup.transactionRef ||
      webhookReplay.appliedRef !== receipt.money.topup.transactionRef ||
      !sameAmount(
        webhookReplay.buyerBalanceBefore,
        receipt.money.topup.buyerBalanceAfter,
      ) ||
      !sameAmount(
        webhookReplay.buyerBalanceAfter,
        receipt.money.topup.buyerBalanceAfter,
      ) ||
      replayCreditDelta === undefined ||
      !sameAmount(webhookReplay.creditDelta, replayCreditDelta) ||
      !sameAmount(webhookReplay.creditDelta, zeroAmount(replayCreditDelta))
    )
      issue(
        ["money", "topup", "webhookReplay"],
        "top-up webhook replay identity or credit delta mismatch",
      );
    if (
      !sameAmount(
        receipt.money.topup.buyerBalanceBefore,
        receipt.usage.buyer.baseline.balance,
      ) ||
      !sameAmount(
        receipt.money.topup.buyerBalanceAfter,
        receipt.usage.buyer.afterOwner.balance,
      )
    )
      issue(["money", "topup"], "top-up balance binding mismatch");
    if (
      receipt.usage.buyer.baseline.principalId !==
        receipt.usage.buyer.afterOwner.principalId ||
      receipt.usage.buyer.baseline.principalId !==
        receipt.usage.buyer.afterReplay.principalId ||
      receipt.usage.buyer.baseline.principalId !==
        receipt.usage.buyer.afterControl.principalId
    )
      issue(["usage", "buyer"], "buyer identity mismatch");
    const charge = receipt.money.operationCharge;
    if (
      charge.controlInvocationRef !== controlHttp.invocationRef ||
      charge.controlAttemptRef !== controlHttp.attemptRef ||
      charge.activityRef !== controlActivity.activityRef ||
      charge.supplierBusinessId !== receipt.discovery.controlBusinessId ||
      !sameAmount(charge.buyerDebit, controlHttp.charge.grossAmount) ||
      !sameAmount(charge.supplierGrossAccrual, controlHttp.charge.grossAmount)
    )
      issue(["money", "operationCharge"], "operation charge binding mismatch");
    if (
      !sameAmount(
        addAmount(charge.aeRake, charge.providerNetAccrual),
        charge.supplierGrossAccrual,
      )
    )
      issue(["money", "operationCharge"], "operation charge split mismatch");
    if (
      receipt.money.payout.supplierBusinessId !==
        receipt.discovery.controlBusinessId ||
      receipt.usage.supplier.baseline.businessId !==
        receipt.discovery.controlBusinessId ||
      receipt.usage.supplier.afterControl.businessId !==
        receipt.discovery.controlBusinessId ||
      receipt.usage.supplier.afterPayout.businessId !==
        receipt.discovery.controlBusinessId
    )
      issue(["money", "payout"], "supplier identity mismatch");
    const topupCredit = subtractAmount(
      receipt.usage.buyer.afterOwner.balance,
      receipt.usage.buyer.baseline.balance,
    );
    if (
      !sameAmount(
        addAmount(
          receipt.money.topup.creditAmount,
          receipt.money.topup.processingFee,
        ),
        receipt.money.topup.chargeAmount,
      )
    )
      issue(["money", "topup"], "top-up amount conservation mismatch");
    if (
      topupCredit === undefined ||
      !sameAmount(topupCredit, receipt.money.topup.creditAmount)
    )
      issue(["money", "topup"], "top-up credit delta mismatch");
    const buyerDebit = subtractAmount(
      receipt.usage.buyer.afterReplay.balance,
      receipt.usage.buyer.afterControl.balance,
    );
    const grossAccrual = subtractAmount(
      receipt.usage.supplier.afterControl.grossAccrual,
      receipt.usage.supplier.baseline.grossAccrual,
    );
    const rake = subtractAmount(
      receipt.usage.supplier.afterControl.rake,
      receipt.usage.supplier.baseline.rake,
    );
    const providerNet = subtractAmount(
      receipt.usage.supplier.afterControl.providerNet,
      receipt.usage.supplier.baseline.providerNet,
    );
    if (
      buyerDebit === undefined ||
      grossAccrual === undefined ||
      rake === undefined ||
      providerNet === undefined ||
      !sameAmount(buyerDebit, charge.buyerDebit) ||
      !sameAmount(grossAccrual, charge.supplierGrossAccrual) ||
      !sameAmount(rake, charge.aeRake) ||
      !sameAmount(providerNet, charge.providerNetAccrual)
    )
      issue(
        ["money", "operationCharge"],
        "operation charge source delta mismatch",
      );
    const payout = receipt.money.payout;
    const providerTransfers = receipt.money.payout.providerTransfers;
    const providerTransferPhases = [
      ["beforePayout", providerTransfers.beforePayout, 0],
      ["afterInitialPayout", providerTransfers.afterInitialPayout, 1],
      ["afterReplay", providerTransfers.afterReplay, 1],
    ] as const;
    for (const [phase, observation, expectedCount] of providerTransferPhases) {
      if (
        observation.payoutRef !== receipt.money.payout.payoutRef ||
        observation.count !== observation.transferIdDigests.length ||
        new Set(observation.transferIdDigests).size !==
          observation.transferIdDigests.length ||
        observation.transferIdsDigest !==
          canonicalDigest({
            format: "stripe-transfer-ids:v1",
            payoutRef: observation.payoutRef,
            transferIdDigests: observation.transferIdDigests,
          }) ||
        observation.count !== expectedCount
      )
        issue(
          ["money", "payout", "providerTransfers", phase],
          "provider transfer count or identity evidence mismatch",
        );
    }
    if (
      !providerTransfers.afterInitialPayout.transferIdDigests.includes(
        receipt.money.payout.stripeTransferDigest,
      ) ||
      !providerTransfers.afterReplay.transferIdDigests.includes(
        receipt.money.payout.stripeTransferDigest,
      )
    )
      issue(
        ["money", "payout", "providerTransfers"],
        "provider transfer immutable identity mismatch",
      );
    if (
      providerTransfers.afterReplay.count -
        providerTransfers.afterInitialPayout.count !==
      receipt.money.payout.replayAdditionalDebits
    )
      issue(
        ["money", "payout", "replayAdditionalDebits"],
        "provider transfer replay delta mismatch",
      );
    if (
      !sameAmount(payout.providerNetAmount, charge.providerNetAccrual) ||
      !sameAmount(
        payout.providerHeldBefore,
        receipt.usage.supplier.afterControl.held,
      ) ||
      !sameAmount(
        payout.providerHeldAfter,
        receipt.usage.supplier.afterPayout.held,
      ) ||
      !sameAmount(
        payout.providerPaidBefore,
        receipt.usage.supplier.afterControl.paidOut,
      ) ||
      !sameAmount(
        payout.providerPaidAfter,
        receipt.usage.supplier.afterPayout.paidOut,
      )
    )
      issue(["money", "payout"], "payout source delta mismatch");
    const conservation = receipt.money.conservation;
    if (
      !sameAmount(conservation.buyerDebit, charge.buyerDebit) ||
      !sameAmount(
        conservation.supplierGrossAccrual,
        charge.supplierGrossAccrual,
      ) ||
      !sameAmount(conservation.aeRake, charge.aeRake) ||
      !sameAmount(conservation.providerNet, charge.providerNetAccrual) ||
      !sameAmount(
        addAmount(conservation.paidOut, conservation.held),
        conservation.providerNet,
      )
    )
      issue(["money", "conservation"], "money conservation mismatch");
  });
export type GatewayProductionSmokeReceipt = z.infer<
  typeof GatewayProductionSmokeReceiptSchema
>;
export type GatewaySmokeReceipt = GatewayProductionSmokeReceipt;
export type GatewayPayoutProviderTransferReadback = z.infer<
  typeof GatewayPayoutProviderTransferReadbackSchema
>;
export type GatewayPayoutReceipt = z.infer<typeof GatewayPayoutReceiptSchema>;
type StrictCreditActivityView = z.infer<typeof CreditActivityViewSchema>;
type HostedMoneySnapshot = Readonly<{
  buyer: z.infer<typeof CreditAccountViewSchema>;
  usage: z.infer<typeof KeyUsageViewSchema>;
  supplier: z.infer<typeof ProviderEarningsViewSchema>;
}>;
export type HostedTopupReadback = Readonly<{
  topupCommandRef: string;
  buyerPrincipalDigest: string;
  paymentEvidenceRef: string;
  paymentEvidenceDigest: string;
  paymentRequestDigest: string;
  paymentMetadataDigest: string;
  checkoutSessionDigest: string;
  paymentIntentDigest?: string;
  paymentId?: string;
  externalRef: string;
  idempotencyKey: string;
  stripeEventId: string;
  stripePayloadDigest: string;
  transactionRef: string;
  creditAmount: ExactAmount;
  processingFee: ExactAmount;
  chargeAmount: ExactAmount;
  checkoutCreatedAt: number;
  buyerBalanceBefore: ExactAmount;
  buyerBalanceAfter: ExactAmount;
}>;
export type GatewayTopupPreparationArtifact = z.infer<
  typeof topupPreparationSchema
>;
export type GatewayTopupProviderEvent = z.infer<
  typeof topupProviderEventSchema
>;
export type GatewayTopupWebhookReplay = z.infer<
  typeof topupWebhookReplaySchema
>;
export type GatewayTopupObservation = Readonly<{
  readback: HostedTopupReadback;
  providerEvent: GatewayTopupProviderEvent;
  webhookReplay: GatewayTopupWebhookReplay;
}>;
export type GatewaySmokeUnknown = Readonly<{
  kind: "unknown";
  code: string;
  status?: number;
  retryable: boolean;
}>;
export type GatewayInvocationObservation =
  OperationInvokeResult | GatewaySmokeUnknown;
export type GatewayCompletedOperation = Extract<
  OperationInvokeResult,
  { kind: "completed" }
>;
export type GatewayPendingOperation = Extract<
  OperationInvokeResult,
  { kind: "pending" }
>;
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

type GatewayHttpResponse = Readonly<{ status: number; body: unknown }>;
export class GatewaySmokeError extends Error {
  readonly cleanupCodes: readonly string[];
  constructor(code: string, cleanupCodes: readonly string[] = []) {
    super(code);
    this.name = "GatewaySmokeError";
    this.cleanupCodes = cleanupCodes;
  }
}
function smokeErrorCode(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function gatewaySmokeFailureWithCleanup(
  primary: unknown,
  failures: readonly unknown[],
): GatewaySmokeError {
  return new GatewaySmokeError(
    smokeErrorCode(primary),
    failures.map(smokeErrorCode),
  );
}
export function parseGatewayOwnerProviderEarnings(
  value: unknown,
  businessId: string,
  currency: string,
): z.infer<typeof ProviderEarningsViewSchema> {
  const parsed = ownerProviderEarningsReadbackSchema.safeParse(value);
  if (!parsed.success || parsed.data.businessId !== businessId)
    throw new GatewaySmokeError(
      "gateway_smoke_supplier_earnings_source_refused",
    );
  if (parsed.data.accountsTruncated)
    throw new GatewaySmokeError("gateway_smoke_supplier_earnings_truncated");
  const matches = parsed.data.accounts.filter(
    (account) => account.currency === currency,
  );
  if (matches.length !== 1)
    throw new GatewaySmokeError(
      "gateway_smoke_supplier_account_missing_or_ambiguous",
    );
  const account = matches[0];
  if (
    account === undefined ||
    account.earnings.businessId !== businessId ||
    account.payout.businessId !== businessId
  )
    throw new GatewaySmokeError(
      "gateway_smoke_supplier_earnings_identity_mismatch",
    );
  const amounts = [
    account.earnings.grossAccrual,
    account.earnings.rake,
    account.earnings.providerNet,
    account.earnings.paidOut,
    account.earnings.held,
    account.earnings.recoveryDue,
    account.payout.providerNet,
    account.payout.minimumPayout,
    account.payout.providerHeldBefore,
    account.payout.providerHeldAfter,
    account.payout.providerPaidBefore,
    account.payout.providerPaidAfter,
  ];
  if (
    amounts.some(
      (amount) => amount !== undefined && amount.currency !== currency,
    )
  )
    throw new GatewaySmokeError(
      "gateway_smoke_supplier_earnings_currency_mismatch",
    );
  const { kind: _kind, ...earnings } = account.earnings;
  return ProviderEarningsViewSchema.parse(earnings);
}
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
export async function runGatewayProductionSmoke(
  config: GatewaySmokeConfig,
): Promise<GatewayProductionSmokeReceipt> {
  const liveGate = evaluateLiveMoneyGate();
  if (liveGate.kind === "refused") throw new GatewaySmokeError(liveGate.code);
  const stripeConfig = readStripeMoneyProviderConfig(
    config.runtimeEnvironment,
    "live",
  );
  if (isMoneyRefusal(stripeConfig) || stripeConfig.mode !== "live")
    throw new GatewaySmokeError("stripe_setup_required");
  const release = await verifyHostedCustomerRequestRelease({
    baseUrl: config.baseUrl,
    apiKey: config.releaseApiKey,
    expectedRevision: config.sourceRevision,
    expectedDeploymentId: config.deploymentId,
    ...(config.expectedConvexDeploymentId === undefined
      ? {}
      : { expectedConvexDeploymentId: config.expectedConvexDeploymentId }),
    ...(config.expectedConvexUrl === undefined
      ? {}
      : { expectedConvexUrl: config.expectedConvexUrl }),
    ...(config.bypassSecret === undefined
      ? {}
      : { deploymentProtectionBypass: config.bypassSecret }),
    fetchImpl: config.fetch,
  });
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
export async function invokeGatewayOperation(
  config: GatewaySmokeConfig,
  operation: PublicOperationDescriptor,
  idempotencyKey: string,
): Promise<GatewayInvocationObservation> {
  const response = await requestJson(
    config.fetch,
    `${config.baseUrl}${OPERATION_INVOKE_HTTP_PATH}`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        operationRef: operation.operationRef,
        input: config.input,
        idempotencyKey,
      }),
    },
    config.apiKey,
  );
  return parseGatewayInvocationResponse(response, operation.operationRef);
}
function delay(milliseconds: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, milliseconds);
  return promise;
}
export function parseGatewayInvocationResponse(
  response: GatewayHttpResponse,
  expectedOperationRef?: string,
): GatewayInvocationObservation {
  if (response.status < 200 || response.status >= 300)
    return {
      kind: "unknown",
      code: "http_error",
      status: response.status,
      retryable: response.status >= 500,
    };
  const parsed = operationInvokeResultSchema.safeParse(response.body);
  if (
    !parsed.success ||
    (expectedOperationRef !== undefined &&
      parsed.data.operationRef !== expectedOperationRef)
  )
    return {
      kind: "unknown",
      code: "malformed_result",
      status: response.status,
      retryable: false,
    };
  return parsed.data;
}
export async function pollGatewayOperation(
  config: GatewaySmokeConfig,
  initial: GatewayInvocationObservation,
): Promise<GatewayInvocationObservation> {
  if (initial.kind !== "pending") return initial;
  const started = config.now?.() ?? Date.now();
  let current = initial;
  while (
    (config.now?.() ?? Date.now()) - started <
    Math.min(config.maxStatusWaitMs ?? MAX_STATUS_WAIT_MS, MAX_STATUS_WAIT_MS)
  ) {
    await (config.sleep ?? delay)(
      Math.min(
        Math.max(current.retryAfterMs, DEFAULT_STATUS_DELAY_MS),
        config.statusDelayMs ?? MAX_STATUS_DELAY_MS,
      ),
    );
    const next = await readGatewayStatus(config, initial.invocationRef);
    if (next.kind !== "pending") return next;
    current = next;
  }
  return {
    kind: "unknown",
    code: "status_timeout",
    status: 200,
    retryable: true,
  };
}
function gatewayInvocationObservationFromStatusResult(
  result: z.infer<typeof operationInvokeStatusResultSchema>,
): GatewayInvocationObservation {
  if (result.kind === "refused")
    return {
      kind: "unknown",
      code: result.code,
      retryable: result.retryable,
    };
  if (result.result !== undefined) return result.result;
  return {
    kind: "pending",
    invocationRef: result.invocationRef,
    operationRef: result.operationRef,
    retryAfterMs: DEFAULT_STATUS_DELAY_MS,
  };
}

type FreshStatusCliOutput = Readonly<{
  stdout: string;
  stderr: string;
}>;

function runFreshStatusCli(
  config: GatewaySmokeConfig,
  invocationRef: string,
): Promise<FreshStatusCliOutput> {
  let baseOrigin: string;
  try {
    baseOrigin = new URL(config.baseUrl).origin;
  } catch {
    return Promise.reject(
      new GatewaySmokeError("gateway_smoke_fresh_status_base_url_invalid"),
    );
  }
  const path = process.env.PATH;
  const env: NodeJS.ProcessEnv = {
    ...(path === undefined ? {} : { PATH: path }),
    AE_CLI_BASE_URL: config.baseUrl,
    AE_API_KEY: config.apiKey,
    AE_API_KEY_ORIGIN: baseOrigin,
  };
  const {
    promise,
    resolve: resolveOutput,
    reject: rejectOutput,
  } = Promise.withResolvers<FreshStatusCliOutput>();
  try {
    execFile(
      "npm",
      ["run", "-s", "ae", "--", "status", invocationRef, "--json"],
      {
        cwd: process.cwd(),
        env,
        encoding: "utf8",
        timeout: FRESH_STATUS_PROCESS_TIMEOUT_MS,
        maxBuffer: Math.max(
          MAX_FRESH_STATUS_STDOUT_BYTES,
          MAX_FRESH_STATUS_STDERR_BYTES,
        ),
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          rejectOutput(error);
          return;
        }
        if (
          Buffer.byteLength(stdout, "utf8") > MAX_FRESH_STATUS_STDOUT_BYTES ||
          Buffer.byteLength(stderr, "utf8") > MAX_FRESH_STATUS_STDERR_BYTES
        ) {
          rejectOutput(
            new Error("gateway_smoke_fresh_status_output_unbounded"),
          );
          return;
        }
        resolveOutput({ stdout, stderr });
      },
    );
  } catch (error) {
    rejectOutput(error);
  }
  return promise;
}

export function parseFreshProcessGatewayStatusOutput(
  text: string,
  invocationRef: string,
): GatewayInvocationObservation {
  const trimmed = text.trim();
  if (trimmed.length === 0)
    throw new GatewaySmokeError("gateway_smoke_fresh_status_output_empty");
  let body: unknown;
  try {
    body = JSON.parse(trimmed) as unknown;
  } catch {
    throw new GatewaySmokeError("gateway_smoke_fresh_status_output_invalid");
  }
  const parsed = operationInvokeStatusResultSchema.safeParse(body);
  if (!parsed.success || parsed.data.invocationRef !== invocationRef)
    throw new GatewaySmokeError("gateway_smoke_fresh_status_output_invalid");
  return gatewayInvocationObservationFromStatusResult(parsed.data);
}

export async function readGatewayStatus(
  config: GatewaySmokeConfig,
  invocationRef: string,
): Promise<GatewayInvocationObservation> {
  const response = await requestJson(
    config.fetch,
    `${config.baseUrl}/api/v1/operations/${encodeURIComponent(invocationRef)}`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
    },
    config.apiKey,
  );
  if (response.status < 200 || response.status >= 300)
    return {
      kind: "unknown",
      code: "http_error",
      status: response.status,
      retryable: response.status >= 500,
    };
  const parsed = operationInvokeRecoveryResultSchema.safeParse(response.body);
  if (!parsed.success)
    return {
      kind: "unknown",
      code: "malformed_result",
      status: response.status,
      retryable: false,
    };
  if (parsed.data.kind === "reconciliation_required")
    return {
      kind: "unknown",
      code: "reconciliation_required",
      status: response.status,
      retryable: true,
    };
  if (parsed.data.kind === "refused")
    return {
      kind: "unknown",
      code: parsed.data.code,
      status: response.status,
      retryable: parsed.data.retryable,
    };
  if (parsed.data.result !== undefined) return parsed.data.result;
  return {
    kind: "pending",
    invocationRef: parsed.data.invocationRef,
    operationRef: parsed.data.operationRef,
    retryAfterMs: DEFAULT_STATUS_DELAY_MS,
  };
}
export async function readFreshProcessGatewayStatus(
  config: GatewaySmokeConfig,
  invocationRef: string,
): Promise<GatewayInvocationObservation> {
  let output: FreshStatusCliOutput;
  try {
    output = await runFreshStatusCli(config, invocationRef);
  } catch {
    throw new GatewaySmokeError("gateway_smoke_fresh_status_process_failed");
  }
  return parseFreshProcessGatewayStatusOutput(output.stdout, invocationRef);
}
export function assertGatewayPaidCompletion(
  operation: PublicOperationDescriptor,
  completed: GatewayCompletedOperation,
): OperationInvokeUsageSummary {
  if (completed.operationRef !== operation.operationRef)
    throw new GatewaySmokeError("gateway_smoke_completed_operation_mismatch");
  const usage = operationInvokeUsageSchema.parse(completed.usage);
  if (
    usage.chargeState !== "paid" ||
    operation.commercial.price.kind !== "fixed" ||
    operation.commercial.priceEvidence?.priceDigest !== usage.priceDigest ||
    !sameAmount(operation.commercial.price.amount, usage.amount) ||
    usage.transactionRef === undefined
  )
    throw new GatewaySmokeError("gateway_smoke_paid_usage_mismatch");
  return usage;
}
export function assertGatewayInvocationReplayParity(
  expected: GatewayCompletedOperation,
  replay: GatewayCompletedOperation,
): void {
  if (expected.operationRef !== replay.operationRef)
    throw new GatewaySmokeError("replay_operation_mismatch");
  if (expected.invocationRef !== replay.invocationRef)
    throw new GatewaySmokeError("replay_invocation_mismatch");
  if (expected.evidenceHash !== replay.evidenceHash)
    throw new GatewaySmokeError("replay_evidence_mismatch");
  if (canonicalDigest(expected.output) !== canonicalDigest(replay.output))
    throw new GatewaySmokeError("replay_output_mismatch");
  if (canonicalDigest(expected.usage) !== canonicalDigest(replay.usage))
    throw new GatewaySmokeError("replay_usage_mismatch");
}

export async function readGatewayCompletionMetadata(
  config: Pick<GatewaySmokeConfig, "baseUrl" | "apiKey" | "fetch">,
  invocationRef: string,
  operationRef: string,
): Promise<
  Readonly<{
    attemptRef: string;
    effectGeneration: number;
    evidenceHash: string;
  }>
> {
  const response = await requestJson(
    config.fetch,
    `${config.baseUrl}/api/v1/operations/${encodeURIComponent(invocationRef)}`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
    },
    config.apiKey,
  );
  const parsed = operationInvokeRecoveryResultSchema.safeParse(response.body);
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !parsed.success ||
    parsed.data.kind !== "found" ||
    parsed.data.attemptRef === undefined ||
    parsed.data.effectGeneration === undefined ||
    parsed.data.evidenceHash === undefined
  )
    throw new GatewaySmokeError("gateway_smoke_status_metadata_missing");
  const nested = parsed.data.result;
  if (
    parsed.data.invocationRef !== invocationRef ||
    parsed.data.operationRef !== operationRef ||
    nested?.kind !== "completed" ||
    nested.invocationRef !== invocationRef ||
    nested.operationRef !== operationRef ||
    nested.evidenceHash !== parsed.data.evidenceHash
  )
    throw new GatewaySmokeError("gateway_smoke_status_metadata_missing");
  return {
    attemptRef: parsed.data.attemptRef,
    effectGeneration: parsed.data.effectGeneration,
    evidenceHash: parsed.data.evidenceHash,
  };
}
function topupReceipt(
  readback: HostedTopupReadback,
  providerEvent: GatewayTopupProviderEvent,
  webhookReplay: GatewayTopupWebhookReplay,
): z.infer<typeof topupReceiptSchema> {
  return {
    topupCommandRef: readback.topupCommandRef,
    buyerPrincipalDigest: readback.buyerPrincipalDigest,
    paymentEvidenceRef: readback.paymentEvidenceRef,
    paymentEvidenceDigest: readback.paymentEvidenceDigest,
    paymentRequestDigest: readback.paymentRequestDigest,
    paymentMetadataDigest: readback.paymentMetadataDigest,
    checkoutSessionDigest: readback.checkoutSessionDigest,
    ...(readback.paymentIntentDigest === undefined
      ? {}
      : { paymentIntentDigest: readback.paymentIntentDigest }),
    ...(readback.paymentId === undefined
      ? {}
      : { paymentId: readback.paymentId }),
    idempotencyKey: readback.idempotencyKey,
    externalRef: readback.externalRef,
    stripeEventId: readback.stripeEventId,
    stripePayloadDigest: readback.stripePayloadDigest,
    transactionRef: readback.transactionRef,
    creditAmount: readback.creditAmount,
    webhookReplay,
    processingFee: readback.processingFee,
    chargeAmount: readback.chargeAmount,
    buyerBalanceBefore: readback.buyerBalanceBefore,
    buyerBalanceAfter: readback.buyerBalanceAfter,
    providerEvent,
  };
}
function completedCallReceipt(
  completed: GatewayCompletedOperation,
  metadata: Readonly<{
    attemptRef: string;
    effectGeneration: number;
    evidenceHash: string;
  }>,
  transport: "http" | "mcp",
  serviceId: string,
  principalDigest: string,
  input: Readonly<Record<string, JsonValue>>,
): z.infer<typeof strictCallReceiptSchema> {
  const usage = operationInvokeUsageSchema.parse(completed.usage);
  if (usage.chargeState !== "paid" && usage.chargeState !== "free_tier")
    throw new GatewaySmokeError("gateway_smoke_call_charge_state_invalid");
  return {
    transport,
    serviceId,
    principalDigest,
    operationRef: completed.operationRef,
    invocationRef: completed.invocationRef,
    attemptRef: metadata.attemptRef,
    terminalState: "completed",
    effectGeneration: metadata.effectGeneration,
    inputDigest: canonicalDigest(input),
    outputDigest: canonicalDigest(completed.output),
    evidenceDigest: metadata.evidenceHash,
    usageDigest: canonicalDigest(usage),
    charge: {
      activityRef: usage.usageRef,
      chargeState: usage.chargeState,
      grossAmount: usage.amount,
      priceDigest: usage.priceDigest,
    },
  };
}
function buildOperationCharge(
  activity: StrictCreditActivityView,
  metadata: Readonly<{ attemptRef: string }>,
  beforeControl: HostedMoneySnapshot,
  afterControl: HostedMoneySnapshot,
  principalDigest: string,
): z.infer<typeof operationChargeReceiptSchema> {
  const buyerDebit = subtractAmount(
    beforeControl.buyer.balance,
    afterControl.buyer.balance,
  );
  const gross = subtractAmount(
    afterControl.supplier.grossAccrual,
    beforeControl.supplier.grossAccrual,
  );
  const rake = subtractAmount(
    afterControl.supplier.rake,
    beforeControl.supplier.rake,
  );
  const net = subtractAmount(
    afterControl.supplier.providerNet,
    beforeControl.supplier.providerNet,
  );
  if (
    activity.transactionRef === undefined ||
    buyerDebit === undefined ||
    gross === undefined ||
    rake === undefined ||
    net === undefined ||
    !sameAmount(buyerDebit, activity.grossAmount) ||
    !sameAmount(gross, activity.grossAmount)
  )
    throw new GatewaySmokeError(
      "gateway_smoke_control_activity_readback_invalid",
    );
  return {
    controlInvocationRef: activity.invocationRef,
    controlAttemptRef: metadata.attemptRef,
    buyerPrincipalDigest: principalDigest,
    supplierBusinessId: activity.businessId,
    activityRef: activity.activityRef,
    transactionRef: activity.transactionRef,
    buyerDebit,
    supplierGrossAccrual: gross,
    aeRake: rake,
    providerNetAccrual: net,
  };
}
export function sanitizeGatewayPayoutProviderTransfers(
  payoutRef: string,
  transferIds: readonly string[],
): GatewayPayoutProviderTransferReadback {
  if (transferIds.length > MAX_PROVIDER_TRANSFER_COUNT)
    throw new GatewaySmokeError(
      "gateway_smoke_payout_provider_transfer_readback_unbounded",
    );
  const normalizedIds = transferIds
    .map((transferId) => boundedRefSchema.parse(transferId))
    .sort();
  if (new Set(normalizedIds).size !== normalizedIds.length)
    throw new GatewaySmokeError(
      "gateway_smoke_payout_provider_transfer_identity_duplicate",
    );
  const transferIdDigests = normalizedIds.map((transferId) =>
    canonicalDigest({ format: "stripe-transfer:v1", transferId }),
  );
  return GatewayPayoutProviderTransferReadbackSchema.parse({
    payoutRef: boundedRefSchema.parse(payoutRef),
    count: normalizedIds.length,
    transferIdsDigest: canonicalDigest({
      format: "stripe-transfer-ids:v1",
      payoutRef,
      transferIdDigests,
    }),
    transferIdDigests,
  });
}

export function buildGatewayPayoutReceipt(
  input: Readonly<{
    payout: StrictLivePayoutReceipt;
    payoutReplay: StrictLivePayoutReceipt;
    providerTransfersBeforePayout: GatewayPayoutProviderTransferReadback;
    providerTransfersAfterInitialPayout: GatewayPayoutProviderTransferReadback;
    providerTransfersAfterReplay: GatewayPayoutProviderTransferReadback;
  }>,
): GatewayPayoutReceipt {
  const payout = StrictLivePayoutReceiptSchema.parse(input.payout);
  const payoutReplay = StrictLivePayoutReceiptSchema.parse(input.payoutReplay);
  if (canonicalDigest(payout) !== canonicalDigest(payoutReplay))
    throw new GatewaySmokeError("gateway_smoke_payout_replay_changed");
  const providerTransfers = {
    beforePayout: GatewayPayoutProviderTransferReadbackSchema.parse(
      input.providerTransfersBeforePayout,
    ),
    afterInitialPayout: GatewayPayoutProviderTransferReadbackSchema.parse(
      input.providerTransfersAfterInitialPayout,
    ),
    afterReplay: GatewayPayoutProviderTransferReadbackSchema.parse(
      input.providerTransfersAfterReplay,
    ),
  };
  for (const observation of Object.values(providerTransfers)) {
    if (
      observation.count !== observation.transferIdDigests.length ||
      new Set(observation.transferIdDigests).size !==
        observation.transferIdDigests.length ||
      observation.transferIdsDigest !==
        canonicalDigest({
          format: "stripe-transfer-ids:v1",
          payoutRef: observation.payoutRef,
          transferIdDigests: observation.transferIdDigests,
        }) ||
      observation.payoutRef !== payout.payoutRef
    )
      throw new GatewaySmokeError(
        "gateway_smoke_payout_provider_transfer_readback_invalid",
      );
  }
  if (
    providerTransfers.beforePayout.count !== 0 ||
    providerTransfers.afterInitialPayout.count !== 1 ||
    providerTransfers.afterReplay.count !== 1 ||
    !providerTransfers.afterInitialPayout.transferIdDigests.includes(
      payout.stripeTransferDigest,
    ) ||
    !providerTransfers.afterReplay.transferIdDigests.includes(
      payout.stripeTransferDigest,
    )
  )
    throw new GatewaySmokeError(
      "gateway_smoke_payout_provider_transfer_identity_invalid",
    );
  const replayAdditionalDebits =
    providerTransfers.afterReplay.count -
    providerTransfers.afterInitialPayout.count;
  if (replayAdditionalDebits !== 0)
    throw new GatewaySmokeError(
      "gateway_smoke_payout_provider_replay_added_transfer",
    );
  return GatewayPayoutReceiptSchema.parse({
    ...payout,
    replayAdditionalDebits,
    providerTransfers,
  });
}

function buildConservation(
  charge: z.infer<typeof operationChargeReceiptSchema>,
  payout: StrictLivePayoutReceipt,
): z.infer<typeof conservationReceiptSchema> {
  if (
    !sameAmount(
      addAmount(charge.aeRake, charge.providerNetAccrual),
      charge.supplierGrossAccrual,
    )
  )
    throw new GatewaySmokeError("gateway_smoke_conservation_readback_invalid");
  const paidOut = subtractAmount(
    payout.providerPaidAfter,
    payout.providerPaidBefore,
  );
  if (paidOut === undefined)
    throw new GatewaySmokeError("gateway_smoke_payout_delta_invalid");
  return {
    buyerDebit: charge.buyerDebit,
    supplierGrossAccrual: charge.supplierGrossAccrual,
    aeRake: charge.aeRake,
    providerNet: charge.providerNetAccrual,
    paidOut,
    held: payout.providerHeldAfter,
  };
}
function sameAmount(a: ExactAmount, b: ExactAmount): boolean {
  return compareExactAmounts(a, b) === 0;
}
function addAmount(a: ExactAmount, b: ExactAmount): ExactAmount {
  const result = addExactAmounts(a, b);
  if (result === undefined)
    throw new GatewaySmokeError("gateway_smoke_amount_currency_mismatch");
  return result;
}
function subtractAmount(
  a: ExactAmount,
  b: ExactAmount,
): ExactAmount | undefined {
  return subtractExactAmounts(a, b);
}
function zeroAmount(amount: ExactAmount): ExactAmount {
  return { currency: amount.currency, units: "0", exponent: amount.exponent };
}
function stableIdempotencyKey(
  runId: string,
  operationRef: string,
  input: Readonly<Record<string, JsonValue>>,
): string {
  return `${runId}:${operationRef}:${canonicalDigest(input)}`;
}
function requireCompletedInvocation(
  value: GatewayInvocationObservation,
  operationRef: string,
  phase: string,
): GatewayCompletedOperation {
  if (value.kind !== "completed")
    throw new GatewaySmokeError(
      `gateway_smoke_${phase}_${value.kind === "unknown" ? value.code : value.kind}`,
    );
  if (value.operationRef !== operationRef)
    throw new GatewaySmokeError(`gateway_smoke_${phase}_operation_mismatch`);
  return value;
}
async function requestJson(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  secret: string,
): Promise<GatewayHttpResponse> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new GatewaySmokeError("gateway_smoke_network_error");
  }
  const text = await response.text();
  if (secret.length > 0 && text.includes(secret))
    throw new GatewaySmokeError("gateway_smoke_secret_leak");
  if (text.trim().length === 0)
    return { status: response.status, body: undefined };
  try {
    return { status: response.status, body: JSON.parse(text) as unknown };
  } catch {
    throw new GatewaySmokeError("gateway_smoke_malformed_json");
  }
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
function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0)
    throw new Error(`${name} is required`);
  return normalized;
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

function ownerProviderWebsite(
  document: Readonly<Record<string, JsonValue>>,
): string {
  const servers = document.servers;
  if (!Array.isArray(servers) || servers.length === 0)
    throw new GatewaySmokeError("gateway_smoke_owner_openapi_servers_missing");
  const server = jsonObjectValue(servers[0]);
  const rawUrl = server?.url;
  const website =
    typeof rawUrl === "string" ? canonicalProviderWebsite(rawUrl) : undefined;
  if (website === undefined)
    throw new GatewaySmokeError("gateway_smoke_owner_openapi_server_invalid");
  return website;
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
  const claimBusinessMutation = sourceMutation<
    Record<string, unknown>,
    unknown
  >("business:claimBusiness");
  const publishCatalogMutation = sourceMutation<
    Record<string, unknown>,
    unknown
  >("catalog:publishBusinessCatalog");

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
      const claimOperationKey = `ae-release-smoke:${options.runId}:business:claim`;
      const claimCommand = {
        name: options.runId,
        category: "release-smoke",
        businessContext: {
          kind: "programmable_provider" as const,
          website: ownerProviderWebsite(options.ownerOpenApiDocument),
          providerIdentifier: material.ids.capabilityId,
        },
        requestedSlug: `ae-release-smoke-${material.ids.capabilityId.slice(-24)}`,
        sourceRefs: [
          {
            label: "release smoke owner OpenAPI",
            evidenceRef: material.ids.evidenceRef,
          },
        ],
        operationKey: claimOperationKey,
        correlationId: claimOperationKey,
      };
      const claimSourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command: claimCommand,
        scope: "owner_claim",
        operationKey: claimOperationKey,
        correlationId: claimOperationKey,
        env: options.env,
      });
      const claimed = record(
        await (
          await transport()
        ).mutation(claimBusinessMutation, {
          ...claimCommand,
          sourceWriteRequest: sourceWriteRequestFromAdmission(claimSourceWrite),
          sourceWrite: claimSourceWrite,
        }),
      );
      if (claimed?.kind !== "ok")
        throw new GatewaySmokeError(
          "gateway_smoke_owner_business_claim_refused",
        );
      const claimedBusiness = record(claimed.business);
      const claimedClaim = record(claimed.claim);
      if (
        claimedBusiness === undefined ||
        claimedClaim === undefined ||
        typeof claimedBusiness.businessId !== "string" ||
        typeof claimedBusiness.name !== "string" ||
        typeof claimedBusiness.slug !== "string" ||
        claimedBusiness.publicStatus !== "unpublished" ||
        claimedBusiness.claimStatus !== "authenticated" ||
        claimedClaim.status !== "authenticated"
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_business_claim_invalid",
        );
      const businessId = boundedRefSchema.parse(claimedBusiness.businessId);
      const businessName = boundedRefSchema.parse(claimedBusiness.name);
      const businessSlug = boundedRefSchema.parse(claimedBusiness.slug);
      const claimId = boundedRefSchema.parse(
        String(claimedClaim.claimId ?? ""),
      );
      if (businessName !== options.runId || businessId === controlBusinessId)
        throw new GatewaySmokeError(
          "gateway_smoke_owner_control_business_identity_collision",
        );
      const offeringRef = boundedRefSchema.parse(
        `offering:${businessId}:${businessSlug}`,
      );
      const before = await ownerSupplyReadback(businessId);
      if (
        before.offerings
          .map(record)
          .some((candidate) => candidate?.offeringRef === offeringRef)
      )
        throw new GatewaySmokeError("gateway_smoke_owner_fixture_preexisting");
      const publishCatalogOperationKey = `ae-release-smoke:${options.runId}:business:publish`;
      const publishCatalogCommand = {
        claimId,
        services: [
          {
            name: options.runId,
            category: "release-smoke",
            summary: `Run-scoped release smoke operation ${options.runId}.`,
            serviceArea: "Production release smoke.",
            hoursOrUnknown: "Available only for this release smoke run.",
            firstRequest: {
              mode: "not_available_yet" as const,
              publicChannel: "not_available" as const,
            },
          },
        ],
        operationKey: publishCatalogOperationKey,
        correlationId: publishCatalogOperationKey,
      };
      const publishCatalogSourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command: publishCatalogCommand,
        scope: "catalog_publish",
        operationKey: publishCatalogOperationKey,
        correlationId: publishCatalogOperationKey,
        env: options.env,
      });
      const publishedCatalog = record(
        await (
          await transport()
        ).mutation(publishCatalogMutation, {
          ...publishCatalogCommand,
          sourceWriteRequest: sourceWriteRequestFromAdmission(
            publishCatalogSourceWrite,
          ),
          sourceWrite: publishCatalogSourceWrite,
        }),
      );
      const publishedBusiness = record(publishedCatalog?.business);
      const publishedClaim = record(publishedCatalog?.claim);
      if (
        publishedCatalog?.kind !== "ok" ||
        publishedBusiness?.businessId !== businessId ||
        publishedBusiness.publicStatus !== "published" ||
        publishedBusiness.claimStatus !== "published" ||
        publishedClaim?.status !== "published"
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_business_publish_refused",
        );
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
    const transferIdDigests = transfers
      .map(({ transferId }) =>
        canonicalDigest({ format: "stripe-transfer:v1", transferId }),
      )
      .sort();
    return GatewayPayoutProviderTransferReadbackSchema.parse({
      payoutRef: transferGroup,
      count: transferIdDigests.length,
      transferIdsDigest: canonicalDigest({
        format: "stripe-transfer-ids:v1",
        payoutRef: transferGroup,
        transferIdDigests,
      }),
      transferIdDigests,
    });
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

function buildGatewayProductionSmokeReceipt(
  material: GatewayProductionSmokeReceiptMaterial,
): GatewayProductionSmokeReceipt {
  const parsed = GatewayProductionSmokeReceiptMaterialSchema.parse(material);
  return GatewayProductionSmokeReceiptSchema.parse({
    ...parsed,
    receiptDigest: canonicalDigest(parsed),
  });
}
export function parseGatewayProductionSmokeReceiptText(
  text: string,
): GatewayProductionSmokeReceipt {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new GatewaySmokeError("gateway_smoke_receipt_json_invalid");
  }
  return GatewayProductionSmokeReceiptSchema.parse(value);
}
export function parseGatewayTopupPreparationText(
  text: string,
): GatewayTopupPreparationArtifact {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new GatewaySmokeError("gateway_smoke_topup_preparation_json_invalid");
  }
  return topupPreparationSchema.parse(value);
}
export function receiptPathFromArguments(
  args: readonly string[],
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const configured = env.AE_GATEWAY_SMOKE_OUTPUT_PATH?.trim();
  if (args.length === 0)
    return configured === undefined || configured.length === 0
      ? undefined
      : configured;
  if (args.length !== 2 || args[0] !== "--receipt")
    throw new GatewaySmokeError("gateway_smoke_receipt_argument_required");
  const value = required(args[1], "--receipt");
  if (configured !== undefined && configured.length > 0 && configured !== value)
    throw new GatewaySmokeError("gateway_smoke_receipt_argument_env_mismatch");
  return value;
}
export function resolveGatewayReceiptPath(
  receiptPath: string,
  repositoryRoot = process.cwd(),
): string {
  const root = resolve(repositoryRoot, RELEASE_RECEIPT_DIRECTORY);
  const target = resolve(repositoryRoot, receiptPath);
  const relativeTarget = relative(root, target);
  if (
    relativeTarget.length === 0 ||
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${sep}`) ||
    relativeTarget.startsWith(sep)
  )
    throw new GatewaySmokeError(
      "gateway_smoke_receipt_path_outside_release_directory",
    );
  return target;
}
export async function writeGatewayProductionSmokeReceipt(
  receipt:
    GatewayProductionSmokeReceipt | GatewayProductionSmokeReceiptMaterial,
  receiptPath: string,
  repositoryRoot = process.cwd(),
): Promise<GatewayProductionSmokeReceipt> {
  const parsed =
    "receiptDigest" in receipt
      ? GatewayProductionSmokeReceiptSchema.parse(receipt)
      : buildGatewayProductionSmokeReceipt(receipt);
  const destination = resolveGatewayReceiptPath(receiptPath, repositoryRoot);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(parsed)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    await link(temporary, destination);
    await unlink(temporary);
    return parseGatewayProductionSmokeReceiptText(
      await readFile(destination, "utf8"),
    );
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new GatewaySmokeError("gateway_smoke_receipt_destination_exists");
    throw error;
  }
}
export async function writeGatewayTopupPreparationArtifact(
  artifact: GatewayTopupPreparationArtifact,
  artifactPath: string,
  repositoryRoot = process.cwd(),
): Promise<GatewayTopupPreparationArtifact> {
  const parsed = topupPreparationSchema.parse(artifact);
  const destination = resolveGatewayReceiptPath(artifactPath, repositoryRoot);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(parsed)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    await link(temporary, destination);
    await unlink(temporary);
    return parseGatewayTopupPreparationText(
      await readFile(destination, "utf8"),
    );
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new GatewaySmokeError(
        "gateway_smoke_topup_preparation_destination_exists",
      );
    throw error;
  }
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
    await verifyHostedCustomerRequestRelease({
      baseUrl: config.baseUrl,
      apiKey: config.releaseApiKey,
      expectedRevision: config.sourceRevision,
      expectedDeploymentId: config.deploymentId,
      ...(config.expectedConvexDeploymentId === undefined
        ? {}
        : { expectedConvexDeploymentId: config.expectedConvexDeploymentId }),
      ...(config.expectedConvexUrl === undefined
        ? {}
        : { expectedConvexUrl: config.expectedConvexUrl }),
      ...(config.bypassSecret === undefined
        ? {}
        : { deploymentProtectionBypass: config.bypassSecret }),
      fetchImpl: config.fetch,
    });
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
