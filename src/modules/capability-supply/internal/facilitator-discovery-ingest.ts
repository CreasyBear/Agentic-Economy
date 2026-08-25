import { isRecord } from "@/modules/common/is-record";
import type { ExactAmount } from "@/modules/money/public";

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
export const FACILITATOR_DISCOVERY_MAX_ACCEPTS = 20 as const;

const DISCOVERY_EVIDENCE_REF = "source:facilitator-discovery";
const MAX_ATOMIC_DIGITS = 78;
const FEE_BPS = 1_000n;
const BPS_DENOMINATOR = 10_000n;

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
  feeBps: 1_000;
}>;

export type FacilitatorDiscoveryAdmitCandidate = Readonly<{
  kind: "admit";
  import: Extract<CapabilityPublicationImport, { kind: "x402" }>;
  identity: Readonly<{ method: "GET" | "POST"; origin: string; path: string }>;
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

  const accept = firstSupportedAccept(paymentRequired.accepts);
  if (accept.kind === "refused") return { kind: "skip", reason: accept.reason };
  const price = priceBreakdown(accept.amount);
  if (price === undefined) return { kind: "skip", reason: "amount_invalid" };
  const identity = normalizedHttpIdentity(endpoint, bazaar.method);
  const providerPrice: ExactAmount = {
    currency: "USD",
    units: accept.amount,
    exponent: FACILITATOR_DISCOVERY_ASSET_EXPONENT,
  };
  const capabilityId = capabilityIdFromIdentity(identity);
  const sourceImport: Extract<CapabilityPublicationImport, { kind: "x402" }> = {
    kind: "x402",
    resource: {
      resourceUrl: endpoint,
      price: providerPrice,
      method: bazaar.method,
      scheme: "exact",
      network: FACILITATOR_DISCOVERY_NETWORK,
      asset: FACILITATOR_DISCOVERY_ASSET,
      payTo: accept.payTo,
      routeAmountExponent: FACILITATOR_DISCOVERY_ASSET_EXPONENT,
      assetAmountExponent: FACILITATOR_DISCOVERY_ASSET_EXPONENT,
      paymentRequired,
      inputSchema: bazaar.inputSchema,
      outputSchema: bazaar.outputSchema,
      ...(bazaar.query === undefined ? {} : { query: bazaar.query }),
    },
    contract: {
      capabilityId,
      version: 1,
      name: boundedResourceText(resource?.serviceName, 160) ?? capabilityId,
      description: boundedResourceText(resource?.description, 1_000) ??
        "Facilitator-discovered Market Operation.",
      customerAnnotations: [],
      dataUse: [],
      effects: [],
      evidence: [],
      lifecycle: { idempotency: "required", recovery: "reconcile_required" },
    },
    commercial: {
      offering: {
        offeringId: `offering:facilitator-discovery:${capabilityId}`,
        networkId: "ae:public",
        presentation: {
          label: boundedResourceText(resource?.serviceName, 160) ?? capabilityId,
          summary: boundedResourceText(resource?.description, 1_000) ??
            "Facilitator-discovered Market Operation.",
          price: { kind: "fixed", amount: providerPrice },
          materialTerms: [],
          commercialRelationship: {
            kind: "none",
            summary: "Facilitator discovery ingest; no commercial influence.",
            influencesEligibility: false,
            influencesInclusion: false,
            influencesOrder: false,
            evidenceRefs: [DISCOVERY_EVIDENCE_REF],
          },
        },
        searchTerms: searchTermsFromResource(resource),
        registrationEvidenceRefs: [DISCOVERY_EVIDENCE_REF],
      },
      bindingId: `binding:facilitator-discovery:${capabilityId}`,
      authority: {
        kind: "provider_connection",
        connectionRef: "connection:facilitator-discovery",
        providerRef: "provider:facilitator-discovery",
      },
      registrationEvidenceRefs: [DISCOVERY_EVIDENCE_REF],
      requestTimeoutMs: 10_000,
    },
    evidenceRefs: [DISCOVERY_EVIDENCE_REF],
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
  } catch {
    return undefined;
  }
}

export function isAllowlistedFacilitatorDiscoveryUrl(value: string): boolean {
  return (FACILITATOR_DISCOVERY_URLS as readonly string[]).includes(value);
}

export function paymentRequiredFromDiscoveryItem(
  item: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (!isRecord(item)) return undefined;
  if (item.x402Version !== undefined) {
    return item.x402Version === 2 && isRecord(item.resource) && Array.isArray(item.accepts)
      ? item
      : undefined;
  }
  if (!Array.isArray(item.accepts) || item.accepts.length < 1) return undefined;
  const resource = isRecord(item.resource)
    ? item.resource
    : typeof item.resource === "string" ? { url: item.resource } : undefined;
  if (resource === undefined) return undefined;
  return {
    x402Version: 2,
    resource,
    accepts: item.accepts,
    ...(isRecord(item.extensions) ? { extensions: item.extensions } : {}),
  };
}

type AcceptResult =
  | Readonly<{ kind: "valid"; amount: string; payTo: string }>
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
    if (candidate.network !== FACILITATOR_DISCOVERY_NETWORK) {
      sawChain = true;
      continue;
    }
    if (
      typeof candidate.asset !== "string" ||
      candidate.asset.toLowerCase() !== FACILITATOR_DISCOVERY_ASSET.toLowerCase()
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
    return { kind: "valid", amount: candidate.amount, payTo: candidate.payTo };
  }
  if (!sawExact) return { kind: "refused", reason: "scheme_unsupported" };
  if (sawChain) return { kind: "refused", reason: "chain_unsupported" };
  if (sawAsset) return { kind: "refused", reason: "asset_unsupported" };
  if (sawAmount) return { kind: "refused", reason: "amount_invalid" };
  return { kind: "refused", reason: "payment_terms_invalid" };
}

function priceBreakdown(amount: string): FacilitatorDiscoveryPriceBreakdown | undefined {
  if (!/^[1-9][0-9]*$/.test(amount) || amount.length > MAX_ATOMIC_DIGITS) return undefined;
  try {
    const providerUnits = BigInt(amount);
    const feeUnits = (providerUnits * FEE_BPS + BPS_DENOMINATOR - 1n) / BPS_DENOMINATOR;
    const provider = exactAtomicAmount(providerUnits);
    const platformFee = exactAtomicAmount(feeUnits);
    const total = exactAtomicAmount(providerUnits + feeUnits);
    return provider === undefined || platformFee === undefined || total === undefined
      ? undefined
      : { provider, platformFee, total, feeBps: 1_000 };
  } catch {
    return undefined;
  }
}

function exactAtomicAmount(units: bigint): ExactAmount | undefined {
  const value = units.toString();
  return value.length > MAX_ATOMIC_DIGITS
    ? undefined
    : { currency: "USD", units: value, exponent: FACILITATOR_DISCOVERY_ASSET_EXPONENT };
}

export function admittedFacilitatorDiscoveryDraft(
  normalized: CanonicalCapabilityPublicationDraft,
  decision: FacilitatorDiscoveryAdmitCandidate,
  sourceRevision: string,
): FacilitatorDiscoveryAdmittedDraft {
  const materialTerms = [
    ...normalized.offering.presentation.materialTerms,
    { termId: "provider-amount", label: "Provider quote", value: `${decision.price.provider.units} atomic USDC units (exponent 6)` },
    { termId: "platform-fee", label: "Platform fee", value: `${decision.price.platformFee.units} atomic USDC units (1000 bps)` },
    { termId: "buyer-total", label: "Buyer total", value: `${decision.price.total.units} atomic USDC units` },
  ].slice(0, 64);
  const offering: FacilitatorDiscoveryAdmittedDraft["offering"] = {
    ...normalized.offering,
    origin: { kind: "standalone" },
    presentation: {
      ...normalized.offering.presentation,
      price: { kind: "fixed", amount: decision.price.total },
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
      endpoint: { url: decision.identity.origin + decision.identity.path },
      method: decision.identity.method,
      ...(query === undefined ? {} : { query }),
    },
    price: decision.price,
    sourceImportJson: JSON.stringify(decision.import),
    sourceRevision,
  };
}

function normalizedHttpIdentity(
  endpoint: string,
  method: "GET" | "POST",
): Readonly<{ method: "GET" | "POST"; origin: string; path: string }> {
  const parsed = new URL(endpoint);
  return { method, origin: parsed.origin, path: parsed.pathname || "/" };
}

function capabilityIdFromIdentity(
  identity: Readonly<{ method: "GET" | "POST"; origin: string; path: string }>,
): string {
  const host = new URL(identity.origin).hostname
    .replace(/^www\./u, "")
    .replace(/[^a-z0-9]+/giu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
  const path = identity.path.replace(/^\//u, "").replace(/[^a-z0-9]+/giu, "-")
    .replace(/^-|-$/gu, "").toLowerCase();
  return `${identity.method.toLowerCase()}.${host || "endpoint"}.${path || "root"}`.slice(0, 190);
}

function admittedResourceUrl(resourceUrl: string): string | undefined {
  const parsed = validPublicHttpsEndpoint(resourceUrl);
  if (parsed === undefined || parsed.hash !== "") return undefined;
  return `${parsed.origin}${parsed.pathname || "/"}`;
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

function readNonNegativeSafeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
function readPositiveSafeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
