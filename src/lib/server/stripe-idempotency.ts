import { canonicalDigest } from "@/modules/common/canonical-digest";

import { validIdentifier } from "./stripe-money-provider-config";

const MAX_STRIPE_IDEMPOTENCY_KEY_LENGTH = 255;
const CREDIT_IDEMPOTENCY_SCOPE = "ae:money:credit:";
const CONNECT_IDEMPOTENCY_SCOPE = "ae:money:connect:";
const PAYOUT_IDEMPOTENCY_SCOPE = "ae:money:payout:";

export function stripeCreditIdempotencyKey(
  idempotencyKey: string,
): string | undefined {
  return scopedIdempotencyKey(CREDIT_IDEMPOTENCY_SCOPE, idempotencyKey);
}

export function stripeConnectIdempotencyKey(
  idempotencyKey: string,
): string | undefined {
  return scopedIdempotencyKey(CONNECT_IDEMPOTENCY_SCOPE, idempotencyKey);
}

export function stripeConnectOperationIdempotencyKey(
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
  return scopedIdempotencyKey(PAYOUT_IDEMPOTENCY_SCOPE, idempotencyKey);
}

function scopedIdempotencyKey(
  scope: string,
  idempotencyKey: string,
): string | undefined {
  if (!validIdentifier(idempotencyKey)) return undefined;
  const scoped = `${scope}${idempotencyKey}`;
  return scoped.length <= MAX_STRIPE_IDEMPOTENCY_KEY_LENGTH
    ? scoped
    : undefined;
}
