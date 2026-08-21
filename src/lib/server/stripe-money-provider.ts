import {
  isMoneyRefusal,
  type ConnectAccountPort,
  type CreditPaymentPort,
  type MoneyRefusal,
  type PayoutTransferPort,
} from "@/modules/money/public";
import {
  createOrRecoverCreditPayment,
  mapStripeCheckoutSessionEvidence,
  readCreditPayment,
  stripeCreditRequestDigest,
} from "./stripe-checkout-evidence";
import {
  createOnboardingLink,
  createOrRecoverConnectAccount,
  readConnectAccount,
} from "./stripe-connect-evidence";
import {
  stripeConnectIdempotencyKey,
  stripeCreditIdempotencyKey,
  stripePayoutIdempotencyKey,
} from "./stripe-idempotency";
import {
  readStripeMoneyProviderConfig,
  resolveStripeMoneyProviderContext,
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
  createOrRecoverTransfer,
  mapStripeTransferEvidence,
  readStripeTransfersByGroup,
  readStripeTransfersByIdentity,
  readTransfer,
  type StripeTransferGroupReadback,
} from "./stripe-transfer-evidence";

export type {
  StripeMoneyClient,
  StripeMoneyMode,
  StripeMoneyProviderConfig,
  StripeMoneyProviderInput,
};
export {
  mapStripeCheckoutSessionEvidence,
  mapStripeMoneyWebhookEvent,
  mapStripeTransferEvidence,
  readStripeMoneyProviderConfig,
  readStripeTransfersByGroup,
  readStripeTransfersByIdentity,
  stripeConnectIdempotencyKey,
  stripeCreditIdempotencyKey,
  stripeCreditRequestDigest,
  stripePayoutIdempotencyKey,
  verifyStripeMoneyWebhook,
};
export type { StripeTransferGroupReadback };

export function createStripeMoneyProvider(
  input: StripeMoneyProviderInput = {},
): CreditPaymentPort & ConnectAccountPort & PayoutTransferPort {
  const context = resolveStripeMoneyProviderContext(input);
  if (isMoneyRefusal(context)) return unavailableProvider(context);
  return {
    createOrRecoverCreditPayment: async (request) =>
      createOrRecoverCreditPayment(context.client, context.config, request),
    readCreditPayment: async (request) =>
      readCreditPayment(context.client, context.config, request),
    createOrRecoverConnectAccount: async (request) =>
      createOrRecoverConnectAccount(context.client, context.config, request),
    createOnboardingLink: async (request) =>
      createOnboardingLink(context.client, context.config, request),
    readConnectAccount: async (request) =>
      readConnectAccount(context.client, context.config, request),
    createOrRecoverTransfer: async (request) =>
      createOrRecoverTransfer(context.client, context.config, request),
    readTransfer: async (request) =>
      readTransfer(context.client, context.config, request),
    readTransfersByIdentity: async (request) =>
      readStripeTransfersByIdentity({
        config: context.config,
        client: context.client,
        request,
      }),
  };
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
