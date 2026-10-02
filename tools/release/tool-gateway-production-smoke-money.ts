import { z } from "zod";

import { canonicalDigest } from "../../src/modules/common/canonical-digest";
import type { JsonValue } from "../../src/modules/capability-contract/public";
import {
  callUsageSchema,
  type CallResult,
} from "../../src/modules/capability-execution/call-contracts";
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
  GatewayPayoutReceiptSchema,
  GatewaySmokeError,
  addAmount,
  boundedRefSchema,
  conservationReceiptSchema,
  operationChargeReceiptSchema,
  sameAmount,
  strictCallReceiptSchema,
  subtractAmount,
  topupReceiptSchema,
  type GatewayPayoutReceipt,
  type GatewayTopupProviderEvent,
  type GatewayTopupWebhookReplay,
  type HostedTopupReadback,
} from "./tool-gateway-production-smoke-receipt";

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
  provider: z.infer<typeof ProviderEarningsViewSchema>;
}>;
type GatewayCompletedCall = Extract<
  CallResult,
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
      "gateway_smoke_provider_earnings_source_refused",
    );
  if (parsed.data.accountsTruncated)
    throw new GatewaySmokeError("gateway_smoke_provider_earnings_truncated");
  const matches = parsed.data.accounts.filter(
    (account) => account.currency === currency,
  );
  if (matches.length !== 1)
    throw new GatewaySmokeError(
      "gateway_smoke_provider_account_missing_or_ambiguous",
    );
  const account = matches[0];
  if (
    account === undefined ||
    account.earnings.businessId !== businessId ||
    account.payout.businessId !== businessId
  )
    throw new GatewaySmokeError(
      "gateway_smoke_provider_earnings_identity_mismatch",
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
      "gateway_smoke_provider_earnings_currency_mismatch",
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
    taxAmount: readback.taxAmount,
    chargeAmount: readback.chargeAmount,
    buyerBalanceBefore: readback.buyerBalanceBefore,
    buyerBalanceAfter: readback.buyerBalanceAfter,
    providerEvent,
  };
}

export function completedCallReceipt(
  completed: GatewayCompletedCall,
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
  const usage = callUsageSchema.parse(completed.usage);
  if (usage.chargeState !== "paid" && usage.chargeState !== "free_tier")
    throw new GatewaySmokeError("gateway_smoke_call_charge_state_invalid");
  return {
    transport,
    serviceId,
    principalDigest,
    operationRef: completed.toolRef,
    invocationRef: completed.callRef,
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

export function buildCallCharge(
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
    afterControl.provider.grossAccrual,
    beforeControl.provider.grossAccrual,
  );
  const rake = subtractAmount(
    afterControl.provider.rake,
    beforeControl.provider.rake,
  );
  const net = subtractAmount(
    afterControl.provider.providerNet,
    beforeControl.provider.providerNet,
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
    controlInvocationRef: activity.callRef,
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

export function buildGatewayPayoutReceipt(
  input: Readonly<{
    payout: StrictLivePayoutReceipt;
    payoutReplay: StrictLivePayoutReceipt;
  }>,
): GatewayPayoutReceipt {
  const payout = StrictLivePayoutReceiptSchema.parse(input.payout);
  const payoutReplay = StrictLivePayoutReceiptSchema.parse(input.payoutReplay);
  if (canonicalDigest(payout) !== canonicalDigest(payoutReplay))
    throw new GatewaySmokeError("gateway_smoke_payout_replay_changed");
  return GatewayPayoutReceiptSchema.parse(payout);
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
