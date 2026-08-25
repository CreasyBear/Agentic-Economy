export type RegistryLaunchCandidate = Readonly<{
  source: "agentic_market" | "treg";
  documentId: string;
  sourceDigest: string;
  provider: string;
  routeIdentity?: string;
  sourceCalls30d?: string;
  sourcePayers30d?: string;
}>;

export const REGISTRY_LAUNCH_COHORT_LIMIT = 100;
export const REGISTRY_LAUNCH_PROVIDER_CAP = 5;

export function selectRegistryLaunchCohort(
  candidates: readonly RegistryLaunchCandidate[],
  input: Readonly<{ limit?: number; providerCap?: number }> = {},
): RegistryLaunchCandidate[] {
  const limit = input.limit ?? REGISTRY_LAUNCH_COHORT_LIMIT;
  const providerCap = input.providerCap ?? REGISTRY_LAUNCH_PROVIDER_CAP;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 0 ||
    !Number.isSafeInteger(providerCap) ||
    providerCap < 1
  ) {
    throw new Error("registry_launch_cohort_bounds_invalid");
  }

  const providerCounts = new Map<string, number>();
  const selected: RegistryLaunchCandidate[] = [];
  const uniqueRoutes = new Map<string, RegistryLaunchCandidate>();
  for (const candidate of candidates) {
    if (candidate.source !== "agentic_market") continue;
    const existing = uniqueRoutes.get(candidate.documentId);
    if (existing === undefined) {
      uniqueRoutes.set(candidate.documentId, candidate);
      continue;
    }
    if (resolveAgenticMarketRouteWinner(existing, candidate) === "right") {
      uniqueRoutes.set(candidate.documentId, candidate);
    }
  }
  for (const candidate of [...uniqueRoutes.values()].toSorted(compareLaunchCandidates)) {
    if (selected.length >= limit) break;
    const provider = normalizedProvider(candidate.provider);
    const count = providerCounts.get(provider) ?? 0;
    if (count >= providerCap) continue;
    providerCounts.set(provider, count + 1);
    selected.push(candidate);
  }
  return selected;
}

export function resolveAgenticMarketRouteWinner(
  left: RegistryLaunchCandidate,
  right: RegistryLaunchCandidate,
): "left" | "right" {
  if (
    left.source !== "agentic_market" ||
    right.source !== "agentic_market" ||
    left.documentId !== right.documentId ||
    left.routeIdentity === undefined ||
    left.routeIdentity !== right.routeIdentity
  ) {
    throw new Error("registry_launch_route_identity_conflict");
  }
  const calls = compareDescendingMetric(left.sourceCalls30d, right.sourceCalls30d);
  if (calls !== 0) return calls < 0 ? "left" : "right";
  const payers = compareDescendingMetric(left.sourcePayers30d, right.sourcePayers30d);
  if (payers !== 0) return payers < 0 ? "left" : "right";
  const provider = compareText(normalizedProvider(left.provider), normalizedProvider(right.provider));
  if (provider !== 0) return provider < 0 ? "left" : "right";
  const exactProvider = compareText(left.provider, right.provider);
  if (exactProvider !== 0) return exactProvider < 0 ? "left" : "right";
  return compareText(left.sourceDigest, right.sourceDigest) <= 0 ? "left" : "right";
}

function compareLaunchCandidates(
  left: RegistryLaunchCandidate,
  right: RegistryLaunchCandidate,
): number {
  const calls = compareDescendingMetric(left.sourceCalls30d, right.sourceCalls30d);
  if (calls !== 0) return calls;
  const payers = compareDescendingMetric(left.sourcePayers30d, right.sourcePayers30d);
  if (payers !== 0) return payers;
  const route = compareText(
    left.routeIdentity ?? left.documentId,
    right.routeIdentity ?? right.documentId,
  );
  if (route !== 0) return route;
  const document = compareText(left.documentId, right.documentId);
  return document === 0
    ? compareText(left.sourceDigest, right.sourceDigest)
    : document;
}

function compareDescendingMetric(
  left: string | undefined,
  right: string | undefined,
): number {
  const parsedLeft = parseMetric(left);
  const parsedRight = parseMetric(right);
  if (parsedLeft === undefined) return parsedRight === undefined ? 0 : 1;
  if (parsedRight === undefined) return -1;
  return parsedLeft > parsedRight ? -1 : parsedLeft < parsedRight ? 1 : 0;
}

function parseMetric(value: string | undefined): bigint | undefined {
  return value !== undefined && /^\d+$/u.test(value) ? BigInt(value) : undefined;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedProvider(value: string): string {
  return value.trim().toLowerCase();
}
