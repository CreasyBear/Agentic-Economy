// @vitest-environment jsdom

import { renderWithRouter, service, tool } from "./supply-funnel-harness";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AeSupplyLanding } from "@/components/ae/supply/AeSupplyLanding";

describe("supply landing", () => {
  it("leads with the supplier path and published Operation rows", () => {
    renderWithRouter(<AeSupplyLanding tools={[tool]} services={[service]} />);
    expect(
      screen.getByRole("heading", { name: "Publish an Operation." }),
    ).toBeDefined();
    expect(screen.getByText("Suppliers")).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Create or continue an Operation" })
        .getAttribute("href"),
    ).toBe("/owner/supply");
    expect(screen.getByRole("heading", { name: "Know what AE will ask for." })).toBeDefined();
    expect(screen.getByText(/one callable job an agent can search/i)).toBeDefined();
    expect(screen.getByText(/OpenAPI 3\.1 GET or POST/i)).toBeDefined();
    expect(screen.getByText(/Never paste a raw key/i)).toBeDefined();
    expect(screen.getByText(/method plus path for OpenAPI/i)).toBeDefined();
    expect(screen.getByText(/USD 0\.50 is units 50, exponent 2/i)).toBeDefined();
    expect(screen.getByText(/Readiness tests may reach the configured upstream/i)).toBeDefined();
    expect(screen.getByText(/only creates credentialless x402 connections/i)).toBeDefined();
    expect(screen.getByRole("link", { name: "Read the supplier agent path" }).getAttribute("href")).toBe("/SKILL.md#supplier-path");
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
    expect(screen.getByText("No supplier profiles are published yet.")).toBeDefined();
  });
});
