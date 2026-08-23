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
            name: "Exa search",
            summary: "Search the web.",
            provider: "Exa",
            category: "Search",
            method: "POST",
            tags: ["search"],
            networks: ["Base"],
            access: "x402",
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
