// @vitest-environment jsdom

import { operation, renderWithRouter, tool } from "./supply-funnel-harness";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AeSupplyLanding } from "@/components/ae/supply/AeSupplyLanding";

describe("supply landing", () => {
  it("leads with a plain-language Provider fit decision and published Operation rows", () => {
    renderWithRouter(<AeSupplyLanding tools={[tool]} operations={[operation]} />);
    expect(
      screen.getByRole("heading", { name: "List a service." }),
    ).toBeDefined();
    expect(screen.getByText("Suppliers")).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "List a service" })
        .getAttribute("href"),
    ).toBe("/owner/offerings");
    expect(screen.getByRole("heading", { name: "Check whether your service is a fit." })).toBeDefined();
    expect(screen.getByText(/List one service an agent can search/i)).toBeDefined();
    expect(screen.getByText(/supported OpenAPI document, remote MCP server/i)).toBeDefined();
    expect(screen.getByText(/Never paste a raw key/i)).toBeDefined();
    expect(screen.getByText(/may consume provider quota or cost/i)).toBeDefined();
    expect(screen.getByText(/does not publish the service, create earnings, or guarantee delivery/i)).toBeDefined();
    expect(screen.getByText(/Publication means the current service passed/i)).toBeDefined();
    expect(screen.getByRole("link", { name: "x402 Provider requirements" }).getAttribute("href")).toBe("https://github.com/CreasyBear/Agentic-Economy/blob/main/X402_SELLER_ONBOARDING.md");
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
    renderWithRouter(<AeSupplyLanding tools={[]} operations={[]} />);
    expect(screen.getByText(/No Operations are published yet/)).toBeDefined();
  });

  it("does not present an unavailable catalogue as empty", () => {
    renderWithRouter(
      <AeSupplyLanding
        tools={[]}
        operations={[]}
        sourceError="Supplier information is temporarily unavailable. Try again."
      />,
    );

    expect(screen.getByText("Supplier information is unavailable")).toBeDefined();
    expect(
      screen.getByText("Supplier information is temporarily unavailable. Try again."),
    ).toBeDefined();
    expect(screen.queryByText(/No Operations are published yet/)).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "What agents can inspect" }),
    ).toBeNull();
  });
});
