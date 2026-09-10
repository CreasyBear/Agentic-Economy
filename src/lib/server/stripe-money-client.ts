import Stripe from "stripe";

import { isMoneyRefusal, type MoneyRefusal } from "@/modules/money/public";
import {
  readStripeMoneyProviderConfig,
  validateStripeMoneyProviderConfig,
  type StripeMoneyClient,
  type StripeMoneyProviderContext,
  type StripeMoneyProviderInput,
} from "./stripe-money-provider-config";

export function resolveStripeMoneyProviderContext(
  input: StripeMoneyProviderInput,
): StripeMoneyProviderContext | MoneyRefusal {
  const configResult =
    input.config === undefined
      ? readStripeMoneyProviderConfig(input.env ?? process.env, input.mode)
      : validateStripeMoneyProviderConfig(input.config, input.mode);
  if (isMoneyRefusal(configResult)) return configResult;
  return {
    config: configResult,
    client: input.client ?? createStripeMoneyClient(configResult.secretKey),
  };
}

export function createStripeMoneyClient(secretKey: string): StripeMoneyClient {
  return new Stripe(secretKey, {
    apiVersion: Stripe.API_VERSION,
    maxNetworkRetries: 2,
    typescript: true,
  });
}
