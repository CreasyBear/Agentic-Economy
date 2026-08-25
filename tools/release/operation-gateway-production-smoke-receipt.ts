import { mkdir, open, readFile, unlink, link } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { z } from "zod";

import { canonicalDigest } from "../../src/modules/common/canonical-digest";
import {
  CreditAccountViewSchema,
  CreditActivityViewSchema,
  exactAmountSchema,
  KeyUsageViewSchema,
  ProviderEarningsViewSchema,
  StrictLivePayoutReceiptSchema,
  addExactAmounts,
  calculateCreditTopupFinancials,
  compareExactAmounts,
  productionCreditTopupConfig,
  subtractExactAmounts,
  type ExactAmount,
} from "../../src/modules/money/public";

const RELEASE_RECEIPT_DIRECTORY = "output/release";
export const MAX_REF_LENGTH = 500;
export const SERVICES_PAGE_LIMIT = 50;
export const MAX_SERVICE_PAGES = 100;
export const MAX_SERVICE_COUNT = SERVICES_PAGE_LIMIT * MAX_SERVICE_PAGES;
export const MAX_ENDPOINT_COUNT = 50_000;
export const MAX_PROVIDER_TRANSFER_COUNT = 100;
export const boundedRefSchema = z.string().trim().min(1).max(MAX_REF_LENGTH);
export const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
export const operationRefSchema = z.string().regex(/^operation:v1:[0-9a-f]{64}$/u);
export const APPROVED_EXTERNAL_MOVEMENT_CAP: ExactAmount = Object.freeze({
  currency: "USD",
  units: "600",
  exponent: 2,
});

export const authenticationSchema = z.union([
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
export const strictCallReceiptSchema = z.strictObject({
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
export const selectedOperationSchema = z.strictObject({
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

export const topupProviderEventSchema = z.strictObject({
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
export const topupPreparationSchema = z.strictObject({
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
export const topupWebhookReplaySchema = z.strictObject({
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
export const topupReceiptSchema = z.strictObject({
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
export const operationChargeReceiptSchema = z.strictObject({
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

export const conservationReceiptSchema = z.strictObject({
  buyerDebit: exactAmountSchema,
  supplierGrossAccrual: exactAmountSchema,
  aeRake: exactAmountSchema,
  providerNet: exactAmountSchema,
  paidOut: exactAmountSchema,
  held: exactAmountSchema,
});

export const fixtureSchema = z.strictObject({
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
export type GatewayPayoutProviderTransferReadback = z.infer<
  typeof GatewayPayoutProviderTransferReadbackSchema
>;
export type GatewayPayoutReceipt = z.infer<typeof GatewayPayoutReceiptSchema>;

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

export class GatewaySmokeError extends Error {
  readonly cleanupCodes: readonly string[];
  constructor(code: string, cleanupCodes: readonly string[] = []) {
    super(code);
    this.name = "GatewaySmokeError";
    this.cleanupCodes = cleanupCodes;
  }
}
export function smokeErrorCode(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function gatewaySmokeFailureWithCleanup(
  primary: unknown,
  failures: readonly unknown[],
): GatewaySmokeError {
  return new GatewaySmokeError(
    smokeErrorCode(primary),
    failures.map(smokeErrorCode),
  );
}

export function sameAmount(a: ExactAmount, b: ExactAmount): boolean {
  return compareExactAmounts(a, b) === 0;
}
export function addAmount(a: ExactAmount, b: ExactAmount): ExactAmount {
  const result = addExactAmounts(a, b);
  if (result === undefined)
    throw new GatewaySmokeError("gateway_smoke_amount_currency_mismatch");
  return result;
}
export function subtractAmount(
  a: ExactAmount,
  b: ExactAmount,
): ExactAmount | undefined {
  return subtractExactAmounts(a, b);
}
export function zeroAmount(amount: ExactAmount): ExactAmount {
  return { currency: amount.currency, units: "0", exponent: amount.exponent };
}

export function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0)
    throw new Error(`${name} is required`);
  return normalized;
}

export function buildGatewayProductionSmokeReceipt(
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
