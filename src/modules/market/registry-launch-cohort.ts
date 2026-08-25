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
  for (const candidate of candidates
    .filter(({ source }) => source === "agentic_market")
    .toSorted(compareLaunchCandidates)) {
    if (selected.length >= limit) break;
    const provider = candidate.provider.trim().toLowerCase();
    const count = providerCounts.get(provider) ?? 0;
    if (count >= providerCap) continue;
    providerCounts.set(provider, count + 1);
    selected.push(candidate);
  }
  return selected;
}

function compareLaunchCandidates(
  left: RegistryLaunchCandidate,
  right: RegistryLaunchCandidate,
): number {
  const calls = compareMetric(right.sourceCalls30d, left.sourceCalls30d);
  if (calls !== 0) return calls;
  const payers = compareMetric(right.sourcePayers30d, left.sourcePayers30d);
  if (payers !== 0) return payers;
  const route = compareText(
    left.routeIdentity ?? left.documentId,
    right.routeIdentity ?? right.documentId,
  );
  return route === 0 ? compareText(left.documentId, right.documentId) : route;
}

function compareMetric(left: string | undefined, right: string | undefined): number {
  const parsedLeft = parseMetric(left);
  const parsedRight = parseMetric(right);
  if (parsedLeft === undefined) return parsedRight === undefined ? 0 : -1;
  if (parsedRight === undefined) return 1;
  return parsedLeft < parsedRight ? -1 : parsedLeft > parsedRight ? 1 : 0;
}

function parseMetric(value: string | undefined): bigint | undefined {
  return value !== undefined && /^\d+$/u.test(value) ? BigInt(value) : undefined;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
