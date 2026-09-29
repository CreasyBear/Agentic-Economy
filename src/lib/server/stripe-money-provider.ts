import {
  isMoneyRefusal,
  type CreditPaymentPort,
  type MoneyRefusal,
} from "@/modules/money/public";
import {
  createOrRecoverCreditPayment,
  mapStripeCheckoutSessionEvidence,
  readCreditPayment,
  stripeCreditRequestDigest,
} from "./stripe-checkout-evidence";
import {
  stripeCreditIdempotencyKey,
} from "./stripe-idempotency";
import { resolveStripeMoneyProviderContext } from "./stripe-money-client";
import {
  readStripeMoneyProviderConfig,
  readStripeMoneyReadbackProviderConfig,
  type StripeMoneyClient,
  type StripeMoneyMode,
  type StripeMoneyProviderConfig,
  type StripeMoneyProviderInput,
} from "./stripe-money-provider-config";
import {
  mapStripeMoneyWebhookEvent,
  verifyStripeMoneyWebhook,
} from "./stripe-money-webhook";
import {
  mapStripeFundingRefundEvidence,
  readStripeFundingRefund,
} from "./stripe-refund-evidence";

export type {
  StripeMoneyClient,
  StripeMoneyMode,
  StripeMoneyProviderConfig,
  StripeMoneyProviderInput,
};
export {
  mapStripeCheckoutSessionEvidence,
  mapStripeMoneyWebhookEvent,
  mapStripeFundingRefundEvidence,
  readStripeMoneyProviderConfig,
  readStripeMoneyReadbackProviderConfig,
  resolveStripeMoneyProviderContext,
  stripeCreditIdempotencyKey,
  stripeCreditRequestDigest,
  verifyStripeMoneyWebhook,
  readStripeFundingRefund,
};
export type { StripeFundingRefundEvidence } from "./stripe-refund-evidence";

export function createStripeMoneyProvider(
  input: StripeMoneyProviderInput = {},
): CreditPaymentPort {
  const context = resolveStripeMoneyProviderContext(input);
  if (isMoneyRefusal(context)) return unavailableProvider(context);
  return {
    createOrRecoverCreditPayment: async (request) =>
      createOrRecoverCreditPayment(context.client, context.config, request),
    readCreditPayment: async (request) =>
      readCreditPayment(context.client, context.config, request),
  };
}

function unavailableProvider(refusalValue: MoneyRefusal): CreditPaymentPort {
  return {
    createOrRecoverCreditPayment: async () => refusalValue,
    readCreditPayment: async () => refusalValue,
  };
}
