import { validatePaymentRequired } from "@x402/core/schemas";
import { describe, expect, it, vi } from "vitest";

import {
  encodeX402PaymentRequiredHeader,
  type X402PaymentRequired,
} from "@/modules/capability-supply/server";
import timezonePin from "@/modules/capability-supply/internal/x402-bazaar-fixtures/timezone-payment-required-2026-08-19.json";
import { probeRegistryEntryForAdmission } from "@/modules/market/registry-graduation";

const requestUrl =
  "https://402timezones.vercel.app/api/convert-timezone?from=UTC&to=America%2FNew_York&time=12%3A00";

const candidate = {
  documentId: `registry:${"a".repeat(64)}`,
  sourceDigest: `sha256:${"b".repeat(64)}`,
  probeRequest: { method: "GET" as const, url: requestUrl, headers: [] },
};

describe("registry entry graduation", () => {
  it("graduates only a live 402 challenge carrying official Bazaar contracts", async () => {
    const paymentRequired = validatePaymentRequired(timezonePin.paymentRequired);
    if (paymentRequired.x402Version !== 2) throw new Error("expected x402 v2 fixture");
    const send = vi.fn(async (request: Request) => {
      expect(request.method).toBe("GET");
      expect(request.url).toBe(requestUrl);
      expect(request.headers.has("payment-signature")).toBe(false);
      return new Response(null, {
        status: 402,
        headers: {
          "payment-required": encodeX402PaymentRequiredHeader(
            paymentRequired as X402PaymentRequired,
          ),
        },
      });
    });

    const result = await probeRegistryEntryForAdmission(candidate, { send });

    expect(result).toMatchObject({
      kind: "admitted",
      documentId: candidate.documentId,
      sourceDigest: candidate.sourceDigest,
      draft: {
        execution: {
          endpoint: { url: "https://402timezones.vercel.app/api/convert-timezone" },
          method: "GET",
        },
      },
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it("refuses a successful response because catalogue metadata is not admission evidence", async () => {
    const result = await probeRegistryEntryForAdmission(candidate, {
      send: async () => Response.json({ result: "metadata looked callable" }),
    });

    expect(result).toEqual({
      kind: "refused",
      documentId: candidate.documentId,
      reason: "payment_required_missing",
    });
  });
});
