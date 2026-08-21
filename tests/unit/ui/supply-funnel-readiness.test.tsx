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
  it("distinguishes an x402 readiness challenge from a paid fill", async () => {
    const runTest = vi.fn(async () => ({
      step: "test" as const,
      state: "completed" as const,
      message:
        "The exact admitted operation returned a fresh valid x402 payment challenge. No payment was sent.",
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
        name: "Check payment challenge (no payment sent).",
      }),
    ).toBeDefined();
    expect(screen.getByText(/readiness only/i)).toBeDefined();
    expect(
      screen.getByText(
        /not a paid fill, Qualified Use, earnings, settlement, or proof of live availability/i,
      ),
    ).toBeDefined();
    expect(screen.queryByText("Send the test")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Check payment challenge (no payment sent).",
      }),
    );
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

    fireEvent.click(screen.getByRole("button", { name: "Check the service" }));
    await waitFor(() =>
      expect(
        screen.getByText(/endpoint returned an unhealthy result/i),
      ).toBeDefined(),
    );
    expect(screen.queryByText("health_unhealthy")).toBeNull();
    expect(screen.getByRole("alert").className).toContain("text-destructive");

    nextStep = "test";
    fireEvent.click(screen.getByRole("button", { name: "Check the service" }));
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
