import "./operation-gateway-production-smoke-harness";
import { describe, expect, it } from "vitest";

import { parseGatewayOwnerProviderEarnings } from "../../../tools/release/operation-gateway-production-smoke";

describe("hosted Operation gateway smoke earnings", () => {
  it("rejects mixed-currency supplier earnings readback", () => {
    const usd = { currency: "USD", units: "0", exponent: 2 };
    const readback = {
      kind: "available",
      businessId: "business:provider",
      accountsTruncated: false,
      accounts: [
        {
          currency: "USD",
          earnings: {
            kind: "ok",
            businessId: "business:provider",
            grossAccrual: usd,
            rake: usd,
            providerNet: usd,
            paidOut: usd,
            held: usd,
            recoveryDue: { currency: "EUR", units: "0", exponent: 2 },
            truncated: false,
            evidence: "source",
          },
          payout: {
            kind: "ok",
            businessId: "business:provider",
            accountState: "ready",
            providerNet: usd,
            minimumPayout: usd,
            evidence: "source",
          },
        },
      ],
    };
    expect(() =>
      parseGatewayOwnerProviderEarnings(readback, "business:provider", "USD"),
    ).toThrow("gateway_smoke_supplier_earnings_currency_mismatch");
  });
  it("parses authoritative earnings and refuses truncation", () => {
    const usd = { currency: "USD", units: "0", exponent: 2 };
    const readback = {
      kind: "available" as const,
      businessId: "business:provider",
      accountsTruncated: false,
      accounts: [
        {
          currency: "USD",
          earnings: {
            kind: "ok" as const,
            businessId: "business:provider",
            grossAccrual: usd,
            rake: usd,
            providerNet: usd,
            paidOut: usd,
            held: usd,
            recoveryDue: usd,
            truncated: false as const,
            evidence: "source" as const,
          },
          payout: {
            kind: "ok" as const,
            businessId: "business:provider",
            accountState: "ready" as const,
            providerNet: usd,
            minimumPayout: usd,
            evidence: "source" as const,
          },
        },
      ],
    };
    expect(
      parseGatewayOwnerProviderEarnings(readback, "business:provider", "USD"),
    ).toEqual({
      businessId: "business:provider",
      grossAccrual: usd,
      rake: usd,
      providerNet: usd,
      paidOut: usd,
      held: usd,
      recoveryDue: usd,
      truncated: false,
      evidence: "source",
    });
    expect(() =>
      parseGatewayOwnerProviderEarnings(
        { ...readback, accountsTruncated: true },
        "business:provider",
        "USD",
      ),
    ).toThrow("gateway_smoke_supplier_earnings_truncated");
  });
});
