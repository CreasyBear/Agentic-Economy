import { canonicalDigest } from '@/modules/common/canonical-digest';
import { isRecord } from "@/modules/common/is-record";
import { isDirectoryEntryEligible } from "@/modules/capability-contract/public";
import { formatCurrencyAmount, type ExactAmount } from "@/modules/money/public";

import type { BazaarAdmission } from "./publication-importer-x402-bazaar";
import type {
  CapabilityPublicationImport,
  CanonicalCapabilityPublicationDraft,
} from "./publication-importer-types";
import {
  parseX402FetchTransportConfiguration,
  validPublicHttpsEndpoint,
  type X402FetchTransportConfiguration,
} from "./transport-adapters";
import { degradeBackend } from "@/lib/observability/degrade-backend";

export const FACILITATOR_DISCOVERY_URLS = [
  "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources",
  "https://facilitator.payai.network/discovery/resources",
] as const;
export const FACILITATOR_DISCOVERY_DEFAULT_PAGE_SIZE = 20 as const;
export const FACILITATOR_DISCOVERY_MAX_PAGE_SIZE = 100 as const;

export const FACILITATOR_DISCOVERY_PUBLISHER_REF = "system:facilitator-discovery";
export const FACILITATOR_DISCOVERY_NETWORK = "eip155:8453" as const;
export const FACILITATOR_DISCOVERY_ASSET =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const FACILITATOR_DISCOVERY_ASSET_EXPONENT = 6 as const;
export const FACILITATOR_DISCOVERY_PAYMENT_PROFILES = Object.freeze([
  Object.freeze({
    network: FACILITATOR_DISCOVERY_NETWORK,
    asset: FACILITATOR_DISCOVERY_ASSET,
    assetExponent: FACILITATOR_DISCOVERY_ASSET_EXPONENT,
  }),
  Object.freeze({
    network: "eip155:84532" as const,
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const,
    assetExponent: FACILITATOR_DISCOVERY_ASSET_EXPONENT,
  }),
]);
export const FACILITATOR_DISCOVERY_MAX_ACCEPTS = 20 as const;

export const FACILITATOR_DISCOVERY_EVIDENCE_REF = "source:facilitator-discovery";
const MAX_ATOMIC_DIGITS = 78;


export type FacilitatorDiscoverySkipReason =
  | "bazaar_missing"
  | "bazaar_discovery_invalid"
  | "schema_missing"
  | "transport_unsupported"
  | "scheme_unsupported"
  | "chain_unsupported"
  | "asset_unsupported"
  | "amount_invalid"
  | "payment_terms_invalid"
  | "resource_invalid"
  | "source_invalid";

export type FacilitatorDiscoverySkip = Readonly<{
  kind: "skip";
  reason: FacilitatorDiscoverySkipReason;
}>;

export type FacilitatorDiscoveryPriceBreakdown = Readonly<{
  provider: ExactAmount;
  platformFee: ExactAmount;
  total: ExactAmount;
  feeBps: 0;
}>;

export type FacilitatorDiscoveryAdmitCandidate = Readonly<{
  kind: "admit";
  import: Extract<CapabilityPublicationImport, { kind: "x402" }>;
  identity: DiscoveryHttpIdentity;
  price: FacilitatorDiscoveryPriceBreakdown;
}>;

export type FacilitatorDiscoveryDecision =
  | FacilitatorDiscoverySkip
  | FacilitatorDiscoveryAdmitCandidate;

export type FacilitatorDiscoveryPage = Readonly<{
  items: readonly unknown[];
  nextOffset?: number;
  nextCursor?: string;
}>;

export type FacilitatorDiscoveryAdmittedDraft = Readonly<
  {
    offering: CanonicalCapabilityPublicationDraft["offering"] & Readonly<{
      origin: { kind: "standalone" };
    }>;
    binding: Omit<CanonicalCapabilityPublicationDraft["binding"], "adapter"> & Readonly<{
      adapter: Readonly<{
        adapterId: "x402-fetch:v2";
        config: X402FetchTransportConfiguration;
      }>;
    }>;
    execution: Readonly<{
        endpoint: Readonly<{ url: string }>;
        method: "GET" | "POST";
        bodyPointer?: "/body";
        queryObjectPointer?: "/query";
        query?: Readonly<{
          inputPointer: string;
          parameter: string;
          required?: boolean;
        }>[];
      }>;
    price: FacilitatorDiscoveryPriceBreakdown;
    sourceImportJson: string;
    sourceRevision: string;
  }
>;

export type FacilitatorDiscoveryAdmissionResult = Readonly<{
  admitted: readonly FacilitatorDiscoveryAdmittedDraft[];
  skipped: readonly FacilitatorDiscoverySkip[];
}>;

export function parseFacilitatorDiscoveryPage(
  document: unknown,
): FacilitatorDiscoveryPage | undefined {
  if (!isRecord(document) || !Array.isArray(document.items)) return undefined;
  if (document.items.length > FACILITATOR_DISCOVERY_MAX_PAGE_SIZE) return undefined;
  const pagination = isRecord(document.pagination) ? document.pagination : undefined;
  const offset = readNonNegativeSafeInteger(pagination?.offset ?? document.offset);
  const limit = readPositiveSafeInteger(pagination?.limit ?? document.limit);
  const total = readNonNegativeSafeInteger(pagination?.total ?? document.total);
  const nextOffset =
    offset !== undefined && limit !== undefined && total !== undefined &&
    offset + document.items.length < total && Number.isSafeInteger(offset + document.items.length)
      ? offset + document.items.length
      : undefined;
  const cursor = pagination?.nextCursor ?? pagination?.cursor ?? document.nextCursor;
  const nextCursor = typeof cursor === "string" && cursor.length > 0 && cursor.length <= 2_000
    ? cursor
    : undefined;
  return {
    items: document.items,
    ...(nextOffset === undefined ? {} : { nextOffset }),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}

export function decideFacilitatorDiscoveryItem(
  item: unknown,
  bazaar: BazaarAdmission = { kind: "absent" },
): FacilitatorDiscoveryDecision {
  const paymentRequired = paymentRequiredFromDiscoveryItem(item);
  if (paymentRequired === undefined) return { kind: "skip", reason: "resource_invalid" };
  const resource = isRecord(paymentRequired.resource) ? paymentRequired.resource : undefined;
  const resourceUrl = typeof resource?.url === "string" ? resource.url : undefined;
  const endpoint = resourceUrl === undefined ? undefined : admittedResourceUrl(resourceUrl);
  if (endpoint === undefined) return { kind: "skip", reason: "resource_invalid" };

  if (bazaar.kind === "absent") return { kind: "skip", reason: "bazaar_missing" };
  if (bazaar.kind === "refused") {
    return {
      kind: "skip",
      reason: bazaar.reason === "selector_invalid"
        ? "payment_terms_invalid"
        : bazaar.reason,
    };
  }

  // Directory eligibility gate (src/modules/market/x402-directory-index.ts:
  // isDirectoryEntryEligible). Default-deny: an item with no `quality`
  // telemetry at all is treated the same as one reporting zero payers
  // (discoveryQualityPayersOrder's -1 sentinel) rather than skipping the
  // check - unverifiable adoption is not eligible, so it fails the payer
  // floor instead of being admitted on trust. Bazaar admission above already
  // guarantees an output schema, so only the payer floor can fail here.
  const payersOrder = discoveryQualityPayersOrder(item) ?? -1;
  if (!isDirectoryEntryEligible({ hasOutputSchema: true, hasOutputExample: false, payersOrder })) {
    return { kind: "skip", reason: "resource_invalid" };
  }

  const accept = firstSupportedAccept(paymentRequired.accepts);
  if (accept.kind === "refused") return { kind: "skip", reason: accept.reason };
  const price = priceBreakdown(accept.amount, accept.assetExponent);
  if (price === undefined) return { kind: "skip", reason: "amount_invalid" };
  const identity = normalizedHttpIdentity(endpoint, bazaar.method, accept.network, accept.asset);
  const providerPrice: ExactAmount = {
    currency: "USDC",
    units: accept.amount,
    exponent: accept.assetExponent,
  };
  const capabilityId = capabilityIdFromIdentity(identity);
  const offeringLabel = discoveryOfferingLabel(resource, capabilityId);
  const offeringSummary = boundedResourceText(resource?.description, 1_000) ??
    "Facilitator-discovered Market Operation.";
  const sourceImport: Extract<CapabilityPublicationImport, { kind: "x402" }> = {
    kind: "x402",
    resource: {
      resourceUrl: endpoint,
      price: providerPrice,
      method: bazaar.method,
      scheme: "exact",
      network: accept.network,
      asset: accept.asset,
      payTo: accept.payTo,
      routeAmountExponent: accept.assetExponent,
      assetAmountExponent: accept.assetExponent,
      paymentRequired,
      inputSchema: bazaar.inputSchema,
      outputSchema: bazaar.outputSchema,
      ...(bazaar.query === undefined ? {} : { query: bazaar.query }),
      ...(bazaar.path === undefined ? {} : { path: bazaar.path }),
      ...(bazaar.pathTemplate === undefined ? {} : { pathTemplate: bazaar.pathTemplate }),
      ...(bazaar.bodyPointer === undefined ? {} : { bodyPointer: bazaar.bodyPointer }),
      ...(bazaar.queryObjectPointer === undefined ? {} : { queryObjectPointer: bazaar.queryObjectPointer }),
    },
    contract: {
      capabilityId,
      version: 1,
      name: offeringLabel,
      description: offeringSummary,
      inputExamples: bazaar.inputExample === undefined ? [] : [{
        label: "Provider example", input: bazaar.inputExample,
      }],
      customerAnnotations: [],
      dataUse: Object.keys(bazaar.inputSchema.properties ?? {}).map((name) => ({
        effectId: "provider_data_use", inputPointer: `/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`,
        classification: "public" as const, phase: "preparation" as const,
        recipient: { kind: "selected_binding" as const }, purposes: ["Perform the requested Tool"],
      })),
      effects: Object.keys(bazaar.inputSchema.properties ?? {}).length === 0 ? [] : [{
        effectId: "provider_data_use", class: "data_release", authority: "explicit", reversibility: "not_applicable",
      }],
      evidence: [],
      lifecycle: { idempotency: "required", recovery: "reconcile_required" },
    },
    commercial: {
      offering: {
        offeringId: `offering:facilitator-discovery:${capabilityId}`,
        networkId: "ae:public",
        presentation: {
          label: offeringLabel,
          summary: offeringSummary,
          // Kept as an input to importX402Capability's anti-fraud check
          // (publication-importer-x402.ts:129, no pricing config in scope
          // there — see report), which validates it against the resource's
          // own declared price. admittedFacilitatorDiscoveryDraft below
          // overrides this to on_request before the offering is persisted.
          price: { kind: "fixed", amount: providerPrice },
          materialTerms: [],
          commercialRelationship: {
            kind: "none",
            summary: "Facilitator discovery ingest; no commercial influence.",
            influencesEligibility: false,
            influencesInclusion: false,
            influencesOrder: false,
            evidenceRefs: [FACILITATOR_DISCOVERY_EVIDENCE_REF],
          },
        },
        searchTerms: [...searchTermsForOffering(resource, capabilityId)],
        registrationEvidenceRefs: [FACILITATOR_DISCOVERY_EVIDENCE_REF],
      },
      bindingId: `binding:facilitator-discovery:${capabilityId}`,
      authority: {
        kind: "provider_connection",
        connectionRef: "connection:facilitator-discovery",
        providerRef: "provider:facilitator-discovery",
      },
      registrationEvidenceRefs: [FACILITATOR_DISCOVERY_EVIDENCE_REF],
      requestTimeoutMs: 10_000,
    },
    evidenceRefs: [FACILITATOR_DISCOVERY_EVIDENCE_REF],
  };
  return { kind: "admit", import: sourceImport, identity, price };
}

export function parseFacilitatorDiscoverySourceImport(
  value: string,
): Extract<CapabilityPublicationImport, { kind: "x402" }> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) && parsed.kind === "x402"
      ? parsed as Extract<CapabilityPublicationImport, { kind: "x402" }>
      : undefined;
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: "parseFacilitatorDiscoverySourceImport", reason: "invalid_response" });
  }
}

export function isAllowlistedFacilitatorDiscoveryUrl(value: string): boolean {
  return (FACILITATOR_DISCOVERY_URLS as readonly string[]).includes(value);
}

export function paymentRequiredFromDiscoveryItem(
  item: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (!isRecord(item)) return undefined;
  const resource = discoveryResourceRecord(item);
  if (resource === undefined || !Array.isArray(item.accepts) || item.accepts.length < 1) {
    return undefined;
  }
  if (item.x402Version !== undefined) {
    return item.x402Version === 2 ? { ...item, resource } : undefined;
  }
  return {
    x402Version: 2,
    resource,
    accepts: item.accepts,
    ...(isRecord(item.extensions) ? { extensions: item.extensions } : {}),
  };
}

function discoveryResourceRecord(
  item: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined {
  if (isRecord(item.resource)) return item.resource;
  if (typeof item.resource !== "string") return undefined;
  return {
    url: item.resource,
    ...(typeof item.description === "string" ? { description: item.description } : {}),
    ...(typeof item.serviceName === "string" ? { serviceName: item.serviceName } : {}),
    ...(Array.isArray(item.tags) ? { tags: item.tags } : {}),
  };
}

type AcceptResult =
  | Readonly<{
      kind: "valid";
      amount: string;
      payTo: string;
      network: (typeof FACILITATOR_DISCOVERY_PAYMENT_PROFILES)[number]["network"];
      asset: (typeof FACILITATOR_DISCOVERY_PAYMENT_PROFILES)[number]["asset"];
      assetExponent: 6;
    }>
  | Readonly<{ kind: "refused"; reason: FacilitatorDiscoverySkipReason }>;

function firstSupportedAccept(value: unknown): AcceptResult {
  if (!Array.isArray(value) || value.length > FACILITATOR_DISCOVERY_MAX_ACCEPTS) {
    return { kind: "refused", reason: "payment_terms_invalid" };
  }
  let sawExact = false;
  let sawChain = false;
  let sawAsset = false;
  let sawAmount = false;
  for (const candidate of value) {
    if (!isRecord(candidate) || candidate.scheme !== "exact") continue;
    sawExact = true;
    const profile = FACILITATOR_DISCOVERY_PAYMENT_PROFILES.find(
      ({ network }) => network === candidate.network,
    );
    if (profile === undefined) {
      sawChain = true;
      continue;
    }
    if (
      typeof candidate.asset !== "string" ||
      candidate.asset.toLowerCase() !== profile.asset.toLowerCase()
    ) {
      sawAsset = true;
      continue;
    }
    if (
      typeof candidate.amount !== "string" ||
      !/^[1-9][0-9]*$/.test(candidate.amount) ||
      candidate.amount.length > MAX_ATOMIC_DIGITS
    ) {
      sawAmount = true;
      continue;
    }
    if (typeof candidate.payTo !== "string" || candidate.payTo.trim().length === 0) continue;
    return {
      kind: "valid",
      amount: candidate.amount,
      payTo: candidate.payTo,
      network: profile.network,
      asset: profile.asset,
      assetExponent: profile.assetExponent,
    };
  }
  if (!sawExact) return { kind: "refused", reason: "scheme_unsupported" };
  if (sawChain) return { kind: "refused", reason: "chain_unsupported" };
  if (sawAsset) return { kind: "refused", reason: "asset_unsupported" };
  if (sawAmount) return { kind: "refused", reason: "amount_invalid" };
  return { kind: "refused", reason: "payment_terms_invalid" };
}

function priceBreakdown(amount: string, exponent: number): FacilitatorDiscoveryPriceBreakdown | undefined {
  if (!/^[1-9][0-9]*$/.test(amount) || amount.length > MAX_ATOMIC_DIGITS) return undefined;
  try {
    const providerUnits = BigInt(amount);
    const feeUnits = 0n;
    const provider = exactAtomicAmount(providerUnits, exponent);
    const platformFee = exactAtomicAmount(feeUnits, exponent);
    const total = exactAtomicAmount(providerUnits + feeUnits, exponent);
    return provider === undefined || platformFee === undefined || total === undefined
      ? undefined
      : { provider, platformFee, total, feeBps: 0 };
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: "priceBreakdown", reason: "invalid_response" });
  }
}

function exactAtomicAmount(units: bigint, exponent: number): ExactAmount | undefined {
  const value = units.toString();
  return value.length > MAX_ATOMIC_DIGITS
    ? undefined
    : { currency: "USDC", units: value, exponent };
}

export function admittedFacilitatorDiscoveryDraft(
  normalized: CanonicalCapabilityPublicationDraft,
  decision: FacilitatorDiscoveryAdmitCandidate,
  sourceRevision: string,
): FacilitatorDiscoveryAdmittedDraft {
  const materialTerms = [
    ...normalized.offering.presentation.materialTerms,
    { termId: "provider-amount", label: "Listed Provider amount", value: formatCurrencyAmount(decision.price.provider) },
    { termId: "buyer-total", label: "Buyer total", value: "Confirmed in AUD by a binding Quote for your input." },
  ].slice(0, 64);
  const { price: _discoveredProviderPrice, ...presentationWithoutPrice } = normalized.offering.presentation;
  const offering: FacilitatorDiscoveryAdmittedDraft["offering"] = {
    ...normalized.offering,
    origin: { kind: "standalone" },
    presentation: {
      ...presentationWithoutPrice,
      materialTerms,
    },
  };
  const config = parseX402FetchTransportConfiguration(normalized.binding.adapter.config);
  if (config === undefined) throw new Error("facilitator_discovery_x402_binding_invariant");
  const binding: FacilitatorDiscoveryAdmittedDraft["binding"] = {
    ...normalized.binding,
    adapter: { adapterId: "x402-fetch:v2", config },
  };
  const resource = isRecord(decision.import.resource) ? decision.import.resource : undefined;
  const query = Array.isArray(resource?.query) ? resource.query : undefined;
  return {
    offering,
    binding,
    execution: {
      // Identity is the bare callable endpoint. The full discovery resourceUrl,
      // which may carry example parameter values, stays on the source import's
      // resource and on the binding's endpointUrl for execution, and in the
      // toolRef digest so distinct resources at one path never collide.
      endpoint: { url: decision.identity.origin + decision.identity.path },
      method: decision.identity.method,
      ...(config.bodyPointer === undefined ? {} : { bodyPointer: config.bodyPointer }),
      ...(config.queryObjectPointer === undefined ? {} : { queryObjectPointer: config.queryObjectPointer }),
      ...(query === undefined ? {} : { query }),
    },
    price: decision.price,
    sourceImportJson: JSON.stringify(decision.import),
    sourceRevision,
  };
}

type DiscoveryHttpIdentity = Readonly<{
  method: "GET" | "POST"; origin: string; path: string; resourceUrl: string; network: string; asset: string;
}>;
function normalizedHttpIdentity(endpoint: string, method: "GET" | "POST", network: string, asset: string): DiscoveryHttpIdentity {
  const parsed = new URL(endpoint);
  return { method, origin: parsed.origin, path: parsed.pathname || "/", resourceUrl: parsed.href, network, asset: asset.toLowerCase() };
}

function capabilityIdFromIdentity(
  identity: DiscoveryHttpIdentity,
): string {
  const host = new URL(identity.origin).hostname
    .replace(/^www\./u, "")
    .replace(/[^a-z0-9]+/giu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
  const path = identity.path.replace(/^\//u, "").replace(/[^a-z0-9]+/giu, "-")
    .replace(/^-|-$/gu, "").toLowerCase();
  return `${`${identity.method.toLowerCase()}.${host || "endpoint"}.${path || "root"}`.slice(0, 115)}.${canonicalDigest({ method: identity.method, url: identity.resourceUrl, network: identity.network, asset: identity.asset }).slice(7)}`;
}

function admittedResourceUrl(resourceUrl: string): string | undefined {
  const parsed = validPublicHttpsEndpoint(resourceUrl);
  if (parsed === undefined || parsed.hash !== "") return undefined;
  return parsed.href;
}

function boundedResourceText(value: unknown, maximum: number): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum
    ? value.trim()
    : undefined;
}

function searchTermsFromResource(resource: Readonly<Record<string, unknown>> | undefined): string[] {
  const tags = Array.isArray(resource?.tags)
    ? resource.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0 && tag.length <= 120)
    : [];
  const name = boundedResourceText(resource?.serviceName, 160);
  return [...new Set([...(name === undefined ? [] : [name]), ...tags])].slice(0, 16);
}

function searchTermsForOffering(
  resource: Readonly<Record<string, unknown>> | undefined,
  capabilityId: string,
): readonly string[] {
  const terms = searchTermsFromResource(resource);
  const label = discoveryOfferingLabel(resource, capabilityId);
  const description = boundedResourceText(resource?.description, 120);
  const named = [
    ...terms,
    ...(label === capabilityId ? [] : [label]),
    ...(description === undefined ? [] : [description]),
  ];
  const unique = [...new Set(named.filter((term) => term.trim().length > 0))];
  return unique.length > 0 ? unique.slice(0, 16) : [capabilityId];
}

const DISCOVERY_PATH_LIKE =
  /^(?:https?:\/\/|(?:get|post|put|patch|delete|head|options)\.)/iu;
const DISCOVERY_NOISE_TOKENS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "api",
  "http",
  "https",
  "www",
  "json",
  "v0",
  "v1",
  "v2",
  "v3",
  "v4",
]);

function discoveryOfferingLabel(
  resource: Readonly<Record<string, unknown>> | undefined,
  capabilityId: string,
): string {
  const named = boundedResourceText(resource?.serviceName, 160);
  if (
    named !== undefined &&
    named !== capabilityId &&
    named.length >= 3 &&
    !DISCOVERY_PATH_LIKE.test(named) &&
    !named.includes("/") &&
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/iu.test(named)
  ) {
    return named;
  }
  const fromId = humanizeDiscoveryCapabilityId(capabilityId);
  if (fromId.length >= 3) return fromId;
  const fromDescription = firstDiscoveryPhrase(
    boundedResourceText(resource?.description, 160),
  );
  if (fromDescription !== undefined) return fromDescription;
  return named ?? capabilityId;
}

function humanizeDiscoveryCapabilityId(capabilityId: string): string {
  const path = capabilityId.replace(/\.[a-f0-9]{64}$/, "").split(".").slice(2).join("-");
  const tokens = path
    .split(/[-_]+/u)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0 && !DISCOVERY_NOISE_TOKENS.has(token));
  return tokens
    .join(" ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function firstDiscoveryPhrase(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const sentence = value.split(/(?<=[.!?])\s+/u)[0]?.replace(/[.]+$/u, "").trim();
  if (sentence === undefined || sentence.length < 3 || sentence.length > 80) {
    return undefined;
  }
  return sentence;
}

export function mapFacilitatorDiscoveryImporterRefusal(
  reason: string,
): FacilitatorDiscoverySkipReason {
  switch (reason) {
    case "bazaar_discovery_invalid": return "bazaar_discovery_invalid";
    case "schema_missing": return "schema_missing";
    case "transport_unsupported":
    case "payment_execution_unsupported": return "transport_unsupported";
    case "selector_invalid":
    case "payment_required_invalid":
    case "commercial_metadata_inconsistent": return "payment_terms_invalid";
    default: return "source_invalid";
  }
}

/** undefined = no discovery `quality` telemetry at all; the caller treats this the same as the -1 sentinel (unreported/invalid) so a missing signal fails the payer floor rather than skipping it. */
function discoveryQualityPayersOrder(item: unknown): number | undefined {
  if (!isRecord(item) || !isRecord(item.quality)) return undefined;
  const payers = item.quality.l30DaysUniquePayers;
  return typeof payers === "number" && Number.isSafeInteger(payers) && payers >= 0 ? payers : -1;
}

function readNonNegativeSafeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
function readPositiveSafeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
