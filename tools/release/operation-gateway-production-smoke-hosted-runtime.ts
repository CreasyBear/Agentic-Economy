import { createClerkClient } from "@clerk/backend";
import Stripe from "stripe";
import { z } from "zod";

import { canonicalDigest } from "../../src/modules/common/canonical-digest";
import { MARKET_OPERATIONS_INVOKE_SCOPE } from "../../src/modules/agent-access/contract";
import type { JsonValue } from "../../src/modules/capability-contract/public";
import { OPERATION_INVOKE_HTTP_PATH } from "../../src/modules/capability-execution/operation-invoke-entry";
import {
  createAuthenticatedSourceTransport,
  sourceAction,
  sourceMutation,
  sourceQuery,
  type ConvexSourceTransport,
} from "../../src/lib/server/convex-source";
import {
  sourceWriteAdmissionFromContext,
  sourceWriteRequestFromAdmission,
} from "../../src/lib/server/source-write-admission";
import { operationDetailOutputSchema } from "../../src/modules/capability-supply/public";
import {
  beginCreditTopupThroughSource,
  readCreditPaymentThroughSource as readTopupPaymentThroughSource,
  readOwnerPayoutTransferThroughSource,
  runOwnerPayoutTransferThroughSource,
} from "../../src/modules/money/server";
import {
  readStripeMoneyProviderConfig,
  readStripeTransfersByGroup,
  verifyStripeMoneyWebhook,
} from "../../src/lib/server/stripe-money-provider";
import {
  CreditAccountViewSchema,
  CreditActivityViewSchema,
  exactAmountSchema,
  isMoneyRefusal,
  KeyUsageViewSchema,
  StrictLivePayoutReceiptSchema,
  accountRefForOwner,
  accountRefForProvider,
  calculateCreditTopupFinancials,
  compareExactAmounts,
  productionCreditTopupConfig,
  subtractExactAmounts,
  type ExactAmount,
  type StrictLivePayoutReceipt,
} from "../../src/modules/money/public";
import {
  APPROVED_EXTERNAL_MOVEMENT_CAP,
  boundedRefSchema,
  digestSchema,
  operationRefSchema,
  required,
  sameAmount,
  topupPreparationSchema,
  topupProviderEventSchema,
  topupWebhookReplaySchema,
  zeroAmount,
} from "./operation-gateway-production-smoke-receipt";
import {
  GatewaySmokeError,
  gatewaySmokeFailureWithCleanup,
  type GatewayPayoutProviderTransferReadback,
  type GatewayTopupObservation,
  type GatewayTopupPreparationArtifact,
  type GatewayTopupProviderEvent,
  type GatewayTopupWebhookReplay,
  type HostedTopupReadback,
} from "./operation-gateway-production-smoke-receipt";
import {
  parseGatewayOwnerProviderEarnings,
  sanitizeGatewayPayoutProviderTransfers,
  type HostedMoneySnapshot,
  type StrictCreditActivityView,
} from "./operation-gateway-production-smoke-money";
import {
  parseGatewayInvocationResponse,
  requestJson,
  type GatewayInvocationObservation,
} from "./operation-gateway-production-smoke-invocation";
import {
  ownerSourceForRun,
  prepareOwnerPublicationMaterial,
  type GatewayOwnerFixtureCleanup,
  type GatewayOwnerFixtureIdentity,
  type HostedOwnerAuthority,
  type HostedOwnerRuntime,
} from "./operation-gateway-production-smoke-hosted-owner";
import { resolveVercelProtectionBypassSecret } from "./vercel-protection-bypass";

const MAX_TOPUP_EVENT_PAGES = 10;
const STRIPE_REQUEST_TIMEOUT_MS = 15_000;
const MAX_TOPUP_WEBHOOK_RAW_BODY_BYTES = 256 * 1024;
const MAX_TOPUP_WEBHOOK_SIGNATURE_BYTES = 4 * 1024;

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

export type HostedMoneyRuntime = Readonly<{
  mode: "live";
  principalId: string;
  accountRef: string;
  businessId: string;
  credentialId: string;
  topupIdempotencyKey: string;
  topupChargeAmount: ExactAmount;
  beginTopup: () => Promise<GatewayTopupPreparationArtifact>;
  payoutRef: string;
  payoutIdempotencyKey: string;
  readSnapshot: () => Promise<HostedMoneySnapshot>;
  readProviderTransfers: (
    payoutRef: string,
  ) => Promise<GatewayPayoutProviderTransferReadback>;
  observeTopup: (
    expected: GatewayTopupPreparationArtifact,
  ) => Promise<GatewayTopupObservation>;
  readControlActivity: (
    invocationRef: string,
  ) => Promise<StrictCreditActivityView>;
  beginPayout: (
    input: Readonly<{
      payoutRef: string;
      idempotencyKey: string;
      amount: ExactAmount;
    }>,
  ) => Promise<StrictLivePayoutReceipt>;
  readPayout: (
    input: Readonly<{ payoutRef: string; idempotencyKey: string }>,
  ) => Promise<StrictLivePayoutReceipt>;
  readWithdrawnOperation: (
    operationRef: string,
  ) => Promise<Readonly<{ kind: "refused"; code: "operation_withdrawn" }>>;
  preflightCredential: () => Promise<void>;
  revokeCredential: (
    operationRef: string | undefined,
    input: Readonly<Record<string, JsonValue>>,
  ) => Promise<
    Readonly<{
      kind: "refused";
      code: "authentication_required";
      credentialDigest: string;
    }>
  >;
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
  const principalId = `clerk_api_key:${credentialId}`;
  const currency = required(
    options.env.AE_GATEWAY_SMOKE_CURRENCY ?? "USD",
    "AE_GATEWAY_SMOKE_CURRENCY",
  );
  const accountRef = accountRefForOwner(ownerUserId, currency);
  const topupIdempotencyKey = `${options.runId}:topup`;
  const payoutRef = required(
    options.env.AE_GATEWAY_SMOKE_PAYOUT_REF,
    "AE_GATEWAY_SMOKE_PAYOUT_REF",
  );
  const payoutIdempotencyKey = required(
    options.env.AE_GATEWAY_SMOKE_PAYOUT_IDEMPOTENCY_KEY,
    "AE_GATEWAY_SMOKE_PAYOUT_IDEMPOTENCY_KEY",
  );
  if (
    payoutRef !== `${options.runId}:payout` ||
    payoutIdempotencyKey !== `${options.runId}:payout`
  )
    throw new GatewaySmokeError("gateway_smoke_money_run_identity_mismatch");
  const amountRaw = required(
    options.env.AE_GATEWAY_SMOKE_TOPUP_AMOUNT_JSON,
    "AE_GATEWAY_SMOKE_TOPUP_AMOUNT_JSON",
  );
  let parsedTopupAmount: unknown;
  try {
    parsedTopupAmount = JSON.parse(amountRaw) as unknown;
  } catch {
    throw new GatewaySmokeError("gateway_smoke_topup_amount_invalid");
  }
  const topupConfig = productionCreditTopupConfig();
  const accountTemplate = topupConfig.minimumByCurrency[currency];
  const parsedAmount = exactAmountSchema.safeParse(parsedTopupAmount);
  const financials =
    accountTemplate === undefined || !parsedAmount.success
      ? undefined
      : calculateCreditTopupFinancials({
          amount: parsedAmount.data,
          accountCurrency: accountTemplate.currency,
          accountExponent: accountTemplate.exponent,
          config: topupConfig,
        });
  if (financials === undefined)
    throw new GatewaySmokeError("gateway_smoke_topup_amount_invalid");
  const topupAmount = financials.amount;
  const chargeAmount = financials.chargeAmount;
  if (
    compareExactAmounts(chargeAmount, APPROVED_EXTERNAL_MOVEMENT_CAP) ===
      undefined ||
    compareExactAmounts(chargeAmount, APPROVED_EXTERNAL_MOVEMENT_CAP) === 1
  )
    throw new GatewaySmokeError(
      "gateway_smoke_topup_charge_exceeds_approved_cap",
    );
  const stripeConfig = readStripeMoneyProviderConfig(options.env, "live");
  if (isMoneyRefusal(stripeConfig) || stripeConfig.mode !== "live")
    throw new GatewaySmokeError("stripe_setup_required");
  const stripe = new Stripe(stripeConfig.secretKey, {
    apiVersion: Stripe.API_VERSION,
    maxNetworkRetries: 0,
    timeout: STRIPE_REQUEST_TIMEOUT_MS,
    typescript: true,
  });

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
  const preflightCredential = async (): Promise<void> => {
    await credentialProof();
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
  const currentOwnerCatalogQuery = sourceQuery<Record<string, never>, unknown>(
    "catalog:getCurrentOwnerPublicCatalog",
  );
  const createOfferingMutation = sourceMutation<Record<string, unknown>, unknown>(
    "catalog:createBusinessOffering",
  );

  const withdrawMutation = sourceMutation<Record<string, unknown>, unknown>(
    "capabilitySupplyOwnerFunnel:withdrawOwnerCapability",
  );
  const retireOfferingMutation = sourceMutation<
    Record<string, unknown>,
    unknown
  >("catalog:changeBusinessOfferingStatus");
  const publishMutation = sourceMutation<Record<string, unknown>, unknown>(
    "capabilitySupply:publishPreparedCapability",
  );
  const readinessAction = sourceAction<Record<string, unknown>, unknown>(
    "capabilitySupplyOwnerSupply:runOwnerSupplyReadiness",
  );
  const ownerSupplyQuery = sourceQuery<Record<string, unknown>, unknown>(
    "capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel",
  );
  const record = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value))
      : undefined;
  const ownerSupplyReadback = async (
    businessId: string,
  ): Promise<
    Readonly<Record<string, unknown> & { offerings: readonly unknown[] }>
  > => {
    const result = record(
      await (await transport()).query(ownerSupplyQuery, { businessId }),
    );
    const offerings = result?.offerings;
    if (
      result?.kind !== "available" ||
      result.businessId !== businessId ||
      !Array.isArray(offerings)
    )
      throw new GatewaySmokeError("gateway_smoke_owner_supply_unavailable");
    return { ...result, offerings };
  };
  let fixture: GatewayOwnerFixtureIdentity | undefined;
  let partialOffering:
    | Readonly<{
        businessId: string;
        offeringRef: string;
        offeringRevision: number;
        offeringSourceHash?: string;
      }>
    | undefined;
  let publicationMayExist = false;
  const retirePartialOffering =
    async (): Promise<GatewayOwnerFixtureCleanup> => {
      const current = partialOffering;
      if (current === undefined)
        throw new GatewaySmokeError(
          "gateway_smoke_owner_partial_offering_missing",
        );
      const before = await ownerSupplyReadback(current.businessId);
      const beforeOfferings = before.offerings
        .map(record)
        .filter((candidate) => candidate?.offeringRef === current.offeringRef);
      if (
        beforeOfferings.length !== 1 ||
        beforeOfferings[0]?.name !== options.runId ||
        typeof beforeOfferings[0].revision !== "number" ||
        !Number.isSafeInteger(beforeOfferings[0].revision) ||
        beforeOfferings[0].revision < 1 ||
        (current.offeringSourceHash !== undefined &&
          beforeOfferings[0].sourceHash !== current.offeringSourceHash)
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_partial_offering_identity_changed",
        );
      const offeringRevision = z
        .number()
        .int()
        .positive()
        .parse(beforeOfferings[0].revision);
      const beforeOffering = beforeOfferings[0];
      if (beforeOffering.status !== "retired") {
        const operationKey = `ae-release-smoke:${options.runId}:retire-partial:${offeringRevision}`;
        const command = {
          businessId: current.businessId,
          offeringRef: current.offeringRef,
          expectedRevision: offeringRevision,
          status: "retired" as const,
          operationKey,
          correlationId: operationKey,
        };
        const sourceWrite = await sourceWriteAdmissionFromContext({
          context,
          command,
          scope: "catalog_publish",
          operationKey,
          correlationId: operationKey,
          env: options.env,
        });
        const result = record(
          await (
            await transport()
          ).mutation(retireOfferingMutation, {
            ...command,
            sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
            sourceWrite,
          }),
        );
        if (result?.kind !== "ok")
          throw new GatewaySmokeError(
            "gateway_smoke_owner_partial_offering_retire_refused",
          );
      }
      const after = await ownerSupplyReadback(current.businessId);
      const afterOfferings = after.offerings
        .map(record)
        .filter((candidate) => candidate?.offeringRef === current.offeringRef);
      if (
        afterOfferings.length !== 1 ||
        afterOfferings[0]?.name !== options.runId ||
        afterOfferings[0].status !== "retired" ||
        afterOfferings[0].revision !== offeringRevision ||
        (current.offeringSourceHash !== undefined &&
          afterOfferings[0].sourceHash !== current.offeringSourceHash)
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_partial_cleanup_readback_invalid",
        );
      partialOffering = undefined;
      return { publicationState: "withdrawn", offeringStatus: "retired" };
    };
  const createFixture = async (): Promise<GatewayOwnerFixtureIdentity> => {
    if (fixture !== undefined)
      throw new GatewaySmokeError(
        "gateway_smoke_owner_fixture_already_created",
      );
    try {
      const material = ownerSourceForRun({
        runId: options.runId,
        ownerQuery: options.ownerQuery,
        ownerOpenApiDocument: options.ownerOpenApiDocument,
        ownerOpenApiPath: options.ownerOpenApiPath,
        ownerOpenApiMethod: options.ownerOpenApiMethod,
        input: options.input,
      });
      const currentCatalog = record(
        await (await transport()).query(currentOwnerCatalogQuery, {}),
      );
      const currentBusiness = record(currentCatalog?.catalog);
      if (
        currentCatalog?.kind !== "available" ||
        currentBusiness === undefined ||
        typeof currentBusiness.businessId !== "string" ||
        typeof currentBusiness.name !== "string"
      ) {
        throw new GatewaySmokeError("gateway_smoke_owner_business_required");
      }
      const businessId = boundedRefSchema.parse(currentBusiness.businessId);
      const businessName = boundedRefSchema.parse(currentBusiness.name);
      if (businessId === controlBusinessId)
        throw new GatewaySmokeError(
          "gateway_smoke_owner_control_business_identity_collision",
        );
      const offeringRef = boundedRefSchema.parse(
        `offering:${businessId}:${material.ids.capabilityId}`,
      );
      const before = await ownerSupplyReadback(businessId);
      if (
        before.offerings
          .map(record)
          .some((candidate) => candidate?.offeringRef === offeringRef)
      )
        throw new GatewaySmokeError("gateway_smoke_owner_fixture_preexisting");
      const createOfferingOperationKey = `ae-release-smoke:${options.runId}:offering:create`;
      const createOfferingCommand = {
        businessId,
        offeringRef,
        facts: {
          name: options.runId,
          category: "release-smoke",
          summary: `Run-scoped release smoke operation ${options.runId}.`,
          serviceAreaSummary: "Production release smoke.",
          availabilitySummary: "Available only for this release smoke run.",
        },
        operationKey: createOfferingOperationKey,
        correlationId: createOfferingOperationKey,
      };
      const createOfferingSourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command: createOfferingCommand,
        scope: "catalog_publish",
        operationKey: createOfferingOperationKey,
        correlationId: createOfferingOperationKey,
        env: options.env,
      });
      const createdOffering = record(
        await (await transport()).mutation(createOfferingMutation, {
          ...createOfferingCommand,
          sourceWriteRequest: sourceWriteRequestFromAdmission(
            createOfferingSourceWrite,
          ),
          sourceWrite: createOfferingSourceWrite,
        }),
      );
      if (
        createdOffering?.kind !== "ok" ||
        createdOffering.resultRef !== offeringRef ||
        createdOffering.currentRevision !== 1
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_offering_create_refused",
        );
      const publishOfferingOperationKey = `ae-release-smoke:${options.runId}:offering:publish`;
      const publishOfferingCommand = {
        businessId,
        offeringRef,
        expectedRevision: 1,
        status: "published" as const,
        operationKey: publishOfferingOperationKey,
        correlationId: publishOfferingOperationKey,
      };
      const publishOfferingSourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command: publishOfferingCommand,
        scope: "catalog_publish",
        operationKey: publishOfferingOperationKey,
        correlationId: publishOfferingOperationKey,
        env: options.env,
      });
      const publishedOffering = record(
        await (await transport()).mutation(retireOfferingMutation, {
          ...publishOfferingCommand,
          sourceWriteRequest: sourceWriteRequestFromAdmission(
            publishOfferingSourceWrite,
          ),
          sourceWrite: publishOfferingSourceWrite,
        }),
      );
      if (publishedOffering?.kind !== "ok")
        throw new GatewaySmokeError("gateway_smoke_owner_offering_publish_refused");
      partialOffering = { businessId, offeringRef, offeringRevision: 1 };
      const afterCatalog = await ownerSupplyReadback(businessId);
      const offerings = afterCatalog.offerings
        .map(record)
        .filter(
          (candidate) =>
            candidate?.offeringRef === offeringRef &&
            candidate.name === options.runId &&
            candidate.status === "published",
        );
      if (
        offerings.length !== 1 ||
        offerings[0] === undefined ||
        typeof offerings[0].revision !== "number" ||
        !Number.isSafeInteger(offerings[0].revision) ||
        offerings[0].revision < 1 ||
        typeof offerings[0].sourceHash !== "string" ||
        !digestSchema.safeParse(offerings[0].sourceHash).success
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_catalog_readback_invalid",
        );
      const offeringRevision = z
        .number()
        .int()
        .positive()
        .parse(offerings[0].revision);
      const offeringSourceHash = digestSchema.parse(offerings[0].sourceHash);
      partialOffering = {
        businessId,
        offeringRef,
        offeringRevision,
        offeringSourceHash,
      };
      const durableMaterial = ownerSourceForRun({
        runId: options.runId,
        ownerQuery: options.ownerQuery,
        ownerOpenApiDocument: options.ownerOpenApiDocument,
        ownerOpenApiPath: options.ownerOpenApiPath,
        ownerOpenApiMethod: options.ownerOpenApiMethod,
        input: options.input,
        origin: {
          kind: "catalog_offering",
          offeringRef,
          offeringRevision,
          offeringSourceHash,
        },
      });
      const prepared = await prepareOwnerPublicationMaterial({
        source: durableMaterial.source,
        sourceRevision: durableMaterial.ids.sourceRevision,
        evidenceRefs: [durableMaterial.ids.evidenceRef],
      });
      const publicationOperationKey = `ae-release-smoke:${options.runId}:publication`;
      const publicationCommand = {
        businessId,
        offeringRef,
        revision: offeringRevision,
        sourceHash: offeringSourceHash,
        runtimeEnvironment: "production" as const,
        prepared,
        operationKey: publicationOperationKey,
        correlationId: publicationOperationKey,
        reasonCode: "release_smoke_create",
        evidenceRefs: [material.ids.evidenceRef],
      };
      const publicationSourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command: publicationCommand,
        scope: "catalog_publish",
        operationKey: publicationOperationKey,
        correlationId: publicationOperationKey,
        env: options.env,
      });
      publicationMayExist = true;
      const published = record(
        await (
          await transport()
        ).mutation(publishMutation, {
          ...publicationCommand,
          sourceWriteRequest: sourceWriteRequestFromAdmission(
            publicationSourceWrite,
          ),
          sourceWrite: publicationSourceWrite,
        }),
      );
      if (
        published !== undefined &&
        published.kind !== "published" &&
        published.kind !== "replayed"
      )
        publicationMayExist = false;
      if (
        published === undefined ||
        (published.kind !== "published" && published.kind !== "replayed") ||
        typeof published.publicationRef !== "string" ||
        typeof published.publicationRevision !== "number" ||
        typeof published.operationRef !== "string" ||
        !operationRefSchema.safeParse(published.operationRef).success
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_publication_create_refused",
        );
      const publicationRef = boundedRefSchema.parse(published.publicationRef);
      const publicationRevision = z
        .number()
        .int()
        .positive()
        .parse(published.publicationRevision);
      const operationRef = operationRefSchema.parse(published.operationRef);
      const createdFixture: GatewayOwnerFixtureIdentity = {
        businessId,
        businessName,
        offeringRef,
        offeringRevision,
        offeringSourceHash,
        publicationRef,
        publicationRevision,
        operationRef,
      };
      fixture = createdFixture;
      partialOffering = undefined;
      publicationMayExist = false;
      if (
        published.offeringId !== material.ids.capabilityOfferingId ||
        published.bindingId !== material.ids.bindingId ||
        published.sourceDigest !== prepared.sourceDigest
      )
        throw new GatewaySmokeError(
          "gateway_smoke_owner_publication_create_refused",
        );
      const readinessOperationKey = `ae-release-smoke:${options.runId}:readiness`;
      const readiness = record(
        await (
          await transport()
        ).action(readinessAction, {
          businessId,
          offeringRef,
          offeringRevision,
          offeringSourceHash,
          publicationRef,
          publicationRevision,
          operationKey: readinessOperationKey,
        }),
      );
      if (
        readiness?.step !== "readiness" ||
        readiness.state !== "completed" ||
        readiness.offeringRef !== offeringRef ||
        readiness.revision !== offeringRevision ||
        readiness.publicationRef !== publicationRef ||
        readiness.operationRef !== operationRef
      )
        throw new GatewaySmokeError("gateway_smoke_owner_readiness_refused");
      return createdFixture;
    } catch (error) {
      const cleanupFailures: unknown[] = [];
      if (
        fixture === undefined &&
        publicationMayExist &&
        partialOffering !== undefined
      ) {
        try {
          const current = partialOffering;
          const readback = await ownerSupplyReadback(current.businessId);
          const candidates = readback.offerings
            .map(record)
            .filter(
              (candidate) =>
                candidate?.offeringRef === current.offeringRef &&
                candidate.name === options.runId,
            );
          const candidate = candidates.length === 1 ? candidates[0] : undefined;
          const publication = record(candidate?.publication);
          if (
            candidate === undefined ||
            typeof candidate.revision !== "number" ||
            typeof candidate.sourceHash !== "string" ||
            typeof publication?.publicationRef !== "string" ||
            typeof publication.publicationRevision !== "number" ||
            typeof publication.operationRef !== "string"
          )
            throw new GatewaySmokeError(
              "gateway_smoke_owner_publication_cleanup_identity_unavailable",
            );
          fixture = {
            businessId: current.businessId,
            businessName: boundedRefSchema.parse(
              record(readback.business)?.name,
            ),
            offeringRef: current.offeringRef,
            offeringRevision: z
              .number()
              .int()
              .positive()
              .parse(candidate.revision),
            offeringSourceHash: digestSchema.parse(candidate.sourceHash),
            publicationRef: boundedRefSchema.parse(publication.publicationRef),
            publicationRevision: z
              .number()
              .int()
              .positive()
              .parse(publication.publicationRevision),
            operationRef: operationRefSchema.parse(publication.operationRef),
          };
          partialOffering = undefined;
          publicationMayExist = false;
        } catch {
          cleanupFailures.push(
            new GatewaySmokeError(
              "gateway_smoke_owner_publication_cleanup_identity_unavailable",
            ),
          );
        }
      }
      if (fixture !== undefined) {
        try {
          await withdraw(fixture.operationRef);
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
        try {
          await readWithdrawnOperation(fixture.operationRef);
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
        try {
          await retireOffering();
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
      } else if (partialOffering !== undefined) {
        try {
          await retirePartialOffering();
        } catch (cleanupError) {
          cleanupFailures.push(cleanupError);
        }
      }
      if (cleanupFailures.length > 0)
        throw gatewaySmokeFailureWithCleanup(error, cleanupFailures);
      fixture = undefined;
      partialOffering = undefined;
      throw error;
    }
  };
  const readAuthority = async (
    operationRef: string,
  ): Promise<HostedOwnerAuthority> => {
    const currentFixture = fixture;
    if (
      currentFixture === undefined ||
      currentFixture.operationRef !== operationRef
    )
      throw new GatewaySmokeError("gateway_smoke_owner_authority_unavailable");
    const result = await ownerSupplyReadback(currentFixture.businessId);
    const business = record(result.business);
    if (business?.name !== currentFixture.businessName)
      throw new GatewaySmokeError("gateway_smoke_owner_authority_unavailable");
    const candidates = result.offerings
      .map(record)
      .filter(
        (offering) => offering?.offeringRef === currentFixture.offeringRef,
      );
    if (candidates.length !== 1)
      throw new GatewaySmokeError("gateway_smoke_owner_authority_ambiguous");
    const offering = candidates[0];
    const publication = record(offering?.publication);
    if (
      offering?.name !== options.runId ||
      offering.status !== "published" ||
      offering.revision !== currentFixture.offeringRevision ||
      offering.sourceHash !== currentFixture.offeringSourceHash ||
      publication?.publicationRef !== currentFixture.publicationRef ||
      publication.publicationRevision !== currentFixture.publicationRevision ||
      publication.operationRef !== currentFixture.operationRef ||
      publication.state !== "current"
    )
      throw new GatewaySmokeError("gateway_smoke_owner_authority_unavailable");
    const source = record(publication.source);
    const contractRef = record(publication.contractRef);
    const binding = record(publication.binding);
    if (record(binding?.authority)?.kind !== "keyless")
      throw new GatewaySmokeError("gateway_smoke_owner_authority_malformed");
    const parsed = z
      .strictObject({
        businessName: boundedRefSchema,
        offeringName: boundedRefSchema,
        publicationRef: boundedRefSchema,
        sourceDigest: digestSchema,
        contractDigest: digestSchema,
        bindingId: boundedRefSchema,
        bindingDigest: digestSchema,
        offeringRevision: z.number().int().positive(),
        offeringSourceHash: digestSchema,
        publicationRevision: z.number().int().positive(),
      })
      .safeParse({
        businessName: business.name,
        offeringName: offering.name,
        publicationRef: publication.publicationRef,
        sourceDigest: source?.digest,
        contractDigest: contractRef?.contractDigest,
        bindingId: binding?.bindingId,
        bindingDigest: binding?.bindingDigest,
        offeringRevision: offering.revision,
        offeringSourceHash: offering.sourceHash,
        publicationRevision: publication.publicationRevision,
      });
    if (!parsed.success)
      throw new GatewaySmokeError("gateway_smoke_owner_authority_malformed");
    return parsed.data;
  };
  const accountQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:readCreditAccount",
  );
  const usageQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:readKeyUsage",
  );
  const activityQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:listCreditActivity",
  );
  const earningsQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:readOwnerProviderEarnings",
  );
  const topupQuery = sourceQuery<Record<string, unknown>, unknown>(
    "moneyLedger:readCreditTopupCommand",
  );

  const readSnapshot = async (): Promise<HostedMoneySnapshot> => {
    const client = await transport();
    const [accountResult, usageResult, earningsResult] = await Promise.all([
      client.query(accountQuery, { principalId, currency }),
      client.query(usageQuery, { principalId, credentialId, currency }),
      client.query(earningsQuery, {}),
    ]);
    const account = record(accountResult);
    const usage = record(usageResult);
    if (account?.kind !== "ok" || usage?.kind !== "ok")
      throw new GatewaySmokeError("gateway_smoke_money_source_refused");
    const accountFields = { ...account };
    const usageFields = { ...usage };
    delete accountFields.kind;
    delete usageFields.kind;
    return {
      buyer: CreditAccountViewSchema.parse(accountFields),
      usage: KeyUsageViewSchema.parse(usageFields),
      supplier: parseGatewayOwnerProviderEarnings(
        earningsResult,
        controlBusinessId,
        currency,
      ),
    };
  };

  const readActivity = async (
    invocationRef: string,
  ): Promise<StrictCreditActivityView> => {
    const result = record(
      await (
        await transport()
      ).query(activityQuery, {
        principalId,
        credentialId,
        currency,
        paginationOpts: { numItems: 100, cursor: null },
      }),
    );
    const page = Array.isArray(result?.page) ? result.page : [];
    const matches = page.flatMap((item) => {
      const parsed = CreditActivityViewSchema.safeParse(item);
      return parsed.success && parsed.data.invocationRef === invocationRef
        ? [parsed.data]
        : [];
    });
    if (matches.length !== 1 || matches[0] === undefined) {
      throw new GatewaySmokeError(
        "gateway_smoke_money_activity_missing_or_ambiguous",
      );
    }
    return matches[0];
  };

  const readProviderTransfers = async (
    transferGroup: string,
  ): Promise<GatewayPayoutProviderTransferReadback> => {
    const transfers = await readStripeTransfersByGroup({
      config: stripeConfig,
      client: stripe,
      transferGroup,
    });
    if (isMoneyRefusal(transfers))
      throw new GatewaySmokeError(`gateway_smoke_payout_${transfers.code}`);
    return sanitizeGatewayPayoutProviderTransfers(
      transferGroup,
      transfers.map(({ transferId }) => transferId),
    );
  };

  const topupReadback = async (
    input: Readonly<{ externalRef: string; idempotencyKey: string }>,
  ): Promise<HostedTopupReadback> => {
    const payment = await readTopupPaymentThroughSource(input, context, {
      env: options.env,
      mode: "live",
      config: stripeConfig,
    });
    if (!("evidence" in payment))
      throw new GatewaySmokeError(`gateway_smoke_topup_${payment.code}`);
    if (
      payment.evidence.status !== "succeeded" ||
      payment.evidence.externalRef !== input.externalRef
    ) {
      throw new GatewaySmokeError("gateway_smoke_topup_payment_not_succeeded");
    }
    const result = record(await (await transport()).query(topupQuery, input));
    const command = record(result?.command);
    if (
      result?.kind !== "accepted" ||
      command === undefined ||
      command.state !== "succeeded"
    ) {
      throw new GatewaySmokeError("gateway_smoke_topup_command_missing");
    }
    const readString = (key: string): string => {
      const value = command[key];
      if (typeof value !== "string" || value.length === 0) {
        throw new GatewaySmokeError(`gateway_smoke_topup_${key}_missing`);
      }
      return value;
    };
    const readOptionalString = (key: string): string | undefined => {
      const value = command[key];
      return typeof value === "string" && value.length > 0 ? value : undefined;
    };
    if (
      readString("principalId") !== principalId ||
      readString("accountRef") !== accountRef ||
      readString("externalRef") !== input.externalRef ||
      readString("idempotencyKey") !== input.idempotencyKey
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_command_identity_mismatch",
      );
    const checkoutSessionDigest = readString("checkoutSessionDigest");
    const paymentIntentDigest = readOptionalString("paymentIntentDigest");
    const paymentId = readOptionalString("paymentId");
    if (
      readString("requestDigest") !== payment.evidence.requestDigest ||
      readString("metadataDigest") !== payment.evidence.metadataDigest ||
      readString("evidenceDigest") !== payment.evidence.evidenceDigest ||
      readString("providerEvidenceRef") !== payment.evidence.evidenceRef ||
      checkoutSessionDigest !== payment.evidence.checkoutSessionDigest ||
      paymentIntentDigest !== payment.evidence.paymentIntentDigest ||
      paymentId !== payment.evidence.paymentId
    )
      throw new GatewaySmokeError("gateway_smoke_topup_evidence_mismatch");
    const amount = (key: string): ExactAmount =>
      exactAmountSchema.parse({
        currency: readString("currency"),
        units: readString(key),
        exponent: command.exponent,
      });
    const checkoutCreatedAt = command.createdAt;
    if (
      !Number.isSafeInteger(checkoutCreatedAt) ||
      Number(checkoutCreatedAt) <= 0
    ) {
      throw new GatewaySmokeError("gateway_smoke_topup_created_at_missing");
    }
    return {
      topupCommandRef: readString("commandRef"),
      buyerPrincipalDigest: canonicalDigest({ principalId }),
      paymentEvidenceRef: payment.evidence.evidenceRef,
      paymentEvidenceDigest: payment.evidence.evidenceDigest,
      paymentRequestDigest: payment.evidence.requestDigest,
      paymentMetadataDigest: payment.evidence.metadataDigest,
      checkoutSessionDigest,
      ...(paymentIntentDigest === undefined ? {} : { paymentIntentDigest }),
      ...(paymentId === undefined ? {} : { paymentId }),
      externalRef: input.externalRef,
      idempotencyKey: input.idempotencyKey,
      stripeEventId: readString("appliedStripeEventId"),
      stripePayloadDigest: readString("appliedPayloadDigest"),
      transactionRef: readString("appliedTransactionRef"),
      creditAmount: amount("amountUnits"),
      processingFee: amount("processingFeeUnits"),
      chargeAmount: amount("chargeAmountUnits"),
      checkoutCreatedAt: Number(checkoutCreatedAt),
      buyerBalanceBefore: exactAmountSchema.parse(command.buyerBalanceBefore),
      buyerBalanceAfter: exactAmountSchema.parse(command.buyerBalanceAfter),
    };
  };

  const beginTopup = async (): Promise<GatewayTopupPreparationArtifact> => {
    const begun = await beginCreditTopupThroughSource(
      {
        principalId,
        amount: topupAmount,
        idempotencyKey: topupIdempotencyKey,
      },
      context,
      {
        env: options.env,
        mode: "live",
        config: stripeConfig,
        resolveOwnerId: async () => ownerUserId,
      },
    );
    if (begun.kind !== "ok")
      throw new GatewaySmokeError(`gateway_smoke_topup_${begun.code}`);
    const evidence = begun.session.evidence;
    if (
      evidence.status !== "pending" ||
      evidence.observedAt < options.approvedAt ||
      !sameAmount(evidence.amount, chargeAmount)
    )
      throw new GatewaySmokeError("gateway_smoke_topup_preparation_invalid");
    return topupPreparationSchema.parse({
      schemaVersion: 1,
      kind: "operation_gateway_topup_preparation",
      status: "awaiting_payment",
      sourceRevision: required(
        options.env.AE_RELEASE_SOURCE_REVISION,
        "AE_RELEASE_SOURCE_REVISION",
      ),
      runId: options.runId,
      approvedAt: new Date(options.approvedAt).toISOString(),
      checkoutCreatedAt: new Date(evidence.observedAt).toISOString(),
      commandRef: begun.commandRef,
      externalRef: evidence.externalRef,
      idempotencyKey: topupIdempotencyKey,
      creditAmount: topupAmount,
      chargeAmount,
      paymentRequestDigest: evidence.requestDigest,
      paymentMetadataDigest: evidence.metadataDigest,
      checkoutSessionDigest: evidence.checkoutSessionDigest,
      operatorAction:
        "complete_the_stripe_checkout_before_dispatching_complete",
    });
  };

  const readTopupWebhookCapture = async (
    externalRef: string,
    stripeEventId: string,
    checkoutCreatedAt: number,
  ): Promise<Readonly<{ rawBody: string; signature: string }>> => {
    let startingAfter: string | undefined;
    const created = Math.floor(checkoutCreatedAt / 1_000);
    try {
      for (let page = 0; page < MAX_TOPUP_EVENT_PAGES; page += 1) {
        const events = await stripe.events.list({
          types: [
            "checkout.session.completed",
            "checkout.session.async_payment_succeeded",
          ],
          created: { gte: created },
          limit: 100,
          ...(startingAfter === undefined
            ? {}
            : { starting_after: startingAfter }),
        });
        for (const event of events.data) {
          if (event.id !== stripeEventId) continue;
          const eventObject = record(event.data.object);
          if (eventObject?.id !== externalRef) continue;
          if (!event.livemode)
            throw new GatewaySmokeError(
              "gateway_smoke_topup_webhook_event_mode_mismatch",
            );
          const rawBody = JSON.stringify(event);
          if (
            new TextEncoder().encode(rawBody).byteLength >
            MAX_TOPUP_WEBHOOK_RAW_BODY_BYTES
          )
            throw new GatewaySmokeError(
              "gateway_smoke_topup_webhook_event_too_large",
            );
          const signature = stripe.webhooks.generateTestHeaderString({
            payload: rawBody,
            secret: stripeConfig.webhookSecret,
          });
          if (
            new TextEncoder().encode(signature).byteLength >
            MAX_TOPUP_WEBHOOK_SIGNATURE_BYTES
          )
            throw new GatewaySmokeError(
              "gateway_smoke_topup_webhook_signature_too_large",
            );
          return { rawBody, signature };
        }
        if (!events.has_more || events.data.length === 0) break;
        const last = events.data[events.data.length - 1];
        if (last === undefined || last.id === startingAfter) break;
        startingAfter = last.id;
      }
    } catch (error) {
      if (error instanceof GatewaySmokeError) throw error;
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_event_lookup_failed",
      );
    }
    throw new GatewaySmokeError("gateway_smoke_topup_webhook_event_not_found");
  };

  const observeTopup = async (
    expected: GatewayTopupPreparationArtifact,
  ): Promise<GatewayTopupObservation> => {
    const sourceRevision = required(
      options.env.AE_RELEASE_SOURCE_REVISION,
      "AE_RELEASE_SOURCE_REVISION",
    );
    if (
      expected.sourceRevision !== sourceRevision ||
      expected.runId !== options.runId ||
      expected.idempotencyKey !== topupIdempotencyKey ||
      new Date(expected.approvedAt).getTime() !== options.approvedAt ||
      !sameAmount(expected.creditAmount, topupAmount) ||
      !sameAmount(expected.chargeAmount, chargeAmount)
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_preparation_identity_mismatch",
      );

    const readback = await topupReadback(expected);
    if (
      readback.topupCommandRef !== expected.commandRef ||
      readback.paymentRequestDigest !== expected.paymentRequestDigest ||
      readback.paymentMetadataDigest !== expected.paymentMetadataDigest ||
      readback.checkoutSessionDigest !== expected.checkoutSessionDigest ||
      readback.checkoutCreatedAt !==
        new Date(expected.checkoutCreatedAt).getTime()
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_preparation_binding_mismatch",
      );

    const { rawBody, signature } = await readTopupWebhookCapture(
      expected.externalRef,
      readback.stripeEventId,
      readback.checkoutCreatedAt,
    );
    const verified = await verifyStripeMoneyWebhook({
      rawBody,
      signature,
      config: stripeConfig,
      mode: "live",
      client: stripe,
    });
    if (
      isMoneyRefusal(verified) ||
      verified.kind !== "checkout" ||
      verified.status !== "paid" ||
      verified.externalRef !== expected.externalRef ||
      verified.commandRef !== readback.topupCommandRef ||
      verified.stripeEventId !== readback.stripeEventId ||
      verified.payloadDigest !== readback.stripePayloadDigest
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_identity_or_verification_failed",
      );

    const providerEvent = topupProviderEventSchema.parse({
      status: "observed",
      stripeEventId: verified.stripeEventId,
      eventType: verified.eventType,
      externalRef: verified.externalRef,
      commandRef: verified.commandRef,
      runId: expected.runId,
      observedAt: new Date(verified.observedAt).toISOString(),
      amount: verified.amount,
    });

    const buyerBeforeReplay = await readSnapshot();
    if (
      !sameAmount(buyerBeforeReplay.buyer.balance, readback.buyerBalanceAfter)
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_replay_before_balance_mismatch",
      );
    const bypassSecret = resolveVercelProtectionBypassSecret(options.env);
    const postWebhookReplay = async (): Promise<
      Readonly<{
        status: number;
        replay: Record<string, unknown> | undefined;
      }>
    > => {
      const response = await options.fetch(
        `${options.baseUrl}/api/stripe/webhook`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "stripe-signature": signature,
            ...(bypassSecret === undefined
              ? {}
              : { "x-vercel-protection-bypass": bypassSecret }),
          },
          body: rawBody,
        },
      );
      let responseBody: unknown;
      try {
        responseBody = JSON.parse(await response.text()) as unknown;
      } catch {
        throw new GatewaySmokeError(
          "gateway_smoke_topup_webhook_replay_response_malformed",
        );
      }
      return { status: response.status, replay: record(responseBody) };
    };
    const firstReplay = await postWebhookReplay();
    const secondReplay = await postWebhookReplay();
    const assertReplay = (
      result: Readonly<{
        status: number;
        replay: Record<string, unknown> | undefined;
      }>,
    ): void => {
      if (
        result.status !== 200 ||
        result.replay?.kind !== "accepted" ||
        result.replay.status !== "replayed" ||
        result.replay.appliedRef !== readback.transactionRef
      )
        throw new GatewaySmokeError(
          "gateway_smoke_topup_webhook_replay_not_confirmed",
        );
    };
    assertReplay(firstReplay);
    assertReplay(secondReplay);
    const replay = secondReplay.replay;
    if (replay === undefined)
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_replay_not_confirmed",
      );

    const buyerAfterReplay = await readSnapshot();
    const creditDelta = subtractExactAmounts(
      buyerAfterReplay.buyer.balance,
      buyerBeforeReplay.buyer.balance,
    );
    if (
      creditDelta === undefined ||
      !sameAmount(creditDelta, zeroAmount(creditDelta))
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_replay_changed_credit",
      );
    const replayReadback = await topupReadback(expected);
    if (
      replayReadback.transactionRef !== readback.transactionRef ||
      replayReadback.stripeEventId !== readback.stripeEventId ||
      replayReadback.stripePayloadDigest !== readback.stripePayloadDigest ||
      !sameAmount(
        replayReadback.buyerBalanceBefore,
        readback.buyerBalanceBefore,
      ) ||
      !sameAmount(
        replayReadback.buyerBalanceAfter,
        buyerAfterReplay.buyer.balance,
      )
    )
      throw new GatewaySmokeError(
        "gateway_smoke_topup_webhook_replay_readback_mismatch",
      );
    const webhookReplay = topupWebhookReplaySchema.parse({
      status: "replayed",
      signatureVerified: true,
      stripeEventId: verified.stripeEventId,
      stripePayloadDigest: verified.payloadDigest,
      rawBodyDigest: canonicalDigest(rawBody),
      signatureDigest: canonicalDigest({
        format: "stripe-signature:v1",
        signature,
      }),
      commandRef: readback.topupCommandRef,
      transactionRef: readback.transactionRef,
      appliedRef: replay.appliedRef,
      buyerBalanceBefore: buyerBeforeReplay.buyer.balance,
      buyerBalanceAfter: buyerAfterReplay.buyer.balance,
      creditDelta,
    });
    return { readback, providerEvent, webhookReplay };
  };

  const payoutReadback = async (
    input: Readonly<{
      payoutRef: string;
      idempotencyKey: string;
      amount?: ExactAmount;
    }>,
    begin: boolean,
  ): Promise<StrictLivePayoutReceipt> => {
    const result = begin
      ? await runOwnerPayoutTransferThroughSource(
          {
            businessId: controlBusinessId,
            currency,
            payoutRef: input.payoutRef,
            amount: exactAmountSchema.parse(input.amount),
            idempotencyKey: input.idempotencyKey,
          },
          context,
        )
      : await readOwnerPayoutTransferThroughSource(
          {
            businessId: controlBusinessId,
            currency,
            payoutRef: input.payoutRef,
            idempotencyKey: input.idempotencyKey,
          },
          context,
        );
    if (result.kind !== "ok")
      throw new GatewaySmokeError(`gateway_smoke_payout_${result.code}`);
    const transfer = record(result.transfer);
    if (
      transfer === undefined ||
      transfer.state !== "paid" ||
      transfer.transferStatus !== "succeeded" ||
      typeof transfer.stripeTransferId !== "string" ||
      typeof transfer.evidenceDigest !== "string"
    )
      throw new GatewaySmokeError(
        "gateway_smoke_payout_transfer_not_succeeded",
      );
    return StrictLivePayoutReceiptSchema.parse({
      payoutRef: transfer.payoutRef,
      payoutCommandId: transfer.payoutCommandId,
      supplierBusinessId: controlBusinessId,
      payoutAccountRef: accountRefForProvider(controlBusinessId, currency),
      stripeAccountDigest: canonicalDigest({
        format: "stripe-account:v1",
        destinationAccountId: transfer.destinationAccountId,
      }),
      stripeTransferDigest: canonicalDigest({
        format: "stripe-transfer:v1",
        transferId: transfer.stripeTransferId,
      }),
      transferEvidenceDigest: transfer.evidenceDigest,
      providerNetAmount: transfer.amount,
      providerHeldBefore: transfer.providerHeldBefore,
      providerHeldAfter: transfer.providerHeldAfter,
      providerPaidBefore: transfer.providerPaidBefore,
      providerPaidAfter: transfer.providerPaidAfter,
      replayAdditionalDebits: 0,
    });
  };

  const withdraw = async (
    operationRef: string,
  ): Promise<Readonly<{ kind: "refused"; code: "operation_withdrawn" }>> => {
    const currentFixture = fixture;
    if (
      currentFixture === undefined ||
      currentFixture.operationRef !== operationRef
    ) {
      throw new GatewaySmokeError(
        "gateway_smoke_owner_withdraw_identity_missing",
      );
    }
    const authority = await readAuthority(operationRef);
    if (
      authority.publicationRef !== currentFixture.publicationRef ||
      authority.publicationRevision !== currentFixture.publicationRevision ||
      authority.offeringRevision !== currentFixture.offeringRevision ||
      authority.offeringSourceHash !== currentFixture.offeringSourceHash
    )
      throw new GatewaySmokeError(
        "gateway_smoke_owner_withdraw_identity_changed",
      );
    const operationKey = `ae-release-smoke:${options.runId}:withdraw:${currentFixture.publicationRevision}`;
    const command = {
      businessId: currentFixture.businessId,
      offeringRef: currentFixture.offeringRef,
      offeringRevision: currentFixture.offeringRevision,
      offeringSourceHash: currentFixture.offeringSourceHash,
      publicationRef: currentFixture.publicationRef,
      publicationRevision: currentFixture.publicationRevision,
      operationKey,
      correlationId: operationKey,
      reasonCode: "release_smoke_withdraw",
      evidenceRefs: [`ae-release-smoke:${options.runId}:owner-source`],
    };
    const sourceWrite = await sourceWriteAdmissionFromContext({
      context,
      command,
      scope: "catalog_publish",
      operationKey,
      correlationId: operationKey,
      env: options.env,
    });
    const result = record(
      await (
        await transport()
      ).mutation(withdrawMutation, {
        ...command,
        sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
        sourceWrite,
      }),
    );
    if (result?.kind !== "withdrawn")
      throw new GatewaySmokeError("gateway_smoke_owner_withdraw_refused");
    return { kind: "refused", code: "operation_withdrawn" };
  };

  const retireOffering = async (): Promise<GatewayOwnerFixtureCleanup> => {
    const currentFixture = fixture;
    if (currentFixture === undefined)
      throw new GatewaySmokeError("gateway_smoke_owner_fixture_missing");
    const before = await ownerSupplyReadback(currentFixture.businessId);
    const beforeOffering = before.offerings
      .map(record)
      .find(
        (candidate) => candidate?.offeringRef === currentFixture.offeringRef,
      );
    const beforePublication = record(beforeOffering?.publication);
    if (
      beforeOffering === undefined ||
      beforePublication === undefined ||
      beforeOffering.name !== options.runId ||
      beforeOffering.revision !== currentFixture.offeringRevision ||
      beforeOffering.sourceHash !== currentFixture.offeringSourceHash ||
      beforePublication.publicationRef !== currentFixture.publicationRef ||
      beforePublication.state !== "withdrawn"
    )
      throw new GatewaySmokeError(
        "gateway_smoke_owner_cleanup_identity_changed",
      );
    if (beforeOffering.status !== "retired") {
      const operationKey = `ae-release-smoke:${options.runId}:retire:${currentFixture.offeringRevision}`;
      const command = {
        businessId: currentFixture.businessId,
        offeringRef: currentFixture.offeringRef,
        expectedRevision: currentFixture.offeringRevision,
        status: "retired" as const,
        operationKey,
        correlationId: operationKey,
      };
      const sourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command,
        scope: "catalog_publish",
        operationKey,
        correlationId: operationKey,
        env: options.env,
      });
      const result = record(
        await (
          await transport()
        ).mutation(retireOfferingMutation, {
          ...command,
          sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
          sourceWrite,
        }),
      );
      if (result?.kind !== "ok")
        throw new GatewaySmokeError("gateway_smoke_owner_retire_refused");
    }
    const after = await ownerSupplyReadback(currentFixture.businessId);
    const afterOffering = after.offerings
      .map(record)
      .find(
        (candidate) => candidate?.offeringRef === currentFixture.offeringRef,
      );
    const afterPublication = record(afterOffering?.publication);
    if (
      afterOffering === undefined ||
      afterPublication === undefined ||
      afterOffering.status !== "retired" ||
      afterOffering.sourceHash !== currentFixture.offeringSourceHash ||
      afterPublication.publicationRef !== currentFixture.publicationRef ||
      afterPublication.state !== "withdrawn"
    )
      throw new GatewaySmokeError(
        "gateway_smoke_owner_cleanup_readback_invalid",
      );
    fixture = undefined;
    return { publicationState: "withdrawn", offeringStatus: "retired" };
  };

  const readWithdrawnOperation = async (
    operationRef: string,
  ): Promise<Readonly<{ kind: "refused"; code: "operation_withdrawn" }>> => {
    const response = await requestJson(
      options.fetch,
      `${options.baseUrl}/api/v1/market-operations/detail`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ operationRef }),
      },
      "",
    );
    const detail = operationDetailOutputSchema.safeParse(response.body);
    if (
      response.status === 200 &&
      detail.success &&
      detail.data.kind === "unavailable" &&
      detail.data.operationRef === operationRef &&
      detail.data.reason === "publisher_withdrew"
    )
      return { kind: "refused", code: "operation_withdrawn" };
    throw new GatewaySmokeError(
      "gateway_smoke_withdrawn_operation_not_source_attributed",
    );
  };

  let revokePromise:
    | Promise<
        Readonly<{
          kind: "refused";
          code: "authentication_required";
          credentialDigest: string;
        }>
      >
    | undefined;
  const revokeCredential = async (
    operationRef: string | undefined,
    input: Readonly<Record<string, JsonValue>>,
  ): Promise<
    Readonly<{
      kind: "refused";
      code: "authentication_required";
      credentialDigest: string;
    }>
  > => {
    revokePromise ??= (async () => {
      const proof = await credentialProof();
      const revoked = await clerk.apiKeys.revoke({
        apiKeyId: proof.credentialId,
        revocationReason: "Agentic Economy release smoke completed",
      });
      const current = await clerk.apiKeys.get(proof.credentialId);
      if (
        revoked.id !== proof.credentialId ||
        !revoked.revoked ||
        current.id !== proof.credentialId ||
        !current.revoked
      ) {
        throw new GatewaySmokeError(
          "gateway_smoke_api_key_revocation_unconfirmed",
        );
      }
      if (operationRef !== undefined) {
        const idempotencyKey = `ae-release-smoke:revoked:${canonicalDigest({ credentialId: proof.credentialId, operationRef })}`;
        const response = await requestJson(
          options.fetch,
          `${options.baseUrl}${OPERATION_INVOKE_HTTP_PATH}`,
          {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              authorization: `Bearer ${options.apiKey}`,
            },
            body: JSON.stringify({ operationRef, input, idempotencyKey }),
          },
          options.apiKey,
        );
        const problem = record(response.body);
        if (
          response.status !== 401 ||
          problem?.code !== "authentication_required"
        ) {
          throw new GatewaySmokeError("gateway_smoke_revoked_key_not_refused");
        }
      }
      return {
        kind: "refused",
        code: "authentication_required",
        credentialDigest: canonicalDigest({
          credentialId: proof.credentialId,
        }),
      };
    })();
    return await revokePromise;
  };

  const owner: HostedOwnerRuntime = {
    createFixture,
    replayMcp: async (operation, idempotencyKey) => {
      const response = await requestJson(
        options.fetch,
        `${options.baseUrl}/mcp`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: idempotencyKey,
            method: "tools/call",
            params: {
              name: "ae_operation_invoke",
              arguments: {
                operationRef: operation.operationRef,
                input: options.input,
                idempotencyKey,
              },
            },
          }),
        },
        options.apiKey,
      );
      const envelope = record(response.body);
      const result = record(envelope?.result);
      return parseGatewayInvocationResponse(
        {
          status: response.status,
          body: result?.structuredContent ?? result?.content,
        },
        operation.operationRef,
      );
    },
    readActivity,
    readAuthority,
    withdraw,
    retireOffering,
  };
  const money: HostedMoneyRuntime = {
    mode: "live",
    principalId,
    accountRef,
    businessId: controlBusinessId,
    readWithdrawnOperation,
    preflightCredential,
    revokeCredential,
    credentialId,
    topupIdempotencyKey,
    topupChargeAmount: chargeAmount,
    payoutRef,
    payoutIdempotencyKey,
    readSnapshot,
    readProviderTransfers,
    beginTopup,
    observeTopup,
    readControlActivity: readActivity,
    beginPayout: async (input) => await payoutReadback(input, true),
    readPayout: async (input) => await payoutReadback(input, false),
  };
  return { owner, money };
}
