// @vitest-environment jsdom

import { moneyServerMocks } from "./supply-funnel-harness";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AeSupplyEarningsCard } from "@/components/ae/supply/earnings-card/AeSupplyEarningsCard";
import { toast } from "@/lib/ui/toast";

vi.mock("@/lib/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const TACTILE_CLASS_FRAGMENT = "active:scale-[0.96]";

function readyExpressConnect(
  stripeAccountId: string,
  exact: { currency: string; units: string; exponent: number },
) {
  return {
    kind: "available" as const,
    businessId: "business-1",
    accountsTruncated: false,
    accounts: [
      {
        currency: "USD",
        account: {
          businessId: "business-1",
          currency: "USD",
          exponent: 2,
          stripeAccountId,
          state: "ready" as const,
          detailsSubmitted: true,
          recipientCapabilityActive: true,
          version: 5,
        },
        payout: {
          businessId: "business-1",
          accountState: "ready" as const,
          providerNet: exact,
          minimumPayout: { ...exact, units: "1000" },
          evidence: "source" as const,
        },
      },
    ],
  };
}

function readyEarningsReadback(
  exact: { currency: string; units: string; exponent: number },
) {
  return {
    kind: "available" as const,
    businessId: "business-1",
    accountsTruncated: false,
    accounts: [
      {
        currency: "USD",
        earnings: {
          kind: "ok" as const,
          businessId: "business-1",
          grossAccrual: exact,
          rake: { ...exact, units: "50" },
          providerNet: exact,
          paidOut: { ...exact, units: "0" },
          held: exact,
          recoveryDue: { ...exact, units: "0" },
          truncated: false,
          evidence: "source" as const,
        },
        payout: {
          kind: "ok" as const,
          businessId: "business-1",
          accountState: "ready" as const,
          payoutState: "held_threshold" as const,
          payoutRef: "payout-1",
          providerNet: exact,
          minimumPayout: { ...exact, units: "1000" },
          evidence: "source" as const,
        },
      },
    ],
  };
}

describe("current supply funnel", () => {
  it("explains a ready account's held payout threshold without mutation controls", () => {
    const exact = { currency: "USD", units: "500", exponent: 2 };
    render(
      <AeSupplyEarningsCard
        readback={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [
            {
              currency: "USD",
              earnings: {
                kind: "ok",
                businessId: "business-1",
                grossAccrual: exact,
                rake: { ...exact, units: "50" },
                providerNet: exact,
                paidOut: { ...exact, units: "0" },
                held: exact,
                recoveryDue: { ...exact, units: "0" },
                truncated: false,
                evidence: "source",
              },
              payout: {
                kind: "ok",
                businessId: "business-1",
                accountState: "ready",
                payoutState: "held_threshold",
                payoutRef: "payout-1",
                providerNet: exact,
                minimumPayout: { ...exact, units: "1000" },
                evidence: "source",
              },
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByText("Waiting for minimum payout"),
    ).toBeDefined();
    expect(
      screen.getByText("USD 5.00 of USD 10.00"),
    ).toBeDefined();
    expect(
      screen.getByText(
        "Your payout account is ready. You can approve a payout after provider earnings reach the minimum shown above.",
      ),
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Set up payouts" }),
    ).toBeNull();
    for (const name of [
      "Review payout",
      "Start payout",
      "Confirm payout",
      "Recover transfer",
      "Reconcile transfer",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByText("Durable transfer evidence")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Refresh recorded status" }),
    ).toBeNull();
    expect(
      moneyServerMocks.readOwnerPayoutTransferServer,
    ).not.toHaveBeenCalled();
    expect(moneyServerMocks.beginOwnerPayoutTransferServer).not.toHaveBeenCalled();
    expect(moneyServerMocks).not.toHaveProperty(
      "recoverOwnerPayoutTransferServer",
    );
  });

  it("binds an eligible payout confirmation to the exact amount, destination, and revisions", async () => {
    const onStatusRefreshed = vi.fn();
    const exact = { currency: "USD", units: "5000", exponent: 2 };
    moneyServerMocks.beginOwnerPayoutTransferServer.mockResolvedValue({
      kind: "ok",
      transfer: { state: "transfer_pending" },
    });

    render(
      <AeSupplyEarningsCard
        readback={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [
            {
              currency: "USD",
              earnings: {
                kind: "ok",
                businessId: "business-1",
                grossAccrual: exact,
                rake: { ...exact, units: "500" },
                providerNet: exact,
                paidOut: { ...exact, units: "0" },
                held: exact,
                recoveryDue: { ...exact, units: "0" },
                truncated: false,
                evidence: "source",
              },
              payout: {
                kind: "ok",
                businessId: "business-1",
                accountState: "ready",
                accountVersion: 7,
                payoutState: "held_threshold",
                payoutRef: "payout-eligible",
                payoutRevision: 11,
                idempotencyKey: "payout-key-eligible",
                providerNet: exact,
                minimumPayout: { ...exact, units: "1000" },
                evidence: "source",
              },
            },
          ],
        }}
        connect={{
          kind: "available",
          businessId: "business-1",
          accounts: [
            {
              currency: "USD",
              account: {
                businessId: "business-1",
                currency: "USD",
                exponent: 2,
                stripeAccountId: "acct_1234",
                state: "ready",
                detailsSubmitted: true,
                recipientCapabilityActive: true,
                version: 7,
              },
              payout: {
                businessId: "business-1",
                accountState: "ready",
                accountVersion: 7,
                payoutState: "held_threshold",
                payoutRef: "payout-eligible",
                payoutRevision: 11,
                idempotencyKey: "payout-key-eligible",
                providerNet: exact,
                minimumPayout: { ...exact, units: "1000" },
                evidence: "source",
              },
            },
          ],
          accountsTruncated: false,
        }}
        onStatusRefreshed={onStatusRefreshed}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review payout" }));
    expect(screen.getByRole("alertdialog", { name: "Confirm payout" })).toBeDefined();
    expect(screen.getByText(/Transfer USD 50\.00/)).toBeDefined();
    expect(screen.getByText(/Stripe account ending 1234/)).toBeDefined();
    expect(screen.getByText(/must be reconciled by status, not resubmitted/)).toBeDefined();
    expect(moneyServerMocks.beginOwnerPayoutTransferServer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm payout" }));

    await waitFor(() =>
      expect(moneyServerMocks.beginOwnerPayoutTransferServer).toHaveBeenCalledWith({
        data: {
          businessId: "business-1",
          currency: "USD",
          payoutRef: "payout-eligible",
          amount: exact,
          expectedPayoutRevision: 11,
          expectedAccountVersion: 7,
          idempotencyKey: "payout-key-eligible",
        },
      }),
    );
    expect(moneyServerMocks.beginOwnerPayoutTransferServer).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onStatusRefreshed).toHaveBeenCalledOnce());
  });

  it("keeps Connect setup available when the payout account has not started", () => {
    const exact = { currency: "USD", units: "500", exponent: 2 };
    render(
      <AeSupplyEarningsCard
        readback={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [
            {
              currency: "USD",
              earnings: {
                kind: "ok",
                businessId: "business-1",
                grossAccrual: exact,
                rake: { ...exact, units: "50" },
                providerNet: exact,
                paidOut: { ...exact, units: "0" },
                held: exact,
                recoveryDue: { ...exact, units: "0" },
                truncated: false,
                evidence: "source",
              },
              payout: {
                kind: "ok",
                businessId: "business-1",
                accountState: "not_started",
                payoutState: "held_threshold",
                payoutRef: "payout-1",
                providerNet: exact,
                minimumPayout: { ...exact, units: "1000" },
                evidence: "source",
              },
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Set up payouts" }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Set up payouts" }));
    expect(screen.getByRole("alertdialog", { name: "Confirm payout authority" })).toBeDefined();
    expect(screen.getByText(/This does not transfer funds/)).toBeDefined();
    expect(moneyServerMocks.createOwnerConnectAccountServer).not.toHaveBeenCalled();
    expect(screen.queryByText("Waiting for minimum payout")).toBeNull();
    expect(screen.queryByText("USD 5.00 of USD 10.00")).toBeNull();
  });

  it("renders persisted transfer evidence with read-only refresh and verified wording", async () => {
    const onStatusRefreshed = vi.fn();
    moneyServerMocks.readOwnerPayoutTransferServer.mockResolvedValue({
      kind: "ok",
      transfer: {},
    });
    const exact = { currency: "USD", units: "5000", exponent: 2 };
    const payout = Object.assign(
      {
        kind: "ok" as const,
        businessId: "business-1",
        accountState: "ready" as const,
        payoutState: "paid" as const,
        payoutRef: "payout-1",
        payoutCommandId: "command-1",
        providerNet: exact,
        minimumPayout: { ...exact, units: "1000" },
        stripeTransferId: "tr_1",
        destinationAccountId: "acct_1",
        transferStatus: "succeeded" as const,
        requestDigest: "sha256:request",
        evidenceDigest: "sha256:evidence",
        providerHeldBefore: exact,
        providerHeldAfter: { ...exact, units: "0" },
        providerPaidBefore: { ...exact, units: "0" },
        providerPaidAfter: exact,
        recoveryState: "admin_intervention" as const,
        evidence: "source" as const,
      },
      { idempotencyKey: "payout-key-1" },
    );
    render(
      <AeSupplyEarningsCard
        readback={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [
            {
              currency: "USD",
              earnings: {
                kind: "ok",
                businessId: "business-1",
                grossAccrual: exact,
                rake: { ...exact, units: "500" },
                providerNet: exact,
                paidOut: exact,
                held: { ...exact, units: "0" },
                recoveryDue: { ...exact, units: "0" },
                truncated: false,
                evidence: "source",
              },
              payout,
            },
          ],
        }}
        onStatusRefreshed={onStatusRefreshed}
      />,
    );

    expect(screen.getByText("Durable transfer evidence")).toBeDefined();
    expect(screen.getByText("tr_1")).toBeDefined();
    expect(screen.getByText("sha256:evidence")).toBeDefined();
    expect(screen.getByText("USD 50.00 → USD 0.00")).toBeDefined();
    expect(screen.getByText("USD 0.00 → USD 50.00")).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh recorded status" }),
    );
    await waitFor(() =>
      expect(moneyServerMocks.readOwnerPayoutTransferServer).toHaveBeenCalledWith(
        {
          data: {
            businessId: "business-1",
            currency: "USD",
            payoutRef: "payout-1",
            idempotencyKey: "payout-key-1",
          },
        },
      ),
    );
    await waitFor(() => expect(onStatusRefreshed).toHaveBeenCalledOnce());
    expect(screen.getByText("Transferred to Stripe")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Refresh recorded status" }),
    ).toBeDefined();
    expect(
      screen.getByText(
        "Transfer outcome requires system reconciliation. Contact support with the durable command ID; do not retry the transfer.",
      ),
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Check transfer status" }),
    ).toBeNull();
    for (const name of [
      "Review payout",
      "Start payout",
      "Confirm payout",
      "Recover transfer",
      "Reconcile transfer",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(moneyServerMocks.beginOwnerPayoutTransferServer).not.toHaveBeenCalled();
    expect(moneyServerMocks).not.toHaveProperty(
      "recoverOwnerPayoutTransferServer",
    );
  });

  it("shows system reconciliation guidance for an unknown recorded transfer", async () => {
    const onStatusRefreshed = vi.fn();
    const exact = { currency: "USD", units: "5000", exponent: 2 };
    moneyServerMocks.readOwnerPayoutTransferServer.mockResolvedValue({
      kind: "ok",
      transfer: {},
    });
    render(
      <AeSupplyEarningsCard
        readback={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [
            {
              currency: "USD",
              earnings: {
                kind: "ok",
                businessId: "business-1",
                grossAccrual: exact,
                rake: { ...exact, units: "500" },
                providerNet: exact,
                paidOut: { ...exact, units: "0" },
                held: exact,
                recoveryDue: { ...exact, units: "0" },
                truncated: false,
                evidence: "source",
              },
              payout: {
                kind: "ok",
                businessId: "business-1",
                accountState: "ready",
                idempotencyKey: "payout-key-unknown",
                payoutState: "outcome_unknown",
                payoutRef: "payout-unknown",
                payoutCommandId: "command-unknown",
                providerNet: exact,
                minimumPayout: { ...exact, units: "1000" },
                recoveryState: "provider_id",
                evidence: "source",
              },
            },
          ],
        }}
        onStatusRefreshed={onStatusRefreshed}
      />,
    );
    expect(
      screen.getByText("AE is reconciling the recorded transfer. Do not retry it."),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Refresh recorded status" }),
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh recorded status" }),
    );
    await waitFor(() =>
      expect(moneyServerMocks.readOwnerPayoutTransferServer).toHaveBeenCalledWith(
        {
          data: {
            businessId: "business-1",
            currency: "USD",
            payoutRef: "payout-unknown",
            idempotencyKey: "payout-key-unknown",
          },
        },
      ),
    );
    await waitFor(() => expect(onStatusRefreshed).toHaveBeenCalledOnce());
    expect(moneyServerMocks.beginOwnerPayoutTransferServer).not.toHaveBeenCalled();
    expect(moneyServerMocks).not.toHaveProperty(
      "recoverOwnerPayoutTransferServer",
    );
  });

  it("refreshes a command-backed pending transfer only through the read command", async () => {
    const onStatusRefreshed = vi.fn();
    const exact = { currency: "USD", units: "5000", exponent: 2 };
    moneyServerMocks.readOwnerPayoutTransferServer.mockResolvedValue({
      kind: "ok",
      transfer: {},
    });
    render(
      <AeSupplyEarningsCard
        readback={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [
            {
              currency: "USD",
              earnings: {
                kind: "ok",
                businessId: "business-1",
                grossAccrual: exact,
                rake: { ...exact, units: "500" },
                providerNet: exact,
                paidOut: { ...exact, units: "0" },
                held: exact,
                recoveryDue: { ...exact, units: "0" },
                truncated: false,
                evidence: "source",
              },
              payout: {
                kind: "ok",
                businessId: "business-1",
                accountState: "ready",
                payoutState: "transfer_pending",
                payoutRef: "payout-pending",
                payoutCommandId: "command-pending",
                idempotencyKey: "payout-key-pending",
                providerNet: exact,
                minimumPayout: { ...exact, units: "1000" },
                stripeTransferId: "tr_pending",
                destinationAccountId: "acct_1",
                transferStatus: "pending",
                requestDigest: "sha256:request-pending",
                evidenceDigest: "sha256:evidence-pending",
                recoveryState: "provider_id",
                evidence: "source",
              },
            },
          ],
        }}
        onStatusRefreshed={onStatusRefreshed}
      />,
    );

    expect(screen.getByText("Durable transfer evidence")).toBeDefined();
    expect(screen.getByText("tr_pending")).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh recorded status" }),
    );
    await waitFor(() =>
      expect(moneyServerMocks.readOwnerPayoutTransferServer).toHaveBeenCalledWith(
        {
          data: {
            businessId: "business-1",
            currency: "USD",
            payoutRef: "payout-pending",
            idempotencyKey: "payout-key-pending",
          },
        },
      ),
    );
    expect(moneyServerMocks.readOwnerPayoutTransferServer).toHaveBeenCalledTimes(
      1,
    );
    expect(moneyServerMocks.createOwnerConnectAccountServer).not.toHaveBeenCalled();
    expect(moneyServerMocks.createOwnerOnboardingLinkServer).not.toHaveBeenCalled();
    await waitFor(() => expect(onStatusRefreshed).toHaveBeenCalledOnce());
  });

  it("binds a payout authority update to the current account generation", async () => {
    const exact = { currency: "USD", units: "500", exponent: 2 };
    moneyServerMocks.createOwnerOnboardingLinkServer.mockResolvedValue({
      kind: "refused",
      code: "payout_not_ready",
      retryable: false,
    });
    render(
      <AeSupplyEarningsCard
        readback={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [{
            currency: "USD",
            earnings: {
              kind: "ok",
              businessId: "business-1",
              grossAccrual: exact,
              rake: { ...exact, units: "50" },
              providerNet: exact,
              paidOut: { ...exact, units: "0" },
              held: exact,
              recoveryDue: { ...exact, units: "0" },
              truncated: false,
              evidence: "source",
            },
            payout: {
              kind: "ok",
              businessId: "business-1",
              accountState: "onboarding_started",
              accountVersion: 4,
              payoutState: "held_threshold",
              payoutRef: "payout-1",
              providerNet: exact,
              minimumPayout: { ...exact, units: "1000" },
              evidence: "source",
            },
          }],
        }}
        connect={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [{
            currency: "USD",
            account: {
              businessId: "business-1",
              currency: "USD",
              exponent: 2,
              stripeAccountId: "acct_9876",
              state: "onboarding_started",
              detailsSubmitted: false,
              recipientCapabilityActive: false,
              version: 4,
            },
            payout: {
              businessId: "business-1",
              accountState: "onboarding_started",
              accountVersion: 4,
              payoutState: "held_threshold",
              payoutRef: "payout-1",
              providerNet: exact,
              minimumPayout: { ...exact, units: "1000" },
              evidence: "source",
            },
          }],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue onboarding" }));
    expect(screen.getByRole("alertdialog", { name: "Confirm payout authority update" })).toBeDefined();
    expect(moneyServerMocks.createOwnerOnboardingLinkServer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and continue" }));
    await waitFor(() =>
      expect(moneyServerMocks.createOwnerOnboardingLinkServer).toHaveBeenCalledWith({
        data: {
          businessId: "business-1",
          currency: "USD",
          stripeAccountId: "acct_9876",
          expectedAccountVersion: 4,
          idempotencyKey: "onboarding:business-1:USD:4",
        },
      }),
    );
  });

  it("renders View Bank Payouts on Stripe and opens SSO link when account is ready", async () => {
    const windowOpenSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => ({}) as Window);
    moneyServerMocks.createOwnerExpressLoginLinkServer.mockResolvedValue({
      kind: "ok",
      url: "https://connect.stripe.com/express/test_session",
    });

    const exact = { currency: "USD", units: "500", exponent: 2 };
    const { container } = render(
      <AeSupplyEarningsCard
        readback={readyEarningsReadback(exact)}
        connect={readyExpressConnect("acct_ready123", exact)}
      />,
    );

    const ssoBtn = screen.getByRole("button", {
      name: /view bank payouts on stripe/i,
    });
    expect(ssoBtn).toBeDefined();
    expect(ssoBtn.className).toContain(TACTILE_CLASS_FRAGMENT);
    expect(screen.getByText("Stripe Express Account Active")).toBeDefined();
    expect(screen.getByText("acct_••••y123")).toBeDefined();
    expect(
      screen.getByText(
        "Manage bank account details, view payout transfer receipts, and download annual tax statements.",
      ),
    ).toBeDefined();
    expect(
      screen.getByText(
        "Direct AUD bank credits are managed directly in Stripe Express. Agentic Economy never stores bank account credentials.",
      ),
    ).toBeDefined();
    expect(
      container.querySelector('[aria-live="polite"].min-h-\\[5\\.5rem\\]'),
    ).not.toBeNull();

    fireEvent.click(ssoBtn);
    await waitFor(() => {
      expect(moneyServerMocks.createOwnerExpressLoginLinkServer).toHaveBeenCalledWith({
        data: {
          businessId: "business-1",
          currency: "USD",
        },
      });
      expect(windowOpenSpy).toHaveBeenCalledWith(
        "https://connect.stripe.com/express/test_session",
        "_blank",
        "noopener,noreferrer",
      );
    });
    windowOpenSpy.mockRestore();
  });

  it("shows Verification Pending for onboarding_started without SSO button", () => {
    const exact = { currency: "USD", units: "500", exponent: 2 };
    render(
      <AeSupplyEarningsCard
        readback={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [{
            currency: "USD",
            earnings: {
              kind: "ok",
              businessId: "business-1",
              grossAccrual: exact,
              rake: { ...exact, units: "50" },
              providerNet: exact,
              paidOut: { ...exact, units: "0" },
              held: exact,
              recoveryDue: { ...exact, units: "0" },
              truncated: false,
              evidence: "source",
            },
            payout: {
              kind: "ok",
              businessId: "business-1",
              accountState: "onboarding_started",
              accountVersion: 4,
              payoutState: "held_threshold",
              payoutRef: "payout-1",
              providerNet: exact,
              minimumPayout: { ...exact, units: "1000" },
              evidence: "source",
            },
          }],
        }}
        connect={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [{
            currency: "USD",
            account: {
              businessId: "business-1",
              currency: "USD",
              exponent: 2,
              stripeAccountId: "acct_9876",
              state: "onboarding_started",
              detailsSubmitted: false,
              recipientCapabilityActive: false,
              version: 4,
            },
            payout: {
              businessId: "business-1",
              accountState: "onboarding_started",
              accountVersion: 4,
              payoutState: "held_threshold",
              payoutRef: "payout-1",
              providerNet: exact,
              minimumPayout: { ...exact, units: "1000" },
              evidence: "source",
            },
          }],
        }}
      />,
    );

    expect(screen.getByText("Verification Pending")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /view bank payouts on stripe/i }),
    ).toBeNull();
    const continueBtn = screen.getByRole("button", { name: "Continue onboarding" });
    expect(continueBtn.className).toContain(TACTILE_CLASS_FRAGMENT);
  });

  it("shows Action Required for restricted without SSO button", () => {
    const exact = { currency: "USD", units: "500", exponent: 2 };
    render(
      <AeSupplyEarningsCard
        readback={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [{
            currency: "USD",
            earnings: {
              kind: "ok",
              businessId: "business-1",
              grossAccrual: exact,
              rake: { ...exact, units: "50" },
              providerNet: exact,
              paidOut: { ...exact, units: "0" },
              held: exact,
              recoveryDue: { ...exact, units: "0" },
              truncated: false,
              evidence: "source",
            },
            payout: {
              kind: "ok",
              businessId: "business-1",
              accountState: "restricted",
              accountVersion: 3,
              payoutState: "held_threshold",
              payoutRef: "payout-1",
              providerNet: exact,
              minimumPayout: { ...exact, units: "1000" },
              evidence: "source",
            },
          }],
        }}
        connect={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [{
            currency: "USD",
            account: {
              businessId: "business-1",
              currency: "USD",
              exponent: 2,
              stripeAccountId: "acct_restricted",
              state: "restricted",
              detailsSubmitted: true,
              recipientCapabilityActive: false,
              version: 3,
            },
            payout: {
              businessId: "business-1",
              accountState: "restricted",
              accountVersion: 3,
              payoutState: "held_threshold",
              payoutRef: "payout-1",
              providerNet: exact,
              minimumPayout: { ...exact, units: "1000" },
              evidence: "source",
            },
          }],
        }}
      />,
    );

    expect(screen.getByText("Action Required")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /view bank payouts on stripe/i }),
    ).toBeNull();
  });

  it("shows Rule 4 diagnostic and toast when SSO link generation fails", async () => {
    vi.mocked(toast.error).mockClear();
    moneyServerMocks.createOwnerExpressLoginLinkServer.mockResolvedValue({
      kind: "refused",
      code: "payout_not_ready",
      retryable: false,
    });

    const exact = { currency: "USD", units: "500", exponent: 2 };
    render(
      <AeSupplyEarningsCard
        readback={readyEarningsReadback(exact)}
        connect={readyExpressConnect("acct_ready123", exact)}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /view bank payouts on stripe/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Could not open Stripe Express dashboard.")).toBeDefined();
      expect(
        screen.getByText(
          "A$0.00 affected — your earnings and payout configuration remain safe.",
        ),
      ).toBeDefined();
      expect(
        screen.getByText("Finish payout verification, then try again."),
      ).toBeDefined();
      expect(toast.error).toHaveBeenCalledWith(
        "Could not open Stripe Express dashboard.",
        { description: "Finish payout verification, then try again." },
      );
    });
  });

  it("shows pop-up blocked guidance when window.open returns null", async () => {
    vi.spyOn(window, "open").mockImplementation(() => null);
    moneyServerMocks.createOwnerExpressLoginLinkServer.mockResolvedValue({
      kind: "ok",
      url: "https://connect.stripe.com/express/test_session",
    });

    const exact = { currency: "USD", units: "500", exponent: 2 };
    render(
      <AeSupplyEarningsCard
        readback={readyEarningsReadback(exact)}
        connect={readyExpressConnect("acct_ready123", exact)}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /view bank payouts on stripe/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Allow pop-ups for this site, then try again."),
      ).toBeDefined();
    });
  });

  it("applies tactile press classes to payout action buttons", () => {
    const exact = { currency: "USD", units: "500", exponent: 2 };
    render(
      <AeSupplyEarningsCard
        readback={{
          kind: "available",
          businessId: "business-1",
          accountsTruncated: false,
          accounts: [
            {
              currency: "USD",
              earnings: {
                kind: "ok",
                businessId: "business-1",
                grossAccrual: exact,
                rake: { ...exact, units: "50" },
                providerNet: exact,
                paidOut: { ...exact, units: "0" },
                held: exact,
                recoveryDue: { ...exact, units: "0" },
                truncated: false,
                evidence: "source",
              },
              payout: {
                kind: "ok",
                businessId: "business-1",
                accountState: "not_started",
                payoutState: "held_threshold",
                payoutRef: "payout-1",
                providerNet: exact,
                minimumPayout: { ...exact, units: "1000" },
                evidence: "source",
              },
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Set up payouts" }).className,
    ).toContain(TACTILE_CLASS_FRAGMENT);
  });
});
