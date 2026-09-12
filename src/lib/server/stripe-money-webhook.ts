import Stripe from "stripe";

import { degradeBackend } from "@/lib/observability/degrade-backend";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import {
  isMoneyRefusal,
  type MoneyRefusal,
  type StripeAccountUpdatedWebhookEvent,
  type StripeMoneyWebhookEvent,
} from "@/modules/money/public";
import { readCheckoutSessionMaterial } from "./stripe-checkout-evidence";
import { resolveStripeMoneyProviderContext } from "./stripe-money-client";
import {
  refusal,
  sessionMatchesMode,
  validBoundedWebhookBody,
  validIdentifier,
  type StripeMoneyProviderConfig,
  type StripeMoneyProviderInput,
} from "./stripe-money-provider-config";
import { refundMaterial } from "./stripe-refund-evidence";

type CheckoutWebhookEventType =
  | "checkout.session.completed"
  | "checkout.session.async_payment_succeeded"
  | "checkout.session.async_payment_failed";

type StripeV2AccountEventType = StripeAccountUpdatedWebhookEvent["eventType"];
type StripeV2AccountEventNotification = Extract<
  Stripe.V2.Core.EventNotification,
  { type: StripeV2AccountEventType }
>;

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
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
      return mapCheckoutSessionWebhookEvent(event, input.config);
    case "refund.created":
    case "refund.updated":
    case "refund.failed":
      return mapRefundWebhookEvent(event);
    default:
      return refusal("payment_binding_invalid", false);
  }
}

function mapRefundWebhookEvent(
  event: Stripe.RefundCreatedEvent | Stripe.RefundUpdatedEvent | Stripe.RefundFailedEvent,
): StripeMoneyWebhookEvent | MoneyRefusal {
  const refund = event.data.object;
  const material = refundMaterial(refund);
  if (isMoneyRefusal(material)) return material;
  if (event.type === "refund.failed" && material.status !== "failed")
    return refusal("payment_binding_invalid", false);
  const refundDigest = canonicalDigest({
    format: "stripe-refund:v1",
    refundId: refund.id,
    paymentId: material.paymentId,
    chargeId: material.chargeId,
    status: material.status,
    amount: material.amount,
    balanceTransactionId:
      typeof refund.balance_transaction === "string"
        ? refund.balance_transaction
        : refund.balance_transaction?.id ?? null,
    failureBalanceTransactionId:
      typeof refund.failure_balance_transaction === "string"
        ? refund.failure_balance_transaction
        : refund.failure_balance_transaction?.id ?? null,
  });
  return {
    kind: "refund",
    stripeEventId: event.id,
    eventType: event.type,
    externalRef: refund.id,
    refundId: refund.id,
    paymentId: material.paymentId,
    chargeId: material.chargeId,
    refundDigest,
    status: material.status,
    amount: material.amount,
    payloadDigest: canonicalDigest({ format: "stripe-webhook-payload:v1", event }),
    observedAt: event.created * 1000,
  };
}

export async function verifyStripeMoneyWebhook(
  input: StripeMoneyProviderInput &
    Readonly<{
      rawBody: string;
      signature: string;
      destination?: "snapshot" | "accounts_v2";
    }>,
): Promise<StripeMoneyWebhookEvent | MoneyRefusal> {
  const context = resolveStripeMoneyProviderContext(input);
  if (isMoneyRefusal(context)) return context;
  if (
    !validBoundedWebhookBody(input.rawBody) ||
    !validIdentifier(input.signature)
  )
    return refusal("payment_binding_invalid", false);
  try {
    if (input.destination === "accounts_v2") {
      if (context.config.v2WebhookSecret === undefined)
        return refusal("stripe_setup_required", false);
      const notification = context.client.parseEventNotification(
        input.rawBody,
        input.signature,
        context.config.v2WebhookSecret,
      );
      return mapStripeV2AccountNotification(notification, context.config);
    }
    if (context.config.webhookSecret === undefined)
      return refusal("stripe_setup_required", false);
    const event = context.client.webhooks.constructEvent(
      input.rawBody,
      input.signature,
      context.config.webhookSecret,
    );
    return mapStripeMoneyWebhookEvent({
      event,
      config: context.config,
      rawBody: input.rawBody,
    });
  } catch (cause) {
    return degradeBackend(cause, refusal("payment_binding_invalid", false), {
      site: "verifyStripeMoneyWebhook",
      reason: "invalid_response",
    });
  }
}

function mapCheckoutSessionWebhookEvent(
  event: Extract<Stripe.Event, { type: CheckoutWebhookEventType }>,
  config: StripeMoneyProviderConfig,
): StripeMoneyWebhookEvent | MoneyRefusal {
  const session = event.data.object;
  const material = readCheckoutSessionMaterial(session, config);
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
    status: checkoutWebhookStatus(event.type, session),
    amount: material.amount,
    metadataDigest: material.metadataDigest,
    payloadDigest,
    observedAt: event.created * 1000,
  };
}

function checkoutWebhookStatus(
  eventType: CheckoutWebhookEventType,
  session: Stripe.Checkout.Session,
): "failed" | "processing" | "paid" {
  switch (eventType) {
    case "checkout.session.async_payment_failed":
      return "failed";
    case "checkout.session.completed":
      return session.payment_status !== "paid" ? "processing" : "paid";
    case "checkout.session.async_payment_succeeded":
      return "paid";
    default: {
      const exhaustive: never = eventType;
      return exhaustive;
    }
  }
}

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

function isV2AccountEventNotification(
  value: Stripe.V2.Core.EventNotification,
): value is StripeV2AccountEventNotification {
  switch (value.type) {
    case "v2.core.account.created":
    case "v2.core.account.updated":
    case "v2.core.account.closed":
    case "v2.core.account[configuration.recipient].updated":
    case "v2.core.account[configuration.recipient].capability_status_updated":
      return true;
    default:
      return false;
  }
}
