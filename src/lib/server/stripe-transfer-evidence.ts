import Stripe from "stripe";

import { canonicalDigest } from "@/modules/common/canonical-digest";
import {
  compareExactAmounts,
  exactAmountSchema,
  isMoneyRefusal,
  type ExactAmount,
  type MoneyRefusal,
  type PayoutTransferEvidence,
  type PayoutTransferRequest,
} from "@/modules/money/public";
import { stripePayoutIdempotencyKey } from "./stripe-idempotency";
import {
  digestMetadata,
  exponentForCurrency,
  readMetadata,
  refusal,
  resolveStripeMoneyProviderContext,
  responseData,
  sessionMatchesMode,
  stripeMinorAmount,
  validAccountId,
  validCurrency,
  validIdentifier,
  validTransferId,
  type StripeMoneyClient,
  type StripeMoneyProviderConfig,
  type StripeMoneyProviderInput,
} from "./stripe-money-provider-config";

export type StripeTransferGroupReadback = Readonly<{
  transferId: string;
  transferGroup: string;
}>;

export async function readStripeTransfersByIdentity(
  input: StripeMoneyProviderInput &
    Readonly<{ request: PayoutTransferRequest }>,
): Promise<readonly PayoutTransferEvidence[] | MoneyRefusal> {
  const context = resolveStripeMoneyProviderContext(input);
  if (isMoneyRefusal(context)) return context;
  const requestRefusal = validatePayoutTransferRequest(input.request);
  if (requestRefusal !== undefined) return requestRefusal;
  try {
    const page = await context.client.transfers.list({
      transfer_group: input.request.payoutRef,
      limit: 100,
    });
    if (page.has_more || page.data.length > 100)
      return refusal("payout_outcome_unknown", true);
    const evidence: PayoutTransferEvidence[] = [];
    for (const transfer of page.data) {
      if (transfer.transfer_group !== input.request.payoutRef)
        return refusal("ledger_idempotency_conflict", false);
      const mapped = mapStripeTransferEvidence({
        transfer,
        config: context.config,
        expected: input.request,
      });
      if (isMoneyRefusal(mapped)) return mapped;
      evidence.push(mapped);
    }
    return evidence;
  } catch {
    return refusal("payout_outcome_unknown", true);
  }
}

export async function readStripeTransfersByGroup(
  input: StripeMoneyProviderInput & Readonly<{ transferGroup: string }>,
): Promise<readonly StripeTransferGroupReadback[] | MoneyRefusal> {
  const context = resolveStripeMoneyProviderContext(input);
  if (isMoneyRefusal(context)) return context;
  if (!validIdentifier(input.transferGroup))
    return refusal("payment_binding_invalid", false);
  try {
    const page = await context.client.transfers.list({
      transfer_group: input.transferGroup,
      limit: 100,
    });
    if (page.has_more || page.data.length > 100)
      return refusal("payout_outcome_unknown", true);
    const transfers: StripeTransferGroupReadback[] = [];
    for (const transfer of page.data) {
      const evidence = mapStripeTransferEvidence({
        transfer,
        config: context.config,
      });
      if (isMoneyRefusal(evidence)) return evidence;
      if (transfer.transfer_group !== input.transferGroup)
        return refusal("ledger_idempotency_conflict", false);
      transfers.push({
        transferId: evidence.transferId,
        transferGroup: input.transferGroup,
      });
    }
    return transfers;
  } catch {
    return refusal("payout_outcome_unknown", true);
  }
}

export async function createOrRecoverTransfer(
  client: StripeMoneyClient,
  config: StripeMoneyProviderConfig,
  input: PayoutTransferRequest & Readonly<{ boundExternalRef?: string }>,
): Promise<PayoutTransferEvidence | MoneyRefusal> {
  const requestRefusal = validatePayoutTransferRequest(input);
  if (requestRefusal !== undefined) return requestRefusal;
  if (input.boundExternalRef !== undefined) {
    if (!validTransferId(input.boundExternalRef))
      return refusal("payment_binding_invalid", false);
    const retrieved = await retrieveTransfer(client, input.boundExternalRef);
    if (isMoneyRefusal(retrieved)) return retrieved;
    return mapStripeTransferEvidence({
      transfer: retrieved,
      config,
      expected: input,
    });
  }
  const idempotencyKey = stripePayoutIdempotencyKey(input.idempotencyKey);
  if (idempotencyKey === undefined)
    return refusal("payment_binding_invalid", false);
  const params = payoutTransferCreateParams(input);
  if (params === undefined)
    return refusal("credit_topup_amount_invalid", false);
  let created: Stripe.Transfer;
  try {
    created = responseData(
      await client.transfers.create(params, { idempotencyKey }),
    );
  } catch {
    try {
      created = responseData(
        await client.transfers.create(params, { idempotencyKey }),
      );
    } catch {
      return refusal("payout_outcome_unknown", true);
    }
  }
  if (!validTransferId(created.id))
    return refusal("payment_binding_invalid", false);
  const transfer = await retrieveTransfer(client, created.id);
  if (isMoneyRefusal(transfer)) {
    const unknown = mapStripeTransferEvidence({
      transfer: created,
      config,
      expected: input,
      status: "outcome_unknown",
    });
    return isMoneyRefusal(unknown) ? transfer : unknown;
  }
  return mapStripeTransferEvidence({ transfer, config, expected: input });
}

export async function readTransfer(
  client: StripeMoneyClient,
  config: StripeMoneyProviderConfig,
  input: Readonly<{ externalRef: string; idempotencyKey: string }>,
): Promise<PayoutTransferEvidence | MoneyRefusal> {
  if (
    !validTransferId(input.externalRef) ||
    stripePayoutIdempotencyKey(input.idempotencyKey) === undefined
  )
    return refusal("payment_binding_invalid", false);
  const transfer = await retrieveTransfer(client, input.externalRef);
  if (isMoneyRefusal(transfer)) return transfer;
  return mapStripeTransferEvidence({
    transfer,
    config,
    idempotencyKey: input.idempotencyKey,
  });
}

export function mapStripeTransferEvidence(
  input: Readonly<{
    transfer: Stripe.Transfer;
    config: StripeMoneyProviderConfig;
    expected?: PayoutTransferRequest;
    idempotencyKey?: string;
    status?: PayoutTransferEvidence["status"];
  }>,
): PayoutTransferEvidence | MoneyRefusal {
  const transfer = input.transfer;
  if (
    !validTransferId(transfer.id) ||
    transfer.object !== "transfer" ||
    !sessionMatchesMode(transfer.livemode, input.config.mode)
  )
    return refusal("stripe_setup_required", false);
  const destinationAccountId =
    typeof transfer.destination === "string"
      ? transfer.destination
      : transfer.destination?.id;
  const transferCurrency =
    typeof transfer.currency === "string"
      ? transfer.currency.toUpperCase()
      : undefined;
  const exponent =
    transferCurrency === undefined
      ? undefined
      : exponentForCurrency(transferCurrency);
  if (
    !validAccountId(destinationAccountId) ||
    !Number.isSafeInteger(transfer.amount) ||
    transfer.amount < 0 ||
    transferCurrency === undefined ||
    !validCurrency(transferCurrency) ||
    exponent === undefined
  )
    return refusal("payment_binding_invalid", false);
  const amount: ExactAmount = {
    currency: transferCurrency,
    units: String(transfer.amount),
    exponent,
  };
  const metadata = readMetadata(transfer.metadata);
  if (
    metadata === undefined ||
    !validIdentifier(metadata.ae_payout_ref) ||
    !validIdentifier(metadata.ae_command_id) ||
    !validIdentifier(metadata.ae_input_digest) ||
    !validIdentifier(metadata.ae_idempotency_key)
  )
    return refusal("payment_binding_invalid", false);
  if (
    input.idempotencyKey !== undefined &&
    metadata.ae_idempotency_key !== input.idempotencyKey
  )
    return refusal("ledger_idempotency_conflict", false);
  const expectedAmount =
    input.expected === undefined
      ? undefined
      : stripeMinorAmount(input.expected.amount);
  if (input.expected !== undefined && expectedAmount === undefined)
    return refusal("payment_binding_invalid", false);
  if (input.expected !== undefined) {
    if (
      transfer.transfer_group !== input.expected.payoutRef ||
      metadata.ae_payout_ref !== input.expected.payoutRef ||
      metadata.ae_command_id !== input.expected.commandId ||
      metadata.ae_input_digest !== input.expected.inputDigest ||
      metadata.ae_idempotency_key !== input.expected.idempotencyKey ||
      destinationAccountId !== input.expected.destinationAccountId ||
      compareExactAmounts(amount, expectedAmount) !== 0
    )
      return refusal("ledger_idempotency_conflict", false);
  }
  const status = transferEvidenceStatus(input.status, transfer.reversed);
  const requestDigest = metadata.ae_input_digest;
  const evidenceDigest = canonicalDigest({
    provider: "stripe",
    transferId: transfer.id,
    destinationAccountId,
    amount,
    status,
    livemode: transfer.livemode,
    metadataDigest: digestMetadata(metadata),
    created: transfer.created,
    reversed: transfer.reversed,
  });
  return {
    provider: "stripe",
    transferId: transfer.id,
    destinationAccountId,
    amount,
    status,
    requestDigest,
    evidenceDigest,
    observedAt: transfer.created * 1000,
  };
}

async function retrieveTransfer(
  client: StripeMoneyClient,
  externalRef: string,
): Promise<Stripe.Transfer | MoneyRefusal> {
  try {
    return responseData(await client.transfers.retrieve(externalRef));
  } catch {
    return refusal("payout_outcome_unknown", true);
  }
}

function payoutTransferCreateParams(
  input: PayoutTransferRequest,
): Stripe.TransferCreateParams | undefined {
  const amount = stripeMinorAmount(input.amount);
  if (amount === undefined) return undefined;
  return {
    amount: Number(amount.units),
    currency: amount.currency.toLowerCase(),
    destination: input.destinationAccountId,
    metadata: {
      ae_payout_ref: input.payoutRef,
      ae_command_id: input.commandId,
      ae_input_digest: input.inputDigest,
      ae_idempotency_key: input.idempotencyKey,
    },
    transfer_group: input.payoutRef,
  };
}

function validatePayoutTransferRequest(
  input: PayoutTransferRequest,
): MoneyRefusal | undefined {
  if (
    !validIdentifier(input.payoutRef) ||
    !validIdentifier(input.commandId) ||
    !validAccountId(input.destinationAccountId) ||
    !validIdentifier(input.inputDigest) ||
    stripePayoutIdempotencyKey(input.idempotencyKey) === undefined
  )
    return refusal("payment_binding_invalid", false);
  const amount = exactAmountSchema.safeParse(input.amount);
  if (
    !amount.success ||
    !validCurrency(amount.data.currency) ||
    stripeMinorAmount(amount.data) === undefined ||
    amount.data.units === "0"
  )
    return refusal("credit_topup_amount_invalid", false);
  return undefined;
}

function transferEvidenceStatus(
  status: PayoutTransferEvidence["status"] | undefined,
  reversed: boolean,
): PayoutTransferEvidence["status"] {
  if (status === "outcome_unknown") return "outcome_unknown";
  if (reversed) return "reversed";
  return status ?? "succeeded";
}
