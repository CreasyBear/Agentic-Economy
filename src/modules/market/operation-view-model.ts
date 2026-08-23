import {
  formatCurrencyAmount,
  formatExactAmount,
} from "@/modules/money/public";
import type { PublicOperationDescriptor } from "@/modules/capability-supply/public";
import {
  emptyMarketListingEvidence,
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

  return {
    operationRef: operation.operationRef,
    title: operation.offering.label,
    summary: operation.summary || operation.offering.summary,
    supplierName: operation.business.name,
    supplierSlug: operation.business.slug,
    supplierInitials: initials(operation.business.name),
    capabilityId: operation.contract.capabilityId,
    capability: capabilityLabel(operation.contract.capabilityId),
    category: evidence.category,
    price: operationPrice(operation),
    readiness,
    readinessLabel: readinessLabels[readiness],
    trustFact: readinessFacts[readiness],
    rating: evidence.rating,
    popularity: evidence.popularity,
    latency: evidence.latency,
  };
}

/**
 * Groups substitutable supply by the capability contract it fulfils.
 * Input ordering is preserved so callers can choose how providers are ranked.
 */
export function groupOperationCards(
  operations: readonly OperationCardViewModel[],
): readonly CapabilityGroupViewModel[] {
  const groups = new Map<string, OperationCardViewModel[]>();

  for (const operation of operations) {
    const existing = groups.get(operation.capabilityId);
    if (existing === undefined) {
      groups.set(operation.capabilityId, [operation]);
    } else {
      existing.push(operation);
    }
  }

  return [...groups.entries()].map(([capabilityId, groupedOperations]) => ({
    capabilityId,
    label: groupedOperations[0]?.capability ?? capabilityLabel(capabilityId),
    category: groupedOperations[0]?.category ?? marketFallbackCategory,
    providerCount: new Set(
      groupedOperations.map((operation) => operation.supplierSlug),
    ).size,
    operations: groupedOperations,
  }));
}

const marketFallbackCategory: MarketCategory = {
  id: "other",
  label: "Other",
  description: "Other callable capabilities.",
};

function operationPrice(operation: PublicOperationDescriptor): string {
  const price = operation.commercial.price;
  if (price.kind === "on_request") return "Price on request";
  if (price.kind === "fixed")
    return exactIsZero(price.amount)
      ? "Free"
      : formatCurrencyAmount(price.amount);
  if (exactIsZero(price.minimum) && exactIsZero(price.maximum)) return "Free";
  return `${formatCurrencyAmount(price.minimum)}–${formatCurrencyAmount(price.maximum)}`;
}

function capabilityLabel(value: string): string {
  const segment = value.split(/[.:]/).at(-1) ?? value;
  return humanize(segment);
}

function humanize(value: string): string {
  return value
    .replaceAll(/[_:-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
