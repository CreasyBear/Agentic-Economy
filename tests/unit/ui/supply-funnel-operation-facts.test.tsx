// @vitest-environment jsdom

import { offeringAt, priceDigest, sourceHash } from "./supply-funnel-harness";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AeOwnerOperationFacts } from "@/components/ae/supply/AeSupplyPublisherHome";

describe("owner operation control facts", () => {
  it("shows canonical operation, source, binding, pricing, readiness, and live readback", () => {
    render(<AeOwnerOperationFacts offering={offeringAt("test")} detail />);

    expect(screen.getByText("operation:one")).toBeDefined();
    expect(screen.getByText("publication:one · revision 1")).toBeDefined();
    expect(screen.getByText("binding:one")).toBeDefined();
    expect(screen.getByText("https://example.test/quote")).toBeDefined();
    expect(screen.getByText(`openapi_http · source:one`)).toBeDefined();
    expect(screen.getAllByText(sourceHash).length).toBeGreaterThan(0);
    expect(screen.getByText("pricing:v2 · call")).toBeDefined();
    expect(screen.getByText("AUD 1.25 · units 125 · exponent 2")).toBeDefined();
    expect(screen.getByText(priceDigest)).toBeDefined();
    expect(screen.getByText("evidence:readiness")).toBeDefined();
    expect(screen.getByText("available")).toBeDefined();
    expect(screen.queryByText(/credential|secret|token/i)).toBeNull();
  });
});
