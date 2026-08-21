// @vitest-environment jsdom

import { moneyServerMocks } from "./supply-funnel-harness";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AeSupplyEarningsCard } from "@/components/ae/supply/AeSupplyEarningsCard";

describe("current supply funnel", () => {
  it("shows recorded daily balance copy and Connect setup without payout mutation controls", () => {
    const exact = { currency: "USD", units: "5000", exponent: 2 };
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
      screen.getByText(
        "Payouts become available when your payout account and provider configuration are ready.",
      ),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Set up payouts" }),
    ).toBeDefined();
    expect(screen.queryByText("Minimum payout")).toBeNull();
    for (const name of [
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
    expect(moneyServerMocks).not.toHaveProperty(
      "beginOwnerPayoutTransferServer",
    );
    expect(moneyServerMocks).not.toHaveProperty(
      "recoverOwnerPayoutTransferServer",
    );
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
      "Start payout",
      "Confirm payout",
      "Recover transfer",
      "Reconcile transfer",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(moneyServerMocks).not.toHaveProperty(
      "beginOwnerPayoutTransferServer",
    );
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
    expect(moneyServerMocks).not.toHaveProperty(
      "beginOwnerPayoutTransferServer",
    );
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
});
