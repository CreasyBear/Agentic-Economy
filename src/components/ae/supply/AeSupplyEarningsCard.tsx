import { useState } from "react";

import { Button } from "@/components/ui/button";
import { AeEmptyState } from "@/components/ae/feedback/AeEmptyState";
import { AeFactList } from "@/components/ae/data/AeFactList";
import type { OwnerProviderEarningsReadback } from "@/modules/capability-supply/supply-funnel.functions";
import {
  createOwnerConnectAccountServer,
  createOwnerOnboardingLinkServer,
  readOwnerPayoutTransferServer,
  type OwnerConnectReadinessReadback,
} from "@/modules/money/server";
import { formatCurrencyAmount } from "@/modules/money/public";

export function AeSupplyEarningsCard({
  readback,
  connect,
  onStatusRefreshed,
}: Readonly<{
  readback: OwnerProviderEarningsReadback;
  connect?: OwnerConnectReadinessReadback;
  onStatusRefreshed?: () => void | Promise<void>;
}>) {
  return (
    <div className="grid gap-4">
      {readback.kind === "error" ? (
          <AeEmptyState
            role="alert"
            title={
              readback.code === "unauthenticated"
                ? "Earnings are unavailable for this session."
                : "Earnings source is unavailable."
            }
            description={
              readback.code === "unauthenticated"
                ? "An authenticated owner session is required to read supplier earnings."
                : "We could not read source earnings and payout data. Try again later."
            }
          />
        ) : readback.kind === "not_found" ? (
          <AeEmptyState
            title="No earnings have been recorded."
            description="This supplier does not have an earnings account yet. Setup or test calls do not create earnings."
          />
        ) : readback.accounts.length === 0 ? (
          <AeEmptyState
            title="No earnings have been recorded."
            description="No supplier earnings account exists yet. Setup or test calls do not create earnings."
          />
        ) : (
          <div className="grid gap-4">
            {readback.accounts.map((account) => (
              <EarningsCurrencyCard
                key={account.currency}
                account={account}
                {...(connect === undefined ? {} : { connect })}
                {...(onStatusRefreshed === undefined ? {} : { onStatusRefreshed })}
                businessId={readback.businessId}
              />
            ))}
            {readback.accountsTruncated ? (
              <p className="text-sm text-muted-foreground">
                Only the first 10 supplier earnings currencies are shown.
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Setup or test calls do not create earnings. Earnings appear only
              when source money records supplier accruals.
            </p>
          </div>
        )}
    </div>
  );
}

type OwnerEarningsAccount = Extract<
  OwnerProviderEarningsReadback,
  { kind: "available" }
>["accounts"][number];

function EarningsCurrencyCard({
  account,
  connect,
  onStatusRefreshed,
  businessId,
}: Readonly<{
  account: OwnerEarningsAccount;
  connect?: OwnerConnectReadinessReadback;
  onStatusRefreshed?: () => void | Promise<void>;
  businessId: string;
}>) {
  const [busy, setBusy] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const canonical =
    connect?.kind === "available"
      ? connect.accounts.find((item) => item.currency === account.currency)
      : undefined;
  const payoutAccount = canonical?.account;
  const boundStripeAccountId =
    payoutAccount?.stripeAccountId ??
    optionalString(account.payout, "stripeAccountId");
  const stripeAccountId =
    boundStripeAccountId === undefined || boundStripeAccountId.length === 0
      ? undefined
      : boundStripeAccountId;
  const accountState =
    payoutAccount?.state ??
    (account.payout.accountState === "missing"
      ? "not_started"
      : account.payout.accountState);
  const payoutState = account.payout.payoutState;
  const payoutRef = account.payout.payoutRef;
  const recoveryState = account.payout.recoveryState;
  const payoutCommandId = account.payout.payoutCommandId;
  const idempotencyKey = account.payout.idempotencyKey;
  const stripeTransferId = account.payout.stripeTransferId;
  const destinationAccountId = account.payout.destinationAccountId;
  const requestDigest = account.payout.requestDigest;
  const evidenceDigest = account.payout.evidenceDigest;
  const providerHeldBefore = account.payout.providerHeldBefore;
  const providerHeldAfter = account.payout.providerHeldAfter;
  const providerPaidBefore = account.payout.providerPaidBefore;
  const providerPaidAfter = account.payout.providerPaidAfter;
  const hasPersistedPayout =
    payoutCommandId !== undefined &&
    payoutCommandId.length > 0 &&
    payoutRef !== undefined &&
    payoutRef.length > 0 &&
    idempotencyKey !== undefined &&
    idempotencyKey.length > 0;
  const canReadRecordedTransfer =
    hasPersistedPayout &&
    (payoutState === "paid" ||
      payoutState === "outcome_unknown" ||
      (payoutState === "transfer_pending" &&
        stripeTransferId !== undefined &&
        stripeTransferId.length > 0));
  const verifiedPaidEvidence =
    payoutState === "paid" &&
    account.payout.transferStatus === "succeeded" &&
    stripeTransferId !== undefined &&
    stripeTransferId.length > 0 &&
    evidenceDigest !== undefined &&
    evidenceDigest.length > 0;
  const recoveryGuidance =
    recoveryState === "admin_intervention"
      ? "Transfer outcome requires system reconciliation. Contact support with the durable command ID; do not retry the transfer."
      : recoveryState === "provider_id" ||
          recoveryState === "idempotency_key" ||
          payoutState === "outcome_unknown"
        ? "AE is reconciling the recorded transfer. Do not retry it."
        : undefined;

  async function createAccount() {
    setBusy("connect");
    setMessage(undefined);
    try {
      const result = await createOwnerConnectAccountServer({
        data: {
          businessId,
          currency: account.currency,
          idempotencyKey: `connect:${businessId}:${account.currency}`,
        },
      });
      if (result.kind !== "ok") {
        setMessage(actionMessage(result.code));
        return;
      }
      setMessage(
        "Connect account created. Continue hosted onboarding; return does not mark readiness.",
      );
      await openOnboarding(result.stripeAccountId);
    } catch {
      setMessage("Payout setup was interrupted. Reload before trying again.");
    } finally {
      setBusy(undefined);
    }
  }

  async function openOnboarding(accountId = stripeAccountId) {
    if (accountId === undefined) {
      setMessage("Connect account is not bound yet. Start setup again.");
      return;
    }
    setBusy("onboarding");
    setMessage(undefined);
    try {
      const result = await createOwnerOnboardingLinkServer({
        data: {
          businessId,
          currency: account.currency,
          stripeAccountId: accountId,
          idempotencyKey: `onboarding:${businessId}:${account.currency}:${crypto.randomUUID()}`,
        },
      });
      if (result.kind !== "ok") {
        setMessage(actionMessage(result.code));
        return;
      }
      window.location.assign(result.url);
    } catch {
      setMessage(
        "Hosted onboarding is temporarily unavailable. Your Connect account remains bound.",
      );
    } finally {
      setBusy(undefined);
    }
  }
  async function refreshRecordedStatus() {
    if (
      !canReadRecordedTransfer ||
      payoutRef === undefined ||
      account.payout.idempotencyKey === undefined
    )
      return;
    setBusy("refresh");
    setMessage(undefined);
    try {
      const result = await readOwnerPayoutTransferServer({
        data: {
          businessId,
          currency: account.currency,
          payoutRef,
          idempotencyKey: account.payout.idempotencyKey,
        },
      });
      if (result.kind === "ok") {
        await onStatusRefreshed?.();
        if (onStatusRefreshed === undefined) {
          window.location.reload();
        }
        return;
      }
      setMessage(actionMessage(result.code));
    } catch {
      setMessage(
        "Recorded transfer status is temporarily unavailable. Reload and try again.",
      );
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h4 className="font-semibold text-foreground">
          {account.currency} earnings
        </h4>
        <p className="text-sm text-muted-foreground">
          Source-recorded supplier earnings and payout state.
        </p>
      </div>
      <AeFactList
        facts={[
          { label: "Gross accrued", value: formatCurrencyAmount(account.earnings.grossAccrual) },
          { label: "AE fee / rake", value: formatCurrencyAmount(account.earnings.rake) },
          { label: "Supplier net", value: formatCurrencyAmount(account.earnings.providerNet) },
          { label: "Paid out", value: formatCurrencyAmount(account.earnings.paidOut) },
          { label: "Held", value: formatCurrencyAmount(account.earnings.held) },
          { label: "Payout account", value: payoutAccountLabel(accountState) },
          {
            label: "Payout state",
            value: verifiedPaidEvidence
              ? "Transferred to Stripe"
              : payoutStateLabel(payoutState),
          },
        ]}
      />
      {!hasPersistedPayout ? null : (
        <details className="grid gap-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-foreground">
            Durable transfer evidence
          </summary>
          <AeFactList
            facts={[
              ...(payoutCommandId === undefined ? [] : [{ label: "Command", value: payoutCommandId, mono: true }]),
              ...(stripeTransferId === undefined ? [] : [{ label: "Stripe transfer", value: stripeTransferId, mono: true }]),
              ...(destinationAccountId === undefined ? [] : [{ label: "Destination", value: destinationAccountId, mono: true }]),
              ...(requestDigest === undefined ? [] : [{ label: "Request digest", value: requestDigest, mono: true }]),
              ...(evidenceDigest === undefined ? [] : [{ label: "Supplier evidence digest", value: evidenceDigest, mono: true }]),
              ...(providerHeldBefore === undefined || providerHeldAfter === undefined
                ? []
                : [{
                    label: "Held balance",
                    value: `${formatCurrencyAmount(providerHeldBefore)} → ${formatCurrencyAmount(providerHeldAfter)}`,
                  }]),
              ...(providerPaidBefore === undefined || providerPaidAfter === undefined
                ? []
                : [{
                    label: "Paid total",
                    value: `${formatCurrencyAmount(providerPaidBefore)} → ${formatCurrencyAmount(providerPaidAfter)}`,
                  }]),
            ]}
          />
          {recoveryGuidance === undefined ? null : (
            <p className="m-0 text-sm text-muted-foreground">
              {recoveryGuidance}
            </p>
          )}
          {canReadRecordedTransfer ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-fit"
              disabled={busy !== undefined}
              onClick={() => void refreshRecordedStatus()}
            >
              {busy === "refresh"
                ? "Refreshing recorded status…"
                : "Refresh recorded status"}
            </Button>
          ) : null}
        </details>
      )}
      <div className="grid gap-2">
        <p className="m-0 text-sm text-muted-foreground">
          Payouts become available when your payout account and supplier configuration are ready.
        </p>
        <div className="flex flex-wrap gap-2">
          {accountState === "ready" ? null : stripeAccountId === undefined ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={busy !== undefined}
              onClick={() => void createAccount()}
            >
              {busy === "connect"
                ? "Creating Connect account…"
                : "Set up payouts"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={busy !== undefined}
              onClick={() => void openOnboarding()}
            >
              {busy === "onboarding"
                ? "Opening hosted onboarding…"
                : accountState === "onboarding_started"
                  ? "Continue onboarding"
                  : "Update Connect details"}
            </Button>
          )}
        </div>
        <div
          role="status"
          aria-live="polite"
          className="min-h-5 text-sm text-muted-foreground"
        >
          {message}
        </div>
      </div>
      {account.earnings.truncated ? (
        <p className="text-sm text-muted-foreground">
          The source ledger read was capped at the latest 100 entries for this
          currency; totals may be incomplete.
        </p>
      ) : null}
    </section>
  );
}

function payoutAccountLabel(state: string): string {
  return state === "missing" ? "Not set up" : state.replaceAll("_", " ");
}

function payoutStateLabel(state: string | undefined): string {
  return state === undefined
    ? "No payout recorded"
    : state.replaceAll("_", " ");
}
function optionalString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record[key] === "string" ? record[key] : undefined;
}

function actionMessage(code: string): string {
  if (code === "billing_identity_missing")
    return "Sign in again as the owner to manage payouts.";
  if (code === "stripe_setup_required")
    return "Stripe payout setup is unavailable or configured for the wrong mode. Try again later.";
  return "Payout setup was refused. Try again later.";
}
