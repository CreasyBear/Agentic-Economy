import type Stripe from "stripe";

import { degradeBackend } from "@/lib/observability/degrade-backend";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import {
  exactAmountSchema,
  rescaleExactAmount,
  type ExactAmount,
  type MoneyRefusal,
} from "@/modules/money/public";

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
const MAX_PROVIDER_IDENTIFIER_LENGTH = 500;

/** Stripe env names `readStripeMoneyProviderConfig` reads to build a money provider config. */
export const STRIPE_MONEY_ENV_NAMES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_V2_WEBHOOK_SECRET",
  "STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID",
  "STRIPE_CHECKOUT_HOST",
] as const;

type Environment = Readonly<Record<string, string | undefined>>;

export type StripeMoneyMode = "test" | "live";
export type StripeMoneyClient = Stripe;

export type StripeMoneyProviderConfig = Readonly<{
  secretKey: string;
  webhookSecret?: string;
  v2WebhookSecret?: string;
  inclusiveGstTaxRateId?: string;
  checkoutHost?: string;
  mode: StripeMoneyMode;
}>;

export type StripeMoneyProviderInput = Readonly<{
  env?: Environment;
  mode?: StripeMoneyMode;
  config?: StripeMoneyProviderConfig;
  client?: StripeMoneyClient;
}>;

export type StripeMoneyProviderContext = Readonly<{
  config: StripeMoneyProviderConfig;
  client: StripeMoneyClient;
}>;

export function readStripeMoneyProviderConfig(
  env: Environment = process.env,
  expectedMode?: StripeMoneyMode,
): StripeMoneyProviderConfig | MoneyRefusal {
  const secretKey = readEnvironmentValue(env, "STRIPE_SECRET_KEY");
  const webhookSecret = readEnvironmentValue(env, "STRIPE_WEBHOOK_SECRET");
  const v2WebhookSecret = readEnvironmentValue(env, "STRIPE_V2_WEBHOOK_SECRET");
  const inclusiveGstTaxRateId = readEnvironmentValue(
    env,
    "STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID",
  );
  const checkoutHost = readEnvironmentValue(env, "STRIPE_CHECKOUT_HOST");
  if (
    secretKey === undefined ||
    webhookSecret === undefined
  ) {
    return refusal("stripe_setup_required", false);
  }
  return validateStripeMoneyProviderConfig(
    {
      secretKey,
      webhookSecret,
      ...(v2WebhookSecret === undefined ? {} : { v2WebhookSecret }),
      ...(inclusiveGstTaxRateId === undefined ? {} : { inclusiveGstTaxRateId }),
      ...(checkoutHost === undefined ? {} : { checkoutHost }),
      mode: modeFromSecretKey(secretKey) ?? "test",
    },
    expectedMode,
  );
}

export function validateStripeMoneyProviderConfig(
  config: StripeMoneyProviderConfig,
  expectedMode?: StripeMoneyMode,
): StripeMoneyProviderConfig | MoneyRefusal {
  const secretMode = modeFromSecretKey(config.secretKey);
  if (
    secretMode === undefined ||
    config.mode !== secretMode ||
    (expectedMode !== undefined && secretMode !== expectedMode) ||
    (config.webhookSecret !== undefined && !/^whsec_[A-Za-z0-9_-]+$/u.test(config.webhookSecret)) ||
    (config.v2WebhookSecret !== undefined && !/^whsec_[A-Za-z0-9_-]+$/u.test(config.v2WebhookSecret))
  )
    return refusal("stripe_setup_required", false);
  return config;
}

export function readStripeMoneyReadbackProviderConfig(
  env: Environment = process.env,
  expectedMode?: StripeMoneyMode,
): StripeMoneyProviderConfig | MoneyRefusal {
  const secretKey = readEnvironmentValue(env, "STRIPE_READBACK_KEY");
  if (secretKey === undefined || !/^rk_(?:test|live)_[A-Za-z0-9_-]+$/u.test(secretKey)) {
    return refusal("stripe_setup_required", false);
  }
  const inclusiveGstTaxRateId = readEnvironmentValue(
    env,
    "STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID",
  );
  const checkoutHost = readEnvironmentValue(env, "STRIPE_CHECKOUT_HOST");
  return validateStripeMoneyProviderConfig(
    {
      secretKey,
      mode: modeFromSecretKey(secretKey) ?? "test",
      ...(inclusiveGstTaxRateId === undefined ? {} : { inclusiveGstTaxRateId }),
      ...(checkoutHost === undefined ? {} : { checkoutHost }),
    },
    expectedMode,
  );
}

export function refusal(
  code: MoneyRefusal["code"],
  retryable: boolean,
): MoneyRefusal {
  return { kind: "refused", code, retryable };
}

export function validBoundedWebhookBody(value: string): boolean {
  return (
    typeof value === "string" &&
    new TextEncoder().encode(value).byteLength <= MAX_WEBHOOK_BODY_BYTES
  );
}

export function validIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    value.length <= MAX_PROVIDER_IDENTIFIER_LENGTH
  );
}

export function validTransferId(value: unknown): value is string {
  return typeof value === "string" && /^tr_[A-Za-z0-9_]+$/u.test(value);
}

export function validAccountId(value: unknown): value is string {
  return typeof value === "string" && /^acct_[A-Za-z0-9_]+$/u.test(value);
}

export function validCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z][A-Z0-9]{2,19}$/u.test(value);
}

export function validHttpUrl(value: unknown): value is string {
  if (!validIdentifier(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch (cause) {
    return degradeBackend(cause, false, {
      site: "validHttpUrl",
      reason: "invalid_response",
    });
  }
}

export function sessionMatchesMode(
  livemode: unknown,
  mode: StripeMoneyMode,
): boolean {
  return typeof livemode === "boolean" && livemode === (mode === "live");
}

export function responseData<T>(value: T | Readonly<{ data: T }>): T {
  if (typeof value === "object" && value !== null && "data" in value)
    return value.data;
  return value as T;
}

export function readMetadata(
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

export function digestMetadata(
  metadata: Readonly<Record<string, string>>,
): string {
  return canonicalDigest(
    Object.fromEntries(
      Object.entries(metadata).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
}

export function stripeMinorAmount(amount: unknown): ExactAmount | undefined {
  const parsed = exactAmountSchema.safeParse(amount);
  if (!parsed.success) return undefined;
  const exponent = exponentForCurrency(parsed.data.currency);
  if (exponent === undefined) return undefined;
  const rescaled = rescaleExactAmount(parsed.data, exponent);
  if (rescaled === undefined) return undefined;
  const units = Number(rescaled.units);
  return Number.isSafeInteger(units) && units >= 0 ? rescaled : undefined;
}

export function exponentForCurrency(currency: string): number | undefined {
  return STRIPE_CURRENCY_EXPONENTS[currency.toUpperCase()];
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
  if (/^(?:sk|rk)_test_[A-Za-z0-9_-]+$/u.test(value)) return "test";
  if (/^(?:sk|rk)_live_[A-Za-z0-9_-]+$/u.test(value)) return "live";
  return undefined;
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
