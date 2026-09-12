import { z } from "zod";

import type { JsonValue } from "../../src/modules/capability-contract/public";
import { canonicalDigest } from "../../src/modules/common/canonical-digest";
import {
  formatExactAmount,
  rescaleExactAmount,
} from "../../src/modules/money/public";
import {
  toolChoiceDescribeOutputSchema,
  toolChoiceSearchOutputSchema,
  type PublicToolChoice,
} from "../../src/modules/registry/tool-choice-contracts";
import { registryDetailAction } from "../../src/modules/registry/registry.actions";
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
} from "./tool-gateway-production-smoke-receipt";
import {
  requestGatewayToolQuote,
  requestJson,
  type GatewayToolQuote,
  type GatewayHttpResponse,
} from "./tool-gateway-production-smoke-call";

const serviceEndpointIdentitySchema = z.object({
  ae: z.object({
    toolRef: z.string().regex(/^operation:v1:[0-9a-f]{64}$/u).optional(),
    offeringRef: boundedRefSchema,
    authentication: authenticationSchema,
    authorityMode: z
      .enum([
        "provider_owned",
        "ae_curated_external",
        "third_party_gateway",
        "observed_external",
      ])
      .optional(),
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
  hasMore: z.boolean(),
  nextCursor: z.string().min(1).max(512).optional(),
});

type GatewaySmokeDiscoveryConfig = Readonly<{
  baseUrl: string;
  apiKey: string;
  input: Readonly<Record<string, JsonValue>>;
  fetch: typeof globalThis.fetch;
}>;

type GatewayToolDescription = Extract<
  z.infer<typeof toolChoiceDescribeOutputSchema>,
  { kind: "found" }
>["tool"];

export type GatewayDiscoveredTool = Readonly<{
  toolRef: string;
  businessId: string;
  offeringRef: string;
  search: PublicToolChoice;
  description: GatewayToolDescription;
  quote: GatewayToolQuote;
  authorityMode:
    | "provider_owned"
    | "ae_curated_external"
    | "third_party_gateway"
    | "observed_external"
    | undefined;
}>;

export type GatewayServiceTool = Readonly<{
  serviceId: string;
  offeringRef: string;
  authentication: z.infer<typeof authenticationSchema>;
  authorityMode?:
    | "provider_owned"
    | "ae_curated_external"
    | "third_party_gateway"
    | "observed_external"
    | undefined;
}>;
export type GatewayServiceDiscovery = Readonly<{
  tools: ReadonlyMap<string, GatewayServiceTool>;
  serviceCount: number;
  endpointCount: number;
}>;

export async function discoverGatewayServices(
  config: GatewaySmokeDiscoveryConfig,
): Promise<GatewayServiceDiscovery> {
  const tools = new Map<string, GatewayServiceTool>();
  let serviceCount = 0;
  let endpointCount = 0;
  let cursor: string | undefined;

  for (let pageNumber = 0; pageNumber < MAX_SERVICE_PAGES; pageNumber += 1) {
    const url = new URL("/api/v1/businesses", config.baseUrl);
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
        const toolRef = endpoint.ae.toolRef;
        if (toolRef === undefined) continue;
        if (tools.has(toolRef))
          throw new GatewaySmokeError(
            "gateway_smoke_service_tool_link_ambiguous",
          );
        tools.set(toolRef, {
          serviceId: service.id,
          offeringRef: endpoint.ae.offeringRef,
          authentication: endpoint.ae.authentication,
          authorityMode: endpoint.ae.authorityMode,
        });
      }
    }

    if (!parsed.data.hasMore) return { tools, serviceCount, endpointCount };
    const nextCursor = parsed.data.nextCursor?.trim() ?? "";
    if (nextCursor.length === 0 || nextCursor === cursor)
      throw new GatewaySmokeError("gateway_smoke_services_cursor_invalid");
    cursor = nextCursor;
  }

  throw new GatewaySmokeError("gateway_smoke_services_page_limit_exceeded");
}

export function matchGatewayServiceTool(
  discovery: GatewayServiceDiscovery,
  tool: Pick<GatewayDiscoveredTool, "toolRef" | "offeringRef" | "description">,
  role: "owner" | "control",
): GatewayServiceTool {
  const linked = discovery.tools.get(tool.toolRef);
  if (linked === undefined)
    throw new GatewaySmokeError(
      `gateway_smoke_${role}_tool_service_link_missing`,
    );
  if (linked.offeringRef !== tool.offeringRef)
    throw new GatewaySmokeError(
      `gateway_smoke_${role}_service_offering_mismatch`,
    );
  if (
    canonicalDigest(linked.authentication) !==
    canonicalDigest(tool.description.authentication)
  )
    throw new GatewaySmokeError(
      `gateway_smoke_${role}_service_authentication_mismatch`,
    );
  if (role === "owner" && linked.authentication.kind !== "ae_api_key")
    throw new GatewaySmokeError("gateway_smoke_owner_tool_not_brokered");
  if (
    role === "control" &&
    linked.authentication.kind !== "platform_credential" &&
    linked.authentication.kind !== "x402"
  )
    throw new GatewaySmokeError(
      "gateway_smoke_control_tool_authentication_unsupported",
    );
  if (linked.authorityMode !== "provider_owned")
    throw new GatewaySmokeError(
      `gateway_smoke_${role}_tool_not_provider_owned`,
    );
  return linked;
}

export async function discoverTool(
  config: GatewaySmokeDiscoveryConfig,
  query: string,
  observedAt: number,
  role: "owner" | "control",
  discovery: GatewayServiceDiscovery,
): Promise<GatewayDiscoveredTool> {
  const response: GatewayHttpResponse = await requestJson(
    config.fetch,
    `${config.baseUrl}/api/v1/market-tools/search`,
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
  const search = toolChoiceSearchOutputSchema.safeParse(response.body);
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !search.success ||
    search.data.kind !== "ok"
  )
    throw new GatewaySmokeError("gateway_smoke_search_result_malformed");
  for (const candidate of search.data.items) {
    const linked = discovery.tools.get(candidate.toolRef);
    if (linked === undefined || linked.authorityMode !== "provider_owned")
      continue;
    const detail: GatewayHttpResponse = await requestJson(
      config.fetch,
      `${config.baseUrl}/api/v1/market-tools/describe`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ toolRef: candidate.toolRef }),
      },
      "",
    );
    const found = toolChoiceDescribeOutputSchema.safeParse(detail.body);
    if (
      detail.status >= 200 &&
      detail.status < 300 &&
      found.success &&
      found.data.kind === "found" &&
      found.data.tool.toolRef === candidate.toolRef &&
      publicChoiceIdentity(candidate, found.data.tool)
    ) {
      if (
        (role === "owner" && linked.authentication.kind !== "ae_api_key") ||
        (role === "control" && linked.authentication.kind === "ae_api_key") ||
        canonicalDigest(linked.authentication) !==
          canonicalDigest(found.data.tool.authentication)
      )
        continue;
      const businessId = await readPublicBusinessIdentity(
        config,
        candidate,
        linked.offeringRef,
        role,
      );
      const quote = await requestGatewayToolQuote(config, candidate);
      if (quote.kind !== "committed") continue;
      const selected: GatewayDiscoveredTool = {
        toolRef: candidate.toolRef,
        businessId,
        offeringRef: linked.offeringRef,
        search: candidate,
        description: found.data.tool,
        quote,
        authorityMode: linked.authorityMode,
      };
      if (
        role === "control" &&
        gatewayToolRejectionReason(selected, observedAt) !== undefined
      )
        continue;
      return selected;
    }
  }
  throw new GatewaySmokeError(`gateway_smoke_${role}_tool_not_found`);
}

async function readPublicBusinessIdentity(
  config: GatewaySmokeDiscoveryConfig,
  candidate: PublicToolChoice,
  offeringRef: string,
  role: "owner" | "control",
): Promise<string> {
  const providerSlug = candidate.provider.slug.trim();
  if (providerSlug.length === 0)
    throw new GatewaySmokeError(
      `gateway_smoke_${role}_business_identity_unavailable`,
    );
  const response = await requestJson(
    config.fetch,
    `${config.baseUrl}/api/businesses/${encodeURIComponent(providerSlug)}`,
    { method: "GET", headers: { accept: "application/json" } },
    "",
  );
  const parsed = registryDetailAction.outputSchema.safeParse(response.body);
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !parsed.success ||
    parsed.data.kind !== "found"
  )
    throw new GatewaySmokeError(
      `gateway_smoke_${role}_business_identity_unavailable`,
    );
  const business = parsed.data.business;
  const businessId = boundedRefSchema.safeParse(business.businessId);
  if (
    !businessId.success ||
    business.slug !== candidate.provider.slug ||
    business.name !== candidate.provider.name ||
    !business.offerings.some(
      (offering) => offering.offeringRef === offeringRef,
    )
  )
    throw new GatewaySmokeError(
      `gateway_smoke_${role}_business_identity_mismatch`,
    );
  return businessId.data;
}

function publicChoiceIdentity(
  candidate: PublicToolChoice,
  description: GatewayToolDescription,
): boolean {
  return (
    canonicalDigest({
      toolRef: candidate.toolRef,
      capabilityId: candidate.capabilityId,
      title: candidate.title,
      description: candidate.description,
      provider: candidate.provider,
      priceLabel: candidate.priceLabel,
      healthStatus: candidate.healthStatus,
    }) ===
    canonicalDigest({
      toolRef: description.toolRef,
      capabilityId: description.capabilityId,
      title: description.title,
      description: description.description,
      provider: description.provider,
      priceLabel: description.priceLabel,
      healthStatus: description.healthStatus,
    })
  );
}

export function gatewayToolRejectionReason(
  tool: GatewayDiscoveredTool,
  observedAt = Date.now(),
): string | undefined {
  if (tool.description.healthStatus !== "operational")
    return "gateway_smoke_candidate_not_routeable";
  if (tool.quote.expiresAt <= observedAt)
    return "gateway_smoke_candidate_stale";
  if (tool.authorityMode !== "provider_owned")
    return "gateway_smoke_candidate_not_provider_owned_or_observed";
  if (tool.quote.price.units === "0")
    return "gateway_smoke_candidate_free";
  const exactPrice = formatExactAmount(tool.quote.price);
  if (
    exactPrice === undefined ||
    tool.description.priceLabel !==
      `${tool.quote.price.currency} ${exactPrice}`
  )
    return "gateway_smoke_candidate_price_not_fixed";
  if (rescaleExactAmount(tool.quote.price, 2) === undefined)
    return "gateway_smoke_candidate_price_not_cent_exact";
  if (
    !digestSchema.safeParse(tool.quote.evidenceDigest).success
  )
    return "gateway_smoke_candidate_price_evidence_missing";
  return undefined;
}
