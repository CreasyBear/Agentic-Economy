import { validatePaymentRequired } from "@x402/core/schemas";
import { describe, expect, it, vi } from "vitest";

import {
  encodeX402PaymentRequiredHeader,
  type X402PaymentRequired,
} from "@/modules/capability-supply/server";
import timezonePin from "@/modules/capability-supply/internal/x402-bazaar-fixtures/timezone-payment-required-2026-08-19.json";
import {
  probeRegistryEntryForAdmission,
} from "@/modules/market/registry-graduation";
import {
  selectRegistryLaunchCohort,
  type RegistryLaunchCandidate,
} from "@/modules/market/registry-launch-cohort";

import { sweep } from "../../../convex/marketRegistryGraduation";

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

  it("selects a replay-deterministic top 100 with at most five routes per provider", () => {
    const candidates = Array.from({ length: 25 }, (_, providerIndex) =>
      Array.from({ length: 6 }, (_, routeIndex) => launchCandidate(
        `provider-${providerIndex}-route-${routeIndex}`,
        {
          provider: `Provider ${providerIndex}`,
          sourceCalls30d: String(10_000 - providerIndex * 100 - routeIndex),
          sourcePayers30d: String(100 - routeIndex),
        },
      )),
    ).flat();
    candidates.push(launchCandidate("treg-top", {
      source: "treg",
      provider: "Treg provider",
      sourceCalls30d: "999999999",
      sourcePayers30d: "999999999",
    }));

    const selected = selectRegistryLaunchCohort(candidates);
    const replayed = selectRegistryLaunchCohort(candidates.toReversed());
    const providerCounts = new Map<string, number>();
    for (const item of selected) {
      providerCounts.set(item.provider, (providerCounts.get(item.provider) ?? 0) + 1);
    }

    expect(selected).toHaveLength(100);
    expect(Math.max(...providerCounts.values())).toBe(5);
    expect(selected.every(({ source }) => source === "agentic_market")).toBe(true);
    expect(replayed.map(({ documentId }) => documentId)).toEqual(
      selected.map(({ documentId }) => documentId),
    );
  });

  it("orders valid nonnegative metrics before malformed metrics and breaks ties by route identity", () => {
    const selected = selectRegistryLaunchCohort([
      launchCandidate("malformed", {
        routeIdentity: "GET https://api.example.com/a",
        sourceCalls30d: "not-a-count",
        sourcePayers30d: "999",
      }),
      launchCandidate("zero", {
        routeIdentity: "GET https://api.example.com/z",
        sourceCalls30d: "0",
        sourcePayers30d: "0",
      }),
      launchCandidate("tie-b", {
        routeIdentity: "GET https://api.example.com/b",
        sourceCalls30d: "12",
        sourcePayers30d: "3",
      }),
      launchCandidate("tie-a", {
        routeIdentity: "GET https://api.example.com/a",
        sourceCalls30d: "12",
        sourcePayers30d: "3",
      }),
      launchCandidate("fewer-payers", {
        sourceCalls30d: "12",
        sourcePayers30d: "2",
      }),
    ], { limit: 5, providerCap: 5 });

    expect(selected.map(({ documentId }) => documentId)).toEqual([
      "registry:tie-a",
      "registry:tie-b",
      "registry:fewer-payers",
      "registry:zero",
      "registry:malformed",
    ]);
  });

  it("attempts only four selected digest-pinned candidates per sweep step", async () => {
    const runQuery = vi.fn(async () => ({
      kind: "page" as const,
      candidates: [],
      isDone: false,
      continueCursor: "ignored",
    }));
    const runAction = vi.fn(async (
      _reference: unknown,
      _args: {
        documentId: string;
        expectedSourceDigest: string;
        expectedGeneration: string;
      },
    ) => ({
      kind: "refused" as const,
      documentId: "registry:refused",
      reason: "request_failed",
    }));
    const runAfter = vi.fn(async (
      _delayMs: number,
      _reference: unknown,
      _args: {
        generation: string;
        candidates: { documentId: string; sourceDigest: string }[];
      },
    ) => undefined);
    const handler = (sweep as unknown as {
      _handler: (
        ctx: {
          runQuery: typeof runQuery;
          runAction: typeof runAction;
          scheduler: { runAfter: typeof runAfter };
        },
        args: {
          generation: string;
          candidates: { documentId: string; sourceDigest: string }[];
        },
      ) => Promise<unknown>;
    })._handler;
    const candidates = Array.from({ length: 6 }, (_, index) => ({
      documentId: `registry:selected-${index}`,
      sourceDigest: `sha256:digest-${index}`,
    }));

    await expect(handler({
      runQuery,
      runAction,
      scheduler: { runAfter },
    }, {
      generation: "generation-1",
      candidates,
    })).resolves.toEqual({ kind: "advanced", attempted: 4, graduated: 0 });

    expect(runAction).toHaveBeenCalledTimes(4);
    expect(runAction.mock.calls.map(([, args]) => args)).toEqual(
      candidates.slice(0, 4).map((item) => ({
        documentId: item.documentId,
        expectedSourceDigest: item.sourceDigest,
        expectedGeneration: "generation-1",
      })),
    );
    expect(runAfter).toHaveBeenCalledOnce();
    expect(runAfter.mock.calls[0]?.[2]).toEqual({
      generation: "generation-1",
      candidates: candidates.slice(4),
    });
  });

  it("stops a stale generation without probing or rescheduling candidates", async () => {
    const runQuery = vi.fn(async () => ({ kind: "stale_generation" as const }));
    const runAction = vi.fn();
    const runAfter = vi.fn();
    const handler = (sweep as unknown as {
      _handler: (
        ctx: {
          runQuery: typeof runQuery;
          runAction: typeof runAction;
          scheduler: { runAfter: typeof runAfter };
        },
        args: {
          generation: string;
          candidates: { documentId: string; sourceDigest: string }[];
        },
      ) => Promise<unknown>;
    })._handler;

    await expect(handler({
      runQuery,
      runAction,
      scheduler: { runAfter },
    }, {
      generation: "stale-generation",
      candidates: [{
        documentId: "registry:selected",
        sourceDigest: "sha256:selected",
      }],
    })).resolves.toEqual({
      kind: "stale_generation",
      attempted: 0,
      graduated: 0,
    });
    expect(runAction).not.toHaveBeenCalled();
    expect(runAfter).not.toHaveBeenCalled();
  });

  it("finishes an already-queued legacy cursor sweep without probing", async () => {
    const runQuery = vi.fn();
    const runAction = vi.fn();
    const runAfter = vi.fn();
    const handler = (sweep as unknown as {
      _handler: (
        ctx: {
          runQuery: typeof runQuery;
          runAction: typeof runAction;
          scheduler: { runAfter: typeof runAfter };
        },
        args: { generation: string; cursor: string | null },
      ) => Promise<unknown>;
    })._handler;

    await expect(handler({
      runQuery,
      runAction,
      scheduler: { runAfter },
    }, {
      generation: "legacy-generation",
      cursor: null,
    })).resolves.toEqual({ kind: "complete", attempted: 0, graduated: 0 });
    expect(runQuery).not.toHaveBeenCalled();
    expect(runAction).not.toHaveBeenCalled();
    expect(runAfter).not.toHaveBeenCalled();
  });
});

function launchCandidate(
  id: string,
  overrides: Partial<RegistryLaunchCandidate> = {},
): RegistryLaunchCandidate {
  return {
    source: "agentic_market",
    documentId: `registry:${id}`,
    sourceDigest: `sha256:${id}`,
    provider: "Provider",
    routeIdentity: `GET https://api.example.com/${id}`,
    sourceCalls30d: "1",
    sourcePayers30d: "1",
    ...overrides,
  };
}
