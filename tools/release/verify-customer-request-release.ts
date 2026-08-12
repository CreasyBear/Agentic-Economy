import {
  parseCustomerRequestReleaseReadback,
  verifyCustomerRequestHostedRevision,
} from "../../src/modules/customer-request/release-readback";
import { pathToFileURL } from "node:url";
import { resolveVercelProtectionBypassSecret } from "./vercel-protection-bypass";

type Environment = Record<string, string | undefined>;

export type HostedCustomerRequestReleaseVerification = Readonly<{
  kind: "verified";
  sourceRevision: string;
  vercelDeploymentId: string;
  vercelUrl: string;
  productionUrl: string;
  convexDeploymentId: string;
  convexUrl: string;
  convexSourceRevision: string;
}>;

export async function verifyHostedCustomerRequestRelease(
  options: Readonly<{
    baseUrl: string;
    apiKey: string;
    expectedRevision: string;
    expectedDeploymentId: string;
    expectedConvexDeploymentId?: string;
    expectedConvexUrl?: string;
    deploymentProtectionBypass?: string;
    fetchImpl?: typeof fetch;
  }>,
): Promise<HostedCustomerRequestReleaseVerification> {
  const bootstrapUrl = new URL(options.baseUrl);
  const expectedConvexDeploymentId = (
    options.expectedConvexDeploymentId ??
    process.env.AE_RELEASE_CONVEX_DEPLOYMENT_ID
  )?.trim();
  const expectedConvexUrl = (
    options.expectedConvexUrl ?? process.env.AE_RELEASE_CONVEX_URL
  )?.trim();
  if (
    expectedConvexDeploymentId === undefined ||
    expectedConvexDeploymentId.length === 0
  )
    throw new Error("AE_RELEASE_CONVEX_DEPLOYMENT_ID_required");
  if (expectedConvexUrl === undefined || expectedConvexUrl.length === 0)
    throw new Error("AE_RELEASE_CONVEX_URL_required");
  if (bootstrapUrl.protocol !== "https:")
    throw new Error("hosted_release_https_required");

  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${options.apiKey}`,
  });
  if (options.deploymentProtectionBypass !== undefined) {
    headers.set(
      "x-vercel-protection-bypass",
      options.deploymentProtectionBypass,
    );
  }

  const response = await (options.fetchImpl ?? fetch)(
    new URL("/api/v1/release", bootstrapUrl),
    {
      method: "GET",
      headers,
      redirect: "error",
    },
  );
  if (!response.ok)
    throw new Error(`hosted_release_readback_failed:${response.status}`);
  const readback = parseCustomerRequestReleaseReadback(await response.json());

  const normalizedBootstrapUrl = bootstrapUrl.href.replace(/\/$/u, "");
  const readbackUrls = [
    readback.deployment.url,
    readback.deployment.productionUrl,
  ].map((value) => new URL(value).href.replace(/\/$/u, ""));
  if (!readbackUrls.includes(normalizedBootstrapUrl))
    throw new Error("hosted_release_deployment_url_mismatch");
  const convex = readback.deployment.convex;
  if (convex === undefined)
    throw new Error("hosted_release_convex_identity_missing");
  verifyCustomerRequestHostedRevision({
    expectedRevision: options.expectedRevision,
    expectedDeploymentId: options.expectedDeploymentId,
    expectedConvexDeploymentId,
    expectedConvexUrl,
    readback,
  });
  const convexSourceRevision = convex.sourceRevision;
  if (
    convexSourceRevision === undefined ||
    convexSourceRevision !== options.expectedRevision
  ) {
    throw new Error("hosted_release_convex_source_revision_mismatch");
  }
  return Object.freeze({
    kind: "verified",
    sourceRevision: readback.source.revision,
    vercelDeploymentId: readback.deployment.id,
    vercelUrl: readback.deployment.url,
    productionUrl: readback.deployment.productionUrl,
    convexDeploymentId: convex.id,
    convexUrl: convex.url,
    convexSourceRevision,
  });
}

export async function main(env: Environment = process.env): Promise<void> {
  const baseUrl = required(env, "AE_CUSTOMER_REQUEST_BASE_URL");
  const apiKey = required(env, "AE_CUSTOMER_REQUEST_API_KEY");
  const expectedRevision = required(env, "AE_RELEASE_SOURCE_REVISION");
  const expectedDeploymentId = required(env, "AE_RELEASE_DEPLOYMENT_ID");
  const expectedConvexDeploymentId = required(
    env,
    "AE_RELEASE_CONVEX_DEPLOYMENT_ID",
  );
  const expectedConvexUrl = required(env, "AE_RELEASE_CONVEX_URL");
  const bypass = resolveVercelProtectionBypassSecret(env);
  const result = await verifyHostedCustomerRequestRelease({
    baseUrl,
    apiKey,
    expectedRevision,
    expectedDeploymentId,
    expectedConvexDeploymentId,
    expectedConvexUrl,
    ...(bypass === undefined ? {} : { deploymentProtectionBypass: bypass }),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function required(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (value === undefined || value.length === 0)
    throw new Error(`${name}_required`);
  return value;
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  import.meta.url === pathToFileURL(entrypoint).href
)
  await main();
