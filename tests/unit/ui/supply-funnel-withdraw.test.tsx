// @vitest-environment jsdom

import { offeringAt, preparedPublication } from "./supply-funnel-harness";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AeSupplyFunnel,
  type SupplyFunnelCallbacks,
} from "@/components/ae/supply/AeSupplyFunnel";
import { emptyOwnerOfferingEditorValue } from "@/components/ae/offerings/AeOwnerOfferings.exports";
import type { OwnerSupplyCommandResult } from "@/modules/capability-supply/supply-funnel.functions";

describe("current supply funnel", () => {
  it("requires one explicit confirmation before withdrawing a publication", async () => {
    let resolveWithdraw!: (result: OwnerSupplyCommandResult) => void;
    const withdraw = vi.fn(
      () =>
        new Promise<OwnerSupplyCommandResult>((resolve) => {
          resolveWithdraw = resolve;
        }),
    );
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
      runReadiness: async () => ({ step: "readiness", state: "completed" }),
      runTest: async () => ({ step: "test", state: "completed" }),
      withdraw,
    };
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={offeringAt("test")}
        initialOffering={emptyOwnerOfferingEditorValue}
        callbacks={callbacks}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Withdraw publication" }),
    );
    expect(withdraw).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(withdraw).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Withdraw publication" }),
    );
    const confirm = screen.getByRole("button", { name: "Confirm withdrawal" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(withdraw).toHaveBeenCalledOnce();

    resolveWithdraw({
      kind: "withdrawn",
      publicationRef: "publication:one",
      revision: 2,
      lifecycle: { state: "withdrawn", reasons: ["owner_withdrew"] },
    });
    await waitFor(() =>
      expect(
        screen.getByText(/current publication is withdrawn/i),
      ).toBeDefined(),
    );
    expect(screen.getByRole("alert").className).not.toContain(
      "text-destructive",
    );
  });
});
