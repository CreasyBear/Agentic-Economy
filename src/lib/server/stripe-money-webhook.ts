import Stripe from "stripe";

import { canonicalDigest } from "@/modules/common/canonical-digest";
import {
  isMoneyRefusal,
  type MoneyRefusal,
  type StripeAccountUpdatedWebhookEvent,
  type StripeMoneyWebhookEvent,
} from "@/modules/money/public";
import { readCheckoutSessionMaterial } from "./stripe-checkout-evidence";
import { accountObjectDigest } from "./stripe-connect-evidence";
import {
  refusal,
  resolveStripeMoneyProviderContext,
  sessionMatchesMode,
  validBoundedWebhookBody,
  validIdentifier,
  type StripeMoneyProviderConfig,
  type StripeMoneyProviderInput,
} from "./stripe-money-provider-config";

type CheckoutWebhookEventType =
  | "checkout.session.completed"
  | "checkout.session.async_payment_succeeded"
  | "checkout.session.async_payment_failed"
  | "checkout.session.expired";

type StripeV2AccountEventType = Exclude<
  StripeAccountUpdatedWebhookEvent["eventType"],
  "account.updated"
>;
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
    case "account.updated":
      return mapAccountUpdatedWebhookEvent(event, input.config);
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      return mapCheckoutSessionWebhookEvent(event, input.config);
    default:
      return refusal("payment_binding_invalid", false);
  }
}

export async function verifyStripeMoneyWebhook(
  input: StripeMoneyProviderInput &
    Readonly<{
      rawBody: string;
      signature: string;
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
    const envelope = JSON.parse(input.rawBody) as unknown;
    if (isV2EventEnvelope(envelope)) {
      const notification = context.client.parseEventNotification(
        input.rawBody,
        input.signature,
        context.config.webhookSecret,
      );
      return mapStripeV2AccountNotification(notification, context.config);
    }
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
  } catch {
    return refusal("payment_binding_invalid", false);
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
  if (event.type === "checkout.session.expired" && session.status !== "expired")
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
): "expired" | "failed" | "paid" {
  switch (eventType) {
    case "checkout.session.expired":
      return "expired";
    case "checkout.session.async_payment_failed":
      return "failed";
    case "checkout.session.completed":
      return session.payment_status !== "paid" ? "failed" : "paid";
    case "checkout.session.async_payment_succeeded":
      return "paid";
    default: {
      const exhaustive: never = eventType;
      return exhaustive;
    }
  }
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
