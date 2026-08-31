// @vitest-environment jsdom

import {
  offeringAt,
  preparedPublication,
  x402OfferingAtTest,
} from "./supply-funnel-harness";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AeSupplyFunnel,
  type SupplyFunnelCallbacks,
} from "@/components/ae/supply/AeSupplyFunnel";
import { AeSupplyEarningsCard } from "@/components/ae/supply/AeSupplyEarningsCard";
import { emptyOwnerOfferingEditorValue } from "@/components/ae/offerings/AeOwnerOfferings.exports";
import type { SupplyFunnelStep } from "@/modules/capability-supply/supply-funnel.functions";

describe("current supply funnel", () => {
  it("requires explicit confirmation and discloses the exact paid x402 canary", async () => {
    const runTest = vi.fn(async () => ({
      step: "test" as const,
      state: "completed" as const,
      message: "The exact paid canary was queued.",
    }));
    const callbacks: SupplyFunnelCallbacks = {
      saveOffering: async (value) => ({
        kind: "saved",
        value,
        message: "Saved.",
      }),
      preflight: async () => ({
        kind: "refused",
        reason: "not_used",
        fix: "Not used in this step.",
      }),
      admit: async () => ({ step: "admission", state: "completed" }),
      runReadiness: async () => ({ step: "readiness", state: "completed" }),
      runTest,
    };
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={x402OfferingAtTest()}
        initialOffering={emptyOwnerOfferingEditorValue}
        callbacks={callbacks}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Review paid canary",
      }),
    ).toBeDefined();
    expect(screen.getByText(/eip155:84532/i)).toBeDefined();
    expect(screen.getByText(/USD 0.01 \(10000 atomic units\)/i)).toBeDefined();
    expect(screen.getByText(/0x1111111111111111111111111111111111111111/i)).toBeDefined();
    expect(screen.getByText(/No payment is sent until you confirm/i)).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Review paid canary",
      }),
    );
    expect(runTest).not.toHaveBeenCalled();
    await waitFor(() => expect(
      screen.getByRole("button", { name: "Confirm one Base Sepolia payment" }),
    ).toBeDefined());
    expect(screen.getByText(/This test can transfer testnet USDC/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Confirm one Base Sepolia payment" }));
    await waitFor(() => expect(runTest).toHaveBeenCalledOnce());
  });

  it("keeps readiness refusal recovery honest and does not create earnings", async () => {
    let attempt = 0;
    let nextStep: SupplyFunnelStep = "readiness";
    let updateOffering: (step: SupplyFunnelStep) => void = () => undefined;
    const runReadinessImplementation: SupplyFunnelCallbacks["runReadiness"] =
      async () => {
        attempt += 1;
        return attempt === 1
          ? { step: "readiness", state: "refused", refusal: "health_unhealthy" }
          : { step: "readiness", state: "completed" };
      };
    const runReadiness = vi.fn(runReadinessImplementation);
    const callbacks: SupplyFunnelCallbacks = {
      saveOffering: async (value) => ({
        kind: "saved",
        value,
        message: "Saved.",
      }),
      preflight: async () => ({
        kind: "prepared",
        prepared: preparedPublication,
      }),
      admit: async () => ({ step: "admission", state: "completed" }),
      runReadiness,
      runTest: async () => ({ step: "test", state: "completed" }),
      onReload: async () => updateOffering(nextStep),
    };
    const view = render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={offeringAt("readiness")}
        initialOffering={emptyOwnerOfferingEditorValue}
        callbacks={callbacks}
      />,
    );
    updateOffering = (step) =>
      view.rerender(
        <AeSupplyFunnel
          businessId="business:one"
          offering={offeringAt(step)}
          initialOffering={emptyOwnerOfferingEditorValue}
          callbacks={callbacks}
        />,
      );

    fireEvent.click(screen.getByRole("button", { name: "Check readiness" }));
    await waitFor(() =>
      expect(
        screen.getByText(/endpoint returned an unhealthy result/i),
      ).toBeDefined(),
    );
    expect(screen.queryByText("health_unhealthy")).toBeNull();
    expect(screen.getByRole("alert").className).toContain("text-destructive");

    nextStep = "test";
    fireEvent.click(screen.getByRole("button", { name: "Check readiness" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Run a real test" }),
      ).toBeDefined(),
    );
    await waitFor(() =>
      expect(screen.getByText("Check that it works is saved.")).toBeDefined(),
    );
    expect(screen.getByRole("alert").className).not.toContain(
      "text-destructive",
    );
    expect(runReadiness).toHaveBeenCalledTimes(2);

    render(<AeSupplyEarningsCard readback={{ kind: "not_found" }} />);
    expect(
      screen.getByText(/Setup or test calls do not create earnings/i),
    ).toBeDefined();
  });
});
