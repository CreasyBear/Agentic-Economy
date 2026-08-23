import { afterEach, describe, expect, it } from "vitest";

import { setHttpRateLimitAdmissionForTests } from "@/lib/server/rate-limit";
import { handleApiRegistryRequest } from "@/routes/api.v1.registry";

describe("Agentic Economy registry public projection", () => {
  afterEach(() => setHttpRateLimitAdmissionForTests(undefined));

  it("returns a first-party, non-executable public registry contract", async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }));
    const response = await handleApiRegistryRequest(
      new Request(
        "https://ae.test/api/v1/registry?query=search&access=x402&limit=12",
      ),
      false,
      async () => ({
        kind: "ok",
        generation: "generation-1",
        coverage: {
          entries: 1,
          completedAt: 1,
        },
        page: [
          {
            documentId: "entry-1",
            sourceUrl: "https://agentic.market/services/api-exa-ai",
            providerUrl: "https://exa.ai",
            endpointUrl: "https://api.exa.ai/search",
            routeIdentity: "POST https://api.exa.ai/search",
            name: "Exa search",
            summary: "Search the web.",
            provider: "Exa",
            category: "Search",
            method: "POST",
            tags: ["search"],
            networks: ["Base"],
            priceLabel: "USDC 0.01",
            exactPrice: {
              scheme: "exact",
              amount: "0.01",
              currency: "USDC",
              network: "eip155:8453",
            },
            access: "x402",
            credentialRequirements: ["x402_payment"],
            readiness: "source_declared_callable",
            lastObservedAt: "2026-08-23T00:00:00.000Z",
            inputSchemaJson: JSON.stringify({ type: "object", properties: {} }),
            exampleInvocation:
              "curl --request POST --url 'https://api.exa.ai/search'",
            authority: "registry_metadata_only",
          },
        ],
        isDone: true,
        continueCursor: "",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      schemaVersion: "api-registry:v1",
      access: "x402",
      kind: "ok",
    });
    expect(body.page[0]).toMatchObject({
      routeIdentity: "POST https://api.exa.ai/search",
      exactPrice: {
        scheme: "exact",
        amount: "0.01",
        currency: "USDC",
        network: "eip155:8453",
      },
      credentialRequirements: ["x402_payment"],
      readiness: "source_declared_callable",
    });
    expect(JSON.stringify(body)).not.toContain("operationRef");
    expect(JSON.stringify(body)).not.toContain("invocationRef");
    expect(body.page[0]).not.toHaveProperty("source");
    expect(body.page[0]).not.toHaveProperty("upstreamServiceId");
  });

  it("rejects unbounded public reads with problem details", async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }));
    const response = await handleApiRegistryRequest(
      new Request("https://ae.test/api/v1/registry?limit=500"),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
  });
});
