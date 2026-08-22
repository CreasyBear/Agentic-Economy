import { createClerkClient } from "@clerk/backend";

import { MARKET_OPERATIONS_INVOKE_SCOPE } from "../../src/modules/agent-access/contract";
import type { JsonValue } from "../../src/modules/capability-contract/public";
import {
  createAuthenticatedSourceTransport,
  type ConvexSourceTransport,
} from "../../src/lib/server/convex-source";
import {
  required,
} from "./operation-gateway-production-smoke-receipt";
import { GatewaySmokeError } from "./operation-gateway-production-smoke-receipt";
import {
  type HostedMoneySnapshot,
  type StrictCreditActivityView,
} from "./operation-gateway-production-smoke-money";
import {
  createHostedOwnerRuntime,
  type HostedOwnerRuntime,
} from "./operation-gateway-production-smoke-hosted-owner";
import {
  createHostedMoneyRuntime,
  type HostedMoneyRuntime,
} from "./operation-gateway-production-smoke-hosted-money";

export function requireHostedUrl(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0)
    throw new Error(`${name} is required`);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL`);
  }
  if (
    url.protocol !== "https:" ||
    /(?:localhost|127\.0\.0\.1|::1|\.local$)/iu.test(url.hostname)
  )
    throw new Error(`${name} must be hosted over HTTPS`);
  return url.toString().replace(/\/$/u, "");
}

export type { HostedMoneySnapshot, StrictCreditActivityView };

export type { HostedMoneyRuntime } from "./operation-gateway-production-smoke-hosted-money";

export type {
  GatewayOwnerFixtureCleanup,
  GatewayOwnerFixtureIdentity,
  HostedOwnerAuthority,
  HostedOwnerRuntime,
} from "./operation-gateway-production-smoke-hosted-owner";
type RunOwnedClerkKeyProof = Readonly<{
  rawSecret: string;
  credentialId: string;
  ownerUserId: string;
  runId: string;
  lifecycle: "active";
  scopes: readonly [typeof MARKET_OPERATIONS_INVOKE_SCOPE];
}>;

export function createHostedRuntimeFromEnvironment(
  options: Readonly<{
    env: Record<string, string | undefined>;
    baseUrl: string;
    apiKey: string;
    fetch: typeof globalThis.fetch;
    input: Readonly<Record<string, JsonValue>>;
    ownerQuery: string;
    ownerOpenApiDocument: Readonly<Record<string, JsonValue>>;
    ownerOpenApiPath: string;
    ownerOpenApiMethod: "get" | "post";
    runId: string;
    approvedAt: number;
  }>,
): Readonly<{ owner: HostedOwnerRuntime; money: HostedMoneyRuntime }> {
  const convexUrl = requireHostedUrl(
    options.env.AE_RELEASE_CONVEX_URL,
    "AE_RELEASE_CONVEX_URL",
  );
  const clerkSecretKey = required(
    options.env.CLERK_SECRET_KEY,
    "CLERK_SECRET_KEY",
  );
  const ownerSessionId = required(
    options.env.AE_GATEWAY_SMOKE_OWNER_CLERK_SESSION_ID,
    "AE_GATEWAY_SMOKE_OWNER_CLERK_SESSION_ID",
  );
  const ownerUserId = required(
    options.env.AE_GATEWAY_SMOKE_OWNER_CLERK_USER_ID,
    "AE_GATEWAY_SMOKE_OWNER_CLERK_USER_ID",
  );
  const controlBusinessId = required(
    options.env.AE_GATEWAY_SMOKE_CONTROL_BUSINESS_ID,
    "AE_GATEWAY_SMOKE_CONTROL_BUSINESS_ID",
  );
  const credentialId = required(
    options.env.AE_GATEWAY_SMOKE_CREDENTIAL_ID,
    "AE_GATEWAY_SMOKE_CREDENTIAL_ID",
  );
  const clerk = createClerkClient({ secretKey: clerkSecretKey });
  let credentialProofPromise: Promise<RunOwnedClerkKeyProof> | undefined;
  const credentialProof = async (): Promise<RunOwnedClerkKeyProof> => {
    credentialProofPromise ??= (async () => {
      const key = await clerk.apiKeys.verify(options.apiKey).catch(() => {
        throw new GatewaySmokeError("gateway_smoke_api_key_identity_invalid");
      });
      const session = await clerk.sessions.getSession(ownerSessionId);
      if (session.status !== "active" || session.userId !== ownerUserId)
        throw new GatewaySmokeError("gateway_smoke_owner_session_invalid");
      if (
        key.id !== credentialId ||
        key.subject !== ownerUserId ||
        key.name !== options.runId ||
        key.revoked ||
        key.expired ||
        key.scopes.length !== 1 ||
        key.scopes[0] !== MARKET_OPERATIONS_INVOKE_SCOPE
      )
        throw new GatewaySmokeError("gateway_smoke_api_key_identity_invalid");
      return {
        rawSecret: options.apiKey,
        credentialId: key.id,
        ownerUserId: key.subject,
        runId: key.name,
        lifecycle: "active",
        scopes: [MARKET_OPERATIONS_INVOKE_SCOPE],
      };
    })();
    return await credentialProofPromise;
  };
  let transportPromise: Promise<ConvexSourceTransport> | undefined;
  const transport = async () => {
    transportPromise ??= (async () => {
      await credentialProof();
      const token = await clerk.sessions.getToken(ownerSessionId);
      return await createAuthenticatedSourceTransport({
        env: { ...options.env, CONVEX_URL: convexUrl },
        authObject: { isAuthenticated: true, getToken: async () => token.jwt },
        fetch: options.fetch,
      });
    })();
    return await transportPromise;
  };
  const context = {
    sourceWriteRequest: {
      method: "POST",
      initiatorOrigin: new URL(options.baseUrl).origin,
      targetOrigin: new URL(options.baseUrl).origin,
      targetPath: "/api/v1/release/operation-gateway",
      targetQuery: "",
      bodyDigest: "none",
    },
  };
  let ownerResult: ReturnType<typeof createHostedOwnerRuntime>;
  const money = createHostedMoneyRuntime({
    env: options.env,
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    fetch: options.fetch,
    runId: options.runId,
    approvedAt: options.approvedAt,
    clerk,
    transport,
    credentialProof,
    context,
    readWithdrawnOperation: (operationRef) =>
      ownerResult.readWithdrawnOperation(operationRef),
  });
  ownerResult = createHostedOwnerRuntime({
    env: options.env,
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    fetch: options.fetch,
    input: options.input,
    ownerQuery: options.ownerQuery,
    ownerOpenApiDocument: options.ownerOpenApiDocument,
    ownerOpenApiPath: options.ownerOpenApiPath,
    ownerOpenApiMethod: options.ownerOpenApiMethod,
    runId: options.runId,
    controlBusinessId,
    transport,
    context,
    readActivity: money.readControlActivity,
  });
  return { owner: ownerResult.owner, money };
}
