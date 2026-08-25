import { vi } from "vitest";
import { canonicalDigest } from "../../../src/modules/common/canonical-digest";

import {
  GatewayProductionSmokeReceiptSchema,
  type GatewayProductionSmokeReceipt,
  type GatewaySmokeConfig,
} from "../../../tools/release/operation-gateway-production-smoke";
import {
  isPublicOperationRef,
  type PublicOperationDescriptor,
  type PublicOperationRef,
} from "../../../src/modules/capability-supply/public";
import { OPERATION_INVOKE_ROUTE_CONTRACT } from "../../../src/modules/capability-execution/operation-invoke-entry";

const clerkBackendMock = vi.hoisted(() => ({
  createClerkClient: vi.fn(),
}));
vi.mock("@clerk/backend", () => clerkBackendMock);

export const clerkBackend = {
  createClerkClient: clerkBackendMock.createClerkClient,
};

const controlOperationRefCandidate = `operation:v1:${"c".repeat(64)}`;
if (!isPublicOperationRef(controlOperationRefCandidate))
  throw new Error("test_control_operation_ref_invalid");
export const controlOperationRef = controlOperationRefCandidate;
const operationRefCandidate = `operation:v1:${"a".repeat(64)}`;
if (!isPublicOperationRef(operationRefCandidate))
  throw new Error("test_operation_ref_invalid");
export const operationRef = operationRefCandidate;
const priceDigest = `sha256:${"b".repeat(64)}`;
export const observedAt = 1_700_000_000_000;
export const amount = { currency: "USD", units: "75", exponent: 2 };
export const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
export const operation = {
  operationRef,
  operationId: "operation:provider:paid",
  callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
  paymentLane: "brokered",
  contract: {
    capabilityId: "provider.paid",
    version: 1,
    inputJsonSchema: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
    outputJsonSchema: { type: "object" },
    customerAnnotations: [],
  },
  business: {
    businessId: "business:provider",
    slug: "provider",
    name: "Provider",
  },
  offering: {
    offeringRef: "offering:provider:paid",
    revision: 1,
    label: "Paid operation",
    summary: "Paid operation",
  },
  summary: "Paid provider operation",
  commercial: {
    price: { kind: "fixed", amount },
    priceEvidence: { priceDigest, evidenceRefs: [] },
    materialTerms: [],
    relationship: { kind: "none", summary: "No relationship declared." },
  },
  dataUse: [],
  effects: [],
  evidence: [],
  cancellation: { kind: "unsupported" },
  recovery: { idempotency: "required", recovery: "retry_safe" },
  provenance: { publisher: "provider_owned", sourceKind: "openapi_http" },
  authentication: { kind: "keyless" },
  transport: { method: "POST", requestTimeoutMs: 1_000 },
  availability: {
    posture: "routeable",
    observedAt,
    validUntil: observedAt + 60_000,
  },
  navigation: [],
} satisfies PublicOperationDescriptor;

export function completed(invocationRef = "invocation:provider:1") {
  return {
    kind: "completed" as const,
    invocationRef,
    operationRef,
    output: { ok: true, value: "result" },
    evidenceHash: "evidence:provider:1",
    usage: {
      usageRef: "usage:provider:1",
      chargeState: "paid" as const,
      amount,
      priceDigest,
      transactionRef: "transaction:provider:1",
      observedAt,
    },
  };
}

export function strictReceipt(): GatewayProductionSmokeReceipt {
  const zero = { currency: "USD", units: "0", exponent: 2 };
  const net = { currency: "USD", units: "60", exponent: 2 };
  const rake = { currency: "USD", units: "15", exponent: 2 };
  const topupAmount = { currency: "USD", units: "500", exponent: 2 };
  const fee = { currency: "USD", units: "25", exponent: 2 };
  const topupCharge = { currency: "USD", units: "525", exponent: 2 };
  const sourceRevision = "a".repeat(40);
  const runId = `ae-release-smoke:${sourceRevision}:run-1`;
  const controlRefCandidate = `operation:v1:${"c".repeat(64)}`;
  if (!isPublicOperationRef(controlRefCandidate))
    throw new Error("test_control_operation_ref_invalid");
  const controlRef = controlRefCandidate;
  const principalId = "principal:buyer";
  const principalDigest = canonicalDigest({ principalId });
  const ownerCall = {
    transport: "http" as const,
    serviceId: "service:owner",
    principalDigest,
    operationRef,
    invocationRef: "invocation:owner",
    attemptRef: "attempt:owner",
    terminalState: "completed" as const,
    effectGeneration: 1,
    inputDigest: digest("2"),
    outputDigest: digest("3"),
    evidenceDigest: "evidence:owner",
    usageDigest: digest("4"),
    charge: {
      activityRef: "activity:owner",
      chargeState: "free_tier" as const,
      grossAmount: zero,
      priceDigest,
    },
  };
  const controlCall = {
    ...ownerCall,
    serviceId: "service:control",
    operationRef: controlRef,
    invocationRef: "invocation:control",
    attemptRef: "attempt:control",
    inputDigest: digest("6"),
    outputDigest: digest("7"),
    evidenceDigest: "evidence:control",
    usageDigest: digest("8"),
    charge: {
      activityRef: "activity:control",
      chargeState: "paid" as const,
      grossAmount: amount,
      priceDigest,
    },
  };
  const account = (balance: typeof amount) => ({
    principalId,
    balance,
    autoRecharge: { enabled: false, threshold: zero, rechargeAmount: zero },
    evidence: "source" as const,
  });
  const usage = (
    callCount: number,
    paidCallCount: number,
    freeCallCount: number,
    grossSpend: typeof amount,
    states: ("free_tier" | "paid")[],
  ) => ({
    credentialId: "credential:buyer",
    callCount,
    paidCallCount,
    freeCallCount,
    grossSpend,
    states,
  });
  const earnings = (
    grossAccrual: typeof amount,
    providerNet: typeof amount,
    paidOut: typeof amount,
    held: typeof amount,
  ) => ({
    businessId: "business:provider",
    grossAccrual,
    rake: grossAccrual.units === "0" ? zero : rake,
    providerNet,
    paidOut,
    held,
    recoveryDue: zero,
    truncated: false as const,
    evidence: "source" as const,
  });
  const activity = (
    call: Readonly<{
      charge: Readonly<{ activityRef: string }>;
      serviceId: string;
      operationRef: PublicOperationRef;
      invocationRef: string;
      attemptRef: string;
    }>,
    offeringRef: string,
    businessId: string,
    chargeState: "free_tier" | "paid",
    grossAmount: typeof amount,
    transactionRef?: string,
  ) => ({
    activityRef: call.charge.activityRef,
    credentialId: "credential:buyer",
    serviceRef: call.serviceId,
    offeringRef,
    businessId,
    operationKey: call.operationRef,
    invocationRef: call.invocationRef,
    attemptRef: call.attemptRef,
    grossAmount,
    chargeState,
    priceDigest,
    observedAt,
    ...(transactionRef === undefined ? {} : { transactionRef }),
  });
  const topup = {
    topupCommandRef: "topup:1",
    buyerPrincipalDigest: principalDigest,
    paymentEvidenceRef: "stripe:checkout:cs_live_smoke",
    paymentEvidenceDigest: digest("a"),
    paymentRequestDigest: digest("b"),
    paymentMetadataDigest: digest("c"),
    checkoutSessionDigest: digest("f"),
    externalRef: "cs_live_smoke",
    idempotencyKey: `${runId}:topup`,
    stripeEventId: "evt:1",
    stripePayloadDigest: digest("d"),
    transactionRef: "transaction:topup",
    creditAmount: topupAmount,
    processingFee: fee,
    chargeAmount: topupCharge,
    buyerBalanceBefore: zero,
    buyerBalanceAfter: topupAmount,
    providerEvent: {
      status: "observed" as const,
      stripeEventId: "evt:1",
      eventType: "checkout.session.completed" as const,
      externalRef: "cs_live_smoke",
      commandRef: "topup:1",
      runId,
      observedAt: new Date(observedAt).toISOString(),
      amount: topupCharge,
    },
    webhookReplay: {
      status: "replayed" as const,
      signatureVerified: true,
      stripeEventId: "evt:1",
      stripePayloadDigest: digest("d"),
      rawBodyDigest: digest("1"),
      signatureDigest: digest("2"),
      commandRef: "topup:1",
      transactionRef: "transaction:topup",
      appliedRef: "transaction:topup",
      buyerBalanceBefore: topupAmount,
      buyerBalanceAfter: topupAmount,
      creditDelta: zero,
    },
  };
  const operationCharge = {
    controlInvocationRef: controlCall.invocationRef,
    controlAttemptRef: controlCall.attemptRef,
    buyerPrincipalDigest: principalDigest,
    supplierBusinessId: "business:provider",
    activityRef: "activity:control",
    transactionRef: "transaction:provider:1",
    buyerDebit: amount,
    supplierGrossAccrual: amount,
    aeRake: rake,
    providerNetAccrual: net,
  };
  const payout = {
    payoutRef: `${runId}:payout`,
    payoutCommandId: "payout-command:1",
    supplierBusinessId: "business:provider",
    payoutAccountRef: "account:provider:USD",
    stripeAccountDigest: digest("e"),
    stripeTransferDigest: digest("f"),
    transferEvidenceDigest: digest("0"),
    providerNetAmount: net,
    providerHeldBefore: net,
    providerHeldAfter: zero,
    providerPaidBefore: zero,
    providerPaidAfter: net,
    replayAdditionalDebits: 0 as const,
    providerTransfers: {
      beforePayout: {
        payoutRef: `${runId}:payout`,
        count: 0,
        transferIdsDigest: canonicalDigest({
          format: "stripe-transfer-ids:v1",
          payoutRef: `${runId}:payout`,
          transferIdDigests: [],
        }),
        transferIdDigests: [],
      },
      afterInitialPayout: {
        payoutRef: `${runId}:payout`,
        count: 1,
        transferIdsDigest: canonicalDigest({
          format: "stripe-transfer-ids:v1",
          payoutRef: `${runId}:payout`,
          transferIdDigests: [digest("f")],
        }),
        transferIdDigests: [digest("f")],
      },
      afterReplay: {
        payoutRef: `${runId}:payout`,
        count: 1,
        transferIdsDigest: canonicalDigest({
          format: "stripe-transfer-ids:v1",
          payoutRef: `${runId}:payout`,
          transferIdDigests: [digest("f")],
        }),
        transferIdDigests: [digest("f")],
      },
    },
  };
  const baselineUsage = usage(0, 0, 0, zero, []);
  const afterOwnerUsage = usage(1, 0, 1, zero, ["free_tier"]);
  const finalUsage = usage(2, 1, 1, amount, ["free_tier", "paid"]);
  const baselineEarnings = earnings(zero, zero, zero, zero);
  const afterControlEarnings = earnings(amount, net, zero, net);
  const afterPayoutEarnings = earnings(amount, net, net, zero);
  const material = {
    schemaVersion: 1 as const,
    kind: "operation_gateway_production_smoke" as const,
    status: "passed" as const,
    observedAt: new Date(observedAt).toISOString(),
    deployment: {
      sourceRevision,
      vercelDeploymentId: "dpl:smoke",
      vercelUrl: "https://smoke.vercel.app",
      productionUrl: "https://gateway.example",
      convexDeploymentId: "convex:smoke",
      convexUrl: "https://convex.example",
      convexSourceRevision: sourceRevision,
    },
    smokeOwnership: {
      runId,
      namespace: "ae-release-smoke" as const,
      businessId: "business:owner",
      businessName: "Release Smoke Business",
      businessCreated: true as const,
      offeringRef: "offering:owner",
      publicationRef: "publication:owner",
      ownerPrincipalDigest: principalDigest,
    },
    fixture: {
      offeringRef: "offering:owner",
      offeringRevision: 1,
      offeringSourceHash: digest("e"),
      publicationRef: "publication:owner",
      publicationRevision: 1,
      operationRef,
      cleanup: { publicationState: "withdrawn", offeringStatus: "retired" },
    },
    discovery: {
      query: "paid",
      detailObservedAt: observedAt,
      serviceCount: 2,
      endpointCount: 2,
      ownerServiceId: "service:owner",
      ownerOfferingRef: "offering:owner",
      ownerOperationRef: operationRef,
      ownerAuthentication: { kind: "keyless" as const },
      controlServiceId: "service:control",
      controlOfferingRef: "offering:provider:paid",
      controlBusinessId: "business:provider",
      controlOperationRef: controlRef,
      controlAuthentication: {
        kind: "platform_credential",
        scheme: "bearer" as const,
      },
      ownerAuthority: {
        businessName: "Release Smoke Business",
        offeringName: runId,
        offeringRevision: 1,
        offeringSourceHash: digest("e"),
        publicationRef: "publication:owner",
        publicationRevision: 1,
        sourceDigest: digest("f"),
        contractDigest: digest("0"),
        bindingId: "binding:1",
        bindingDigest: digest("1"),
      },
    },
    calls: {
      ownerHttp: ownerCall,
      ownerMcpReplay: { ...ownerCall, transport: "mcp" as const },
      controlHttp: controlCall,
    },
    usage: {
      baseline: baselineUsage,
      afterOwner: afterOwnerUsage,
      afterReplay: afterOwnerUsage,
      final: finalUsage,
      ownerActivity: activity(
        ownerCall,
        "offering:owner",
        "business:owner",
        "free_tier",
        zero,
      ),
      controlActivity: activity(
        controlCall,
        "offering:provider:paid",
        "business:provider",
        "paid",
        amount,
        "transaction:provider:1",
      ),
      replayAdditionalMeteredCalls: 0 as const,
      buyer: {
        baseline: account(zero),
        afterOwner: account(topupAmount),
        afterReplay: account(topupAmount),
        afterControl: account({ currency: "USD", units: "425", exponent: 2 }),
      },
      supplier: {
        baseline: baselineEarnings,
        afterControl: afterControlEarnings,
        afterPayout: afterPayoutEarnings,
      },
    },
    money: {
      topup,
      operationCharge,
      payout,
      conservation: {
        buyerDebit: amount,
        supplierGrossAccrual: amount,
        aeRake: rake,
        providerNet: net,
        paidOut: net,
        held: zero,
      },
    },
    refusals: {
      withdrawnOperationCode: "operation_withdrawn" as const,
      revokedKeyCode: "authentication_required" as const,
      revokedCredentialDigest: canonicalDigest({
        credentialId: "credential:buyer",
      }),
    },
    claimBoundary:
      "one_smoke_owned_publication_one_owner_operation_one_paid_control_operation_one_live_topup_one_live_payout" as const,
  };
  return GatewayProductionSmokeReceiptSchema.parse({
    ...material,
    receiptDigest: canonicalDigest(material),
  });
}
export function servicePage(
  services: readonly unknown[],
  isDone: boolean,
  continueCursor = "",
): unknown {
  return {
    kind: "ok",
    schemaVersion: "public-services-api:v2",
    services,
    isDone,
    continueCursor,
  };
}

export function linkedService(
  serviceId: string,
  linkedOperationRef: string,
  authentication:
    | { kind: "keyless" }
    | { kind: "platform_credential"; scheme: "bearer" }
    | { kind: "x402" } = { kind: "keyless" },
  offeringRef = operation.offering.offeringRef,
): unknown {
  return {
    id: serviceId,
    endpoints: [
      { ae: { operationRef: linkedOperationRef, offeringRef, authentication } },
    ],
  };
}

export function serviceFetch(responses: readonly unknown[]): {
  config: Pick<GatewaySmokeConfig, "baseUrl" | "fetch">;
  urls: string[];
} {
  let index = 0;
  const urls: string[] = [];
  const fetch: typeof globalThis.fetch = async (input) => {
    urls.push(String(input));
    const body = responses[Math.min(index++, responses.length - 1)];
    return new Response(JSON.stringify(body) ?? "", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { config: { baseUrl: "https://gateway.example", fetch }, urls };
}
export function gatewaySmokeEnvironment(
  overrides: Readonly<Record<string, string | undefined>> = {},
): Record<string, string | undefined> {
  const sourceRevision = "a".repeat(40);
  const runId = `ae-release-smoke:${sourceRevision}:run-1`;
  return {
    AE_GATEWAY_SMOKE_CONFIRM_LIVE_SPEND: "true",
    AE_GATEWAY_SMOKE_RUN_ID: runId,
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
    AE_GATEWAY_SMOKE_API_KEY: "raw-key-a",
    AE_GATEWAY_SMOKE_RELEASE_API_KEY: "key:release",
    AE_GATEWAY_SMOKE_APPROVED_AT: String(observedAt),
    AE_RELEASE_SOURCE_REVISION: sourceRevision,
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
    AE_GATEWAY_SMOKE_CREDENTIAL_ID: "credential:key-a",
    AE_GATEWAY_SMOKE_TOPUP_STAGE: "prepare",
    AE_GATEWAY_SMOKE_TOPUP_AMOUNT_JSON: JSON.stringify({
      currency: "USD",
      units: "500",
      exponent: 2,
    }),
    AE_GATEWAY_SMOKE_PAYOUT_REF: `${runId}:payout`,
    AE_GATEWAY_SMOKE_PAYOUT_IDEMPOTENCY_KEY: `${runId}:payout`,
    AE_GATEWAY_SMOKE_CURRENCY: "USD",
    ...overrides,
  };
}

export function mockClerkKey(credentialId: string, runId: string) {
  const key = {
    id: credentialId,
    subject: "user_smoke",
    name: runId,
    revoked: false,
    expired: false,
    scopes: ["market_operations:invoke"],
  };
  const apiKeys = {
    verify: vi.fn().mockResolvedValue(key),
    revoke: vi.fn().mockResolvedValue({ ...key, revoked: true }),
    get: vi.fn().mockResolvedValue({ ...key, revoked: true }),
  };
  const client = {
    sessions: {
      getSession: vi
        .fn()
        .mockResolvedValue({ status: "active", userId: "user_smoke" }),
      getToken: vi.fn().mockResolvedValue({ jwt: "session-token" }),
    },
    apiKeys,
  };
  clerkBackend.createClerkClient.mockReturnValue(client);
  return { apiKeys };
}
