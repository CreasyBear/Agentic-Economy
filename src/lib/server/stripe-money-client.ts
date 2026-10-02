import Stripe from "stripe";

import { isMoneyRefusal, type MoneyRefusal } from "@/modules/money/public";
import {
  expectedStripeMoneyModeForDeployment,
  readStripeMoneyProviderConfig,
  validateStripeMoneyProviderConfig,
  type StripeMoneyClient,
  type StripeMoneyProviderContext,
  type StripeMoneyProviderInput,
} from "./stripe-money-provider-config";

export function resolveStripeMoneyProviderContext(
  input: StripeMoneyProviderInput,
): StripeMoneyProviderContext | MoneyRefusal {
  const expectedMode = expectedStripeMoneyModeForDeployment(
    input.env ?? process.env,
    input.mode,
  );
  const configResult =
    input.config === undefined
      ? readStripeMoneyProviderConfig(input.env ?? process.env, input.mode)
      : validateStripeMoneyProviderConfig(input.config, expectedMode);
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
