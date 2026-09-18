import { useEffect, useRef, useState } from "react";
import { useReverification } from "@clerk/tanstack-react-start";
import { isReverificationCancelledError } from "@clerk/tanstack-react-start/errors";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { degrade } from "@/lib/observability/degrade";
import { toast } from "@/lib/ui/toast";
import { AeEmptyState } from "@/components/ae/feedback/AeEmptyState";
import { AeFactList } from "@/components/ae/data/AeFactList";
import { AeConfirmDialog } from "@/components/ae/feedback/AeConfirmDialog";
import type { OwnerProviderEarningsReadback } from "@/modules/capability-supply/supply-funnel.functions";
import {
  createOwnerConnectAccountServer,
  createOwnerExpressLoginLinkServer,
  createOwnerOnboardingLinkServer,
  beginOwnerPayoutTransferServer,
  readOwnerPayoutTransferServer,
  type OwnerConnectReadinessReadback,
} from "@/modules/money/money.functions";
import { compareExactAmounts, formatCurrencyAmount } from "@/modules/money/public";

const TACTILE =
  "enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100";
const FINANCIAL_SAFE =
  "A$0.00 affected — your earnings and payout configuration remain safe.";
const WHAT_HAPPENED = "Could not open Stripe Express dashboard.";

type Rule4Diagnostic = Readonly<{
  whatHappened: string;
  financialImpact: string;
  nextStep: string;
}>;

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
                ? "An authenticated owner session is required to read provider earnings."
                : "We could not read source earnings and payout data. Try again later."
            }
          />
        ) : readback.kind === "not_found" ? (
          <AeEmptyState
            title="No earnings have been recorded."
            description="This provider does not have an earnings account yet. Setup or test calls do not create earnings."
          />
        ) : readback.accounts.length === 0 ? (
          <AeEmptyState
            title="No earnings have been recorded."
            description="No provider earnings account exists yet. Setup or test calls do not create earnings."
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
                Only the first 10 provider earnings currencies are shown.
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Setup or test calls do not create earnings. Earnings appear only
              when source money records provider accruals.
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
  const [diagnosticError, setDiagnosticError] = useState<Rule4Diagnostic>();
  const [confirmAction, setConfirmAction] = useState<"connect" | "onboarding" | "transfer">();
  const payoutActionRef = useRef<HTMLButtonElement>(null);
  const expressActionRef = useRef<HTMLButtonElement>(null);
  const createConnect = useReverification(useServerFn(createOwnerConnectAccountServer));
  const createOnboarding = useReverification(useServerFn(createOwnerOnboardingLinkServer));
  const createExpressLoginLink = useServerFn(createOwnerExpressLoginLinkServer);
  const beginPayout = useReverification(useServerFn(beginOwnerPayoutTransferServer));
  const canonical =
    connect?.kind === "available"
      ? connect.accounts.find((item) => item.currency === account.currency)
      : undefined;
  const payoutAccount = canonical?.account;
  const payoutAccountVersion =
    payoutAccount?.version ?? account.payout.accountVersion;
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
  const isWaitingForMinimumPayout =
    accountState === "ready" && payoutState === "held_threshold";
  const canApprovePayout =
    isWaitingForMinimumPayout &&
    compareExactAmounts(account.payout.providerNet, account.payout.minimumPayout) !== -1 &&
    account.payout.payoutRef !== undefined &&
    account.payout.payoutRevision !== undefined &&
    account.payout.accountVersion !== undefined &&
    account.payout.idempotencyKey !== undefined &&
    stripeAccountId !== undefined;
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

  useEffect(() => {
    function refocusExpressAction() {
      if (document.visibilityState === "visible") {
        expressActionRef.current?.focus();
      }
    }
    window.addEventListener("focus", refocusExpressAction);
    document.addEventListener("visibilitychange", refocusExpressAction);
    return () => {
      window.removeEventListener("focus", refocusExpressAction);
      document.removeEventListener("visibilitychange", refocusExpressAction);
    };
  }, []);

  function reportSsoFailure(nextStep: string) {
    setDiagnosticError({
      whatHappened: WHAT_HAPPENED,
      financialImpact: FINANCIAL_SAFE,
      nextStep,
    });
    toast.error(WHAT_HAPPENED, { description: nextStep });
  }

  async function createAccount() {
    setBusy("connect");
    setMessage(undefined);
    setDiagnosticError(undefined);
    try {
      const result = await createConnect({
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
      setMessage(result.onboardingUrl === undefined
        ? "Connect account created. Reload current status before continuing hosted onboarding."
        : "Connect account created. Continue in Stripe; returning does not mark readiness.");
      if (result.onboardingUrl !== undefined) window.location.assign(result.onboardingUrl);
      else await onStatusRefreshed?.();
    } catch (cause) {
      setMessage(degrade(cause, "Payout setup was interrupted. Reload before trying again.", { site: "createAccount", reason: "source_unavailable" }));
    } finally {
      setBusy(undefined);
    }
  }

  async function openOnboarding(accountId = stripeAccountId) {
    if (accountId === undefined || payoutAccountVersion === undefined) {
      setMessage("Current payout authority is unavailable. Reload before updating it.");
      return;
    }
    setBusy("onboarding");
    setMessage(undefined);
    setDiagnosticError(undefined);
    try {
      const result = await createOnboarding({
        data: {
          businessId,
          currency: account.currency,
          stripeAccountId: accountId,
          expectedAccountVersion: payoutAccountVersion,
          idempotencyKey: `onboarding:${businessId}:${account.currency}:${payoutAccountVersion}`,
        },
      });
      if (result.kind !== "ok") {
        setMessage(actionMessage(result.code));
        return;
      }
      window.location.assign(result.url);
    } catch (cause) {
      setMessage(degrade(
        cause,
        "Hosted onboarding is temporarily unavailable. Your Connect account remains bound.",
        { site: "openOnboarding", reason: "source_unavailable" },
      ));
    } finally {
      setBusy(undefined);
    }
  }

  async function confirmPayoutAuthority() {
    const action = confirmAction;
    if (action === undefined || busy !== undefined) return;
    if (action === "connect") await createAccount();
    else if (action === "onboarding") await openOnboarding();
    else await startPayout();
    setConfirmAction(undefined);
  }

  async function startPayout() {
    if (
      !canApprovePayout ||
      payoutRef === undefined ||
      account.payout.payoutRevision === undefined ||
      account.payout.accountVersion === undefined ||
      idempotencyKey === undefined
    ) return;
    setBusy("transfer");
    setMessage(undefined);
    setDiagnosticError(undefined);
    try {
      const result = await beginPayout({
        data: {
          businessId,
          currency: account.currency,
          payoutRef,
          amount: account.payout.providerNet,
          expectedPayoutRevision: account.payout.payoutRevision,
          expectedAccountVersion: account.payout.accountVersion,
          idempotencyKey,
        },
      });
      if (result.kind !== "ok") {
        setMessage(actionMessage(result.code));
        return;
      }
      setMessage(result.transfer.state === "outcome_unknown"
        ? "Transfer outcome is not yet known. Check recorded status; do not submit another payout."
        : "Payout recorded. Refreshing the authoritative transfer status.");
      await onStatusRefreshed?.();
      if (onStatusRefreshed === undefined) window.location.reload();
    } catch (error) {
      if (isReverificationCancelledError(error)) return;
      setMessage("Payout approval was interrupted. Reload current status before taking another action.");
    } finally {
      setBusy(undefined);
    }
  }

  async function openExpressDashboard() {
    setBusy("express_dashboard");
    setMessage(undefined);
    setDiagnosticError(undefined);
    try {
      const result = await createExpressLoginLink({
        data: {
          businessId,
          currency: account.currency,
        },
      });
      if (result.kind === "ok") {
        const popup = window.open(result.url, "_blank", "noopener,noreferrer");
        if (popup === null) {
          reportSsoFailure("Allow pop-ups for this site, then try again.");
          return;
        }
        expressActionRef.current?.focus();
        return;
      }
      reportSsoFailure(ssoFailureNextStep(result.code));
    } catch (cause) {
      degrade(cause, WHAT_HAPPENED, {
        site: "openExpressDashboard",
        reason: "source_unavailable",
      });
      reportSsoFailure(
        "Please refresh your session or try again in a few moments.",
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
    setDiagnosticError(undefined);
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
    } catch (cause) {
      setMessage(degrade(
        cause,
        "Recorded transfer status is temporarily unavailable. Reload and try again.",
        { site: "refreshRecordedStatus", reason: "source_unavailable" },
      ));
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
          Source-recorded provider earnings and payout state.
        </p>
      </div>
      <AeFactList
        facts={[
          { label: "Gross accrued", value: formatCurrencyAmount(account.earnings.grossAccrual) },
          { label: "AE fee / rake", value: formatCurrencyAmount(account.earnings.rake) },
          { label: "Provider net", value: formatCurrencyAmount(account.earnings.providerNet) },
          { label: "Paid out", value: formatCurrencyAmount(account.earnings.paidOut) },
          { label: "Held", value: formatCurrencyAmount(account.earnings.held) },
          { label: "Payout account", value: payoutAccountLabel(accountState) },
          {
            label: "Payout state",
            value: verifiedPaidEvidence
              ? "Transferred to Stripe"
              : isWaitingForMinimumPayout
                ? "Waiting for minimum payout"
                : payoutStateLabel(payoutState),
          },
          ...(isWaitingForMinimumPayout
            ? [
                {
                  label: "Threshold progress",
                  value: `${formatCurrencyAmount(account.payout.providerNet)} of ${formatCurrencyAmount(account.payout.minimumPayout)}`,
                },
              ]
            : []),
        ]}
      />
      {!hasPersistedPayout ? null : (
        <details className="grid gap-2">
          <summary className="flex min-h-touch cursor-pointer items-center text-sm font-medium text-foreground">
            Durable transfer evidence
          </summary>
          <AeFactList
            facts={[
              ...(payoutCommandId === undefined ? [] : [{ label: "Command", value: payoutCommandId, mono: true }]),
              ...(stripeTransferId === undefined ? [] : [{ label: "Stripe transfer", value: stripeTransferId, mono: true }]),
              ...(destinationAccountId === undefined ? [] : [{ label: "Destination", value: destinationAccountId, mono: true }]),
              ...(requestDigest === undefined ? [] : [{ label: "Request digest", value: requestDigest, mono: true }]),
              ...(evidenceDigest === undefined ? [] : [{ label: "Provider evidence digest", value: evidenceDigest, mono: true }]),
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
              className="min-h-touch w-fit"
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
          {isWaitingForMinimumPayout
            ? "Your payout account is ready. You can approve a payout after provider earnings reach the minimum shown above."
            : "Payouts become available when your payout account and provider configuration are ready."}
        </p>
        <div
          className="grid min-h-[7.5rem] gap-2 rounded-lg border bg-muted/20 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            {expressStatusBadge(accountState)}
            {stripeAccountId !== undefined ? (
              <span
                className="font-mono text-xs tabular-nums text-muted-foreground"
                aria-label={`Stripe Express account ending ${stripeAccountId.slice(-4)}`}
              >
                acct_••••{stripeAccountId.slice(-4)}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Stripe account not bound yet.
              </span>
            )}
          </div>
          <p className="m-0 text-sm text-muted-foreground">
            {expressStatusExplanation(accountState)}
          </p>
          <p className="m-0 text-xs text-muted-foreground">
            Direct AUD bank credits are managed directly in Stripe Express.
            Agentic Economy never stores bank account credentials.
          </p>
        </div>
        <div className="flex min-h-touch flex-wrap gap-2">
          {canApprovePayout ? (
            <Button
              ref={payoutActionRef}
              type="button"
              className={`min-h-touch ${TACTILE}`}
              disabled={busy !== undefined}
              onClick={() => setConfirmAction("transfer")}
            >
              {busy === "transfer" ? "Submitting payout…" : "Review payout"}
            </Button>
          ) : null}
          {accountState === "ready" && stripeAccountId !== undefined ? (
            <Button
              ref={expressActionRef}
              type="button"
              variant={canApprovePayout ? "outline" : "secondary"}
              className={`min-h-touch gap-2 ${TACTILE}`}
              disabled={busy !== undefined}
              onClick={() => void openExpressDashboard()}
            >
              {busy === "express_dashboard" ? (
                "Opening Stripe…"
              ) : (
                <>
                  View Bank Payouts on Stripe
                  <ExternalLinkIcon className="size-4" aria-hidden />
                </>
              )}
            </Button>
          ) : accountState === "ready" ? null : stripeAccountId === undefined ? (
            <Button
              ref={payoutActionRef}
              type="button"
              variant="secondary"
              className={`min-h-touch ${TACTILE}`}
              disabled={busy !== undefined}
              onClick={() => setConfirmAction("connect")}
            >
              {busy === "connect"
                ? "Creating Connect account…"
                : "Set up payouts"}
            </Button>
          ) : payoutAccountVersion === undefined ? null : (
            <Button
              ref={payoutActionRef}
              type="button"
              variant="secondary"
              className={`min-h-touch ${TACTILE}`}
              disabled={busy !== undefined}
              onClick={() => setConfirmAction("onboarding")}
            >
              {busy === "onboarding"
                ? "Opening hosted onboarding…"
                : accountState === "onboarding_started"
                  ? "Continue onboarding"
                  : "Update Connect details"}
            </Button>
          )}
        </div>
        <AeConfirmDialog
          open={confirmAction !== undefined}
          onOpenChange={(open) => {
            if (!open && busy === undefined) setConfirmAction(undefined);
          }}
          title={confirmAction === "transfer" ? "Confirm payout" : confirmAction === "onboarding" ? "Confirm payout authority update" : "Confirm payout authority"}
          description={confirmAction === "transfer"
            ? `Transfer ${formatCurrencyAmount(account.payout.providerNet)} from provider ${businessId} to Stripe account ending ${stripeAccountId?.slice(-4) ?? "unknown"}. AE reserves the amount now and dispatches through Stripe. It may not be reversible after dispatch; an uncertain outcome must be reconciled by status, not resubmitted.`
            : confirmAction === "onboarding"
            ? `Reopen Stripe-hosted onboarding for ${account.currency} payouts from provider ${businessId}. This may change where future payouts go. Current readiness remains authoritative after you return.`
            : `Create Stripe-hosted ${account.currency} payout authority for provider ${businessId} under your signed-in owner Account. This does not transfer funds. Current readiness is read back after you return.`}
          confirmLabel={confirmAction === "transfer" ? "Confirm payout" : confirmAction === "onboarding" ? "Confirm and continue" : "Confirm and set up"}
          pending={busy !== undefined}
          onConfirm={confirmPayoutAuthority}
          returnFocusRef={payoutActionRef}
        />
        <div aria-live="polite" className="min-h-[5.5rem]">
          {diagnosticError !== undefined ? (
            <Alert variant="destructive">
              <AlertTitle className="text-sm font-medium">
                {diagnosticError.whatHappened}
              </AlertTitle>
              <AlertDescription className="grid gap-1 text-xs">
                <span>{diagnosticError.financialImpact}</span>
                <span>{diagnosticError.nextStep}</span>
              </AlertDescription>
            </Alert>
          ) : message === undefined ? null : (
            <p className="m-0 text-sm text-muted-foreground">{message}</p>
          )}
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

function expressStatusBadge(accountState: string) {
  if (accountState === "ready") {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2Icon className="size-3" />
        Stripe Express Account Active
      </Badge>
    );
  }
  if (accountState === "submitted" || accountState === "onboarding_started") {
    return (
      <Badge variant="warning" className="gap-1">
        <AlertCircleIcon className="size-3" />
        Verification Pending
      </Badge>
    );
  }
  if (accountState === "restricted") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircleIcon className="size-3" />
        Action Required
      </Badge>
    );
  }
  return (
    <Badge variant="warning" className="gap-1">
      <AlertCircleIcon className="size-3" />
      Action Required
    </Badge>
  );
}

function expressStatusExplanation(accountState: string): string {
  if (accountState === "ready") {
    return "Manage bank account details, view payout transfer receipts, and download annual tax statements.";
  }
  if (accountState === "submitted" || accountState === "onboarding_started") {
    return "Stripe is still verifying this payout account. Bank details, receipts, and tax statements open in Express once verification completes.";
  }
  if (accountState === "restricted") {
    return "Stripe needs more information before Express can be opened. Continue onboarding to resolve outstanding requirements.";
  }
  return "Connect Stripe Express to manage bank details, payout receipts, and annual tax statements.";
}

function ssoFailureNextStep(code: string): string {
  if (code === "billing_identity_missing") {
    return "Sign in again as the owner, then try again.";
  }
  if (code === "payout_not_ready") {
    return "Finish payout verification, then try again.";
  }
  if (code === "stripe_setup_required") {
    return "Stripe Express is temporarily unavailable. Try again in a few moments.";
  }
  return "Please refresh your session or try again in a few moments.";
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
