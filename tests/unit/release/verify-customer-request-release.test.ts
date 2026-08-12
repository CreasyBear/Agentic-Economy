import { afterEach, describe, expect, it, vi } from "vitest";

import {
  main as verifyHostedCustomerRequestReleaseMain,
  verifyHostedCustomerRequestRelease,
} from "../../../tools/release/verify-customer-request-release";

const revision = "50fa5ed886dbf5eddbfc1397704b12fc52469abe";
const expectedConvexDeploymentId = "dev-smoke-1";
const expectedConvexUrl = "https://dev-smoke.convex.cloud";
const expectedConvex = { expectedConvexDeploymentId, expectedConvexUrl };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function readback(
  sourceRevision = revision,
  convexSourceRevision = sourceRevision,
): Record<string, unknown> {
  return {
    kind: "release_readback",
    schemaVersion: "ae.customer-request-release:v1",
    source: {
      provider: "github",
      repository: "CreasyBear/Agentic-Economy",
      revision: sourceRevision,
    },
    deployment: {
      provider: "vercel",
      id: "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3",
      environment: "production",
      targetEnvironment: "production",
      url: "https://agentic-economy-abc123.vercel.app",
      productionUrl: "https://agentic-economy-phi.vercel.app",
      convex: {
        provider: "convex",
        id: "dev-smoke-1",
        url: "https://dev-smoke.convex.cloud",
        sourceRevision: convexSourceRevision,
      },
    },
    requestEntrypoint: {
      contract: "Customer Request V2",
      method: "POST",
      path: "/api/v1/requests",
      schemaPath: "/api/v1/requests/schema",
      authentication: "clerk_api_key",
      requiredScope: "customer_requests:create",
    },
    evidence: {
      observedAt: "2026-07-14T04:05:06.000Z",
      inputs: [
        "VERCEL",
        "VERCEL_ENV",
        "VERCEL_TARGET_ENV",
        "VERCEL_DEPLOYMENT_ID",
        "VERCEL_URL",
        "VERCEL_PROJECT_PRODUCTION_URL",
        "VERCEL_GIT_PROVIDER",
        "VERCEL_GIT_REPO_OWNER",
        "VERCEL_GIT_REPO_SLUG",
        "VERCEL_GIT_COMMIT_SHA",
      ],
      convexInputs: ["CONVEX_DEPLOYMENT_ID", "CONVEX_URL"],
      sandbox: {
        involved: false,
        reason: "release readback does not discover or execute supply",
      },
    },
  };
}

describe("hosted Customer Request release verifier", () => {
  it("reads the authenticated deployment URL and verifies the expected revision", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(input.toString()).toBe(
        "https://agentic-economy-abc123.vercel.app/api/v1/release",
      );
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer test_key",
      );
      return Response.json(readback());
    };
    await expect(
      verifyHostedCustomerRequestRelease({
        baseUrl: "https://agentic-economy-abc123.vercel.app",
        apiKey: "test_key",
        expectedRevision: revision,
        expectedDeploymentId: "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3",
        ...expectedConvex,
        fetchImpl,
      }),
    ).resolves.toEqual({
      kind: "verified",
      sourceRevision: revision,
      vercelDeploymentId: "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3",
      vercelUrl: "https://agentic-economy-abc123.vercel.app",
      productionUrl: "https://agentic-economy-phi.vercel.app",
      convexDeploymentId: "dev-smoke-1",
      convexUrl: "https://dev-smoke.convex.cloud",
      convexSourceRevision: revision,
    });
  });

  it("passes canonical-first bypass configuration from environment into the readback request", async () => {
    const fetchImpl = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json(readback()));
    vi.stubGlobal("fetch", fetchImpl);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await verifyHostedCustomerRequestReleaseMain({
      AE_CUSTOMER_REQUEST_BASE_URL: "https://agentic-economy-abc123.vercel.app",
      AE_CUSTOMER_REQUEST_API_KEY: "test_key",
      AE_RELEASE_SOURCE_REVISION: revision,
      AE_RELEASE_DEPLOYMENT_ID: "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3",
      AE_RELEASE_CONVEX_DEPLOYMENT_ID: expectedConvexDeploymentId,
      AE_RELEASE_CONVEX_URL: expectedConvexUrl,
      VERCEL_AUTOMATION_BYPASS_SECRET: " canonical-secret ",
      AE_CUSTOMER_REQUEST_VERCEL_BYPASS_SECRET: " alias-secret ",
    });

    expect(
      new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get(
        "x-vercel-protection-bypass",
      ),
    ).toBe("canonical-secret");
  });

  it("fails closed when expected Convex deployment identity is absent", async () => {
    const env = {
      AE_CUSTOMER_REQUEST_BASE_URL: "https://agentic-economy-abc123.vercel.app",
      AE_CUSTOMER_REQUEST_API_KEY: "test_key",
      AE_RELEASE_SOURCE_REVISION: revision,
      AE_RELEASE_DEPLOYMENT_ID: "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3",
    };
    await expect(verifyHostedCustomerRequestReleaseMain(env)).rejects.toThrow(
      "AE_RELEASE_CONVEX_DEPLOYMENT_ID_required",
    );
    await expect(
      verifyHostedCustomerRequestReleaseMain({
        ...env,
        AE_RELEASE_CONVEX_DEPLOYMENT_ID: expectedConvexDeploymentId,
      }),
    ).rejects.toThrow("AE_RELEASE_CONVEX_URL_required");
  });

  it("admits the platform-reported production alias for protected deployment URLs", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      expect(input.toString()).toBe(
        "https://agentic-economy-phi.vercel.app/api/v1/release",
      );
      return Response.json(readback());
    };
    await expect(
      verifyHostedCustomerRequestRelease({
        baseUrl: "https://agentic-economy-phi.vercel.app",
        apiKey: "test_key",
        expectedRevision: revision,
        expectedDeploymentId: "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3",
        ...expectedConvex,
        fetchImpl,
      }),
    ).resolves.toMatchObject({ kind: "verified", sourceRevision: revision });
  });

  it("refuses revision, deployment URL, schema and transport mismatches", async () => {
    const serving =
      (body: unknown): typeof fetch =>
      async () =>
        Response.json(body);
    const exact = {
      baseUrl: "https://agentic-economy-abc123.vercel.app",
      apiKey: "test_key",
      expectedRevision: revision,
      expectedDeploymentId: "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3",
      ...expectedConvex,
    };
    await expect(
      verifyHostedCustomerRequestRelease({
        ...exact,
        fetchImpl: serving(
          readback("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        ),
      }),
    ).rejects.toThrow("hosted_release_revision_mismatch");
    await expect(
      verifyHostedCustomerRequestRelease({
        ...exact,
        fetchImpl: serving(
          readback(revision, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        ),
      }),
    ).rejects.toThrow("hosted_release_convex_source_revision_mismatch");
    await expect(
      verifyHostedCustomerRequestRelease({
        ...exact,
        baseUrl: "https://another-deployment.vercel.app",
        fetchImpl: serving(readback()),
      }),
    ).rejects.toThrow("hosted_release_deployment_url_mismatch");
    await expect(
      verifyHostedCustomerRequestRelease({
        ...exact,
        fetchImpl: serving({ ...readback(), schemaVersion: "unsupported" }),
      }),
    ).rejects.toThrow();
    await expect(
      verifyHostedCustomerRequestRelease({
        ...exact,
        baseUrl: "http://agentic-economy-abc123.vercel.app",
        fetchImpl: serving(readback()),
      }),
    ).rejects.toThrow("hosted_release_https_required");
    await expect(
      verifyHostedCustomerRequestRelease({
        ...exact,
        expectedDeploymentId: "dpl_another",
        fetchImpl: serving(readback()),
      }),
    ).rejects.toThrow("hosted_release_deployment_id_mismatch");
  });
});
