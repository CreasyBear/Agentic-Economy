// @vitest-environment jsdom

import { publishedTool, renderWithRouter, tool } from "./supply-funnel-harness";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AeSupplyLanding } from "@/components/ae/supply/AeSupplyLanding";

describe("supply landing", () => {
  it("leads with a plain-language Provider fit decision and published Tool rows", () => {
    renderWithRouter(<AeSupplyLanding tools={[tool]} publishedTools={[publishedTool]} />);
    expect(
      screen.getByRole("heading", { name: "List a Tool." }),
    ).toBeDefined();
    expect(screen.getByText("Providers")).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "List a Tool" })
        .getAttribute("href"),
    ).toBe("/owner/operations");
    expect(screen.getByRole("heading", { name: "Check whether your Tool is a fit." })).toBeDefined();
    expect(screen.getByText(/List one Tool an agent can search/i)).toBeDefined();
    expect(screen.getByText(/supported OpenAPI document, remote MCP server/i)).toBeDefined();
    expect(screen.getByText(/Never paste a raw key/i)).toBeDefined();
    expect(screen.getByText(/may consume provider quota or cost/i)).toBeDefined();
    expect(screen.getByText(/does not publish the Tool, create earnings, or guarantee delivery/i)).toBeDefined();
    expect(screen.getByText(/Publication means the current Tool passed/i)).toBeDefined();
    expect(screen.getByRole("heading", { name: "Public x402 endpoint" })).toBeDefined();
    expect(screen.getByText(/Prove control of the payout address; never paste a wallet private key/i)).toBeDefined();
    expect(screen.queryByRole("link", { name: "x402 Provider requirements" })).toBeNull();
    expect(screen.getByRole("heading", { name: "What agents can inspect" })).toBeDefined();
    expect(screen.getByText("Quote API")).toBeDefined();
    expect(screen.getByText(/AUD 0\.00/i)).toBeDefined();
    expect(screen.queryByText(/payment support is enabled|unavailable until payment support/i)).toBeNull();
    expect(screen.queryByText(/\b[0-9]+ actions available/i)).toBeNull();
    expect(
      screen.queryByText(/publisher console|money rail|machine surfaces/i),
    ).toBeNull();
  });

  it("keeps provider guidance available while current Tool information loads", () => {
    renderWithRouter(<AeSupplyLanding tools={[]} publishedTools={[]} sourcePending />);

    expect(screen.getByRole("heading", { name: "List a Tool." })).toBeDefined();
    expect(screen.getByRole("link", { name: "List a Tool" }).getAttribute("href")).toBe("/owner/operations");
    expect(screen.getByRole("heading", { name: "Check whether your Tool is a fit." })).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain("Loading current Tool information…");
    expect(screen.queryByText(/No Tools are published yet/)).toBeNull();
    expect(screen.queryByText("Provider information is unavailable")).toBeNull();
  });

  it("renders the honest empty state", () => {
    renderWithRouter(<AeSupplyLanding tools={[]} publishedTools={[]} />);
    expect(screen.getByText(/No Tools are published yet/)).toBeDefined();
  });

  it("does not present an unavailable catalogue as empty", () => {
    renderWithRouter(
      <AeSupplyLanding
        tools={[]}
        publishedTools={[]}
        sourceError="Provider information is temporarily unavailable. Try again."
      />,
    );

    expect(screen.getByText("Provider information is unavailable")).toBeDefined();
    expect(
      screen.getByText("Provider information is temporarily unavailable. Try again."),
    ).toBeDefined();
    expect(screen.queryByText(/No Tools are published yet/)).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "What agents can inspect" }),
    ).toBeNull();
  });
});
