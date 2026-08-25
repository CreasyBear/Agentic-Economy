import { z } from "zod";

import { canonicalDigest } from "../../src/modules/common/canonical-digest";
import type { JsonValue } from "../../src/modules/capability-contract/public";
import {
  operationInvokeUsageSchema,
  type OperationInvokeResult,
} from "../../src/modules/capability-execution/operation-invoke-contracts";
import {
  CreditAccountViewSchema,
  CreditActivityViewSchema,
  exactAmountSchema,
  KeyUsageViewSchema,
  ProviderEarningsViewSchema,
  StrictLivePayoutReceiptSchema,
  type StrictLivePayoutReceipt,
} from "../../src/modules/money/public";
import {
  GatewayPayoutProviderTransferReadbackSchema,
  GatewayPayoutReceiptSchema,
  GatewaySmokeError,
  MAX_PROVIDER_TRANSFER_COUNT,
  addAmount,
  boundedRefSchema,
  conservationReceiptSchema,
  operationChargeReceiptSchema,
  sameAmount,
  strictCallReceiptSchema,
  subtractAmount,
  topupReceiptSchema,
  type GatewayPayoutProviderTransferReadback,
  type GatewayPayoutReceipt,
  type GatewayTopupProviderEvent,
  type GatewayTopupWebhookReplay,
  type HostedTopupReadback,
} from "./operation-gateway-production-smoke-receipt";

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

export type StrictCreditActivityView = z.infer<typeof CreditActivityViewSchema>;
export type HostedMoneySnapshot = Readonly<{
  buyer: z.infer<typeof CreditAccountViewSchema>;
  usage: z.infer<typeof KeyUsageViewSchema>;
  supplier: z.infer<typeof ProviderEarningsViewSchema>;
}>;
type GatewayCompletedOperation = Extract<
  OperationInvokeResult,
  { kind: "completed" }
>;

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

export function topupReceipt(
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
    ...(readback.paymentId === undefined ? {} : { paymentId: readback.paymentId }),
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

export function completedCallReceipt(
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

export function buildOperationCharge(
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

export function buildConservation(
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
