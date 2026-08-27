import {
  formatCurrencyAmount,
  formatExactAmount,
} from "@/modules/money/public";
import type {
  PublicOperationAuthentication,
  PublicOperationAvailability,
  PublicOperationDescriptor,
  PublicOperationPrice,
} from "@/modules/capability-supply/public";
import {
  emptyMarketListingEvidence,
  marketCategories,
  type MarketCategory,
  type MarketLatencyProjection,
  type MarketListingEvidenceProjection,
  type MarketPopularityProjection,
  type MarketRatingProjection,
} from "./listing-evidence";

type OperationReadiness = "Routeable" | "Integrated" | "Unavailable";

export type OperationCardViewModel = Readonly<{
  operationRef: string;
  title: string;
  summary: string;
  supplierName: string;
  supplierSlug: string;
  supplierInitials: string;
  capabilityId: string;
  capability: string;
  category: MarketCategory;
  price: string;
  authentication: string;
  lastVerifiedAt?: number;
  callLabel: string;
  readiness: OperationReadiness;
  readinessLabel: string;
  trustFact: string;
  rating: MarketRatingProjection;
  popularity: MarketPopularityProjection;
  latency: MarketLatencyProjection;
}>;

export type CapabilityGroupViewModel = Readonly<{
  capabilityId: string;
  label: string;
  category: MarketCategory;
  providerCount: number;
  operations: readonly OperationCardViewModel[];
}>;

export type CategoryShelfViewModel = Readonly<{
  category: MarketCategory;
  capabilities: readonly CapabilityGroupViewModel[];
}>;

const readinessLabels = {
  Routeable: "Ready now",
  Integrated: "Integration available",
  Unavailable: "Unavailable",
} satisfies Record<OperationReadiness, string>;

const readinessFacts = {
  Routeable: "Ready to run through Agentic Economy",
  Integrated: "Connected, but not currently ready to run",
  Unavailable: "Not currently available",
} satisfies Record<OperationReadiness, string>;

export function toOperationCardViewModel(
  operation: PublicOperationDescriptor,
  evidence: MarketListingEvidenceProjection = emptyMarketListingEvidence(
    operation.operationRef,
    operation.contract.capabilityId,
  ),
): OperationCardViewModel {
  const readiness: OperationReadiness =
    operation.availability.posture === "routeable"
      ? "Routeable"
      : operation.availability.posture === "integrated"
        ? "Integrated"
        : "Unavailable";
  const lastVerifiedAt = operation.availability.observedAt ?? operation.commercial.priceEvidence?.observedAt;
  const summary = catalogJobSummary(
    operation.summary || operation.offering.summary,
  );
  const capability = catalogJobLabel(
    operation.contract.capabilityId,
    operation.offering.label,
    summary,
  );

  return {
    operationRef: operation.operationRef,
    title: catalogOfferingTitle(operation.offering.label, capability),
    summary,
    supplierName: operation.business.name,
    supplierSlug: operation.business.slug,
    supplierInitials: initials(operation.business.name),
    capabilityId: operation.contract.capabilityId,
    capability,
    category: evidence.category,
    price: operationPrice(operation),
    authentication: formatOperationAuthentication(operation.authentication),
    ...(lastVerifiedAt === undefined ? {} : { lastVerifiedAt }),
    callLabel: operationCallLabel(readiness),
    readiness,
    readinessLabel: readinessLabels[readiness],
    trustFact: readinessFacts[readiness],
    rating: evidence.rating,
    popularity: evidence.popularity,
    latency: evidence.latency,
  };
}

/**
 * Groups substitutable supply by the job it fulfils. HTTP path identities
 * that share a job slug sit on one tile; dotted job ids stay exact.
 * Input ordering is preserved so callers can choose how providers are ranked.
 */
export function groupOperationCards(
  operations: readonly OperationCardViewModel[],
): readonly CapabilityGroupViewModel[] {
  const groups = new Map<string, OperationCardViewModel[]>();

  for (const operation of operations) {
    const groupKey = catalogGroupKey(operation.capabilityId, operation.capability);
    const existing = groups.get(groupKey);
    if (existing === undefined) {
      groups.set(groupKey, [operation]);
    } else {
      existing.push(operation);
    }
  }

  return [...groups.entries()].map(([groupKey, groupedOperations]) => ({
    capabilityId: groupedOperations[0]?.capabilityId ?? groupKey,
    label: groupedOperations[0]?.capability ?? catalogJobLabel(groupKey),
    category: groupedOperations[0]?.category ?? marketFallbackCategory,
    providerCount: new Set(
      groupedOperations.map((operation) => operation.supplierSlug),
    ).size,
    operations: groupedOperations,
  }));
}

export function groupCapabilitiesByCategory(
  groups: readonly CapabilityGroupViewModel[],
): readonly CategoryShelfViewModel[] {
  return marketCategories.flatMap((category) => {
    const capabilities = groups.filter(
      (group) => group.category.id === category.id,
    );
    return capabilities.length === 0 ? [] : [{ category, capabilities }];
  });
}

export function capabilityFromPrice(
  operations: readonly OperationCardViewModel[],
): string {
  const prices = [...new Set(operations.map((operation) => operation.price))];
  if (prices.length === 0) return "Price on request";
  if (prices.includes("Free")) {
    return prices.every(
      (price) => price === "Free" || price === "Price on request",
    ) && !prices.includes("Price on request")
      ? "Free"
      : "from Free";
  }
  const comparable = prices.filter((price) => price !== "Price on request");
  const floor = [...comparable].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  )[0];
  if (floor === undefined) return "Price on request";
  return `from ${floor}`;
}

const marketFallbackCategory: MarketCategory = {
  id: "other",
  label: "Other",
  description: "Other callable capabilities.",
};

export function formatOperationPrice(price: PublicOperationPrice): string {
  if (price.kind === "on_request") return "Price on request";
  if (price.kind === "fixed") {
    return exactIsZero(price.amount) ? "Free" : formatCurrencyAmount(price.amount);
  }
  if (exactIsZero(price.minimum) && exactIsZero(price.maximum)) return "Free";
  return `${formatCurrencyAmount(price.minimum)}–${formatCurrencyAmount(price.maximum)}`;
}

export function formatOperationReadiness(
  posture: PublicOperationAvailability["posture"],
): string {
  if (posture === "routeable") return readinessLabels.Routeable;
  if (posture === "integrated") return readinessLabels.Integrated;
  return readinessLabels.Unavailable;
}

export function formatOperationAuthentication(
  authentication: PublicOperationAuthentication,
): string {
  if (authentication.kind === "keyless") return "No provider key";
  if (authentication.kind === "x402") return "x402 payment";
  if (authentication.kind === "platform_credential") {
    return authentication.scheme === "bearer" ? "Bearer connection" : "API key connection";
  }
  return "Check access";
}

function operationPrice(operation: PublicOperationDescriptor): string {
  if (operation.commercial.priceBreakdown !== undefined) {
    return exactIsZero(operation.commercial.priceBreakdown.totalBuyerAuthorization)
      ? "Free"
      : formatCurrencyAmount(operation.commercial.priceBreakdown.totalBuyerAuthorization);
  }
  return formatOperationPrice(operation.commercial.price);
}

function operationCallLabel(readiness: OperationReadiness): string {
  if (readiness === "Routeable") return "Use capability";
  if (readiness === "Integrated") return "Setup required";
  return "Not available";
}

const HTTP_CAPABILITY_PREFIX =
  /^(get|post|put|patch|delete|head|options)\.[a-z0-9-]+\./iu;
const PATH_LIKE_LABEL =
  /^(?:https?:\/\/|(?:get|post|put|patch|delete|head|options)\.)/iu;
const PROTOCOL_SUMMARY_NOISE =
  /well-known|first-buy\.json|\bhip-?3\b|\bx402\b|payment required|bazaar|facilitator-discovered market operation/iu;
const DISPLAY_NOISE_TOKENS = new Set([
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

/** Job name for a catalog tile: a named task, not a URL path. */
export function catalogJobLabel(
  capabilityId: string,
  offeredLabel = "",
  summary = "",
): string {
  if (isHttpPathCapabilityId(capabilityId)) {
    if (isUsefulDisplayName(offeredLabel) && !isPathLikeLabel(offeredLabel, capabilityId)) {
      return offeredLabel.trim();
    }
    const fromId = humanizeHttpCapabilityId(capabilityId);
    if (isUsefulDisplayName(fromId)) return fromId;
    const fromSummary = firstJobPhrase(summary);
    if (fromSummary !== undefined) return fromSummary;
    if (isUsefulDisplayName(offeredLabel)) return offeredLabel.trim();
    return fromId || offeredLabel.trim() || capabilityId;
  }
  const segment = capabilityId.split(/[.:]/u).at(-1) ?? capabilityId;
  const fromId = humanize(segment);
  if (isUsefulDisplayName(fromId)) return fromId;
  if (isUsefulDisplayName(offeredLabel) && !isPathLikeLabel(offeredLabel, capabilityId)) {
    return offeredLabel.trim();
  }
  const fromSummary = firstJobPhrase(summary);
  if (fromSummary !== undefined) return fromSummary;
  return fromId || offeredLabel.trim() || capabilityId;
}

/** Drop protocol residue so the card reads as a job, not a transport. */
export function catalogJobSummary(value: string): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (compact.length === 0) return "";
  const sentences = compact.split(/(?<=[.!?])\s+/u);
  const kept = sentences.filter((sentence) => !PROTOCOL_SUMMARY_NOISE.test(sentence));
  const cleaned = (kept.length > 0
    ? kept
    : [
        compact.replace(
          /well-known|first-buy\.json|\bhip-?3\b|\bx402\b|payment required|bazaar|facilitator-discovered market operation/giu,
          " ",
        ),
      ])
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return "";
  if (cleaned.length <= 220) return cleaned;
  return `${cleaned.slice(0, 217).replace(/\s+\S*$/u, "")}…`;
}

export function catalogGroupKey(capabilityId: string, jobLabel = ""): string {
  const normalized = jobLabel.trim().toLowerCase().replace(/\s+/gu, " ");
  if (normalized.length >= 12) return `label:${normalized}`;
  const slug = httpCapabilityJobSlug(capabilityId);
  if (slug !== undefined) return slug;
  return capabilityId;
}

function catalogOfferingTitle(offeredLabel: string, jobLabel: string): string {
  if (isUsefulDisplayName(offeredLabel) && !isPathLikeLabel(offeredLabel)) {
    return offeredLabel.trim();
  }
  return jobLabel;
}

function isHttpPathCapabilityId(capabilityId: string): boolean {
  return HTTP_CAPABILITY_PREFIX.test(capabilityId);
}

function isPathLikeLabel(value: string, capabilityId?: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (capabilityId !== undefined && trimmed === capabilityId) return true;
  if (PATH_LIKE_LABEL.test(trimmed) || trimmed.includes("/")) return true;
  if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/iu.test(trimmed)) return true;
  return trimmed.split(/[.:]/u).length >= 3 && HTTP_CAPABILITY_PREFIX.test(`${trimmed}.`);
}

function httpCapabilityJobSlug(capabilityId: string): string | undefined {
  if (!isHttpPathCapabilityId(capabilityId)) return undefined;
  const slug = meaningfulHttpTokens(capabilityId).join("-");
  return slug.length >= 3 ? slug : undefined;
}

function humanizeHttpCapabilityId(capabilityId: string): string {
  return humanize(meaningfulHttpTokens(capabilityId).join(" "));
}

function meaningfulHttpTokens(capabilityId: string): readonly string[] {
  const parts = capabilityId.split(".");
  const path = parts.slice(2).join("-");
  return path
    .split(/[-_]+/u)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0 && !DISPLAY_NOISE_TOKENS.has(token));
}

function isUsefulDisplayName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3) return false;
  return !DISPLAY_NOISE_TOKENS.has(trimmed.toLowerCase());
}

function firstJobPhrase(summary: string): string | undefined {
  const cleaned = catalogJobSummary(summary);
  if (!isUsefulDisplayName(cleaned)) return undefined;
  if (cleaned.length <= 48) return cleaned.replace(/[.]+$/u, "");
  const clipped = cleaned.slice(0, 48).replace(/\s+\S*$/u, "").replace(/[.]+$/u, "");
  return isUsefulDisplayName(clipped) ? clipped : undefined;
}

function humanize(value: string): string {
  return value
    .replaceAll(/[_:-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\s+/gu, " ")
    .trim();
}

function initials(value: string): string {
  const letters =
    value
      .match(/[\p{L}\p{N}]+/gu)
      ?.slice(0, 2)
      .map((part) => part[0])
      .join("") ?? "OP";
  return letters.toUpperCase();
}

function exactIsZero(amount: Parameters<typeof formatExactAmount>[0]): boolean {
  const formatted = formatExactAmount(amount);
  return formatted !== undefined && /^0(?:\.0+)?$/.test(formatted);
}
