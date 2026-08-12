import Stripe from "stripe";

import { canonicalDigest } from "@/modules/common/canonical-digest";
import {
  compareExactAmounts,
  exactAmountSchema,
  isMoneyRefusal,
  rescaleExactAmount,
  type ConnectAccountEvidence,
  type ConnectAccountPort,
  type ConnectAccountRequest,
  type CreditPaymentEvidence,
  type CreditPaymentPort,
  type CreditPaymentReadRequest,
  type CreditPaymentRequest,
  type CreditPaymentSession,
  type ExactAmount,
  type MoneyRefusal,
  type OnboardingLinkRequest,
  type PayoutTransferEvidence,
  type PayoutTransferPort,
  type PayoutTransferRequest,
  type StripeAccountUpdatedWebhookEvent,
  type StripeMoneyWebhookEvent,
} from "@/modules/money/public";
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
const MAX_PROVIDER_IDENTIFIER_LENGTH = 500;
const MAX_STRIPE_IDEMPOTENCY_KEY_LENGTH = 255;
const CREDIT_LINE_ITEM_NAME = "AE credit";
const CREDIT_IDEMPOTENCY_SCOPE = "ae:money:credit:";
const CONNECT_IDEMPOTENCY_SCOPE = "ae:money:connect:";
const PAYOUT_IDEMPOTENCY_SCOPE = "ae:money:payout:";
type Environment = Readonly<Record<string, string | undefined>>;
export type StripeMoneyMode = "test" | "live";
export type StripeMoneyClient = Stripe;

export type StripeMoneyProviderConfig = Readonly<{
  secretKey: string;
  webhookSecret: string;
  publishableKey: string;
  mode: StripeMoneyMode;
}>;

export type StripeMoneyProviderInput = Readonly<{
  env?: Environment;
  mode?: StripeMoneyMode;
  config?: StripeMoneyProviderConfig;
  client?: StripeMoneyClient;
}>;
export async function readStripeTransfersByIdentity(
  input: StripeMoneyProviderInput &
    Readonly<{ request: PayoutTransferRequest }>,
): Promise<readonly PayoutTransferEvidence[] | MoneyRefusal> {
  const configResult =
    input.config === undefined
      ? readStripeMoneyProviderConfig(input.env ?? process.env, input.mode)
      : validateStripeMoneyProviderConfig(input.config, input.mode);
  if (isMoneyRefusal(configResult)) return configResult;
  const requestRefusal = validatePayoutTransferRequest(input.request);
  if (requestRefusal !== undefined) return requestRefusal;
  const client =
    input.client ??
    new Stripe(configResult.secretKey, {
      apiVersion: Stripe.API_VERSION,
      maxNetworkRetries: 0,
      typescript: true,
    });
  try {
    const page = await client.transfers.list({
      transfer_group: input.request.payoutRef,
      limit: 100,
    });
    if (page.has_more || page.data.length > 100)
      return refusal("payout_outcome_unknown", true);
    const evidence: PayoutTransferEvidence[] = [];
    for (const transfer of page.data) {
      if (transfer.transfer_group !== input.request.payoutRef)
        return refusal("ledger_idempotency_conflict", false);
      const mapped = mapStripeTransferEvidence({
        transfer,
        config: configResult,
        expected: input.request,
      });
      if (isMoneyRefusal(mapped)) return mapped;
      evidence.push(mapped);
    }
    return evidence;
  } catch {
    return refusal("payout_outcome_unknown", true);
  }
}

export type StripeTransferGroupReadback = Readonly<{
  transferId: string;
  transferGroup: string;
}>;

export async function readStripeTransfersByGroup(
  input: StripeMoneyProviderInput & Readonly<{ transferGroup: string }>,
): Promise<readonly StripeTransferGroupReadback[] | MoneyRefusal> {
  const configResult =
    input.config === undefined
      ? readStripeMoneyProviderConfig(input.env ?? process.env, input.mode)
      : validateStripeMoneyProviderConfig(input.config, input.mode);
  if (isMoneyRefusal(configResult)) return configResult;
  if (!validIdentifier(input.transferGroup))
    return refusal("payment_binding_invalid", false);
  const client =
    input.client ??
    new Stripe(configResult.secretKey, {
      apiVersion: Stripe.API_VERSION,
      maxNetworkRetries: 0,
      typescript: true,
    });
  try {
    const page = await client.transfers.list({
      transfer_group: input.transferGroup,
      limit: 100,
    });
    if (page.has_more || page.data.length > 100)
      return refusal("payout_outcome_unknown", true);
    const transfers: StripeTransferGroupReadback[] = [];
    for (const transfer of page.data) {
      const evidence = mapStripeTransferEvidence({
        transfer,
        config: configResult,
      });
      if (isMoneyRefusal(evidence)) return evidence;
      if (transfer.transfer_group !== input.transferGroup)
        return refusal("ledger_idempotency_conflict", false);
      transfers.push({
        transferId: evidence.transferId,
        transferGroup: input.transferGroup,
      });
    }
    return transfers;
  } catch {
    return refusal("payout_outcome_unknown", true);
  }
}

export function readStripeMoneyProviderConfig(
  env: Environment = process.env,
  expectedMode?: StripeMoneyMode,
): StripeMoneyProviderConfig | MoneyRefusal {
  const secretKey = readEnvironmentValue(env, "STRIPE_SECRET_KEY");
  const webhookSecret = readEnvironmentValue(env, "STRIPE_WEBHOOK_SECRET");
  const publishableKey = readEnvironmentValue(
    env,
    "VITE_STRIPE_PUBLISHABLE_KEY",
  );
  if (
    secretKey === undefined ||
    webhookSecret === undefined ||
    publishableKey === undefined
  ) {
    return refusal("stripe_setup_required", false);
  }
  return validateStripeMoneyProviderConfig(
    {
      secretKey,
      webhookSecret,
      publishableKey,
      mode: modeFromSecretKey(secretKey) ?? "test",
    },
    expectedMode,
  );
}

function validateStripeMoneyProviderConfig(
  config: StripeMoneyProviderConfig,
  expectedMode?: StripeMoneyMode,
): StripeMoneyProviderConfig | MoneyRefusal {
  const secretMode = modeFromSecretKey(config.secretKey);
  const publishableMode = modeFromPublishableKey(config.publishableKey);
  if (
    secretMode === undefined ||
    publishableMode === undefined ||
    secretMode !== publishableMode ||
    config.mode !== secretMode ||
    (expectedMode !== undefined && secretMode !== expectedMode) ||
    !/^whsec_[A-Za-z0-9_-]+$/u.test(config.webhookSecret)
  )
    return refusal("stripe_setup_required", false);
  return config;
}

export function createStripeMoneyProvider(
  input: StripeMoneyProviderInput = {},
): CreditPaymentPort & ConnectAccountPort & PayoutTransferPort {
  const configResult =
    input.config === undefined
      ? readStripeMoneyProviderConfig(input.env ?? process.env, input.mode)
      : validateStripeMoneyProviderConfig(input.config, input.mode);
  if (isMoneyRefusal(configResult)) return unavailableProvider(configResult);
  const client =
    input.client ??
    new Stripe(configResult.secretKey, {
      apiVersion: Stripe.API_VERSION,
      maxNetworkRetries: 0,
      typescript: true,
    });
  return {
    createOrRecoverCreditPayment: async (request) =>
      createOrRecoverCreditPayment(client, configResult, request),
    readCreditPayment: async (request) =>
      readCreditPayment(client, configResult, request),
    createOrRecoverConnectAccount: async (request) =>
      createOrRecoverConnectAccount(client, configResult, request),
    createOnboardingLink: async (request) =>
      createOnboardingLink(client, configResult, request),
    readConnectAccount: async (request) =>
      readConnectAccount(client, configResult, request),
    createOrRecoverTransfer: async (request) =>
      createOrRecoverTransfer(client, configResult, request),
    readTransfer: async (request) =>
      readTransfer(client, configResult, request),
    readTransfersByIdentity: async (request) =>
      readStripeTransfersByIdentity({ config: configResult, client, request }),
  };
}

export function stripeCreditIdempotencyKey(
  idempotencyKey: string,
): string | undefined {
  if (!validIdentifier(idempotencyKey)) return undefined;
  const scoped = `${CREDIT_IDEMPOTENCY_SCOPE}${idempotencyKey}`;
  return scoped.length <= MAX_STRIPE_IDEMPOTENCY_KEY_LENGTH
    ? scoped
    : undefined;
}

export function stripeConnectIdempotencyKey(
  idempotencyKey: string,
): string | undefined {
  if (!validIdentifier(idempotencyKey)) return undefined;
  const scoped = `${CONNECT_IDEMPOTENCY_SCOPE}${idempotencyKey}`;
  return scoped.length <= MAX_STRIPE_IDEMPOTENCY_KEY_LENGTH
    ? scoped
    : undefined;
}
function stripeConnectOperationIdempotencyKey(
  operation: "accounts.create" | "account_links.create",
  requestDigest: string,
  idempotencyKey: string,
): string | undefined {
  return stripeConnectIdempotencyKey(
    canonicalDigest({
      format: "stripe-connect-operation-idempotency:v1",
      operation,
      requestDigest,
      idempotencyKey,
    }),
  );
}

export function stripePayoutIdempotencyKey(
  idempotencyKey: string,
): string | undefined {
  if (!validIdentifier(idempotencyKey)) return undefined;
  const scoped = `${PAYOUT_IDEMPOTENCY_SCOPE}${idempotencyKey}`;
  return scoped.length <= MAX_STRIPE_IDEMPOTENCY_KEY_LENGTH
    ? scoped
    : undefined;
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

export function mapStripeMoneyWebhookEvent(
  input: Readonly<{
    event: Stripe.Event;
    config: StripeMoneyProviderConfig;
    rawBody: string;
  }>,
): StripeMoneyWebhookEvent | MoneyRefusal {
  const event = input.event;
  if (!validBoundedWebhookBody(input.rawBody))
    return refusal("payment_binding_invalid", false);
  if (
    !validIdentifier(event.id) ||
    !Number.isSafeInteger(event.created) ||
    event.created < 0 ||
    !Number.isSafeInteger(event.created * 1000) ||
    !sessionMatchesMode(event.livemode, input.config.mode)
  ) {
    return refusal("payment_binding_invalid", false);
  }
  if (event.type === "account.updated")
    return mapAccountUpdatedWebhookEvent(event, input.config);
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded" &&
    event.type !== "checkout.session.async_payment_failed" &&
    event.type !== "checkout.session.expired"
  )
    return refusal("payment_binding_invalid", false);

  const session = event.data.object;
  const material = readCheckoutSessionMaterial(session, input.config);
  if (isMoneyRefusal(material)) return material;
  const commandRef =
    material.metadata.ae_command_ref ??
    session.client_reference_id ??
    undefined;
  if (!validIdentifier(commandRef))
    return refusal("payment_binding_invalid", false);
  if (
    event.type === "checkout.session.completed" &&
    session.status !== "complete"
  )
    return refusal("payment_binding_invalid", false);
  if (
    event.type === "checkout.session.async_payment_succeeded" &&
    session.payment_status !== "paid"
  )
    return refusal("payment_binding_invalid", false);
  if (event.type === "checkout.session.expired" && session.status !== "expired")
    return refusal("payment_binding_invalid", false);
  const status =
    event.type === "checkout.session.expired"
      ? "expired"
      : event.type === "checkout.session.async_payment_failed"
        ? "failed"
        : event.type === "checkout.session.completed" &&
            session.payment_status !== "paid"
          ? "failed"
          : "paid";
  const payloadDigest = canonicalDigest({
    format: "stripe-webhook-payload:v1",
    event,
  });
  return {
    kind: "checkout",
    stripeEventId: event.id,
    eventType: event.type,
    externalRef: session.id,
    sessionId: session.id,
    commandRef,
    ...(material.paymentId === undefined
      ? {}
      : { paymentId: material.paymentId }),
    checkoutSessionDigest: material.checkoutSessionDigest,
    ...(material.paymentIntentDigest === undefined
      ? {}
      : { paymentIntentDigest: material.paymentIntentDigest }),
    status,
    amount: material.amount,
    metadataDigest: material.metadataDigest,
    payloadDigest,
    observedAt: event.created * 1000,
  };
}

export async function verifyStripeMoneyWebhook(
  input: Readonly<{
    rawBody: string;
    signature: string;
    config?: StripeMoneyProviderConfig;
    env?: Environment;
    mode?: StripeMoneyMode;
    client?: StripeMoneyClient;
  }>,
): Promise<StripeMoneyWebhookEvent | MoneyRefusal> {
  const configResult =
    input.config === undefined
      ? readStripeMoneyProviderConfig(input.env ?? process.env, input.mode)
      : validateStripeMoneyProviderConfig(input.config, input.mode);
  if (isMoneyRefusal(configResult)) return configResult;
  if (
    !validBoundedWebhookBody(input.rawBody) ||
    !validIdentifier(input.signature)
  )
    return refusal("payment_binding_invalid", false);
  const client =
    input.client ??
    new Stripe(configResult.secretKey, {
      apiVersion: Stripe.API_VERSION,
      maxNetworkRetries: 0,
      typescript: true,
    });
  try {
    const envelope = JSON.parse(input.rawBody) as unknown;
    if (isV2EventEnvelope(envelope)) {
      const notification = client.parseEventNotification(
        input.rawBody,
        input.signature,
        configResult.webhookSecret,
      );
      return mapStripeV2AccountNotification(notification, configResult);
    }
    const event = client.webhooks.constructEvent(
      input.rawBody,
      input.signature,
      configResult.webhookSecret,
    );
    return mapStripeMoneyWebhookEvent({
      event,
      config: configResult,
      rawBody: input.rawBody,
    });
  } catch {
    return refusal("payment_binding_invalid", false);
  }
}

async function createOrRecoverCreditPayment(
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

async function readCreditPayment(
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
type CheckoutSessionMaterial = Readonly<{
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

function readCheckoutSessionMaterial(
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

async function createOrRecoverConnectAccount(
  client: StripeMoneyClient,
  config: StripeMoneyProviderConfig,
  input: ConnectAccountRequest,
): Promise<
  | Readonly<{
      provider: "stripe";
      stripeAccountId: string;
      evidenceRef: string;
    }>
  | MoneyRefusal
> {
  const idempotencyKey = stripeConnectOperationIdempotencyKey(
    "accounts.create",
    input.providerRequestDigest,
    input.idempotencyKey,
  );
  if (
    !validIdentifier(input.businessId) ||
    !validCurrency(input.currency) ||
    input.configuration !== "accounts_v2" ||
    idempotencyKey === undefined ||
    !validIdentifier(input.providerRequestDigest) ||
    !Number.isSafeInteger(input.providerRecoveryDeadlineAt) ||
    input.providerRecoveryDeadlineAt < 0 ||
    !validIdentifier(input.recoveryLeaseOwner) ||
    !Number.isSafeInteger(input.recoveryLeaseGeneration) ||
    input.recoveryLeaseGeneration < 1 ||
    (input.boundStripeAccountId !== undefined &&
      !validIdentifier(input.boundStripeAccountId))
  )
    return refusal("payment_binding_invalid", false);
  if (input.boundStripeAccountId !== undefined) {
    const readback = await readConnectAccount(client, config, {
      businessId: input.businessId,
      currency: input.currency,
      stripeAccountId: input.boundStripeAccountId,
    });
    if (isMoneyRefusal(readback)) return readback;
    return {
      provider: "stripe",
      stripeAccountId: readback.stripeAccountId,
      evidenceRef: readback.evidenceRef,
    };
  }
  try {
    const response = await client.v2.core.accounts.create(
      {
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
        dashboard: "express",
        defaults: {
          currency: input.currency.toLowerCase(),
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        },
        metadata: {
          ae_business_id: input.businessId,
          ae_currency: input.currency,
        },
        include: ["configuration.recipient", "requirements"],
      },
      { idempotencyKey },
    );
    const account = responseData(response);
    if (
      !validIdentifier(account.id) ||
      !sessionMatchesMode(account.livemode, config.mode)
    )
      return refusal("stripe_setup_required", false);
    if (
      account.defaults?.currency?.toUpperCase() !== input.currency ||
      account.metadata?.ae_business_id !== input.businessId ||
      account.metadata?.ae_currency !== input.currency
    )
      return refusal("payment_binding_invalid", false);
    return {
      provider: "stripe",
      stripeAccountId: account.id,
      evidenceRef: accountEvidenceRef(account),
    };
  } catch {
    return refusal("stripe_setup_required", true);
  }
}

async function createOnboardingLink(
  client: StripeMoneyClient,
  config: StripeMoneyProviderConfig,
  input: OnboardingLinkRequest,
): Promise<
  | Readonly<{ provider: "stripe"; url: string; evidenceRef: string }>
  | MoneyRefusal
> {
  const requestDigest = canonicalDigest({
    format: "stripe-connect-onboarding-request:v1",
    businessId: input.businessId,
    currency: input.currency,
    stripeAccountId: input.stripeAccountId,
    refreshRef: input.refreshRef,
    returnRef: input.returnRef,
  });
  const idempotencyKey = stripeConnectOperationIdempotencyKey(
    "account_links.create",
    requestDigest,
    input.idempotencyKey,
  );
  if (
    !validIdentifier(input.businessId) ||
    !validCurrency(input.currency) ||
    !validIdentifier(input.stripeAccountId) ||
    idempotencyKey === undefined ||
    !validHttpUrl(input.refreshRef) ||
    !validHttpUrl(input.returnRef)
  )
    return refusal("payment_binding_invalid", false);
  try {
    const response = await client.v2.core.accountLinks.create(
      {
        account: input.stripeAccountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["recipient"],
            refresh_url: input.refreshRef,
            return_url: input.returnRef,
          },
        },
      },
      { idempotencyKey },
    );
    const link = responseData(response);
    if (
      !sessionMatchesMode(link.livemode, config.mode) ||
      !validHttpUrl(link.url)
    )
      return refusal("stripe_setup_required", false);
    if (link.account !== input.stripeAccountId)
      return refusal("payment_binding_invalid", false);
    return {
      provider: "stripe",
      url: link.url,
      evidenceRef: `stripe:account_link:${canonicalDigest({ account: link.account, created: link.created, expiresAt: link.expires_at })}`,
    };
  } catch {
    return refusal("stripe_setup_required", true);
  }
}

async function readConnectAccount(
  client: StripeMoneyClient,
  config: StripeMoneyProviderConfig,
  input: Readonly<{
    businessId: string;
    currency: string;
    stripeAccountId: string;
  }>,
): Promise<ConnectAccountEvidence | MoneyRefusal> {
  if (
    !validIdentifier(input.businessId) ||
    !validCurrency(input.currency) ||
    !validIdentifier(input.stripeAccountId)
  )
    return refusal("payment_binding_invalid", false);
  try {
    const response = await client.v2.core.accounts.retrieve(
      input.stripeAccountId,
      {
        include: [
          "configuration.recipient",
          "requirements",
          "future_requirements",
        ],
      },
    );
    const account = responseData(response);
    if (
      !validIdentifier(account.id) ||
      !sessionMatchesMode(account.livemode, config.mode)
    )
      return refusal("payment_binding_invalid", false);
    const currency = account.defaults?.currency?.toUpperCase();
    if (
      currency !== input.currency ||
      account.metadata?.ae_business_id !== input.businessId ||
      account.metadata?.ae_currency !== input.currency
    )
      return refusal("payment_binding_invalid", false);
    const requirementsDigest = canonicalDigest(account.requirements ?? null);
    const requirementEntries = account.requirements?.entries ?? [];
    const restricted = requirementEntries.some(
      (entry) => entry.awaiting_action_from === "user",
    );
    const recipient = account.configuration?.recipient;
    const recipientCapabilityActive =
      account.applied_configurations.includes("recipient") &&
      recipient?.applied === true &&
      recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ===
        "active" &&
      !restricted;
    const detailsSubmitted = !restricted;
    const observedAt = Date.parse(account.created);
    return {
      provider: "stripe",
      businessId: input.businessId,
      currency,
      stripeAccountId: account.id,
      detailsSubmitted,
      recipientCapabilityActive,
      restricted,
      requirementsDigest,
      evidenceRef: accountEvidenceRef(account),
      providerObjectDigest: accountObjectDigest(account),
      observedAt: Number.isFinite(observedAt) ? observedAt : Date.now(),
    };
  } catch {
    return refusal("stripe_setup_required", true);
  }
}

async function createOrRecoverTransfer(
  client: StripeMoneyClient,
  config: StripeMoneyProviderConfig,
  input: PayoutTransferRequest & Readonly<{ boundExternalRef?: string }>,
): Promise<PayoutTransferEvidence | MoneyRefusal> {
  const requestRefusal = validatePayoutTransferRequest(input);
  if (requestRefusal !== undefined) return requestRefusal;
  if (input.boundExternalRef !== undefined) {
    if (!validTransferId(input.boundExternalRef))
      return refusal("payment_binding_invalid", false);
    const retrieved = await retrieveTransfer(client, input.boundExternalRef);
    if (isMoneyRefusal(retrieved)) return retrieved;
    return mapStripeTransferEvidence({
      transfer: retrieved,
      config,
      expected: input,
    });
  }
  const idempotencyKey = stripePayoutIdempotencyKey(input.idempotencyKey);
  if (idempotencyKey === undefined)
    return refusal("payment_binding_invalid", false);
  const params = payoutTransferCreateParams(input);
  if (params === undefined)
    return refusal("credit_topup_amount_invalid", false);
  let created: Stripe.Transfer;
  try {
    created = responseData(
      await client.transfers.create(params, { idempotencyKey }),
    );
  } catch {
    try {
      created = responseData(
        await client.transfers.create(params, { idempotencyKey }),
      );
    } catch {
      return refusal("payout_outcome_unknown", true);
    }
  }
  if (!validTransferId(created.id))
    return refusal("payment_binding_invalid", false);
  const transfer = await retrieveTransfer(client, created.id);
  if (isMoneyRefusal(transfer)) {
    const unknown = mapStripeTransferEvidence({
      transfer: created,
      config,
      expected: input,
      status: "outcome_unknown",
    });
    return isMoneyRefusal(unknown) ? transfer : unknown;
  }
  return mapStripeTransferEvidence({ transfer, config, expected: input });
}

async function readTransfer(
  client: StripeMoneyClient,
  config: StripeMoneyProviderConfig,
  input: Readonly<{ externalRef: string; idempotencyKey: string }>,
): Promise<PayoutTransferEvidence | MoneyRefusal> {
  if (
    !validTransferId(input.externalRef) ||
    stripePayoutIdempotencyKey(input.idempotencyKey) === undefined
  )
    return refusal("payment_binding_invalid", false);
  const transfer = await retrieveTransfer(client, input.externalRef);
  if (isMoneyRefusal(transfer)) return transfer;
  return mapStripeTransferEvidence({
    transfer,
    config,
    idempotencyKey: input.idempotencyKey,
  });
}

async function retrieveTransfer(
  client: StripeMoneyClient,
  externalRef: string,
): Promise<Stripe.Transfer | MoneyRefusal> {
  try {
    return responseData(await client.transfers.retrieve(externalRef));
  } catch {
    return refusal("payout_outcome_unknown", true);
  }
}

export function mapStripeTransferEvidence(
  input: Readonly<{
    transfer: Stripe.Transfer;
    config: StripeMoneyProviderConfig;
    expected?: PayoutTransferRequest;
    idempotencyKey?: string;
    status?: PayoutTransferEvidence["status"];
  }>,
): PayoutTransferEvidence | MoneyRefusal {
  const transfer = input.transfer;
  if (
    !validTransferId(transfer.id) ||
    transfer.object !== "transfer" ||
    !sessionMatchesMode(transfer.livemode, input.config.mode)
  )
    return refusal("stripe_setup_required", false);
  const destinationAccountId =
    typeof transfer.destination === "string"
      ? transfer.destination
      : transfer.destination?.id;
  const transferCurrency =
    typeof transfer.currency === "string"
      ? transfer.currency.toUpperCase()
      : undefined;
  const exponent =
    transferCurrency === undefined
      ? undefined
      : exponentForCurrency(transferCurrency);
  if (
    !validAccountId(destinationAccountId) ||
    !Number.isSafeInteger(transfer.amount) ||
    transfer.amount < 0 ||
    transferCurrency === undefined ||
    !validCurrency(transferCurrency) ||
    exponent === undefined
  )
    return refusal("payment_binding_invalid", false);
  const amount: ExactAmount = {
    currency: transferCurrency,
    units: String(transfer.amount),
    exponent,
  };
  const metadata = readMetadata(transfer.metadata);
  if (
    metadata === undefined ||
    !validIdentifier(metadata.ae_payout_ref) ||
    !validIdentifier(metadata.ae_command_id) ||
    !validIdentifier(metadata.ae_input_digest) ||
    !validIdentifier(metadata.ae_idempotency_key)
  )
    return refusal("payment_binding_invalid", false);
  if (
    input.idempotencyKey !== undefined &&
    metadata.ae_idempotency_key !== input.idempotencyKey
  )
    return refusal("ledger_idempotency_conflict", false);
  const expectedAmount =
    input.expected === undefined
      ? undefined
      : stripeMinorAmount(input.expected.amount);
  if (input.expected !== undefined && expectedAmount === undefined)
    return refusal("payment_binding_invalid", false);
  if (input.expected !== undefined) {
    if (
      transfer.transfer_group !== input.expected.payoutRef ||
      metadata.ae_payout_ref !== input.expected.payoutRef ||
      metadata.ae_command_id !== input.expected.commandId ||
      metadata.ae_input_digest !== input.expected.inputDigest ||
      metadata.ae_idempotency_key !== input.expected.idempotencyKey ||
      destinationAccountId !== input.expected.destinationAccountId ||
      compareExactAmounts(amount, expectedAmount) !== 0
    )
      return refusal("ledger_idempotency_conflict", false);
  }
  const status =
    input.status === "outcome_unknown"
      ? "outcome_unknown"
      : transfer.reversed
        ? "reversed"
        : (input.status ?? "succeeded");
  const requestDigest = metadata.ae_input_digest;
  const evidenceDigest = canonicalDigest({
    provider: "stripe",
    transferId: transfer.id,
    destinationAccountId,
    amount,
    status,
    livemode: transfer.livemode,
    metadataDigest: digestMetadata(metadata),
    created: transfer.created,
    reversed: transfer.reversed,
  });
  return {
    provider: "stripe",
    transferId: transfer.id,
    destinationAccountId,
    amount,
    status,
    requestDigest,
    evidenceDigest,
    observedAt: transfer.created * 1000,
  };
}

function payoutTransferCreateParams(
  input: PayoutTransferRequest,
): Stripe.TransferCreateParams | undefined {
  const amount = stripeMinorAmount(input.amount);
  if (amount === undefined) return undefined;
  return {
    amount: Number(amount.units),
    currency: amount.currency.toLowerCase(),
    destination: input.destinationAccountId,
    metadata: {
      ae_payout_ref: input.payoutRef,
      ae_command_id: input.commandId,
      ae_input_digest: input.inputDigest,
      ae_idempotency_key: input.idempotencyKey,
    },
    transfer_group: input.payoutRef,
  };
}

function validatePayoutTransferRequest(
  input: PayoutTransferRequest,
): MoneyRefusal | undefined {
  if (
    !validIdentifier(input.payoutRef) ||
    !validIdentifier(input.commandId) ||
    !validAccountId(input.destinationAccountId) ||
    !validIdentifier(input.inputDigest) ||
    stripePayoutIdempotencyKey(input.idempotencyKey) === undefined
  )
    return refusal("payment_binding_invalid", false);
  const amount = exactAmountSchema.safeParse(input.amount);
  if (
    !amount.success ||
    !validCurrency(amount.data.currency) ||
    stripeMinorAmount(amount.data) === undefined ||
    amount.data.units === "0"
  )
    return refusal("credit_topup_amount_invalid", false);
  return undefined;
}
function mapAccountUpdatedWebhookEvent(
  event: Stripe.AccountUpdatedEvent,
  config: StripeMoneyProviderConfig,
): StripeMoneyWebhookEvent | MoneyRefusal {
  const account = event.data.object;
  if (
    !validIdentifier(account.id) ||
    !sessionMatchesMode(event.livemode, config.mode)
  )
    return refusal("payment_binding_invalid", false);
  return {
    kind: "account",
    stripeEventId: event.id,
    eventType: "account.updated",
    externalRef: account.id,
    stripeAccountId: account.id,
    providerObjectDigest: accountObjectDigest(account),
    payloadDigest: canonicalDigest({
      eventId: event.id,
      eventType: event.type,
      created: event.created,
      livemode: event.livemode,
      account: {
        id: account.id,
        object: account.object,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        capabilities: account.capabilities ?? null,
        requirements: account.requirements ?? null,
      },
    }),
    observedAt: event.created * 1000,
  };
}

type StripeV2AccountEventType = Exclude<
  StripeAccountUpdatedWebhookEvent["eventType"],
  "account.updated"
>;
type StripeV2AccountEventNotification = Extract<
  Stripe.V2.Core.EventNotification,
  { type: StripeV2AccountEventType }
>;

function mapStripeV2AccountNotification(
  notification: Stripe.V2.Core.EventNotification,
  config: StripeMoneyProviderConfig,
): StripeMoneyWebhookEvent | MoneyRefusal {
  if (
    !isV2AccountEventNotification(notification) ||
    !sessionMatchesMode(notification.livemode, config.mode) ||
    notification.related_object?.type !== "v2.core.account" ||
    !validIdentifier(notification.id) ||
    !validIdentifier(notification.related_object.id)
  )
    return refusal("payment_binding_invalid", false);
  const observedAt = Date.parse(notification.created);
  if (!Number.isFinite(observedAt))
    return refusal("payment_binding_invalid", false);
  const payloadDigest = canonicalDigest({
    eventId: notification.id,
    eventType: notification.type,
    created: notification.created,
    livemode: notification.livemode,
    relatedObject: notification.related_object,
    changes: notification.changes ?? null,
  });
  return {
    kind: "account",
    stripeEventId: notification.id,
    eventType: notification.type,
    externalRef: notification.related_object.id,
    stripeAccountId: notification.related_object.id,
    providerObjectDigest: canonicalDigest({
      id: notification.related_object.id,
      type: notification.related_object.type,
      eventType: notification.type,
      changes: notification.changes ?? null,
    }),
    payloadDigest,
    observedAt,
  };
}

function isV2EventEnvelope(
  value: unknown,
): value is Readonly<{ object: "v2.core.event" }> {
  return (
    typeof value === "object" &&
    value !== null &&
    "object" in value &&
    value.object === "v2.core.event"
  );
}

function isV2AccountEventNotification(
  value: Stripe.V2.Core.EventNotification,
): value is StripeV2AccountEventNotification {
  return (
    value.type === "v2.core.account.created" ||
    value.type === "v2.core.account.updated" ||
    value.type === "v2.core.account.closed" ||
    value.type === "v2.core.account[configuration.recipient].updated" ||
    value.type ===
      "v2.core.account[configuration.recipient].capability_status_updated"
  );
}

function accountObjectDigest(
  account: Stripe.Account | Stripe.V2.Core.Account,
): string {
  if (account.object === "v2.core.account") {
    return canonicalDigest({
      id: account.id,
      object: account.object,
      livemode: account.livemode,
      requirements: account.requirements ?? null,
      configuration: account.configuration ?? null,
      defaults: account.defaults ?? null,
      appliedConfigurations: account.applied_configurations,
    });
  }
  return canonicalDigest({
    id: account.id,
    object: account.object,
    livemode: null,
    requirements: account.requirements ?? null,
    configuration: null,
    defaults: null,
    appliedConfigurations: null,
  });
}

function accountEvidenceRef(
  account: Stripe.Account | Stripe.V2.Core.Account,
): string {
  return `stripe:account:${account.id}:${accountObjectDigest(account)}`;
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

function responseData<T>(value: T | Readonly<{ data: T }>): T {
  if (typeof value === "object" && value !== null && "data" in value)
    return value.data;
  return value as T;
}

function readMetadata(
  value: Stripe.Metadata | null,
): Record<string, string> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > 50) return undefined;
  const metadata: Record<string, string> = {};
  for (const [key, item] of entries) {
    if (
      !validIdentifier(key) ||
      typeof item !== "string" ||
      !validIdentifier(item)
    )
      return undefined;
    metadata[key] = item;
  }
  return metadata;
}

function digestMetadata(metadata: Readonly<Record<string, string>>): string {
  return canonicalDigest(
    Object.fromEntries(
      Object.entries(metadata).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
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

function stripeMinorAmount(amount: unknown): ExactAmount | undefined {
  const parsed = exactAmountSchema.safeParse(amount);
  if (!parsed.success) return undefined;
  const exponent = exponentForCurrency(parsed.data.currency);
  if (exponent === undefined) return undefined;
  const rescaled = rescaleExactAmount(parsed.data, exponent);
  if (rescaled === undefined) return undefined;
  const units = Number(rescaled.units);
  return Number.isSafeInteger(units) && units >= 0 ? rescaled : undefined;
}

function validBoundedWebhookBody(value: string): boolean {
  return (
    typeof value === "string" &&
    new TextEncoder().encode(value).byteLength <= MAX_WEBHOOK_BODY_BYTES
  );
}

function validIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    value.length <= MAX_PROVIDER_IDENTIFIER_LENGTH
  );
}
function knownPaymentStatus(
  value: string,
): NonNullable<CreditPaymentEvidence["paymentStatus"]> | undefined {
  return value === "paid" ||
    value === "unpaid" ||
    value === "no_payment_required"
    ? value
    : undefined;
}

function validTransferId(value: unknown): value is string {
  return typeof value === "string" && /^tr_[A-Za-z0-9_]+$/u.test(value);
}

function validAccountId(value: unknown): value is string {
  return typeof value === "string" && /^acct_[A-Za-z0-9_]+$/u.test(value);
}

function validCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z][A-Z0-9]{2,19}$/u.test(value);
}

function validHttpUrl(value: unknown): value is string {
  if (!validIdentifier(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function readEnvironmentValue(
  env: Environment,
  name: string,
): string | undefined {
  const value = env[name];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function modeFromSecretKey(value: string): StripeMoneyMode | undefined {
  if (/^sk_test_[A-Za-z0-9_-]+$/u.test(value)) return "test";
  if (/^sk_live_[A-Za-z0-9_-]+$/u.test(value)) return "live";
  return undefined;
}

function modeFromPublishableKey(value: string): StripeMoneyMode | undefined {
  if (/^pk_test_[A-Za-z0-9_-]+$/u.test(value)) return "test";
  if (/^pk_live_[A-Za-z0-9_-]+$/u.test(value)) return "live";
  return undefined;
}

function sessionMatchesMode(livemode: unknown, mode: StripeMoneyMode): boolean {
  return typeof livemode === "boolean" && livemode === (mode === "live");
}

function unavailableProvider(
  refusalValue: MoneyRefusal,
): CreditPaymentPort & ConnectAccountPort & PayoutTransferPort {
  return {
    createOrRecoverCreditPayment: async () => refusalValue,
    readCreditPayment: async () => refusalValue,
    createOrRecoverConnectAccount: async () => refusalValue,
    createOnboardingLink: async () => refusalValue,
    readConnectAccount: async () => refusalValue,
    createOrRecoverTransfer: async () => refusalValue,
    readTransfer: async () => refusalValue,
    readTransfersByIdentity: async () => refusalValue,
  };
}

function refusal(code: MoneyRefusal["code"], retryable: boolean): MoneyRefusal {
  return { kind: "refused", code, retryable };
}

const STRIPE_CURRENCY_EXPONENTS: Readonly<Record<string, number>> =
  Object.fromEntries([
    ..."USD AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BMD BND BOB BRL BSD BWP BYN BZD CAD CDF CHF CNY COP CRC CVE CZK DKK DOP DZD EGP ETB EUR FJD FKP GBP GEL GIP GMD GTQ GYD HKD HNL HTG HUF IDR ILS INR ISK JMD KES KGS KHR KYD KZT LAK LBP LKR LRD LSL MAD MDL MKD MMK MNT MOP MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD PAB PEN PGK PHP PKR PLN QAR RON RSD RUB SAR SBD SCR SEK SGD SHP SLE SOS SRD STD SZL THB TJS TOP TRY TTD TWD TZS UAH UGX UYU UZS WST XCD XCG YER ZAR ZMW".split(
      " ",
    ).map((currency) => [currency, 2] as const),
    ..."BIF CLP DJF GNF JPY KMF KRW MGA PYG RWF VND VUV XAF XOF XPF".split(
      " ",
    ).map((currency) => [currency, 0] as const),
    ..."BHD JOD KWD OMR TND".split(" ").map((currency) => [currency, 3] as const),
  ]);

function exponentForCurrency(currency: string): number | undefined {
  return STRIPE_CURRENCY_EXPONENTS[currency.toUpperCase()];
}
