import { z } from "zod";
import type { PaginationOptions } from "convex/server";
export type { FormanceMoneyResult } from './formance'
export type { FormanceSettlementReadResult, FormanceReservationReadResult, FormanceReleaseReadResult } from './formance-result'
export type { FormanceManagedCallBooking } from './formance-workflows'
import { exactAmountSchema, type ExactAmount } from "./internal/exact-amount";
import {
  moneyRefSchema,
} from "./internal/pricing-contract";
import type { ChargeState } from './internal/money-types'
import type {
  PayoutStatusView,
  ProviderEarningsView,
} from './internal/money-query-views'

export {
  COMMERCIAL_POLICY_FAMILIES,
  DEFAULT_PLAN_RATE_TOLERANCE_BPS,
  COMMERCIAL_POLICY_REFUSAL_REASONS,
  commercialPolicyRefusalReasonSchema,
  evaluateCommercialPolicyGate,
  PACKAGE4_FORMANCE_REQUIREMENTS,
  productionTreasuryBufferSupported,
  SANDBOX_COMMERCIAL_POLICY_CONTROLS,
  validCommercialPolicyControl,
  validProductionCommercialPolicyControl,
} from './internal/commercial-policy'
export {
  admitTaxInvoiceIssuance,
  AUSTRALIAN_INVOICE_SELLER,
  formatAbnDisplay,
  isValidAbn,
  normalizeAbn,
  parseTaxDocumentSnapshot,
  taxDocumentNumber,
  taxDocumentSnapshotSchema,
} from './internal/tax-invoice-control'
export type {
  CustomerTaxFacts,
  TaxDocumentSnapshot,
  TaxInvoiceSnapshot,
  TaxInvoiceIssuanceAdmission,
  TaxInvoiceIssuanceWithheldReason,
} from './internal/tax-invoice-control'
export type {
  CommercialPolicyApproval,
  CommercialPolicyControl,
  CommercialPolicyControls,
  CommercialPolicyEnvironment,
  CommercialPolicyFamily,
  CommercialPolicyGateRefusalCode,
  CommercialPolicyGateResult,
  CommercialPolicyRefusalReason,
  CommercialPolicyLifecycle,
  CommercialPolicySandboxFixture,
} from './internal/commercial-policy'
export {
  AUD_EXPONENT,
  audFundingPolicyFromCommercialControls,
  calculateAudFundingFinancials,
  canonicalAudUnits,
  quoteAudAccountFunding,
  roundAudStatementTotal,
  roundAudUnitsToCent,
} from './internal/aud-funding'
export {
  REFERENCE_RATE_MAX_AGE_MS,
  convertUsdcToAud,
  createExecutableRatePort,
  quoteExecutableAudToUsdc,
  quoteManagedX402BuyerAud,
  validateExecutableRateEvidence,
  validateExecutableRateEvidenceIntegrity,
  validReferenceRate,
} from './internal/executable-rate'
export type {
  ReferenceRate,
  ManagedReferenceRateEvidence,
  LegacyExecutableRateEvidence,
  ExecutableRateEnvironment,
  ExecutableRateEvidence,
  ExecutableRatePort,
  ExecutableRateQuoteResult,
} from './internal/executable-rate'
export type {
  AudFundingPolicy,
} from './internal/aud-funding'
export {
  accountRefForOwner,
  accountRefForProvider,
} from './internal/account-ref'

export {
  moneyRefSchema,
  currencySchema,
  exactAmountSchema,
  pricingConfigSchema,
} from "./internal/pricing-contract";
export {
  pricingConfigDecisionAmount,
  pricingConfigSourceAmount,
  fixedAudPricingConfig,
  displayPriceFromPricingConfig,
} from './internal/pricing-config'
export type { DisplayPrice } from './internal/pricing-config'
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
  sameExactScale,
  subtractExactAmounts,
  sumExactAmounts,
  zeroExactAmount,
} from "./internal/exact-amount";
export type { ExactAmount } from "./internal/exact-amount";
export type {
  PricingConfig,
  PricingConfigInput,
} from "./internal/pricing-contract";
export type {
  ChargeAuthorizationResult,
  ChargeState,
  MoneyAcceptedCallCharge,
  MoneyAcceptedCharge,
  MoneyChargeOutcomeUnknown,
  MoneyFreeTierCounter,
  MoneyPayout,
  MoneyPayoutAccount,
  MoneyPayoutTransferStatus,
  MoneyRefusal,
  MoneyRefusalCode,
  MoneyStripeEvent,
  PayoutAccountState,
  PayoutState,
  PricingResolution,
  RakeConfig,
  RakeSplit,
} from './internal/money-types'
export { isMoneyRefusal } from './internal/money-types'
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
  purchasedBalance?: ExactAmount;
  promotionalBalance?: ExactAmount;
  nextPromotionalExpiryAt?: number | null;
  pendingTopup?: Readonly<{
    commandRef: string
    amount: ExactAmount
    state: "pending" | "outcome_unknown"
    externalRef?: string | undefined
  }> | undefined
  evidence: "source" | "labelled_local_dev";
}>;
export type CreditActivityView = Readonly<{
  activityRef: string;
  credentialId: string;
  serviceRef: string | null;
  offeringRef: string | null;
  businessId: string | null;
  operationKey: string;
  callRef: string;
  attemptRef: string | null;
  grossAmount: ExactAmount;
  chargeState: ChargeState;
  priceDigest: string | null;
  observedAt: number;
  entryKind?:'charge'|'refund'|'promotional_use'|'promotional_refund'
  callCreatedAt?:number
  effectiveAt?:number
  recordedAt?:number|null
  serviceFeeUnits?:string
  transactionRef?: string;
}>;

export type KeyUsageView = Readonly<{
  credentialId: string;
  callCount: number;
  paidCallCount: number;
  freeCallCount: number;
  grossSpend: ExactAmount;
  refundUnits?:string
  netChargeUnits?:string
  promotionalUseUnits?:string
  promotionalRefundUnits?:string
  periodStartAt?:number
  periodEndAt?:number
  snapshotAt?:number
  countTimeBasis?:'call_created'
  spendTimeBasis?:'financial_effective'
  coverage?:'complete'|'partial'
  source?:'formance_with_canonical_call_joins'
  states: readonly ChargeState[];
}>;

export type { PayoutStatusView, ProviderEarningsView } from './internal/money-query-views'

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
  purchasedBalance: exactAmountSchema.optional(),
  promotionalBalance: exactAmountSchema.optional(),
  nextPromotionalExpiryAt: z.number().int().nonnegative().nullable().optional(),
  pendingTopup: z
    .strictObject({
      commandRef: moneyRefSchema,
      amount: exactAmountSchema,
      state: z.enum(["pending", "outcome_unknown"]),
      externalRef: moneyRefSchema.optional(),
    })
    .optional(),
  evidence: z.literal("source"),
});

export const CreditActivityViewSchema = z.strictObject({
  activityRef: moneyRefSchema,
  credentialId: moneyRefSchema,
  serviceRef: moneyRefSchema.nullable(),
  offeringRef: moneyRefSchema.nullable(),
  businessId: moneyRefSchema.nullable(),
  operationKey: moneyRefSchema,
  callRef: moneyRefSchema,
  attemptRef: moneyRefSchema.nullable(),
  grossAmount: exactAmountSchema,
  chargeState: strictChargeStateSchema,
  priceDigest: strictMoneyDigestSchema.nullable(),
  observedAt: strictMoneyCountSchema,
  transactionRef: moneyRefSchema.exactOptional(),
  entryKind:z.enum(['charge','refund','promotional_use','promotional_refund']).exactOptional(),
  callCreatedAt:strictMoneyCountSchema.exactOptional(),effectiveAt:strictMoneyCountSchema.exactOptional(),recordedAt:strictMoneyCountSchema.nullable().exactOptional(),serviceFeeUnits:z.string().regex(/^(?:0|[1-9]\d*)$/u).exactOptional(),
});

export const KeyUsageViewSchema = z.strictObject({
  credentialId: moneyRefSchema,
  callCount: strictMoneyCountSchema,
  paidCallCount: strictMoneyCountSchema,
  freeCallCount: strictMoneyCountSchema,
  grossSpend: exactAmountSchema,
  states: z.array(strictChargeStateSchema),
  refundUnits:z.string().regex(/^(?:0|[1-9]\d*)$/u).exactOptional(),netChargeUnits:z.string().regex(/^(?:0|-?[1-9]\d*)$/u).exactOptional(),promotionalUseUnits:z.string().regex(/^(?:0|[1-9]\d*)$/u).exactOptional(),promotionalRefundUnits:z.string().regex(/^(?:0|[1-9]\d*)$/u).exactOptional(),
  periodStartAt:strictMoneyCountSchema.exactOptional(),periodEndAt:strictMoneyCountSchema.exactOptional(),snapshotAt:strictMoneyCountSchema.exactOptional(),
  countTimeBasis:z.literal('call_created').exactOptional(),spendTimeBasis:z.literal('financial_effective').exactOptional(),coverage:z.enum(['complete','partial']).exactOptional(),source:z.literal('formance_with_canonical_call_joins').exactOptional(),
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
export type CreditActivityPage = MoneyPaginationPage<CreditActivityView> & Readonly<{
  periodStartAt?:number
  periodEndAt?:number
  snapshotAt?:number
  timeBasis?:'financial_effective'
  coverage?:'complete'|'partial'
  source?:'formance_with_canonical_call_joins'
}>;

export type MoneyQueryPort = Readonly<{
  readCreditAccount: (input: CreditAccountQuery) => Promise<CreditAccountView>;
  listCreditActivity: (
    input: CreditActivityQuery,
  ) => Promise<CreditActivityPage>;
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
): Promise<CreditActivityPage> {
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
  computeRakeSplit,
  normalizePricingConfig,
  pricingConfigDigest,
  resolveCallPrice,
} from "./internal/pricing-config";
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
} from "./internal/ports";
export type {
  StripeAccountUpdatedWebhookEvent,
  StripeRefundWebhookEvent,
  StripeMoneyWebhookEvent,
} from "./internal/stripe-webhook";
export {
  FUNDING_QUOTE_CONTRACT_VERSION,
  FUNDING_QUOTE_VALIDITY_MS,
  FUNDING_CONSTRAINTS_PATH,
  FUNDING_QUOTE_PATH,
  FUNDING_PREFLIGHT_ROUTE_CONTRACTS,
  commercialPolicyControlsFromFundingProjection,
  fundingConstraintsSchema,
  fundingQuoteInputSchema,
  fundingQuoteSchema,
  quoteFunding,
  readFundingConstraints,
} from "./internal/funding-quote";
export type {
  FundingConstraints,
  FundingQuote,
  FundingQuoteInput,
} from "./internal/funding-quote";
export {
  evaluateOrganizationMonthlySpendFence,
  type OrganizationMonthlySpendFenceInput,
  type OrganizationMonthlySpendFenceResult,
} from './internal/organization-monthly-spend-fence'
export { formatDisplayPrice, formatDisplayAmount } from './internal/display-price'
export { accountHistoryResultSchema } from './internal/account-history'
export type { AccountHistoryEntry, AccountHistoryResult } from './internal/account-history'
export { digestReference } from './internal/formance-digest'
export {
  spendingPeriodsValue,
  spendingPeriodAdjustmentValue,
  spendingPeriodAdjustmentReference,
} from './internal/spending-period-values'
export type {
  SpendingPeriods,
  SpendingPeriodAdjustment,
} from './internal/spending-period-values'

export { promotionalCreditReference, promotionalPurchasedAmounts, promotionalCreditAllocationValue, partitionPromotionalCreditAllocation, MAX_PROMOTIONAL_GRANTS_PER_CALL, type PromotionalCreditAllocation } from './promotional-credit-contracts'
export { TRIAL_AMOUNT_UNITS, TRIAL_DURATION_MS, trialRecipientValue, trialActivationValue, trialDeliveryValue, trialClaimResultValue } from './trial-access-contracts'

export { accountCreditBalanceValue, eligiblePromotionalGrantValue, type AccountCreditBalance, type EligiblePromotionalGrant } from './promotional-credit-contracts'

export { managedCallBookingValue, planCallAllocationValue, planHoldBookingValue, MANAGED_CALL_FORMANCE_SCHEMA_VERSION } from './managed-call-contracts'
export { settledSaleRefundReference, settledSaleRefundReferences } from './settled-sale-refund-contracts'
export type { X402PayeeScreeningDecision, X402SpendAdmissionResult } from './x402-spend-admission'

export { financialUsageReadSchema, financialUsageEntrySchema, reconciliationPeriodSchema, reconcileUsage, reconciliationCallSchema, usageReconciliationSchema } from './usage-reconciliation'
export type { FinancialUsageEntry, FinancialUsageRead, ReconciliationCall, UsageReconciliation } from './usage-reconciliation'

export {financialReportSummarySchema,emptyFinancialReportSummary,appendFinancialReportSummary,type FinancialReportSummary} from './usage-report-summary'
