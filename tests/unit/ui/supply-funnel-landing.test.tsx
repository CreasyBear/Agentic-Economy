// @vitest-environment jsdom

import { renderWithRouter, service, tool } from "./supply-funnel-harness";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AeSupplyLanding } from "@/components/ae/supply/AeSupplyLanding";

describe("supply landing", () => {
  it("leads with the business outcome and generated service rows", () => {
    renderWithRouter(<AeSupplyLanding tools={[tool]} services={[service]} />);
    expect(
      screen.getByRole("heading", { name: /AI assistants/i }),
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Manage operations" })
        .getAttribute("href"),
    ).toBe("/owner/supply");
    expect(screen.getByText(/agents bring you work/i)).toBeDefined();
    expect(screen.getByText("Quote API")).toBeDefined();
    expect(screen.getByText(/configured payment setup/i)).toBeDefined();
    expect(screen.queryByText(/payment support is enabled|unavailable until payment support/i)).toBeNull();
    expect(screen.queryByText(/\b[0-9]+ actions available/i)).toBeNull();
    expect(
      screen.queryByText(/publisher console|money rail|machine surfaces/i),
    ).toBeNull();
  });

  it("renders the honest empty state", () => {
    renderWithRouter(<AeSupplyLanding tools={[]} services={[]} />);
    expect(screen.getByText("No services are listed yet.")).toBeDefined();
  });
});
