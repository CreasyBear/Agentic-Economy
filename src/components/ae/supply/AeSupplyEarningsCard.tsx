import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { AeConfirmDialog } from "@/components/ae/feedback/AeConfirmDialog";
import type { OwnerProviderEarningsReadback } from "@/modules/capability-supply/supply-funnel.functions";
import {
  beginOwnerPayoutTransferServer,
  createOwnerConnectAccountServer,
  createOwnerOnboardingLinkServer,
  readOwnerPayoutTransferServer,
  recoverOwnerPayoutTransferServer,
  type OwnerConnectReadinessReadback,
  type OwnerPayoutTransferResult,
} from "@/modules/money/server";
import {
  compareExactAmounts,
  formatCurrencyAmount,
} from "@/modules/money/public";

export function AeSupplyEarningsCard({
  readback,
  connect,
}: Readonly<{
  readback: OwnerProviderEarningsReadback;
  connect?: OwnerConnectReadinessReadback;
}>) {
  return (
    <Card>
      <CardHeader className="p-5 pb-0">
        <CardTitle>
          <h3 className="text-lg font-semibold text-foreground">
            Earnings and payouts
          </h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        {readback.kind === "error" ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>
                {readback.code === "unauthenticated"
                  ? "Earnings are unavailable for this session."
                  : "Earnings source is unavailable."}
              </EmptyTitle>
              <EmptyDescription>
                {readback.code === "unauthenticated"
                  ? "An authenticated owner session is required to read provider earnings."
                  : "We could not read source earnings and payout data. Try again later."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : readback.kind === "not_found" ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>No earnings have been recorded.</EmptyTitle>
              <EmptyDescription>
                This owner does not have a business with a provider-earnings
                account yet. Setup or test calls do not create earnings.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : readback.accounts.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>No earnings have been recorded.</EmptyTitle>
              <EmptyDescription>
                No provider-earnings money account exists for this business yet.
                Setup or test calls do not create earnings.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-4">
            {readback.accounts.map((account) => (
              <EarningsCurrencyCard
                key={account.currency}
                account={account}
                {...(connect === undefined ? {} : { connect })}
                businessId={readback.businessId}
              />
            ))}
            {readback.accountsTruncated ? (
              <p className="text-sm text-muted-foreground">
                Only the first 10 provider-earnings currencies are shown.
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Setup or test calls do not create earnings. Earnings appear only
              when source money records provider accruals.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type OwnerEarningsAccount = Extract<
  OwnerProviderEarningsReadback,
  { kind: "available" }
>["accounts"][number];
type OwnerPayoutTransferView = Extract<
  OwnerPayoutTransferResult,
  { kind: "ok" }
>["transfer"];

function EarningsCurrencyCard({
  account,
  connect,
  businessId,
}: Readonly<{
  account: OwnerEarningsAccount;
  connect?: OwnerConnectReadinessReadback;
  businessId: string;
}>) {
  const [busy, setBusy] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [transfer, setTransfer] = useState<
    OwnerPayoutTransferView | undefined
  >();
  const [payoutConfirmOpen, setPayoutConfirmOpen] = useState(false);
  const payoutInFlight = useRef(false);
  const payoutTriggerRef = useRef<HTMLButtonElement>(null);
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
  const payoutState = transfer?.state ?? account.payout.payoutState;
  const payoutRef = transfer?.payoutRef ?? account.payout.payoutRef;
  const idempotencyKey =
    transfer?.idempotencyKey ??
    optionalString(account.payout, "idempotencyKey");
  const recoveryState =
    transfer?.recoveryState ?? optionalString(account.payout, "recoveryState");
  const payoutThresholdComparison = compareExactAmounts(
    account.payout.providerNet,
    account.payout.minimumPayout,
  );
  const hasMinimumPayout =
    payoutThresholdComparison === 0 || payoutThresholdComparison === 1;
  const payoutCommandId =
    transfer?.payoutCommandId ?? account.payout.payoutCommandId;
  const stripeTransferId =
    transfer?.stripeTransferId ?? account.payout.stripeTransferId;
  const destinationAccountId =
    transfer?.destinationAccountId ?? account.payout.destinationAccountId;
  const requestDigest = transfer?.requestDigest ?? account.payout.requestDigest;
  const evidenceDigest =
    transfer?.evidenceDigest ?? account.payout.evidenceDigest;
  const providerHeldBefore =
    transfer?.providerHeldBefore ?? account.payout.providerHeldBefore;
  const providerHeldAfter =
    transfer?.providerHeldAfter ?? account.payout.providerHeldAfter;
  const providerPaidBefore =
    transfer?.providerPaidBefore ?? account.payout.providerPaidBefore;
  const providerPaidAfter =
    transfer?.providerPaidAfter ?? account.payout.providerPaidAfter;
  const payoutDestination = destinationAccountId ?? stripeAccountId;

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

  async function startPayout() {
    if (
      payoutRef === undefined ||
      payoutDestination === undefined ||
      payoutInFlight.current
    ) {
      return;
    }
    payoutInFlight.current = true;
    setBusy("payout");
    setMessage(undefined);
    try {
      const result = await beginOwnerPayoutTransferServer({
        data: {
          businessId,
          currency: account.currency,
          payoutRef,
          amount: account.payout.providerNet,
          idempotencyKey: `owner-payout:${crypto.randomUUID()}`,
        },
      });
      setTransferResult(result);
    } catch {
      setMessage(
        "Payout start was interrupted. Reload to recover the durable transfer state before retrying.",
      );
    } finally {
      payoutInFlight.current = false;
      setBusy(undefined);
      setPayoutConfirmOpen(false);
    }
  }

  async function readPayout() {
    if (payoutRef === undefined || idempotencyKey === undefined) {
      setMessage("No durable payout identity is available yet.");
      return;
    }
    setBusy("status");
    setMessage(undefined);
    try {
      const result = await readOwnerPayoutTransferServer({
        data: {
          businessId,
          currency: account.currency,
          payoutRef,
          idempotencyKey,
        },
      });
      setTransferResult(result);
    } catch {
      setMessage(
        "Transfer status is temporarily unavailable. No payout state was changed.",
      );
    } finally {
      setBusy(undefined);
    }
  }

  async function recoverPayout() {
    if (payoutRef === undefined || idempotencyKey === undefined) {
      setMessage("No durable payout identity is available yet.");
      return;
    }
    setBusy("recover");
    setMessage(undefined);
    try {
      const result = await recoverOwnerPayoutTransferServer({
        data: {
          businessId,
          currency: account.currency,
          payoutRef,
          amount: account.payout.providerNet,
          idempotencyKey,
        },
      });
      setTransferResult(result);
    } catch {
      setMessage(
        "Transfer recovery was interrupted. Reload before taking another payout action.",
      );
    } finally {
      setBusy(undefined);
    }
  }

  function setTransferResult(result: OwnerPayoutTransferResult) {
    if (result.kind !== "ok") {
      setMessage(actionMessage(result.code));
      return;
    }
    setTransfer(result.transfer);
    setMessage(transferMessage(result.transfer));
  }

  return (
    <section className="grid gap-4 rounded-md border border-border p-4">
      <div className="grid gap-1">
        <h4 className="font-semibold text-foreground">
          {account.currency} earnings
        </h4>
        <p className="text-sm text-muted-foreground">
          Source-recorded provider earnings and payout state.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-1">
          <dt className="text-sm font-medium text-muted-foreground">
            Gross accrued
          </dt>
          <dd className="m-0 text-foreground">
            {formatCurrencyAmount(account.earnings.grossAccrual)}
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-sm font-medium text-muted-foreground">
            AE fee / rake
          </dt>
          <dd className="m-0 text-foreground">
            {formatCurrencyAmount(account.earnings.rake)}
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-sm font-medium text-muted-foreground">
            Provider net
          </dt>
          <dd className="m-0 text-foreground">
            {formatCurrencyAmount(account.earnings.providerNet)}
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-sm font-medium text-muted-foreground">
            Paid out
          </dt>
          <dd className="m-0 text-foreground">
            {formatCurrencyAmount(account.earnings.paidOut)}
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-sm font-medium text-muted-foreground">Held</dt>
          <dd className="m-0 text-foreground">
            {formatCurrencyAmount(account.earnings.held)}
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-sm font-medium text-muted-foreground">
            Minimum payout
          </dt>
          <dd className="m-0 text-foreground">
            {formatCurrencyAmount(account.payout.minimumPayout)}
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-sm font-medium text-muted-foreground">
            Payout account
          </dt>
          <dd className="m-0 text-foreground">
            {payoutAccountLabel(accountState)}
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-sm font-medium text-muted-foreground">
            Payout state
          </dt>
          <dd className="m-0 text-foreground">
            {payoutStateLabel(transfer?.state ?? payoutState)}
          </dd>
        </div>
      </dl>
      {payoutCommandId === undefined ? null : (
        <div className="grid gap-2 rounded-md border border-border p-3">
          <p className="m-0 text-sm font-medium text-foreground">
            Durable transfer evidence
          </p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <dt className="text-xs font-medium text-muted-foreground">
                Command
              </dt>
              <dd className="m-0 break-all font-mono text-xs text-foreground">
                {payoutCommandId}
              </dd>
            </div>
            {stripeTransferId === undefined ? null : (
              <div className="grid gap-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  Stripe transfer
                </dt>
                <dd className="m-0 break-all font-mono text-xs text-foreground">
                  {stripeTransferId}
                </dd>
              </div>
            )}
            {destinationAccountId === undefined ? null : (
              <div className="grid gap-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  Destination
                </dt>
                <dd className="m-0 break-all font-mono text-xs text-foreground">
                  {destinationAccountId}
                </dd>
              </div>
            )}
            {requestDigest === undefined ? null : (
              <div className="grid gap-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  Request digest
                </dt>
                <dd className="m-0 break-all font-mono text-xs text-foreground">
                  {requestDigest}
                </dd>
              </div>
            )}
            {evidenceDigest === undefined ? null : (
              <div className="grid gap-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  Provider evidence digest
                </dt>
                <dd className="m-0 break-all font-mono text-xs text-foreground">
                  {evidenceDigest}
                </dd>
              </div>
            )}
            {providerHeldBefore === undefined ||
            providerHeldAfter === undefined ? null : (
              <div className="grid gap-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  Held balance
                </dt>
                <dd className="m-0 text-sm text-foreground">
                  {formatCurrencyAmount(providerHeldBefore)} →{" "}
                  {formatCurrencyAmount(providerHeldAfter)}
                </dd>
              </div>
            )}
            {providerPaidBefore === undefined ||
            providerPaidAfter === undefined ? null : (
              <div className="grid gap-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  Paid total
                </dt>
                <dd className="m-0 text-sm text-foreground">
                  {formatCurrencyAmount(providerPaidBefore)} →{" "}
                  {formatCurrencyAmount(providerPaidAfter)}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
      <div className="grid gap-2 rounded-md bg-muted/40 p-3">
        <p className="m-0 text-sm text-muted-foreground">
          {accountState === "ready"
            ? "Ready only after a verified account event and exact current account readback."
            : "Hosted onboarding return is not proof of readiness. Complete onboarding, then check status."}
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
          {accountState === "ready" &&
          hasMinimumPayout &&
          payoutRef !== undefined &&
          payoutDestination !== undefined &&
          (payoutState === "held_threshold" || payoutState === "held_kyc") ? (
            <Button
              ref={payoutTriggerRef}
              type="button"
              className="min-h-11"
              disabled={busy !== undefined}
              onClick={() => setPayoutConfirmOpen(true)}
            >
              Start payout
            </Button>
          ) : null}
          {recoveryState === "provider_id" ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy !== undefined}
              onClick={() => void readPayout()}
            >
              {busy === "status"
                ? "Checking transfer…"
                : "Check transfer status"}
            </Button>
          ) : null}
          {recoveryState === "idempotency_key" ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy !== undefined}
              onClick={() => void recoverPayout()}
            >
              {busy === "recover" ? "Recovering transfer…" : "Recover transfer"}
            </Button>
          ) : null}
          {recoveryState === "admin_intervention" ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy !== undefined}
              onClick={() => void recoverPayout()}
            >
              {busy === "recover"
                ? "Reconciling transfer…"
                : "Reconcile transfer"}
            </Button>
          ) : null}
        </div>
        {recoveryState === "admin_intervention" ? (
          <p className="m-0 text-sm text-destructive">
            Recovery could not prove exactly one Stripe transfer. Retry
            reconciliation; AE will not create a replacement transfer.
          </p>
        ) : null}
        <div
          role="status"
          aria-live="polite"
          className="min-h-5 text-sm text-muted-foreground"
        >
          {message}
        </div>
      </div>
      {payoutRef === undefined || payoutDestination === undefined ? null : (
        <AeConfirmDialog
          open={payoutConfirmOpen}
          onOpenChange={setPayoutConfirmOpen}
          returnFocusRef={payoutTriggerRef}
          title="Confirm payout"
          description={`Transfer ${formatCurrencyAmount(account.payout.providerNet)} to ${destinationAccountId === undefined ? "Connect account" : "destination account"} ${payoutDestination}. Durable payout reference: ${payoutRef}.`}
          confirmLabel="Confirm payout"
          pending={busy === "payout"}
          onConfirm={startPayout}
        />
      )}
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
  if (code === "live_money_gate_open")
    return "Payouts are held until the required counsel and live-money approvals are complete.";
  if (code === "stripe_setup_required")
    return "Stripe payout setup is unavailable or configured for the wrong mode. Try again later.";
  if (code === "payout_not_ready")
    return "Complete Connect onboarding and wait for verified readiness before retrying.";
  if (code === "payout_below_threshold")
    return "Your held provider balance is below the payout minimum.";
  if (code === "payout_outcome_unknown")
    return "Transfer outcome is still unknown. Check status before retrying.";
  if (code === "payout_reconciliation_required")
    return "AE needs an exact transfer readback before changing payout state.";
  return "Payout action was refused. Try again later.";
}

function transferMessage(transfer: OwnerPayoutTransferView): string {
  if (transfer.state === "paid")
    return "Paid only after verified succeeded transfer evidence.";
  if (transfer.recoveryState === "provider_id")
    return "Transfer is bound to Stripe. Check status; do not start another transfer.";
  if (transfer.recoveryState === "idempotency_key")
    return "Transfer outcome is unknown. Recover only with the original idempotency key.";
  if (transfer.recoveryState === "admin_intervention")
    return "Automatic recovery expired. Funds remain held until AE support reconciles the command.";
  if (transfer.state === "held_threshold" || transfer.state === "held_kyc")
    return "Funds remain held until payout requirements are met.";
  return `Payout state: ${transfer.state.replaceAll("_", " ")}.`;
}
