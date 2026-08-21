import {
  gatewaySmokeEnvironment,
  mockClerkKey,
  observedAt,
} from "./operation-gateway-production-smoke-harness";
import { describe, expect, it } from "vitest";

import {
  gatewaySmokeConfigFromEnvironment,
  receiptPathFromArguments,
} from "../../../tools/release/operation-gateway-production-smoke";

describe("hosted Operation gateway smoke config", () => {
  it("keeps CLI argument and environment receipt selection bounded", () => {
    expect(receiptPathFromArguments([], {})).toBeUndefined();
    expect(
      receiptPathFromArguments([], {
        AE_GATEWAY_SMOKE_OUTPUT_PATH: "output/release/receipt.json",
      }),
    ).toBe("output/release/receipt.json");
    expect(() =>
      receiptPathFromArguments(["--receipt", "output/release/other.json"], {
        AE_GATEWAY_SMOKE_OUTPUT_PATH: "output/release/receipt.json",
      }),
    ).toThrow("argument_env_mismatch");
    expect(() =>
      gatewaySmokeConfigFromEnvironment({
        AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND: "true",
        AE_GATEWAY_SMOKE_BASE_URL: "https://gateway.example",
        AE_GATEWAY_SMOKE_JOB_QUERY: "paid",
        AE_GATEWAY_SMOKE_INPUT_JSON: "{}",
        AE_GATEWAY_SMOKE_OWNER_OPENAPI_DOCUMENT_JSON: JSON.stringify({
          paths: {
            "/release-smoke": {
              get: { operationId: "__AE_RELEASE_SMOKE_OPERATION_ID__" },
            },
          },
        }),
        AE_GATEWAY_SMOKE_OWNER_OPENAPI_PATH: "/release-smoke",
        AE_GATEWAY_SMOKE_OWNER_OPENAPI_METHOD: "get",
        AE_RELEASE_SOURCE_REVISION: "a".repeat(40),
        AE_RELEASE_DEPLOYMENT_ID: "dpl_smoke",
      }),
    ).toThrow("AE_GATEWAY_SMOKE_API_KEY");
    expect(() =>
      gatewaySmokeConfigFromEnvironment({
        AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND: "true",
        AE_GATEWAY_SMOKE_BASE_URL: "https://gateway.example",
        AE_GATEWAY_SMOKE_JOB_QUERY: "paid",
        AE_GATEWAY_SMOKE_INPUT_JSON: "{}",
        AE_GATEWAY_SMOKE_OWNER_OPENAPI_DOCUMENT_JSON: JSON.stringify({
          paths: {
            "/release-smoke": {
              get: { operationId: "__AE_RELEASE_SMOKE_OPERATION_ID__" },
            },
          },
        }),
        AE_GATEWAY_SMOKE_OWNER_OPENAPI_PATH: "/release-smoke",
        AE_GATEWAY_SMOKE_OWNER_OPENAPI_METHOD: "get",
        AE_GATEWAY_SMOKE_API_KEY: "key:smoke",
        AE_GATEWAY_SMOKE_RELEASE_API_KEY: "key:release",
        AE_GATEWAY_SMOKE_TOPUP_WEBHOOK_RAW_BODY: "retained-body",
      }),
    ).toThrow("gateway_smoke_retained_webhook_capture_forbidden");
    const env = {
      AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND: "true",
      AE_GATEWAY_SMOKE_RUN_ID: `ae-release-smoke:${"a".repeat(40)}:run-1`,
      AE_GATEWAY_SMOKE_BASE_URL: "https://gateway.example",
      AE_GATEWAY_SMOKE_JOB_QUERY: "paid",
      AE_GATEWAY_SMOKE_OWNER_QUERY: "owner smoke",
      AE_GATEWAY_SMOKE_INPUT_JSON: "{}",
      AE_GATEWAY_SMOKE_OWNER_OPENAPI_DOCUMENT_JSON: JSON.stringify({
        paths: {
          "/release-smoke": {
            get: { operationId: "__AE_RELEASE_SMOKE_OPERATION_ID__" },
          },
        },
      }),
      AE_GATEWAY_SMOKE_OWNER_OPENAPI_PATH: "/release-smoke",
      AE_GATEWAY_SMOKE_OWNER_OPENAPI_METHOD: "get",
      AE_GATEWAY_SMOKE_API_KEY: "key:smoke",
      AE_GATEWAY_SMOKE_RELEASE_API_KEY: "key:release",
      AE_GATEWAY_SMOKE_APPROVED_AT: String(observedAt),
      AE_RELEASE_SOURCE_REVISION: "a".repeat(40),
      AE_RELEASE_DEPLOYMENT_ID: "dpl_smoke",
      AE_RELEASE_CONVEX_DEPLOYMENT_ID: "convex:smoke",
      AE_RELEASE_CONVEX_URL: "https://convex.example",
      CLERK_SECRET_KEY: "sk_test_smoke",
      STRIPE_SECRET_KEY: "sk_live_smoke",
      STRIPE_WEBHOOK_SECRET: "whsec_smoke",
      VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_smoke",
      AE_GATEWAY_SMOKE_OWNER_CLERK_SESSION_ID: "sess_smoke",
      AE_GATEWAY_SMOKE_OWNER_CLERK_USER_ID: "user_smoke",
      AE_GATEWAY_SMOKE_CONTROL_BUSINESS_ID: "business:provider",
      AE_GATEWAY_SMOKE_CREDENTIAL_ID: "ak_smoke",
      AE_GATEWAY_SMOKE_TOPUP_STAGE: "prepare",
      AE_GATEWAY_SMOKE_TOPUP_AMOUNT_JSON: JSON.stringify({
        currency: "USD",
        units: "500",
        exponent: 2,
      }),
      AE_GATEWAY_SMOKE_PAYOUT_REF: `ae-release-smoke:${"a".repeat(40)}:run-1:payout`,
      AE_GATEWAY_SMOKE_PAYOUT_IDEMPOTENCY_KEY: `ae-release-smoke:${"a".repeat(40)}:run-1:payout`,
      AE_GATEWAY_SMOKE_CURRENCY: "USD",
    };
    const config = gatewaySmokeConfigFromEnvironment(env);
    expect(config.apiKey).toBe("key:smoke");
    expect(config.releaseApiKey).toBe("key:release");
    expect(() =>
      gatewaySmokeConfigFromEnvironment({
        ...env,
        AE_GATEWAY_SMOKE_RELEASE_API_KEY: undefined,
      }),
    ).toThrow("AE_GATEWAY_SMOKE_RELEASE_API_KEY");
    expect("ownerServiceId" in config).toBe(false);
    expect("controlServiceId" in config).toBe(false);
    expect(config.topupStage).toBe("prepare");
    expect(() =>
      gatewaySmokeConfigFromEnvironment({
        ...env,
        AE_GATEWAY_SMOKE_TOPUP_WEBHOOK_SIGNATURE: "retained-signature",
      }),
    ).toThrow("gateway_smoke_retained_webhook_capture_forbidden");
  });

  it("does not revoke when the raw key and configured credential diverge", async () => {
    const rawSecret = "raw-key-a";
    const env = gatewaySmokeEnvironment({
      AE_GATEWAY_SMOKE_API_KEY: rawSecret,
      AE_GATEWAY_SMOKE_CREDENTIAL_ID: "credential:key-b",
    });
    const { apiKeys } = mockClerkKey(
      "credential:key-a",
      env.AE_GATEWAY_SMOKE_RUN_ID ?? "",
    );
    const config = gatewaySmokeConfigFromEnvironment(env);
    let failure: unknown;
    try {
      await config.money.preflightCredential();
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toContain("gateway_smoke_api_key_identity_invalid");
    expect(String(failure)).not.toContain(rawSecret);
    await expect(
      config.money.revokeCredential(undefined, {}),
    ).rejects.toThrow("gateway_smoke_api_key_identity_invalid");
    expect(apiKeys.verify).toHaveBeenCalledTimes(1);
    expect(apiKeys.revoke).not.toHaveBeenCalled();
  });

  it("revokes one cached proof for a valid run-owned key", async () => {
    const rawSecret = "raw-key-a";
    const env = gatewaySmokeEnvironment({ AE_GATEWAY_SMOKE_API_KEY: rawSecret });
    const credentialId = env.AE_GATEWAY_SMOKE_CREDENTIAL_ID ?? "";
    const { apiKeys } = mockClerkKey(
      credentialId,
      env.AE_GATEWAY_SMOKE_RUN_ID ?? "",
    );
    const config = gatewaySmokeConfigFromEnvironment(env);
    await config.money.preflightCredential();
    await config.money.preflightCredential();
    const result = await config.money.revokeCredential(undefined, {});
    await config.money.revokeCredential(undefined, {});
    expect(apiKeys.verify).toHaveBeenCalledTimes(1);
    expect(apiKeys.revoke).toHaveBeenCalledTimes(1);
    expect(apiKeys.revoke.mock.calls[0]?.[0]).toMatchObject({
      apiKeyId: credentialId,
    });
    expect(JSON.stringify(result)).not.toContain(rawSecret);
  });
});
