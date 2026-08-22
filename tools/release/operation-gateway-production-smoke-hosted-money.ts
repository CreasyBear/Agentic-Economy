import { createClerkClient } from "@clerk/backend";
import Stripe from "stripe";

import { canonicalDigest } from "../../src/modules/common/canonical-digest";
import type { JsonValue } from "../../src/modules/capability-contract/public";
import { OPERATION_INVOKE_HTTP_PATH } from "../../src/modules/capability-execution/operation-invoke-entry";
import {
  sourceQuery,
  type ConvexSourceTransport,
} from "../../src/lib/server/convex-source";
import {
  beginCreditTopupThroughSource,
  readCreditPaymentThroughSource as readTopupPaymentThroughSource,
  readOwnerPayoutTransferThroughSource,
  runOwnerPayoutTransferThroughSource,
} from "../../src/modules/money/server";
import {
  readStripeMoneyProviderConfig,
  readStripeTransfersByGroup,
  verifyStripeMoneyWebhook,
} from "../../src/lib/server/stripe-money-provider";
import {
  CreditAccountViewSchema,
  CreditActivityViewSchema,
  exactAmountSchema,
  isMoneyRefusal,
  KeyUsageViewSchema,
  StrictLivePayoutReceiptSchema,
  accountRefForOwner,
  accountRefForProvider,
  calculateCreditTopupFinancials,
  compareExactAmounts,
  productionCreditTopupConfig,
  subtractExactAmounts,
  type ExactAmount,
  type StrictLivePayoutReceipt,
} from "../../src/modules/money/public";
import {
  APPROVED_EXTERNAL_MOVEMENT_CAP,
  required,
  sameAmount,
  topupPreparationSchema,
  topupProviderEventSchema,
  topupWebhookReplaySchema,
  zeroAmount,
} from "./operation-gateway-production-smoke-receipt";
import {
  GatewaySmokeError,
  type GatewayPayoutProviderTransferReadback,
  type GatewayTopupObservation,
  type GatewayTopupPreparationArtifact,
  type GatewayTopupProviderEvent,
  type GatewayTopupWebhookReplay,
  type HostedTopupReadback,
} from "./operation-gateway-production-smoke-receipt";
import {
  parseGatewayOwnerProviderEarnings,
  sanitizeGatewayPayoutProviderTransfers,
  type HostedMoneySnapshot,
  type StrictCreditActivityView,
} from "./operation-gateway-production-smoke-money";
import { requestJson } from "./operation-gateway-production-smoke-invocation";
import { resolveVercelProtectionBypassSecret } from "./vercel-protection-bypass";

export const MAX_TOPUP_EVENT_PAGES = 10;
export const STRIPE_REQUEST_TIMEOUT_MS = 15_000;
export const MAX_TOPUP_WEBHOOK_RAW_BODY_BYTES = 256 * 1024;
export const MAX_TOPUP_WEBHOOK_SIGNATURE_BYTES = 4 * 1024;

export type HostedMoneyRuntime = Readonly<{
  mode: "live";
  principalId: string;
  accountRef: string;
  businessId: string;
  credentialId: string;
  topupIdempotencyKey: string;
  topupChargeAmount: ExactAmount;
  beginTopup: () => Promise<GatewayTopupPreparationArtifact>;
  payoutRef: string;
  payoutIdempotencyKey: string;
  readSnapshot: () => Promise<HostedMoneySnapshot>;
  readProviderTransfers: (
    payoutRef: string,
  ) => Promise<GatewayPayoutProviderTransferReadback>;
  observeTopup: (
    expected: GatewayTopupPreparationArtifact,
  ) => Promise<GatewayTopupObservation>;
  readControlActivity: (
    invocationRef: string,
  ) => Promise<StrictCreditActivityView>;
  beginPayout: (
    input: Readonly<{
      payoutRef: string;
      idempotencyKey: string;
      amount: ExactAmount;
    }>,
  ) => Promise<StrictLivePayoutReceipt>;
  readPayout: (
    input: Readonly<{ payoutRef: string; idempotencyKey: string }>,
  ) => Promise<StrictLivePayoutReceipt>;
  readWithdrawnOperation: (
    operationRef: string,
  ) => Promise<Readonly<{ kind: "refused"; code: "operation_withdrawn" }>>;
  preflightCredential: () => Promise<void>;
  revokeCredential: (
    operationRef: string | undefined,
    input: Readonly<Record<string, JsonValue>>,
  ) => Promise<
    Readonly<{
      kind: "refused";
      code: "authentication_required";
      credentialDigest: string;
    }>
  >;
}>;

export function createHostedMoneyRuntime(
  options: Readonly<{
    env: Record<string, string | undefined>;
    baseUrl: string;
    apiKey: string;
    fetch: typeof globalThis.fetch;
    runId: string;
    approvedAt: number;
    clerk: ReturnType<typeof createClerkClient>;
    transport: () => Promise<ConvexSourceTransport>;
    credentialProof: () => Promise<Readonly<{ credentialId: string }>>;
    context: unknown;
    readWithdrawnOperation: HostedMoneyRuntime["readWithdrawnOperation"];
  }>,
): HostedMoneyRuntime {
  const ownerUserId = required(
    options.env.AE_GATEWAY_SMOKE_OWNER_CLERK_USER_ID,
    "AE_GATEWAY_SMOKE_OWNER_CLERK_USER_ID",
  );
  const controlBusinessId = required(
    options.env.AE_GATEWAY_SMOKE_CONTROL_BUSINESS_ID,
    "AE_GATEWAY_SMOKE_CONTROL_BUSINESS_ID",
  );
  const credentialId = required(
    options.env.AE_GATEWAY_SMOKE_CREDENTIAL_ID,
    "AE_GATEWAY_SMOKE_CREDENTIAL_ID",
  );
  const principalId = `clerk_api_key:${credentialId}`;
  const currency = required(
    options.env.AE_GATEWAY_SMOKE_CURRENCY ?? "USD",
    "AE_GATEWAY_SMOKE_CURRENCY",
  );
  const accountRef = accountRefForOwner(ownerUserId, currency);
  const topupIdempotencyKey = `${options.runId}:topup`;
  const payoutRef = required(
    options.env.AE_GATEWAY_SMOKE_PAYOUT_REF,
    "AE_GATEWAY_SMOKE_PAYOUT_REF",
  );
  const payoutIdempotencyKey = required(
    options.env.AE_GATEWAY_SMOKE_PAYOUT_IDEMPOTENCY_KEY,
    "AE_GATEWAY_SMOKE_PAYOUT_IDEMPOTENCY_KEY",
  );
  if (
    payoutRef !== `${options.runId}:payout` ||
    payoutIdempotencyKey !== `${options.runId}:payout`
  )
    throw new GatewaySmokeError("gateway_smoke_money_run_identity_mismatch");
  const amountRaw = required(
    options.env.AE_GATEWAY_SMOKE_TOPUP_AMOUNT_JSON,
    "AE_GATEWAY_SMOKE_TOPUP_AMOUNT_JSON",
  );
  let parsedTopupAmount: unknown;
  try {
    parsedTopupAmount = JSON.parse(amountRaw) as unknown;
  } catch {
    throw new GatewaySmokeError("gateway_smoke_topup_amount_invalid");
  }
  const topupConfig = productionCreditTopupConfig();
  const accountTemplate = topupConfig.minimumByCurrency[currency];
  const parsedAmount = exactAmountSchema.safeParse(parsedTopupAmount);
  const financials =
    accountTemplate === undefined || !parsedAmount.success
      ? undefined
      : calculateCreditTopupFinancials({
          amount: parsedAmount.data,
          accountCurrency: accountTemplate.currency,
          accountExponent: accountTemplate.exponent,
          config: topupConfig,
        });
  if (financials === undefined)
    throw new GatewaySmokeError("gateway_smoke_topup_amount_invalid");
  const topupAmount = financials.amount;
  const chargeAmount = financials.chargeAmount;
  if (
    compareExactAmounts(chargeAmount, APPROVED_EXTERNAL_MOVEMENT_CAP) ===
      undefined ||
    compareExactAmounts(chargeAmount, APPROVED_EXTERNAL_MOVEMENT_CAP) === 1
  )
    throw new GatewaySmokeError(
      "gateway_smoke_topup_charge_exceeds_approved_cap",
    );
  const stripeConfig = readStripeMoneyProviderConfig(options.env, "live");
  if (isMoneyRefusal(stripeConfig) || stripeConfig.mode !== "live")
    throw new GatewaySmokeError("stripe_setup_required");
  const stripe = new Stripe(stripeConfig.secretKey, {
    apiVersion: Stripe.API_VERSION,
    maxNetworkRetries: 0,
    timeout: STRIPE_REQUEST_TIMEOUT_MS,
    typescript: true,
  });
  const { transport, credentialProof, context, clerk } = options;
  const preflightCredential = async (): Promise<void> => {
    await credentialProof();
  };
  const record = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value))
      : undefined;

  const accountQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:readCreditAccount",
  );
  const usageQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:readKeyUsage",
  );
  const activityQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:listCreditActivity",
  );
  const earningsQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:readOwnerProviderEarnings",
  );
  const topupQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:readCreditTopupCommand",
  );

  const readSnapshot = async (): Promise<HostedMoneySnapshot> => {
    const client = await transport();
    const [accountResult, usageResult, earningsResult] = await Promise.all([
      client.query(accountQuery, { principalId, currency }),
      client.query(usageQuery, { principalId, credentialId, currency }),
      client.query(earningsQuery, {}),
    ]);
    const account = record(accountResult);
    const usage = record(usageResult);
    if (account?.kind !== "ok" || usage?.kind !== "ok")
      throw new GatewaySmokeError("gateway_smoke_money_source_refused");
    const accountFields = { ...account };
    const usageFields = { ...usage };
    delete accountFields.kind;
    delete usageFields.kind;
    return {
      buyer: CreditAccountViewSchema.parse(accountFields),
      usage: KeyUsageViewSchema.parse(usageFields),
      supplier: parseGatewayOwnerProviderEarnings(
        earningsResult,
        controlBusinessId,
        currency,
      ),
    };
  };

  const readActivity = async (
    invocationRef: string,
  ): Promise<StrictCreditActivityView> => {
    const result = record(
      await (
        await transport()
      ).query(activityQuery, {
        principalId,
        credentialId,
        currency,
        paginationOpts: { numItems: 100, cursor: null },
      }),
    );
    const page = Array.isArray(result?.page) ? result.page : [];
    const matches = page.flatMap((item) => {
      const parsed = CreditActivityViewSchema.safeParse(item);
      return parsed.success && parsed.data.invocationRef === invocationRef
        ? [parsed.data]
        : [];
    });
    if (matches.length !== 1 || matches[0] === undefined) {
      throw new GatewaySmokeError(
        "gateway_smoke_money_activity_missing_or_ambiguous",
      );
    }
    return matches[0];
  };

  const readProviderTransfers = async (
    transferGroup: string,
  ): Promise<GatewayPayoutProviderTransferReadback> => {
    const transfers = await readStripeTransfersByGroup({
      config: stripeConfig,
      client: stripe,
      transferGroup,
    });
    if (isMoneyRefusal(transfers))
      throw new GatewaySmokeError(`gateway_smoke_payout_${transfers.code}`);
    return sanitizeGatewayPayoutProviderTransfers(
      transferGroup,
      transfers.map(({ transferId }) => transferId),
    );
  };

  const topupReadback = async (
    input: Readonly<{ externalRef: string; idempotencyKey: string }>,
  ): Promise<HostedTopupReadback> => {
    const payment = await readTopupPaymentThroughSource(input, context, {
      env: options.env,
      mode: "live",
      config: stripeConfig,
    });
    if (!("evidence" in payment))
      throw new GatewaySmokeError(`gateway_smoke_topup_${payment.code}`);
    if (
      payment.evidence.status !== "succeeded" ||
      payment.evidence.externalRef !== input.externalRef
    ) {
      throw new GatewaySmokeError("gateway_smoke_topup_payment_not_succeeded");
    }
    const result = record(await (await transport()).query(topupQuery, input));
    const command = record(result?.command);
    if (
      result?.kind !== "accepted" ||
      command === undefined ||
      command.state !== "succeeded"
    ) {
      throw new GatewaySmokeError("gateway_smoke_topup_command_missing");
    }
    const readString = (key: string): string => {
      const value = command[key];
      if (typeof value !== "string" || value.length === 0) {
        throw new GatewaySmokeError(`gateway_smoke_topup_${key}_missing`);
      }
      return value;
    };
    const readOptionalString = (key: string): string | undefined => {
      const value = command[key];
      return typeof value === "string" && value.length > 0 ? value : undefined;
    };
    if (
      readString("principalId") !== principalId ||
      readString("accountRef") !== accountRef ||
      readString("externalRef") !== input.externalRef ||
      readString("idempotencyKey") !== input.idempotencyKey
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_command_identity_mismatch",
      );
    const checkoutSessionDigest = readString("checkoutSessionDigest");
    const paymentIntentDigest = readOptionalString("paymentIntentDigest");
    const paymentId = readOptionalString("paymentId");
    if (
      readString("requestDigest") !== payment.evidence.requestDigest ||
      readString("metadataDigest") !== payment.evidence.metadataDigest ||
      readString("evidenceDigest") !== payment.evidence.evidenceDigest ||
      readString("providerEvidenceRef") !== payment.evidence.evidenceRef ||
      checkoutSessionDigest !== payment.evidence.checkoutSessionDigest ||
      paymentIntentDigest !== payment.evidence.paymentIntentDigest ||
      paymentId !== payment.evidence.paymentId
    )
      throw new GatewaySmokeError("gateway_smoke_topup_evidence_mismatch");
    const amount = (key: string): ExactAmount =>
      exactAmountSchema.parse({
        currency: readString("currency"),
        units: readString(key),
        exponent: command.exponent,
      });
    const checkoutCreatedAt = command.createdAt;
    if (
      !Number.isSafeInteger(checkoutCreatedAt) ||
      Number(checkoutCreatedAt) <= 0
    ) {
      throw new GatewaySmokeError("gateway_smoke_topup_created_at_missing");
    }
    return {
      topupCommandRef: readString("commandRef"),
      buyerPrincipalDigest: canonicalDigest({ principalId }),
      paymentEvidenceRef: payment.evidence.evidenceRef,
      paymentEvidenceDigest: payment.evidence.evidenceDigest,
      paymentRequestDigest: payment.evidence.requestDigest,
      paymentMetadataDigest: payment.evidence.metadataDigest,
      checkoutSessionDigest,
      ...(paymentIntentDigest === undefined ? {} : { paymentIntentDigest }),
      ...(paymentId === undefined ? {} : { paymentId }),
      externalRef: input.externalRef,
      idempotencyKey: input.idempotencyKey,
      stripeEventId: readString("appliedStripeEventId"),
      stripePayloadDigest: readString("appliedPayloadDigest"),
      transactionRef: readString("appliedTransactionRef"),
      creditAmount: amount("amountUnits"),
      processingFee: amount("processingFeeUnits"),
      chargeAmount: amount("chargeAmountUnits"),
      checkoutCreatedAt: Number(checkoutCreatedAt),
      buyerBalanceBefore: exactAmountSchema.parse(command.buyerBalanceBefore),
      buyerBalanceAfter: exactAmountSchema.parse(command.buyerBalanceAfter),
    };
  };

  const beginTopup = async (): Promise<GatewayTopupPreparationArtifact> => {
    const begun = await beginCreditTopupThroughSource(
      {
        principalId,
        amount: topupAmount,
        idempotencyKey: topupIdempotencyKey,
      },
      context,
      {
        env: options.env,
        mode: "live",
        config: stripeConfig,
        resolveOwnerId: async () => ownerUserId,
      },
    );
    if (begun.kind !== "ok")
      throw new GatewaySmokeError(`gateway_smoke_topup_${begun.code}`);
    const evidence = begun.session.evidence;
    if (
      evidence.status !== "pending" ||
      evidence.observedAt < options.approvedAt ||
      !sameAmount(evidence.amount, chargeAmount)
    )
      throw new GatewaySmokeError("gateway_smoke_topup_preparation_invalid");
    return topupPreparationSchema.parse({
      schemaVersion: 1,
      kind: "operation_gateway_topup_preparation",
      status: "awaiting_payment",
      sourceRevision: required(
        options.env.AE_RELEASE_SOURCE_REVISION,
        "AE_RELEASE_SOURCE_REVISION",
      ),
      runId: options.runId,
      approvedAt: new Date(options.approvedAt).toISOString(),
      checkoutCreatedAt: new Date(evidence.observedAt).toISOString(),
      commandRef: begun.commandRef,
      externalRef: evidence.externalRef,
      idempotencyKey: topupIdempotencyKey,
      creditAmount: topupAmount,
      chargeAmount,
      paymentRequestDigest: evidence.requestDigest,
      paymentMetadataDigest: evidence.metadataDigest,
      checkoutSessionDigest: evidence.checkoutSessionDigest,
      operatorAction:
        "complete_the_stripe_checkout_before_dispatching_complete",
    });
  };

  const readTopupWebhookCapture = async (
    externalRef: string,
    stripeEventId: string,
    checkoutCreatedAt: number,
  ): Promise<Readonly<{ rawBody: string; signature: string }>> => {
    let startingAfter: string | undefined;
    const created = Math.floor(checkoutCreatedAt / 1_000);
    try {
      for (let page = 0; page < MAX_TOPUP_EVENT_PAGES; page += 1) {
        const events = await stripe.events.list({
          types: [
            "checkout.session.completed",
            "checkout.session.async_payment_succeeded",
          ],
          created: { gte: created },
          limit: 100,
          ...(startingAfter === undefined
            ? {}
            : { starting_after: startingAfter }),
        });
        for (const event of events.data) {
          if (event.id !== stripeEventId) continue;
          const eventObject = record(event.data.object);
          if (eventObject?.id !== externalRef) continue;
          if (!event.livemode)
            throw new GatewaySmokeError(
              "gateway_smoke_topup_webhook_event_mode_mismatch",
            );
          const rawBody = JSON.stringify(event);
          if (
            new TextEncoder().encode(rawBody).byteLength >
            MAX_TOPUP_WEBHOOK_RAW_BODY_BYTES
          )
            throw new GatewaySmokeError(
              "gateway_smoke_topup_webhook_event_too_large",
            );
          const signature = stripe.webhooks.generateTestHeaderString({
            payload: rawBody,
            secret: stripeConfig.webhookSecret,
          });
          if (
            new TextEncoder().encode(signature).byteLength >
            MAX_TOPUP_WEBHOOK_SIGNATURE_BYTES
          )
            throw new GatewaySmokeError(
              "gateway_smoke_topup_webhook_signature_too_large",
            );
          return { rawBody, signature };
        }
        if (!events.has_more || events.data.length === 0) break;
        const last = events.data[events.data.length - 1];
        if (last === undefined || last.id === startingAfter) break;
        startingAfter = last.id;
      }
    } catch (error) {
      if (error instanceof GatewaySmokeError) throw error;
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_event_lookup_failed",
      );
    }
    throw new GatewaySmokeError("gateway_smoke_topup_webhook_event_not_found");
  };

  const observeTopup = async (
    expected: GatewayTopupPreparationArtifact,
  ): Promise<GatewayTopupObservation> => {
    const sourceRevision = required(
      options.env.AE_RELEASE_SOURCE_REVISION,
      "AE_RELEASE_SOURCE_REVISION",
    );
    if (
      expected.sourceRevision !== sourceRevision ||
      expected.runId !== options.runId ||
      expected.idempotencyKey !== topupIdempotencyKey ||
      new Date(expected.approvedAt).getTime() !== options.approvedAt ||
      !sameAmount(expected.creditAmount, topupAmount) ||
      !sameAmount(expected.chargeAmount, chargeAmount)
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_preparation_identity_mismatch",
      );

    const readback = await topupReadback(expected);
    if (
      readback.topupCommandRef !== expected.commandRef ||
      readback.paymentRequestDigest !== expected.paymentRequestDigest ||
      readback.paymentMetadataDigest !== expected.paymentMetadataDigest ||
      readback.checkoutSessionDigest !== expected.checkoutSessionDigest ||
      readback.checkoutCreatedAt !==
        new Date(expected.checkoutCreatedAt).getTime()
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_preparation_binding_mismatch",
      );

    const { rawBody, signature } = await readTopupWebhookCapture(
      expected.externalRef,
      readback.stripeEventId,
      readback.checkoutCreatedAt,
    );
    const verified = await verifyStripeMoneyWebhook({
      rawBody,
      signature,
      config: stripeConfig,
      mode: "live",
      client: stripe,
    });
    if (
      isMoneyRefusal(verified) ||
      verified.kind !== "checkout" ||
      verified.status !== "paid" ||
      verified.externalRef !== expected.externalRef ||
      verified.commandRef !== readback.topupCommandRef ||
      verified.stripeEventId !== readback.stripeEventId ||
      verified.payloadDigest !== readback.stripePayloadDigest
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_identity_or_verification_failed",
      );

    const providerEvent = topupProviderEventSchema.parse({
      status: "observed",
      stripeEventId: verified.stripeEventId,
      eventType: verified.eventType,
      externalRef: verified.externalRef,
      commandRef: verified.commandRef,
      runId: expected.runId,
      observedAt: new Date(verified.observedAt).toISOString(),
      amount: verified.amount,
    });

    const buyerBeforeReplay = await readSnapshot();
    if (
      !sameAmount(buyerBeforeReplay.buyer.balance, readback.buyerBalanceAfter)
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_replay_before_balance_mismatch",
      );
    const bypassSecret = resolveVercelProtectionBypassSecret(options.env);
    const postWebhookReplay = async (): Promise<
      Readonly<{
        status: number;
        replay: Record<string, unknown> | undefined;
      }>
    > => {
      const response = await options.fetch(
        `${options.baseUrl}/api/stripe/webhook`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "stripe-signature": signature,
            ...(bypassSecret === undefined
              ? {}
              : { "x-vercel-protection-bypass": bypassSecret }),
          },
          body: rawBody,
        },
      );
      let responseBody: unknown;
      try {
        responseBody = JSON.parse(await response.text()) as unknown;
      } catch {
        throw new GatewaySmokeError(
          "gateway_smoke_topup_webhook_replay_response_malformed",
        );
      }
      return { status: response.status, replay: record(responseBody) };
    };
    const firstReplay = await postWebhookReplay();
    const secondReplay = await postWebhookReplay();
    const assertReplay = (
      result: Readonly<{
        status: number;
        replay: Record<string, unknown> | undefined;
      }>,
    ): void => {
      if (
        result.status !== 200 ||
        result.replay?.kind !== "accepted" ||
        result.replay.status !== "replayed" ||
        result.replay.appliedRef !== readback.transactionRef
      )
        throw new GatewaySmokeError(
          "gateway_smoke_topup_webhook_replay_not_confirmed",
        );
    };
    assertReplay(firstReplay);
    assertReplay(secondReplay);
    const replay = secondReplay.replay;
    if (replay === undefined)
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_replay_not_confirmed",
      );

    const buyerAfterReplay = await readSnapshot();
    const creditDelta = subtractExactAmounts(
      buyerAfterReplay.buyer.balance,
      buyerBeforeReplay.buyer.balance,
    );
    if (
      creditDelta === undefined ||
      !sameAmount(creditDelta, zeroAmount(creditDelta))
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_replay_changed_credit",
      );
    const replayReadback = await topupReadback(expected);
    if (
      replayReadback.transactionRef !== readback.transactionRef ||
      replayReadback.stripeEventId !== readback.stripeEventId ||
      replayReadback.stripePayloadDigest !== readback.stripePayloadDigest ||
      !sameAmount(
        replayReadback.buyerBalanceBefore,
        readback.buyerBalanceBefore,
      ) ||
      !sameAmount(
        replayReadback.buyerBalanceAfter,
        buyerAfterReplay.buyer.balance,
      )
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_replay_readback_mismatch",
      );
    const webhookReplay = topupWebhookReplaySchema.parse({
      status: "replayed",
      signatureVerified: true,
      stripeEventId: verified.stripeEventId,
      stripePayloadDigest: verified.payloadDigest,
      rawBodyDigest: canonicalDigest(rawBody),
      signatureDigest: canonicalDigest({
        format: "stripe-signature:v1",
        signature,
      }),
      commandRef: readback.topupCommandRef,
      transactionRef: readback.transactionRef,
      appliedRef: replay.appliedRef,
      buyerBalanceBefore: buyerBeforeReplay.buyer.balance,
      buyerBalanceAfter: buyerAfterReplay.buyer.balance,
      creditDelta,
    });
    return { readback, providerEvent, webhookReplay };
  };

  const payoutReadback = async (
    input: Readonly<{
      payoutRef: string;
      idempotencyKey: string;
      amount?: ExactAmount;
    }>,
    begin: boolean,
  ): Promise<StrictLivePayoutReceipt> => {
    const result = begin
      ? await runOwnerPayoutTransferThroughSource(
          {
            businessId: controlBusinessId,
            currency,
            payoutRef: input.payoutRef,
            amount: exactAmountSchema.parse(input.amount),
            idempotencyKey: input.idempotencyKey,
          },
          context,
        )
      : await readOwnerPayoutTransferThroughSource(
          {
            businessId: controlBusinessId,
            currency,
            payoutRef: input.payoutRef,
            idempotencyKey: input.idempotencyKey,
          },
          context,
        );
    if (result.kind !== "ok")
      throw new GatewaySmokeError(`gateway_smoke_payout_${result.code}`);
    const transfer = record(result.transfer);
    if (
      transfer === undefined ||
      transfer.state !== "paid" ||
      transfer.transferStatus !== "succeeded" ||
      typeof transfer.stripeTransferId !== "string" ||
      typeof transfer.evidenceDigest !== "string"
    )
      throw new GatewaySmokeError(
        "gateway_smoke_payout_transfer_not_succeeded",
      );
    return StrictLivePayoutReceiptSchema.parse({
      payoutRef: transfer.payoutRef,
      payoutCommandId: transfer.payoutCommandId,
      supplierBusinessId: controlBusinessId,
      payoutAccountRef: accountRefForProvider(controlBusinessId, currency),
      stripeAccountDigest: canonicalDigest({
        format: "stripe-account:v1",
        destinationAccountId: transfer.destinationAccountId,
      }),
      stripeTransferDigest: canonicalDigest({
        format: "stripe-transfer:v1",
        transferId: transfer.stripeTransferId,
      }),
      transferEvidenceDigest: transfer.evidenceDigest,
      providerNetAmount: transfer.amount,
      providerHeldBefore: transfer.providerHeldBefore,
      providerHeldAfter: transfer.providerHeldAfter,
      providerPaidBefore: transfer.providerPaidBefore,
      providerPaidAfter: transfer.providerPaidAfter,
      replayAdditionalDebits: 0,
    });
  };

  let revokePromise:
    | Promise<
        Readonly<{
          kind: "refused";
          code: "authentication_required";
          credentialDigest: string;
        }>
      >
    | undefined;
  const revokeCredential = async (
    operationRef: string | undefined,
    input: Readonly<Record<string, JsonValue>>,
  ): Promise<
    Readonly<{
      kind: "refused";
      code: "authentication_required";
      credentialDigest: string;
    }>
  > => {
    revokePromise ??= (async () => {
      const proof = await credentialProof();
      const revoked = await clerk.apiKeys.revoke({
        apiKeyId: proof.credentialId,
        revocationReason: "Agentic Economy release smoke completed",
      });
      const current = await clerk.apiKeys.get(proof.credentialId);
      if (
        revoked.id !== proof.credentialId ||
        !revoked.revoked ||
        current.id !== proof.credentialId ||
        !current.revoked
      ) {
        throw new GatewaySmokeError(
          "gateway_smoke_api_key_revocation_unconfirmed",
        );
      }
      if (operationRef !== undefined) {
        const idempotencyKey = `ae-release-smoke:revoked:${canonicalDigest({ credentialId: proof.credentialId, operationRef })}`;
        const response = await requestJson(
          options.fetch,
          `${options.baseUrl}${OPERATION_INVOKE_HTTP_PATH}`,
          {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              authorization: `Bearer ${options.apiKey}`,
            },
            body: JSON.stringify({ operationRef, input, idempotencyKey }),
          },
          options.apiKey,
        );
        const problem = record(response.body);
        if (
          response.status !== 401 ||
          problem?.code !== "authentication_required"
        ) {
          throw new GatewaySmokeError("gateway_smoke_revoked_key_not_refused");
        }
      }
      return {
        kind: "refused",
        code: "authentication_required",
        credentialDigest: canonicalDigest({
          credentialId: proof.credentialId,
        }),
      };
    })();
    return await revokePromise;
  };

  const money: HostedMoneyRuntime = {
    mode: "live",
    principalId,
    accountRef,
    businessId: controlBusinessId,
    readWithdrawnOperation: options.readWithdrawnOperation,
    preflightCredential,
    revokeCredential,
    credentialId,
    topupIdempotencyKey,
    topupChargeAmount: chargeAmount,
    payoutRef,
    payoutIdempotencyKey,
    readSnapshot,
    readProviderTransfers,
    beginTopup,
    observeTopup,
    readControlActivity: readActivity,
    beginPayout: async (input) => await payoutReadback(input, true),
    readPayout: async (input) => await payoutReadback(input, false),
  };

  return money;
}
