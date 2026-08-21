import Stripe from "stripe";

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

const CREDIT_LINE_ITEM_NAME = "AE credit";

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
  const params = creditSessionCreateParams(input);
  if (params === undefined)
    return refusal("credit_topup_amount_invalid", false);
  try {
    const created = await client.checkout.sessions.create(params, {
      idempotencyKey,
    });
    return paymentSessionFromCheckoutSession(
      responseData(created),
      config,
      input,
    );
  } catch {
    if (Date.now() >= input.providerRecoveryDeadlineAt)
      return refusal("credit_topup_outcome_unknown", true);
    try {
      const recovered = await client.checkout.sessions.create(params, {
        idempotencyKey,
      });
      return paymentSessionFromCheckoutSession(
        responseData(recovered),
        config,
        input,
      );
    } catch {
      return refusal("credit_topup_outcome_unknown", true);
    }
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
      : stripeCreditRequestDigest(input.expected));
  if (requestDigest === undefined)
    return refusal("payment_binding_invalid", false);
  if (
    input.expected !== undefined &&
    !creditSessionMatchesRequest(
      input.session,
      material.amount,
      material.metadata,
      input.expected,
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
): string | undefined {
  const idempotencyKey = stripeCreditIdempotencyKey(input.idempotencyKey);
  const params = creditSessionCreateParams(input);
  if (idempotencyKey === undefined || params === undefined) return undefined;
  return canonicalDigest({
    format: "stripe-checkout-request:v1",
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
    session.ui_mode !== "elements"
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
  const checkoutSessionDigest = canonicalDigest({
    format: "stripe-checkout-session-identity:v1",
    id: session.id,
    object: session.object,
    mode: session.mode,
    uiMode: session.ui_mode,
    livemode: session.livemode,
    clientReferenceId: session.client_reference_id,
    currency: session.currency?.toUpperCase() ?? null,
    amountTotal: session.amount_total,
    returnUrl: session.return_url ?? null,
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
    checkoutSessionDigest,
  };
}

async function retrieveCheckoutSession(
  client: StripeMoneyClient,
  externalRef: string,
): Promise<Stripe.Checkout.Session | MoneyRefusal> {
  try {
    const response = await client.checkout.sessions.retrieve(externalRef, {
      expand: ["payment_intent", "line_items.data.price"],
    });
    return responseData(response);
  } catch {
    return refusal("credit_topup_outcome_unknown", true);
  }
}

function paymentSessionFromCheckoutSession(
  session: Stripe.Checkout.Session,
  config: StripeMoneyProviderConfig,
  expected: CreditPaymentRequest,
): CreditPaymentSession | MoneyRefusal {
  const requestDigest = stripeCreditRequestDigest(expected);
  if (requestDigest === undefined)
    return refusal("payment_binding_invalid", false);
  const evidence = mapStripeCheckoutSessionEvidence({
    session,
    config,
    requestDigest,
    expected,
  });
  if (isMoneyRefusal(evidence)) return evidence;
  const clientSecret = session.client_secret;
  if (typeof clientSecret !== "string" || clientSecret.length === 0)
    return refusal("stripe_setup_required", false);
  return { evidence, clientSecret };
}

function creditSessionCreateParams(
  input: CreditPaymentRequest,
): Stripe.Checkout.SessionCreateParams | undefined {
  const amount = stripeMinorAmount(input.amount);
  if (amount === undefined) return undefined;
  return {
    mode: "payment",
    ui_mode: "elements",
    line_items: [
      {
        price_data: {
          currency: amount.currency.toLowerCase(),
          product_data: { name: CREDIT_LINE_ITEM_NAME },
          unit_amount: Number(amount.units),
        },
        quantity: 1,
      },
    ],
    client_reference_id: input.commandRef,
    metadata: creditMetadata(input),
    return_url: input.successReturnRef,
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

function creditMetadata(input: CreditPaymentRequest): Record<string, string> {
  return { ae_command_ref: input.commandRef };
}

function creditSessionMatchesRequest(
  session: Stripe.Checkout.Session,
  amount: ExactAmount,
  metadata: Readonly<Record<string, string>>,
  input: CreditPaymentRequest,
): boolean {
  const expectedAmount = stripeMinorAmount(input.amount);
  if (expectedAmount === undefined) return false;
  const expectedMetadata = creditMetadata(input);
  if (
    session.client_reference_id !== input.commandRef ||
    session.mode !== "payment" ||
    session.ui_mode !== "elements"
  )
    return false;
  if (
    session.currency?.toUpperCase() !== expectedAmount.currency ||
    session.return_url !== input.successReturnRef
  )
    return false;
  if (compareExactAmounts(amount, expectedAmount) !== 0) return false;
  for (const [key, value] of Object.entries(expectedMetadata))
    if (metadata[key] !== value) return false;
  if (
    session.line_items === undefined ||
    session.line_items.data.length !== 1 ||
    session.line_items.data[0]?.quantity !== 1 ||
    session.line_items.data[0]?.amount_total !== Number(expectedAmount.units)
  )
    return false;
  return true;
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
