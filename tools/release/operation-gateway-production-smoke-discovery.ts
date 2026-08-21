import { z } from "zod";

import { canonicalDigest } from "../../src/modules/common/canonical-digest";
import { rescaleExactAmount } from "../../src/modules/money/public";
import {
  operationDetailOutputSchema,
  operationSearchOutputSchema,
  type PublicOperationDescriptor,
} from "../../src/modules/capability-supply/public";
import { PublicServicesApiSchemaVersion } from "../../src/modules/registry/public";
import {
  GatewaySmokeError,
  MAX_ENDPOINT_COUNT,
  MAX_SERVICE_COUNT,
  MAX_SERVICE_PAGES,
  SERVICES_PAGE_LIMIT,
  authenticationSchema,
  boundedRefSchema,
  digestSchema,
  operationRefSchema,
} from "./operation-gateway-production-smoke-receipt";
import {
  requestJson,
  type GatewayHttpResponse,
} from "./operation-gateway-production-smoke-invocation";

const serviceEndpointIdentitySchema = z.object({
  ae: z.object({
    operationRef: operationRefSchema.optional(),
    offeringRef: boundedRefSchema,
    authentication: authenticationSchema,
  }),
});
const serviceIdentitySchema = z.object({
  id: boundedRefSchema,
  endpoints: z.array(serviceEndpointIdentitySchema).max(MAX_ENDPOINT_COUNT),
});
const servicesPageSchema = z.object({
  kind: z.literal("ok"),
  schemaVersion: z.literal(PublicServicesApiSchemaVersion),
  services: z.array(serviceIdentitySchema).max(SERVICES_PAGE_LIMIT),
  isDone: z.boolean(),
  continueCursor: z.string().max(512),
});

type GatewaySmokeDiscoveryConfig = Readonly<{
  baseUrl: string;
  fetch: typeof globalThis.fetch;
}>;

export type GatewayServiceOperation = Readonly<{
  serviceId: string;
  offeringRef: string;
  authentication: z.infer<typeof authenticationSchema>;
}>;
export type GatewayServiceDiscovery = Readonly<{
  operations: ReadonlyMap<string, GatewayServiceOperation>;
  serviceCount: number;
  endpointCount: number;
}>;

export async function discoverGatewayServices(
  config: GatewaySmokeDiscoveryConfig,
): Promise<GatewayServiceDiscovery> {
  const operations = new Map<string, GatewayServiceOperation>();
  let serviceCount = 0;
  let endpointCount = 0;
  let cursor: string | undefined;

  for (let pageNumber = 0; pageNumber < MAX_SERVICE_PAGES; pageNumber += 1) {
    const url = new URL("/api/v1/services", config.baseUrl);
    url.searchParams.set("limit", String(SERVICES_PAGE_LIMIT));
    if (cursor !== undefined) url.searchParams.set("cursor", cursor);
    const response: GatewayHttpResponse = await requestJson(
      config.fetch,
      url.href,
      { method: "GET", headers: { accept: "application/json" } },
      "",
    );
    const parsed = servicesPageSchema.safeParse(response.body);
    if (response.status < 200 || response.status >= 300 || !parsed.success)
      throw new GatewaySmokeError("gateway_smoke_services_page_malformed");

    serviceCount += parsed.data.services.length;
    endpointCount += parsed.data.services.reduce(
      (total, service) => total + service.endpoints.length,
      0,
    );
    if (serviceCount > MAX_SERVICE_COUNT || endpointCount > MAX_ENDPOINT_COUNT)
      throw new GatewaySmokeError("gateway_smoke_services_count_limit");

    for (const service of parsed.data.services) {
      for (const endpoint of service.endpoints) {
        const operationRef = endpoint.ae.operationRef;
        if (operationRef === undefined) continue;
        if (operations.has(operationRef))
          throw new GatewaySmokeError(
            "gateway_smoke_service_operation_link_ambiguous",
          );
        operations.set(operationRef, {
          serviceId: service.id,
          offeringRef: endpoint.ae.offeringRef,
          authentication: endpoint.ae.authentication,
        });
      }
    }

    if (parsed.data.isDone) return { operations, serviceCount, endpointCount };
    const nextCursor = parsed.data.continueCursor.trim();
    if (nextCursor.length === 0 || nextCursor === cursor)
      throw new GatewaySmokeError("gateway_smoke_services_cursor_invalid");
    cursor = nextCursor;
  }

  throw new GatewaySmokeError("gateway_smoke_services_page_limit_exceeded");
}

export function matchGatewayServiceOperation(
  discovery: GatewayServiceDiscovery,
  operation: PublicOperationDescriptor,
  role: "owner" | "control",
): GatewayServiceOperation {
  const linked = discovery.operations.get(operation.operationRef);
  if (linked === undefined)
    throw new GatewaySmokeError(
      `gateway_smoke_${role}_operation_service_link_missing`,
    );
  if (linked.offeringRef !== operation.offering.offeringRef)
    throw new GatewaySmokeError(
      `gateway_smoke_${role}_service_offering_mismatch`,
    );
  if (
    canonicalDigest(linked.authentication) !==
    canonicalDigest(operation.authentication)
  )
    throw new GatewaySmokeError(
      `gateway_smoke_${role}_service_authentication_mismatch`,
    );
  if (role === "owner" && linked.authentication.kind !== "keyless")
    throw new GatewaySmokeError("gateway_smoke_owner_operation_not_keyless");
  if (
    role === "control" &&
    linked.authentication.kind !== "platform_credential" &&
    linked.authentication.kind !== "x402"
  )
    throw new GatewaySmokeError(
      "gateway_smoke_control_operation_authentication_unsupported",
    );
  return linked;
}

export async function discoverOperation(
  config: GatewaySmokeDiscoveryConfig,
  query: string,
  observedAt: number,
  role: "owner" | "control",
): Promise<PublicOperationDescriptor> {
  const response: GatewayHttpResponse = await requestJson(
    config.fetch,
    `${config.baseUrl}/api/v1/market-operations/search`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, limit: 20 }),
    },
    "",
  );
  const search = operationSearchOutputSchema.safeParse(response.body);
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !search.success ||
    search.data.kind !== "ok"
  )
    throw new GatewaySmokeError("gateway_smoke_search_result_malformed");
  for (const candidate of search.data.items) {
    if (role === "owner" && candidate.authentication.kind !== "keyless")
      continue;
    if (role === "control" && candidate.authentication.kind === "keyless")
      continue;
    if (
      role === "control" &&
      gatewayOperationRejectionReason(candidate, observedAt) !== undefined
    )
      continue;
    const detail: GatewayHttpResponse = await requestJson(
      config.fetch,
      `${config.baseUrl}/api/v1/market-operations/detail`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ operationRef: candidate.operationRef }),
      },
      "",
    );
    const found = operationDetailOutputSchema.safeParse(detail.body);
    if (
      detail.status >= 200 &&
      detail.status < 300 &&
      found.success &&
      found.data.kind === "found" &&
      found.data.operation.operationRef === candidate.operationRef &&
      found.data.operation.availability.posture === "routeable" &&
      found.data.operation.availability.validUntil !== undefined &&
      found.data.operation.availability.validUntil > observedAt &&
      found.data.operation.provenance.publisher === "provider_owned" &&
      (role === "owner" ||
        gatewayOperationRejectionReason(found.data.operation, observedAt) ===
          undefined)
    )
      return found.data.operation;
  }
  throw new GatewaySmokeError(`gateway_smoke_${role}_operation_not_found`);
}

export function gatewayOperationRejectionReason(
  operation: PublicOperationDescriptor,
  observedAt = Date.now(),
): string | undefined {
  if (operation.availability.posture !== "routeable")
    return "gateway_smoke_candidate_not_routeable";
  if (
    operation.availability.validUntil === undefined ||
    operation.availability.validUntil <= observedAt
  )
    return "gateway_smoke_candidate_stale";
  if (
    operation.provenance.publisher !== "provider_owned" &&
    operation.provenance.publisher !== "observed_external"
  )
    return "gateway_smoke_candidate_not_provider_owned_or_observed";
  if (operation.commercial.price.kind !== "fixed")
    return "gateway_smoke_candidate_price_not_fixed";
  if (operation.commercial.price.amount.units === "0")
    return "gateway_smoke_candidate_free";
  if (rescaleExactAmount(operation.commercial.price.amount, 2) === undefined)
    return "gateway_smoke_candidate_price_not_cent_exact";
  if (
    operation.commercial.priceEvidence?.priceDigest === undefined ||
    !digestSchema.safeParse(operation.commercial.priceEvidence.priceDigest)
      .success
  )
    return "gateway_smoke_candidate_price_evidence_missing";
  return undefined;
}
