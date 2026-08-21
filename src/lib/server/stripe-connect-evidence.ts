import type Stripe from "stripe";

import { canonicalDigest } from "@/modules/common/canonical-digest";
import {
  isMoneyRefusal,
  type ConnectAccountEvidence,
  type ConnectAccountRequest,
  type MoneyRefusal,
  type OnboardingLinkRequest,
} from "@/modules/money/public";
import { stripeConnectOperationIdempotencyKey } from "./stripe-idempotency";
import {
  refusal,
  responseData,
  sessionMatchesMode,
  validCurrency,
  validHttpUrl,
  validIdentifier,
  type StripeMoneyClient,
  type StripeMoneyProviderConfig,
} from "./stripe-money-provider-config";

export async function createOrRecoverConnectAccount(
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

export async function createOnboardingLink(
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

export async function readConnectAccount(
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

export function accountObjectDigest(
  account: Stripe.Account | Stripe.V2.Core.Account,
): string {
  switch (account.object) {
    case "v2.core.account":
      return canonicalDigest({
        id: account.id,
        object: account.object,
        livemode: account.livemode,
        requirements: account.requirements ?? null,
        configuration: account.configuration ?? null,
        defaults: account.defaults ?? null,
        appliedConfigurations: account.applied_configurations,
      });
    case "account":
      return canonicalDigest({
        id: account.id,
        object: account.object,
        livemode: null,
        requirements: account.requirements ?? null,
        configuration: null,
        defaults: null,
        appliedConfigurations: null,
      });
    default: {
      const exhaustive: never = account;
      return exhaustive;
    }
  }
}

function accountEvidenceRef(
  account: Stripe.Account | Stripe.V2.Core.Account,
): string {
  return `stripe:account:${account.id}:${accountObjectDigest(account)}`;
}
