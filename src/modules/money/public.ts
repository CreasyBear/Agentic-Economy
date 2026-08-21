import { z } from "zod";
import type { PaginationOptions } from "convex/server";
import { exactAmountSchema, type ExactAmount } from "./internal/exact-amount";
import {
  moneyRefSchema,
  type PricingConfig,
} from "./internal/pricing-contract";

export {
  moneyRefSchema,
  currencySchema,
  exactAmountSchema,
  pricingConfigSchema,
} from "./internal/pricing-contract";
export {
  addExactAmounts,
  amountAtScale,
  amountFromParts,
  compareExactAmounts,
  formatCurrencyAmount,
  formatExactAmount,
  multiplyExactAmountByBps,
  parseDecimalExactAmount,
  readExactAmount,
  rescaleExactAmount,
  subtractExactAmounts,
  zeroExactAmount,
} from "./internal/exact-amount";
export type { ExactAmount } from "./internal/exact-amount";
export type {
  PricingConfig,
  PricingConfigInput,
} from "./internal/pricing-contract";

export type PricingResolution =
  | Readonly<{
      kind: "free";
      reason: "zero_price" | "free_tier";
      amount: ExactAmount;
      priceDigest: string;
    }>
  | Readonly<{
      kind: "paid";
      amount: ExactAmount;
      priceDigest: string;
    }>
  | Readonly<{
      kind: "refused";
      code:
        "price_unavailable" | "pricing_config_invalid" | "currency_mismatch";
    }>;

export type MoneyRefusalCode =
  | "billing_identity_missing"
  | "billing_identity_mismatch"
  | "price_unavailable"
  | "pricing_config_invalid"
  | "currency_mismatch"
  | "price_changed"
  | "rake_not_configured"
  | "insufficient_credit"
  | "ledger_idempotency_conflict"
  | "ledger_cas_conflict"
  | "charge_reconciliation_required"
  | "credit_topup_amount_invalid"
  | "credit_topup_required"
  | "credit_topup_pending"
  | "credit_topup_outcome_unknown"
  | "stripe_setup_required"
  | "payout_not_ready"
  | "payout_below_threshold"
  | "payout_outcome_unknown"
  | "payout_reconciliation_required"
  | "payment_binding_invalid"
  | "payment_approval_expired"
  | "fresh_approval_required"
  | "budget_policy_missing"
  | "budget_generation_stale"
  | "budget_invocation_limit_exceeded"
  | "budget_daily_limit_exceeded"
  | "budget_monthly_limit_exceeded"
  | "budget_concurrency_exhausted"
  | "budget_reconciliation_required";
export type EntryType =
  "topup" | "charge" | "refund" | "payout_accrual" | "rake" | "external_loss";
export type EntryDirection = "credit" | "debit";
export type AccountKind = "operator_credit" | "provider_earnings" | "ae_rake" | "ae_external_loss";
export type AccountState = "active" | "locked";
export type TransactionState =
  "pending" | "applied" | "outcome_unknown" | "reversed";
export type ChargeState =
  "free_tier" | "paid" | "insufficient_credit" | "outcome_unknown" | "refunded";
export type PayoutAccountState =
  "not_started" | "onboarding_started" | "submitted" | "restricted" | "ready";
export type PayoutState =
  | "review"
  | "held_kyc"
  | "held_threshold"
  | "transfer_pending"
  | "paid"
  | "reversed"
  | "failed"
  | "outcome_unknown";

export type MoneyAccount = Readonly<{
  accountRef: string;
  accountKind: AccountKind;
  accountId?: string;
  businessId?: string;
  balance: ExactAmount;
  recoveryDue: ExactAmount;
  version: number;
  state: AccountState;
  createdAt: number;
  updatedAt: number;
}>;

export type MoneyLedgerEntry = Readonly<{
  entryRef: string;
  accountRef: string;
  entryType: EntryType;
  direction: EntryDirection;
  amount: ExactAmount;
  transactionRef: string;
  idempotencyKey: string;
  principalId?: string;
  businessId?: string;
  invocationRef?: string;
  attemptRef?: string;
  sourceDigest: string;
  evidenceRefs: readonly string[];
  createdAt: number;
  reversalOf?: string;
}>;

export type MoneyTransaction = Readonly<{
  transactionRef: string;
  kind: EntryType;
  idempotencyKey: string;
  inputDigest: string;
  principalId: string;
  accountId?: string;
  currency: string;
  exponent: number;
  state: TransactionState;
  expectedAccountVersion: number;
  amount?: ExactAmount;
  budgetState?: "reserved" | "settled" | "released" | "unknown";
  settledAt?: number;
  externalRef?: string;
  reversalOf?: string;
  createdAt: number;
  updatedAt: number;
}>;

export type MoneyUsageEvent = Readonly<{
  usageRef: string;
  principalId: string;
  accountId?: string;
  credentialId: string;
  serviceRef: string;
  offeringRef: string;
  businessId: string;
  invocationRef: string;
  attemptRef: string;
  operationKey: string;
  priceDigest: string;
  chargeState: ChargeState;
  amount: ExactAmount;
  transactionRef?: string;
  observedAt: number;
}>;

export type MoneyFreeTierCounter = Readonly<{
  counterRef: string;
  principalId: string;
  offeringRef: string;
  window: "day" | "month";
  windowStart: string;
  callsUsed: number;
  version: number;
  updatedAt: number;
}>;

export type MoneyStripeEvent = Readonly<{
  stripeEventId: string;
  eventType: string;
  payloadDigest: string;
  status: "received" | "applied" | "ignored" | "failed";
  appliedRef?: string;
  receivedAt: number;
  appliedAt?: number;
}>;

export type MoneyPayoutAccount = Readonly<{
  businessId: string;
  currency: string;
  exponent: number;
  stripeAccountId: string;
  state: PayoutAccountState;
  detailsSubmitted: boolean;
  recipientCapabilityActive: boolean;
  requirementsDigest: string;
  providerObjectDigest?: string;
  lastStripePayloadDigest?: string;
  lastStripeObservedAt?: number;
  version?: number;
  lastStripeEventId?: string;
  createdAt: number;
  updatedAt: number;
}>;

export type MoneyPayout = Readonly<{
  payoutRef: string;
  businessId: string;
  grossAccrual: ExactAmount;
  rake: ExactAmount;
  providerNet: ExactAmount;
  minimumPayout: ExactAmount;
  state: PayoutState;
  periodStart: string;
  periodEnd: string;
  stripeTransferId?: string;
  payoutCommandId?: string;
  transferRequestDigest?: string;
  transferEvidenceDigest?: string;
  transferReversalEvidenceDigest?: string;
  transferObservedAt?: number;
  transferStatus?:
    "pending" | "succeeded" | "failed" | "reversed" | "outcome_unknown";
  providerHeldBefore?: ExactAmount;
  providerHeldAfter?: ExactAmount;
  providerPaidBefore?: ExactAmount;
  providerPaidAfter?: ExactAmount;
  idempotencyKey: string;
  failureCode?: string;
  createdAt: number;
  updatedAt: number;
}>;

export type MoneyPayoutTransferStatus = Readonly<{
  payoutRef: string;
  payoutCommandId: string;
  state: PayoutState;
  idempotencyKey: string;
  inputDigest: string;
  amount: ExactAmount;
  destinationAccountId: string;
  stripeTransferId?: string;
  transferStatus?:
    "pending" | "succeeded" | "failed" | "reversed" | "outcome_unknown";
  requestDigest?: string;
  evidenceDigest?: string;
  reversalEvidenceDigest?: string;
  providerHeldBefore?: ExactAmount;
  providerHeldAfter?: ExactAmount;
  providerPaidBefore?: ExactAmount;
  providerPaidAfter?: ExactAmount;
}>;

export type MoneyRefusal = Readonly<{
  kind: "refused";
  code: MoneyRefusalCode;
  retryable: boolean;
  nextAction?: "credit_topup_required";
  requiredAmount?: ExactAmount;
  availableAmount?: ExactAmount;
}>;
export function isMoneyRefusal(value: unknown): value is MoneyRefusal {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "refused"
  );
}

export type MoneyAcceptedCharge = Readonly<{
  kind: "accepted";
  chargeState: "free_tier" | "paid";
  amount: ExactAmount;
  priceDigest: string;
  transactionRef?: string;
  providerNet?: ExactAmount;
  rake?: ExactAmount;
}>;

export type MoneyAcceptedInvocationCharge = MoneyAcceptedCharge &
  Readonly<{
    usageRef: string;
    observedAt: number;
  }>;

export type ChargeAuthorizationResult =
  MoneyAcceptedInvocationCharge | MoneyRefusal;
export type MoneyChargeOutcomeUnknown = Readonly<{
  kind: "outcome_unknown";
  transactionRef: string;
}>;


export type CredentialBudgetGrant = Readonly<{
  grantRef: string;
  generation: number;
}>;
export type MoneyInvocationChargeInput = Readonly<{
  applicationRef?: string;
  principalId: string;
  operationKey: string;
  invocationRef: string;
  attemptRef: string;
  effectGeneration: number;
  capabilityContractDigest: string;
  businessId: string;
  offeringRef: string;
  pricingConfig: PricingConfig;
  priceDigest: string;
  priceSourceDigest: string;
  authorityMaximumSpend: ExactAmount;
  credentialBudget?: CredentialBudgetGrant;
}>;

export type MoneyInvocationPort = Readonly<{
  authorizeInvocationCharge: (
    input: MoneyInvocationChargeInput,
  ) => Promise<ChargeAuthorizationResult>;
  markChargeOutcomeUnknown?: (
    input: Readonly<{
      transactionRef: string;
      principalId: string;
      invocationRef: string;
      attemptRef: string;
      effectGeneration: number;
    }>,
  ) => Promise<MoneyChargeOutcomeUnknown | MoneyRefusal>;
  refundCharge?: (
    input: Readonly<{
      transactionRef: string;
      principalId: string;
      invocationRef: string;
      attemptRef: string;
      effectGeneration: number;
    }>,
  ) => Promise<MoneyRefusal | MoneyAcceptedCharge>;
  reconcileCharge?: (
    input: Readonly<{
      transactionRef: string;
      principalId: string;
      outcome: "not_released" | "released";
      evidenceRefs: readonly string[];
    }>,
  ) => Promise<MoneyRefusal | MoneyAcceptedCharge>;
}>;

export type RakeConfig = Readonly<{ rakeBps: number }>;
export type RakeSplit = Readonly<{
  grossAmount: ExactAmount;
  rakeBps: number;
  rake: ExactAmount;
  providerNet: ExactAmount;
}>;

export type CreditAccountQuery = Readonly<{
  principalId: string;
  currency: string;
}>;
export type CreditActivityQuery = Readonly<{
  principalId: string;
  credentialId: string;
  currency: string;
  paginationOpts: PaginationOptions;
}>;
export type KeyUsageQuery = Readonly<{
  principalId: string;
  credentialId: string;
  currency: string;
}>;
export type ProviderEarningsQuery = Readonly<{
  businessId: string;
  currency: string;
}>;
export type PayoutStatusQuery = Readonly<{
  businessId: string;
  currency: string;
}>;

export type CreditAccountView = Readonly<{
  principalId: string;
  accountId: string;
  balance: ExactAmount;
  pendingTopup?: Readonly<{
    amount: ExactAmount;
    state: "pending" | "outcome_unknown";
    externalRef?: string;
  }>;
  autoRecharge: Readonly<{
    enabled: boolean;
    threshold: ExactAmount;
    rechargeAmount: ExactAmount;
  }>;
  evidence: "source" | "labelled_local_dev";
}>;
export type CreditActivityView = Readonly<{
  activityRef: string;
  credentialId: string;
  serviceRef: string;
  offeringRef: string;
  businessId: string;
  operationKey: string;
  invocationRef: string;
  attemptRef: string;
  grossAmount: ExactAmount;
  chargeState: ChargeState;
  priceDigest: string;
  observedAt: number;
  transactionRef?: string;
}>;

export type KeyUsageView = Readonly<{
  credentialId: string;
  callCount: number;
  paidCallCount: number;
  freeCallCount: number;
  grossSpend: ExactAmount;
  states: readonly ChargeState[];
}>;

export type ProviderEarningsView = Readonly<{
  businessId: string;
  grossAccrual: ExactAmount;
  rake: ExactAmount;
  providerNet: ExactAmount;
  paidOut: ExactAmount;
  held: ExactAmount;
  recoveryDue: ExactAmount;
  /** True when the source capped its ledger scan at the latest 100 entries. */
  truncated: boolean;
  evidence: "source" | "labelled_local_dev";
}>;

export type PayoutStatusView = Readonly<{
  businessId: string;
  accountState: PayoutAccountState | "missing";
  payoutState?: PayoutState;
  payoutRef?: string;
  payoutCommandId?: string;
  idempotencyKey?: string;
  providerNet: ExactAmount;
  minimumPayout: ExactAmount;
  stripeTransferId?: string;
  destinationAccountId?: string;
  transferStatus?:
    "pending" | "succeeded" | "failed" | "reversed" | "outcome_unknown";
  providerRecoveryDeadlineAt?: number;
  recoveryState?: "provider_id" | "idempotency_key" | "admin_intervention";
  requestDigest?: string;
  evidenceDigest?: string;
  reversalEvidenceDigest?: string;
  providerHeldBefore?: ExactAmount;
  providerHeldAfter?: ExactAmount;
  providerPaidBefore?: ExactAmount;
  providerPaidAfter?: ExactAmount;
  evidence: "source" | "labelled_local_dev";
}>;
const strictMoneyDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const strictMoneyCountSchema = z.number().int().safe().nonnegative();
const strictChargeStateSchema = z.enum([
  "free_tier",
  "paid",
  "insufficient_credit",
  "outcome_unknown",
  "refunded",
]);

export const CreditAccountViewSchema = z.strictObject({
  principalId: moneyRefSchema,
  balance: exactAmountSchema,
  pendingTopup: z
    .strictObject({
      amount: exactAmountSchema,
      state: z.enum(["pending", "outcome_unknown"]),
      externalRef: moneyRefSchema.exactOptional(),
    })
    .exactOptional(),
  autoRecharge: z.strictObject({
    enabled: z.boolean(),
    threshold: exactAmountSchema,
    rechargeAmount: exactAmountSchema,
  }),
  evidence: z.literal("source"),
});

export const CreditActivityViewSchema = z.strictObject({
  activityRef: moneyRefSchema,
  credentialId: moneyRefSchema,
  serviceRef: moneyRefSchema,
  offeringRef: moneyRefSchema,
  businessId: moneyRefSchema,
  operationKey: moneyRefSchema,
  invocationRef: moneyRefSchema,
  attemptRef: moneyRefSchema,
  grossAmount: exactAmountSchema,
  chargeState: strictChargeStateSchema,
  priceDigest: strictMoneyDigestSchema,
  observedAt: strictMoneyCountSchema,
  transactionRef: moneyRefSchema.exactOptional(),
});

export const KeyUsageViewSchema = z.strictObject({
  credentialId: moneyRefSchema,
  callCount: strictMoneyCountSchema,
  paidCallCount: strictMoneyCountSchema,
  freeCallCount: strictMoneyCountSchema,
  grossSpend: exactAmountSchema,
  states: z.array(strictChargeStateSchema),
});

export const ProviderEarningsViewSchema = z.strictObject({
  businessId: moneyRefSchema,
  grossAccrual: exactAmountSchema,
  rake: exactAmountSchema,
  providerNet: exactAmountSchema,
  paidOut: exactAmountSchema,
  held: exactAmountSchema,
  recoveryDue: exactAmountSchema,
  truncated: z.literal(false),
  evidence: z.literal("source"),
});

export const StrictLivePayoutReceiptSchema = z.strictObject({
  payoutRef: moneyRefSchema,
  payoutCommandId: moneyRefSchema,
  supplierBusinessId: moneyRefSchema,
  payoutAccountRef: moneyRefSchema,
  stripeAccountDigest: strictMoneyDigestSchema,
  stripeTransferDigest: strictMoneyDigestSchema,
  transferEvidenceDigest: strictMoneyDigestSchema,
  providerNetAmount: exactAmountSchema,
  providerHeldBefore: exactAmountSchema,
  providerHeldAfter: exactAmountSchema,
  providerPaidBefore: exactAmountSchema,
  providerPaidAfter: exactAmountSchema,
  replayAdditionalDebits: z.literal(0),
});

export type StrictLivePayoutReceipt = z.infer<
  typeof StrictLivePayoutReceiptSchema
>;

export type MoneyPaginationPage<Item> = Readonly<{
  page: readonly Item[];
  isDone: boolean;
  continueCursor: string;
}>;

export type MoneyQueryPort = Readonly<{
  readCreditAccount: (input: CreditAccountQuery) => Promise<CreditAccountView>;
  listCreditActivity: (
    input: CreditActivityQuery,
  ) => Promise<MoneyPaginationPage<CreditActivityView>>;
  readKeyUsage: (input: KeyUsageQuery) => Promise<KeyUsageView>;
  readProviderEarnings: (
    input: ProviderEarningsQuery,
  ) => Promise<ProviderEarningsView>;
  readPayoutStatus: (input: PayoutStatusQuery) => Promise<PayoutStatusView>;
}>;

export async function readCreditAccount(
  input: Readonly<{ port: MoneyQueryPort; query: CreditAccountQuery }>,
): Promise<CreditAccountView> {
  return await input.port.readCreditAccount(input.query);
}

export async function listCreditActivity(
  input: Readonly<{ port: MoneyQueryPort; query: CreditActivityQuery }>,
): Promise<MoneyPaginationPage<CreditActivityView>> {
  return await input.port.listCreditActivity(input.query);
}

export async function readKeyUsage(
  input: Readonly<{ port: MoneyQueryPort; query: KeyUsageQuery }>,
): Promise<KeyUsageView> {
  return await input.port.readKeyUsage(input.query);
}

export async function readProviderEarnings(
  input: Readonly<{ port: MoneyQueryPort; query: ProviderEarningsQuery }>,
): Promise<ProviderEarningsView> {
  return await input.port.readProviderEarnings(input.query);
}

export async function readPayoutStatus(
  input: Readonly<{ port: MoneyQueryPort; query: PayoutStatusQuery }>,
): Promise<PayoutStatusView> {
  return await input.port.readPayoutStatus(input.query);
}

export {
  computeProviderFeeBreakdown,
  computeRakeSplit,
  normalizePricingConfig,
  pricingConfigDigest,
  resolveInvocationPrice,
} from "./internal/pricing-config";
export type { ProviderFeeBreakdown } from "./internal/pricing-config";
export {
  createLedgerState,
  beginIdempotentTransaction,
  validateChargeAccounts,
  applyTopup,
  authorizePaidCharge,
  planPaidCharge,
  applyChargePlan,
  paidChargeContractInput,
  appendRefundReversal,
  applyProviderAccountCredit,
  applyProviderAccountDebit,
  markOutcomeUnknown,
  decideChargeOutcomeUnknown,
  payoutAccrualFromChargeAmounts,
  reconcileCharge,
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  accountRefForExternalLoss,
  sameEvidenceRefs,
  selectChargeEntries,
  recoveryExceedsProvider,
  validateChargeContract,
} from "./internal/ledger";
export type {
  LedgerState,
  LedgerOperationResult,
  BeginTransactionInput,
  TopupInput,
  PaidChargeInput,
  ChargePlan,
  ChargePlanAccounts,
  PlanPaidChargeInput,
  RefundInput,
  OutcomeUnknownInput,
  ReconcileChargeInput,
  ProviderAccountCreditApplication,
  ChargeBudgetState,
  ChargeOutcomeUnknownDecision,
  PayoutAccrualAmounts,
  SelectedChargeEntries,
  ChargeEntryLeg,
  ChargeContractAccount,
  ChargeContractEntry,
  ChargeContractOriginal,
  ChargeContractUsage,
  ValidateChargeContractInput,
  ValidatedChargeContract,
} from "./internal/ledger";
export {
  transitionPayoutAccount,
  transitionPayout,
  payoutReviewWindow,
  STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
  STRIPE_CONNECT_RECOVERY_WINDOW_MS,
  STRIPE_CONNECT_RECOVERY_LEASE_MS,
} from "./internal/payout-policy";
export type {
  PayoutPolicyResult,
  PayoutAccountTransitionInput,
  PayoutTransitionInput,
} from "./internal/payout-policy";
export { payoutTransferCommand } from "./internal/payout-transfer-command";
export type {
  PayoutTransferCommand,
  PayoutTransferCommandInput,
} from "./internal/payout-transfer-command";
export {
  paymentBindingSchema,
  validatePaymentBinding,
} from "./internal/payment-binding";
export type {
  PaymentBinding,
  PaymentBindingValidation,
} from "./internal/payment-binding";
export type {
  CreditPaymentPort,
  CreditPaymentRequest,
  CreditPaymentReadRequest,
  CreditPaymentEvidence,
  CreditPaymentSession,
  ConnectAccountPort,
  ConnectAccountRequest,
  OnboardingLinkRequest,
  ConnectAccountEvidence,
  PayoutTransferPort,
  PayoutTransferRequest,
  PayoutTransferEvidence,
} from "./internal/ports";
export type {
  StripeAccountUpdatedWebhookEvent,
  StripeMoneyWebhookEvent,
} from "./internal/stripe-webhook";
export {
  createTopupState,
  beginCreditTopup,
  applyCreditTopup,
  markCreditTopupOutcomeUnknown,
  setAutoRecharge,
  productionCreditTopupConfig,
  calculateCreditTopupFinancials,
  STRIPE_CREDIT_RECOVERY_WINDOW_MS,
  fixtureUsdTopupConfig,
} from "./internal/topup";
export type {
  CreditTopupConfig,
  CreditTopupFinancials,
  AutoRechargeSettings,
  CreditTopupCommand,
  TopupState,
  BeginTopupResult,
} from "./internal/topup";
export {
  admitCredentialBudget,
  settleCredentialBudget,
  releaseCredentialBudget,
  credentialBudgetReservationDigest,
  credentialBudgetDayWindowStart,
  credentialBudgetMonthWindowStart,
} from "./internal/credential-budget";
export type {
  CredentialBudgetPolicy,
  CredentialBudgetWindowUsage,
  CredentialBudgetUsage,
  CredentialBudgetReservationState,
  CredentialBudgetReservation,
  CredentialBudgetRefusalCode,
  CredentialBudgetAdmission,
} from "./internal/credential-budget";
export { reverseCredentialBudget } from "./internal/credential-budget";
export {
  decideExternalSpendFinalization,
  decideExternalSpendReconciliation,
  decideExternalSpendReversal,
  externalSpendFinalizationCommandRefusal,
  externalSpendIdentityDigest,
  externalSpendIdentityFromReservation,
  externalSpendIdentityMatchingReservationRef,
  externalSpendIdentityMaterialValid,
  externalSpendFinalizationDigest,
  externalSpendPaymentFactsValid,
  externalSpendReconciliationCommandRefusal,
  externalSpendReconciliationDigest,
  externalSpendReversalCommandRefusal,
  externalSpendReversalDigest,
  mintExternalSpendIdentity,
  sameExternalSpendIdentity,
  externalSpendStateForSettlement,
} from "./internal/external-spend";
export type {
  ExternalSpendFinalizationCommand,
  ExternalSpendIdentity,
  ExternalSpendPaymentFacts,
  ExternalSpendReservation,
  ExternalSpendReservationState,
  ExternalSpendSettlementStatus,
  ExternalSpendSubmissionStatus,
  ExternalSpendRefusalCode,
  ExternalSpendMutationResult,
} from "./internal/external-spend";
export {
  createInMemoryMoneyQueryPort,
  projectProviderEarnings,
} from "./internal/query-projections";
export type { ProviderEarningsProjectionResult } from "./internal/query-projections";
export {
  buildQualifiedUseReceipt,
  decideQualifiedUseWrite,
  qualifiedUseEligibility,
  qualifiedUseMaterialDigest,
  qualifiedUseRef,
  sameQualifiedUseIdentity,
  QUALIFIED_USE_EXCLUSIONS,
  QUALIFIED_USE_PRINCIPAL_CLASSES,
} from "./internal/delivery";
export type {
  QualifiedUseEligibility,
  QualifiedUseExclusion,
  QualifiedUseIdentity,
  QualifiedUseMaterial,
  QualifiedUsePrincipalClass,
  QualifiedUseReceipt,
  QualifiedUseWriteDecision,
} from "./internal/delivery";
