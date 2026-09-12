import Stripe from "stripe";

import { degradeBackend } from "@/lib/observability/degrade-backend";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import {
  compareExactAmounts,
  exactAmountSchema,
  isMoneyRefusal,
  type CreditPaymentEvidence,
  type CreditPaymentReadRequest,
  type CreditPaymentRequest,
  type CreditPaymentSession,
  type ExactAmount,
  type MoneyRefusal,
} from "@/modules/money/public";
import { stripeCreditIdempotencyKey } from "./stripe-idempotency";
import {
  digestMetadata,
  exponentForCurrency,
  readMetadata,
  refusal,
  responseData,
  sessionMatchesMode,
  stripeMinorAmount,
  validCurrency,
  validHttpUrl,
  validIdentifier,
  type StripeMoneyClient,
  type StripeMoneyProviderConfig,
} from "./stripe-money-provider-config";

const HOSTED_CREDIT_LINE_ITEM_NAME = "Agentic Economy Account credit";
const HOSTED_FEE_LINE_ITEM_NAME = "Account funding service fee";

export async function createOrRecoverCreditPayment(
  client: StripeMoneyClient,
  config: StripeMoneyProviderConfig,
  input: CreditPaymentRequest & Readonly<{ boundExternalRef?: string }>,
): Promise<CreditPaymentSession | MoneyRefusal> {
  const requestRefusal = validateCreditRequest(input);
  if (requestRefusal !== undefined) return requestRefusal;
  if (input.boundExternalRef !== undefined) {
    if (!validIdentifier(input.boundExternalRef))
      return refusal("payment_binding_invalid", false);
    const retrieved = await retrieveCheckoutSession(
      client,
      input.boundExternalRef,
    );
    if (isMoneyRefusal(retrieved)) return retrieved;
    return paymentSessionFromCheckoutSession(retrieved, config, input);
  }
  const idempotencyKey = stripeCreditIdempotencyKey(input.idempotencyKey);
  if (idempotencyKey === undefined)
    return refusal("payment_binding_invalid", false);
  if (Date.now() >= input.providerRecoveryDeadlineAt)
    return refusal("credit_topup_outcome_unknown", true);
  const params = creditSessionCreateParams(input, config);
  if (params === undefined)
    return refusal("credit_topup_amount_invalid", false);
  try {
    const created = await client.checkout.sessions.create(params, { idempotencyKey });
    return paymentSessionFromCheckoutSession(responseData(created), config, input);
  } catch (cause) {
    return degradeBackend(cause, refusal("credit_topup_outcome_unknown", true), {
      site: "createOrRecoverCreditPayment",
      reason: "source_unavailable",
    });
  }
}

export async function readCreditPayment(
  client: StripeMoneyClient,
  config: StripeMoneyProviderConfig,
  input: CreditPaymentReadRequest,
): Promise<CreditPaymentSession | MoneyRefusal> {
  const requestRefusal = validateCreditRequest(input);
  if (requestRefusal !== undefined || !validIdentifier(input.externalRef))
    return requestRefusal ?? refusal("payment_binding_invalid", false);
  const retrieved = await retrieveCheckoutSession(client, input.externalRef);
  if (isMoneyRefusal(retrieved)) return retrieved;
  return paymentSessionFromCheckoutSession(retrieved, config, input);
}

export function mapStripeCheckoutSessionEvidence(
  input: Readonly<{
    session: Stripe.Checkout.Session;
    config: StripeMoneyProviderConfig;
    requestDigest?: string;
    expected?: CreditPaymentRequest;
  }>,
): CreditPaymentEvidence | MoneyRefusal {
  const material = readCheckoutSessionMaterial(input.session, input.config);
  if (isMoneyRefusal(material)) return material;
  const requestDigest =
    input.requestDigest ??
    (input.expected === undefined
      ? undefined
      : stripeCreditRequestDigest(input.expected, input.config));
  if (requestDigest === undefined)
    return refusal("payment_binding_invalid", false);
  if (
    input.expected !== undefined &&
    !creditSessionMatchesRequest(
      input.session,
      material.amount,
      material.metadata,
      input.expected,
      input.config,
    )
  ) {
    return refusal("ledger_idempotency_conflict", false);
  }
  const evidenceDigest = canonicalDigest({
    format: "stripe-checkout-observation:v1",
    checkoutSessionDigest: material.checkoutSessionDigest,
    paymentIntentDigest: material.paymentIntentDigest ?? null,
    paymentId: material.paymentId ?? null,
    requestDigest,
    metadataDigest: material.metadataDigest,
    amount: material.amount,
    status: material.status,
    checkoutStatus: material.checkoutStatus,
    paymentStatus: material.paymentStatus,
    checkoutMode: material.checkoutMode,
    ...(material.checkoutExpiresAt === undefined ? {} : { checkoutExpiresAt: material.checkoutExpiresAt }),
  });
  return {
    provider: "stripe",
    externalRef: input.session.id,
    ...(material.paymentId === undefined
      ? {}
      : { paymentId: material.paymentId }),
    amount: material.amount,
    status: material.status,
    checkoutStatus: material.checkoutStatus,
    paymentStatus: material.paymentStatus,
    checkoutMode: material.checkoutMode,
    ...(material.checkoutExpiresAt === undefined ? {} : { checkoutExpiresAt: material.checkoutExpiresAt }),
    requestDigest,
    metadataDigest: material.metadataDigest,
    checkoutSessionDigest: material.checkoutSessionDigest,
    ...(material.paymentIntentDigest === undefined
      ? {}
      : { paymentIntentDigest: material.paymentIntentDigest }),
    evidenceDigest,
    evidenceRef: `stripe:checkout.session:${input.session.id}`,
    observedAt: input.session.created * 1000,
  };
}

export function stripeCreditRequestDigest(
  input: CreditPaymentRequest,
  config?: StripeMoneyProviderConfig,
): string | undefined {
  const idempotencyKey = stripeCreditIdempotencyKey(input.idempotencyKey);
  const params = creditSessionCreateParams(input, config);
  if (idempotencyKey === undefined || params === undefined) return undefined;
  return canonicalDigest({
    format: "stripe-checkout-request:v2",
    params,
    idempotencyKey,
  });
}

export type CheckoutSessionMaterial = Readonly<{
  amount: ExactAmount;
  metadata: Record<string, string>;
  metadataDigest: string;
  paymentId?: string;
  paymentIntentDigest?: string;
  status: CreditPaymentEvidence["status"];
  checkoutStatus: NonNullable<CreditPaymentEvidence["checkoutStatus"]>;
  paymentStatus: NonNullable<CreditPaymentEvidence["paymentStatus"]>;
  checkoutMode: NonNullable<CreditPaymentEvidence["checkoutMode"]>;
  checkoutExpiresAt?: number;
  checkoutSessionDigest: string;
}>;

export function readCheckoutSessionMaterial(
  session: Stripe.Checkout.Session,
  config: StripeMoneyProviderConfig,
): CheckoutSessionMaterial | MoneyRefusal {
  const paymentStatus = knownPaymentStatus(session.payment_status);
  if (
    !validIdentifier(session.id) ||
    session.object !== "checkout.session" ||
    !Number.isSafeInteger(session.created) ||
    session.created < 0 ||
    !Number.isSafeInteger(session.created * 1000) ||
    (session.status !== "open" &&
      session.status !== "complete" &&
      session.status !== "expired") ||
    paymentStatus === undefined
  )
    return refusal("payment_binding_invalid", false);
  if (
    !sessionMatchesMode(session.livemode, config.mode) ||
    session.mode !== "payment" ||
    session.ui_mode !== "hosted_page"
  ) {
    return refusal("stripe_setup_required", false);
  }
  const amount = exactSessionAmount(session);
  const metadata = readMetadata(session.metadata);
  if (amount === undefined || metadata === undefined)
    return refusal("payment_binding_invalid", false);
  const paymentId = paymentIdFromSession(session.payment_intent);
  if (
    session.payment_intent !== null &&
    session.payment_intent !== undefined &&
    paymentId === undefined
  )
    return refusal("payment_binding_invalid", false);
  const metadataDigest = digestMetadata(metadata);
  const paymentIntentDigest = paymentIntentObjectDigest(session.payment_intent);
  const checkoutMode = "hosted_page" as const;
  const checkoutExpiresAt = Number.isSafeInteger(session.expires_at)
    ? session.expires_at * 1000
    : undefined;
  if (checkoutExpiresAt === undefined)
    return refusal("payment_binding_invalid", false);
  const checkoutSessionDigest = canonicalDigest({
    format: "stripe-checkout-session-identity:v2",
    id: session.id,
    object: session.object,
    mode: session.mode,
    uiMode: session.ui_mode,
    livemode: session.livemode,
    clientReferenceId: session.client_reference_id,
    currency: session.currency?.toUpperCase() ?? null,
    amountTotal: session.amount_total,
    returnUrl: session.return_url ?? null,
    successUrl: session.success_url ?? null,
    cancelUrl: session.cancel_url ?? null,
    expiresAt: session.expires_at ?? null,
    paymentId: paymentId ?? null,
    metadataDigest,
    created: session.created,
  });
  return {
    amount,
    metadata,
    metadataDigest,
    ...(paymentId === undefined ? {} : { paymentId }),
    ...(paymentIntentDigest === undefined ? {} : { paymentIntentDigest }),
    status: providerStatusForSession(session),
    checkoutStatus: session.status,
    paymentStatus,
    checkoutMode,
    ...(checkoutExpiresAt === undefined ? {} : { checkoutExpiresAt }),
    checkoutSessionDigest,
  };
}

async function retrieveCheckoutSession(
  client: StripeMoneyClient,
  externalRef: string,
): Promise<Stripe.Checkout.Session | MoneyRefusal> {
  try {
    const response = await client.checkout.sessions.retrieve(externalRef, {
      expand: ["payment_intent", "line_items.data.price", "line_items.data.taxes.rate"],
    });
    return responseData(response);
  } catch (cause) {
    return degradeBackend(cause, refusal("credit_topup_outcome_unknown", true), {
      site: "retrieveCheckoutSession",
      reason: "source_unavailable",
    });
  }
}

function paymentSessionFromCheckoutSession(
  session: Stripe.Checkout.Session,
  config: StripeMoneyProviderConfig,
  expected: CreditPaymentRequest,
): CreditPaymentSession | MoneyRefusal {
  const requestDigest = stripeCreditRequestDigest(expected, config);
  if (requestDigest === undefined)
    return refusal("payment_binding_invalid", false);
  const evidence = mapStripeCheckoutSessionEvidence({
    session,
    config,
    requestDigest,
    expected,
  });
  if (isMoneyRefusal(evidence)) return evidence;
  const expiresAt = evidence.checkoutExpiresAt;
  if (expiresAt === undefined) return refusal("payment_binding_invalid", false);
  const checkoutUrl = session.url;
  if (checkoutUrl !== null && !validCheckoutUrl(checkoutUrl, config))
    return refusal("payment_binding_invalid", false);
  if (evidence.checkoutStatus === "open" && checkoutUrl === null)
    return refusal("payment_binding_invalid", false);
  return {
    kind: "hosted_redirect",
    evidence,
    expiresAt,
    ...(checkoutUrl === null ? {} : { checkoutUrl }),
  };
}

function creditSessionCreateParams(
  input: CreditPaymentRequest,
  config?: StripeMoneyProviderConfig,
): Stripe.Checkout.SessionCreateParams | undefined {
  const amount = stripeMinorAmount(input.amount);
  if (amount === undefined) return undefined;
  const principal = stripeMinorAmount(input.principalAmount);
  const serviceFee = stripeMinorAmount(input.serviceFeeAmount);
  const tax = stripeMinorAmount(input.taxAmount);
  const expiresAt = input.checkoutExpiresAt;
  const cancelReturnRef = input.cancelReturnRef;
  const taxRateId = config?.inclusiveGstTaxRateId;
  if (
    principal === undefined || serviceFee === undefined || tax === undefined ||
    principal.currency !== amount.currency || serviceFee.currency !== amount.currency || tax.currency !== amount.currency ||
    BigInt(principal.units) + BigInt(serviceFee.units) + BigInt(tax.units) !== BigInt(amount.units) ||
    !validHttpUrl(cancelReturnRef) || typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) || expiresAt <= 0 ||
    !validIdentifier(taxRateId)
  ) return undefined;
  const feeInclusiveTax = BigInt(serviceFee.units) + BigInt(tax.units);
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{
    price_data: {
      currency: amount.currency.toLowerCase(),
      product_data: { name: HOSTED_CREDIT_LINE_ITEM_NAME },
      unit_amount: Number(principal.units),
    },
    quantity: 1,
  }];
  if (feeInclusiveTax > 0n) lineItems.push({
    price_data: {
      currency: amount.currency.toLowerCase(),
      product_data: {
        name: HOSTED_FEE_LINE_ITEM_NAME,
        description: "Includes Australian GST",
      },
      unit_amount: Number(feeInclusiveTax),
    },
    quantity: 1,
    tax_rates: [taxRateId],
  });
  return {
    mode: "payment",
    ui_mode: "hosted_page",
    submit_type: "pay",
    line_items: lineItems,
    client_reference_id: input.commandRef,
    metadata: creditMetadata(input),
    payment_intent_data: { metadata: creditMetadata(input) },
    expires_at: Math.floor(expiresAt / 1000),
    success_url: input.successReturnRef,
    cancel_url: cancelReturnRef,
    custom_text: {
      submit: {
        message: "This payment adds Account credit. It does not grant access or spending authority.",
      },
    },
    expand: ["payment_intent", "line_items.data.price", "line_items.data.taxes.rate"],
  };
}

function paymentIntentObjectDigest(
  value: string | Stripe.PaymentIntent | null | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const paymentId = paymentIdFromSession(value);
  if (paymentId === undefined) return undefined;
  return canonicalDigest({
    format: "stripe-payment-intent-identity:v1",
    id: paymentId,
  });
}

function creditMetadata(_input: CreditPaymentRequest): Record<string, string> {
  return { ae_command_ref: _input.commandRef, ae_contract: "account_funding_v2" };
}

function creditSessionMatchesRequest(
  session: Stripe.Checkout.Session,
  amount: ExactAmount,
  metadata: Readonly<Record<string, string>>,
  input: CreditPaymentRequest,
  config: StripeMoneyProviderConfig,
): boolean {
  const expectedAmount = stripeMinorAmount(input.amount);
  if (expectedAmount === undefined) return false;
  const expectedMetadata = creditMetadata(input);
  if (
    session.client_reference_id !== input.commandRef ||
    session.mode !== "payment"
  )
    return false;
  if (session.ui_mode !== "hosted_page" || session.currency?.toUpperCase() !== expectedAmount.currency)
    return false;
  if (compareExactAmounts(amount, expectedAmount) !== 0) return false;
  for (const [key, value] of Object.entries(expectedMetadata))
    if (metadata[key] !== value) return false;
  return hostedSessionMatchesRequest(session, input, config);
}

function hostedSessionMatchesRequest(
  session: Stripe.Checkout.Session,
  input: CreditPaymentRequest,
  config: StripeMoneyProviderConfig,
): boolean {
  const principal = stripeMinorAmount(input.principalAmount);
  const serviceFee = stripeMinorAmount(input.serviceFeeAmount);
  const tax = stripeMinorAmount(input.taxAmount);
  const taxRateId = config.inclusiveGstTaxRateId;
  if (principal === undefined || serviceFee === undefined || tax === undefined || taxRateId === undefined)
    return false;
  if (
    session.success_url !== input.successReturnRef ||
    session.cancel_url !== input.cancelReturnRef ||
    session.expires_at !== Math.floor((input.checkoutExpiresAt ?? -1) / 1000) ||
    session.total_details?.amount_tax !== Number(tax.units) ||
    session.line_items === undefined
  ) return false;
  const expectedCount = BigInt(serviceFee.units) + BigInt(tax.units) === 0n ? 1 : 2;
  if (session.line_items.data.length !== expectedCount) return false;
  const credit = session.line_items.data[0];
  if (
    credit?.quantity !== 1 || credit.amount_total !== Number(principal.units) ||
    credit.amount_tax !== 0 || credit.description !== HOSTED_CREDIT_LINE_ITEM_NAME
  ) return false;
  if (expectedCount === 1) return true;
  const fee = session.line_items.data[1];
  const appliedTax = fee?.taxes?.[0];
  const appliedTaxRate = typeof appliedTax?.rate === "object" ? appliedTax.rate : undefined;
  return fee?.quantity === 1
    && fee.amount_total === Number(BigInt(serviceFee.units) + BigInt(tax.units))
    && fee.amount_tax === Number(tax.units)
    && fee.description === HOSTED_FEE_LINE_ITEM_NAME
    && fee.taxes?.length === 1
    && appliedTax?.amount === Number(tax.units)
    && appliedTaxRate?.id === taxRateId
    && appliedTaxRate.active === true
    && appliedTaxRate.inclusive === true
    && appliedTaxRate.percentage === 10
    && appliedTaxRate.country === "AU"
    && appliedTaxRate.livemode === (config.mode === "live");
}

function validCheckoutUrl(value: string, config: StripeMoneyProviderConfig): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === (config.checkoutHost ?? "checkout.stripe.com");
  } catch (cause) {
    return degradeBackend(cause, false, {
      site: "validCheckoutUrl",
      reason: "invalid_response",
    });
  }
}

function exactSessionAmount(
  session: Stripe.Checkout.Session,
): ExactAmount | undefined {
  if (
    session.amount_total === null ||
    !Number.isSafeInteger(session.amount_total) ||
    session.amount_total < 0 ||
    typeof session.currency !== "string"
  )
    return undefined;
  const currency = session.currency.toUpperCase();
  const exponent = exponentForCurrency(currency);
  if (!validCurrency(currency) || exponent === undefined) return undefined;
  return {
    currency,
    units: String(session.amount_total),
    exponent,
  };
}

function providerStatusForSession(
  session: Stripe.Checkout.Session,
): CreditPaymentEvidence["status"] {
  if (session.status === "open") return "pending";
  if (session.payment_status === "paid") return "succeeded";
  if (session.status === "complete") return "pending";
  return "failed";
}

function paymentIdFromSession(
  value: string | Stripe.PaymentIntent | null,
): string | undefined {
  const paymentId = typeof value === "string" ? value : value?.id;
  return validIdentifier(paymentId) ? paymentId : undefined;
}

function validateCreditRequest(
  input: CreditPaymentRequest,
): MoneyRefusal | undefined {
  if (
    !validIdentifier(input.commandRef) ||
    !validIdentifier(input.principalId) ||
    !validIdentifier(input.accountRef) ||
    !validIdentifier(input.inputDigest) ||
    !validHttpUrl(input.successReturnRef) ||
    !Number.isSafeInteger(input.providerRecoveryDeadlineAt) ||
    input.providerRecoveryDeadlineAt < 0 ||
    stripeCreditIdempotencyKey(input.idempotencyKey) === undefined
  )
    return refusal("payment_binding_invalid", false);
  const parsed = exactAmountSchema.safeParse(input.amount);
  if (
    !parsed.success ||
    !validCurrency(parsed.data.currency) ||
    stripeMinorAmount(parsed.data) === undefined
  )
    return refusal("credit_topup_amount_invalid", false);
  return undefined;
}

function knownPaymentStatus(
  value: string,
): NonNullable<CreditPaymentEvidence["paymentStatus"]> | undefined {
  switch (value) {
    case "paid":
    case "unpaid":
    case "no_payment_required":
      return value;
    default:
      return undefined;
  }
}
