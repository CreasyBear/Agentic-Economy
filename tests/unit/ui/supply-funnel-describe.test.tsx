// @vitest-environment jsdom

import { offeringAt } from "./supply-funnel-harness";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  AeSupplyFunnel,
  type SupplyFunnelCallbacks,
} from "@/components/ae/supply/AeSupplyFunnel";
import { emptyOwnerOfferingEditorValue } from "@/components/ae/offerings/AeOwnerOfferings.exports";

describe("current supply funnel", () => {
  it("renders only the describe frontier first", () => {
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
      runTest: async () => ({ step: "test", state: "completed" }),
    };
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={offeringAt("describe")}
        initialOffering={emptyOwnerOfferingEditorValue}
        callbacks={callbacks}
      />,
    );
    expect(screen.getByText("Service details")).toBeDefined();
    expect(
      screen.queryByRole("heading", { name: "Check that it works" }),
    ).toBeNull();
  });
});
