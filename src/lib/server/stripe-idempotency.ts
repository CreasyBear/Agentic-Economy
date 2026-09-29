import { validIdentifier } from "./stripe-money-provider-config";

const MAX_STRIPE_IDEMPOTENCY_KEY_LENGTH = 255;
const CREDIT_IDEMPOTENCY_SCOPE = "ae:money:credit:";

export function stripeCreditIdempotencyKey(
  idempotencyKey: string,
): string | undefined {
  return scopedIdempotencyKey(CREDIT_IDEMPOTENCY_SCOPE, idempotencyKey);
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
