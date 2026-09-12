import {
  formatCurrencyAmount,
  formatExactAmount,
  formatDisplayPrice,
  type ExactAmount,
} from "@/modules/money/public";
import type {
  PublicToolAuthentication,
  PublicToolAvailability,
  PublicToolDescriptor,
  PublicToolPrice,
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

type ToolReadiness = "Routeable" | "SetupRequired" | "Unavailable";

export type ToolCardViewModel = Readonly<{
  toolRef: string;
  title: string;
  summary: string;
  providerName: string;
  providerSlug: string;
  providerInitials: string;
  capabilityId: string;
  capability: string;
  category: MarketCategory;
  price: string;
  priceAmount?: ExactAmount;
  priceValidUntil?: number;
  authentication: string;
  paymentNetwork?: string;
  lastVerifiedAt?: number;
  callLabel: string;
  readiness: ToolReadiness;
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
  tools: readonly ToolCardViewModel[];
}>;

export type CategoryShelfViewModel = Readonly<{
  category: MarketCategory;
  capabilities: readonly CapabilityGroupViewModel[];
}>;

const readinessLabels = {
  Routeable: "Ready now",
  SetupRequired: "Setup required",
  Unavailable: "Unavailable",
} satisfies Record<ToolReadiness, string>;

const readinessFacts = {
  Routeable: "Ready to run through Agentic Economy",
  SetupRequired: "Not callable until setup is completed",
  Unavailable: "Not currently available",
} satisfies Record<ToolReadiness, string>;

/**
 * The one source of truth for a Tool's display title: the Provider-stated
 * title when it reads as a real name, otherwise the capability's job name.
 * Never a bare title-cased identifier. Consumed by the catalog card and by
 * the Tool detail page so the same Tool never shows two different titles.
 */
export function toolDisplayTitle(tool: PublicToolDescriptor): string {
  const summary = catalogJobSummary(tool.summary || tool.offering.summary);
  const capability = catalogJobLabel(
    tool.contract.capabilityId,
    tool.offering.label,
    summary,
  );
  return catalogOfferingTitle(tool.offering.label, capability);
}

export function toToolCardViewModel(
  tool: PublicToolDescriptor,
  evidence: MarketListingEvidenceProjection = emptyMarketListingEvidence(
    tool.toolRef,
    tool.contract.capabilityId,
  ),
): ToolCardViewModel {
  const readiness: ToolReadiness =
    tool.availability.posture === "routeable"
      ? "Routeable"
      : tool.availability.posture === "setup_required"
        ? "SetupRequired"
        : "Unavailable";
  const lastVerifiedAt = tool.availability.observedAt ?? tool.commercial.priceEvidence?.observedAt;
  const summary = catalogJobSummary(
    tool.summary || tool.offering.summary,
  );
  const capability = catalogJobLabel(
    tool.contract.capabilityId,
    tool.offering.label,
    summary,
  );
  const priceAmount = toolPriceAmount(tool);

  return {
    toolRef: tool.toolRef,
    title: catalogOfferingTitle(tool.offering.label, capability),
    summary,
    providerName: tool.business.name,
    providerSlug: tool.business.slug,
    providerInitials: initials(tool.business.name),
    capabilityId: tool.contract.capabilityId,
    capability,
    category: evidence.category,
    price: toolPrice(tool),
    ...(priceAmount === undefined ? {} : { priceAmount }),
    ...(tool.commercial.displayPrice?.kind === "indicative" ? { priceValidUntil: tool.commercial.displayPrice.validUntil } : {}),
    authentication: formatToolAuthentication(tool.authentication),
    ...(tool.payment === undefined ? {} : { paymentNetwork: formatPaymentNetwork(tool.payment.network) }),
    ...(lastVerifiedAt === undefined ? {} : { lastVerifiedAt }),
    callLabel: tool.availability.reason === "inspection_required" ? "Get a Quote" : toolCallLabel(readiness),
    readiness,
    readinessLabel: tool.availability.reason === "inspection_required" ? "Checked when quoting" : readinessLabels[readiness],
    trustFact: tool.availability.reason === "inspection_required" ? "Availability and exact price are checked for your request" : readinessFacts[readiness],
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
export function groupToolCards(
  tools: readonly ToolCardViewModel[],
): readonly CapabilityGroupViewModel[] {
  const groups = new Map<string, ToolCardViewModel[]>();

  for (const tool of tools) {
    const groupKey = catalogGroupKey(tool.capabilityId, tool.capability);
    const existing = groups.get(groupKey);
    if (existing === undefined) {
      groups.set(groupKey, [tool]);
    } else {
      existing.push(tool);
    }
  }

  return [...groups.entries()].map(([groupKey, groupedTools]) => ({
    capabilityId: groupedTools[0]?.capabilityId ?? groupKey,
    label: groupedTools[0]?.capability ?? catalogJobLabel(groupKey),
    category: groupedTools[0]?.category ?? marketFallbackCategory,
    providerCount: new Set(
      groupedTools.map((tool) => tool.providerSlug),
    ).size,
    tools: groupedTools,
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
  tools: readonly ToolCardViewModel[],
): string {
  const priced = tools.filter((tool) => tool.priceAmount !== undefined
    && (tool.priceValidUntil === undefined || tool.priceValidUntil > Date.now()));
  if (priced.length === 0) return tools.some((tool) => tool.priceValidUntil !== undefined && tool.priceValidUntil <= Date.now())
    ? "AUD estimate temporarily unavailable" : tools[0]?.price ?? "Price on request";
  const currencies = new Set(priced.flatMap((tool) => tool.priceAmount === undefined ? [] : [tool.priceAmount.currency]));
  if (currencies.size > 1) return "Prices vary";
  const [floor] = [...priced].sort(compareToolPrices);
  if (floor === undefined) return "Price on request";
  return priced.length === tools.length && tools.every((tool) => tool.price === floor.price)
    ? floor.price : `from ${floor.price}`;
}

const marketFallbackCategory: MarketCategory = {
  id: "other",
  label: "Other",
  description: "Other callable capabilities.",
};

export function formatToolPrice(price: PublicToolPrice): string {
  if (price.kind === "on_request") return "Price on request";
  if (price.kind === "fixed") {
    return exactIsZero(price.amount) ? "Free" : formatCurrencyAmount(price.amount);
  }
  if (exactIsZero(price.minimum) && exactIsZero(price.maximum)) return "Free";
  return `${formatCurrencyAmount(price.minimum)}–${formatCurrencyAmount(price.maximum)}`;
}

export function formatToolReadiness(
  posture: PublicToolAvailability["posture"],
): string {
  if (posture === "routeable") return readinessLabels.Routeable;
  if (posture === "setup_required") return readinessLabels.SetupRequired;
  return readinessLabels.Unavailable;
}

export function formatToolAuthentication(
  authentication: PublicToolAuthentication,
): string {
  if (authentication.kind === "ae_api_key") return "AE account invocation";
  if (authentication.kind === "x402") return "Uses your AE balance";
  if (authentication.kind === "platform_credential") {
    return authentication.scheme === "bearer" ? "Bearer connection" : "API key connection";
  }
  return "Check access";
}

export function toolPrice(tool: PublicToolDescriptor, now = Date.now()): string {
  const display = formatDisplayPrice(tool.commercial.displayPrice, now);
  if (display !== undefined) return display;
  if (tool.commercial.priceBreakdown !== undefined) {
    return exactIsZero(tool.commercial.priceBreakdown.totalBuyerAuthorization)
      ? "Free"
      : formatCurrencyAmount(tool.commercial.priceBreakdown.totalBuyerAuthorization);
  }
  return formatToolPrice(tool.commercial.price);
}

function toolPriceAmount(tool: PublicToolDescriptor): ExactAmount | undefined {
  const display = tool.commercial.displayPrice;
  if (display !== undefined) return display.kind === "indicative" && display.validUntil > Date.now()
    ? display.amount : undefined;
  if (tool.commercial.priceBreakdown !== undefined) return tool.commercial.priceBreakdown.totalBuyerAuthorization;
  return tool.commercial.price.kind === "fixed" ? tool.commercial.price.amount
    : tool.commercial.price.kind === "range" ? tool.commercial.price.minimum : undefined;
}

/** Compare exact quantities, never their formatted labels. Unknown prices sort last. */
export function compareToolPrices(left: ToolCardViewModel, right: ToolCardViewModel): number {
  const a = left.priceValidUntil !== undefined && left.priceValidUntil <= Date.now() ? undefined : left.priceAmount;
  const b = right.priceValidUntil !== undefined && right.priceValidUntil <= Date.now() ? undefined : right.priceAmount;
  if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1;
  if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
  const exponent = Math.max(a.exponent, b.exponent);
  const au = BigInt(a.units) * 10n ** BigInt(exponent - a.exponent);
  const bu = BigInt(b.units) * 10n ** BigInt(exponent - b.exponent);
  return au < bu ? -1 : au > bu ? 1 : 0;
}

function toolCallLabel(readiness: ToolReadiness): string {
  if (readiness === "Routeable") return "Use capability";
  if (readiness === "SetupRequired") return "Setup required";
  return "Not available";
}

export function formatPaymentNetwork(network: string): string {
  if (network === "eip155:84532") return "Base Sepolia (eip155:84532)";
  if (network === "eip155:8453") return "Base (eip155:8453)";
  return network;
}

const HTTP_CAPABILITY_PREFIX =
  /^(get|post|put|patch|delete|head|options)\.[a-z0-9-]+\./iu;
const PATH_LIKE_LABEL =
  /^(?:https?:\/\/|(?:get|post|put|patch|delete|head|options)\.)/iu;
const PROTOCOL_SUMMARY_NOISE =
  /well-known|first-buy\.json|\bhip-?3\b|\bx402\b|payment required|bazaar|facilitator-discovered market (?:operation|tool)/iu;
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
          /well-known|first-buy\.json|\bhip-?3\b|\bx402\b|payment required|bazaar|facilitator-discovered market (?:operation|tool)/giu,
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
