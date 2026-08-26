// @vitest-environment jsdom

import { renderWithRouter, service, tool } from "./supply-funnel-harness";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AeSupplyLanding } from "@/components/ae/supply/AeSupplyLanding";

describe("supply landing", () => {
  it("leads with the supplier path and published Operation rows", () => {
    renderWithRouter(<AeSupplyLanding tools={[tool]} services={[service]} />);
    expect(
      screen.getByRole("heading", { name: "List your tool or API." }),
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Open supplier dashboard" })
        .getAttribute("href"),
    ).toBe("/owner/supply");
    expect(screen.getByRole("heading", { name: "What agents can inspect" })).toBeDefined();
    expect(screen.getByText("Quote API")).toBeDefined();
    expect(screen.getByText(/AUD 0\.00/i)).toBeDefined();
    expect(screen.queryByText(/payment support is enabled|unavailable until payment support/i)).toBeNull();
    expect(screen.queryByText(/\b[0-9]+ actions available/i)).toBeNull();
    expect(
      screen.queryByText(/publisher console|money rail|machine surfaces/i),
    ).toBeNull();
  });

  it("renders the honest empty state", () => {
    renderWithRouter(<AeSupplyLanding tools={[]} services={[]} />);
    expect(screen.getByText("No Operations are listed yet.")).toBeDefined();
  });
});
