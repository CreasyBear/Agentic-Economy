import {
  compareExactAmounts,
  exactAmountSchema,
  type ExactAmount,
} from "@/modules/money/public";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import {
  isPublicOperationRef,
  type PublicOperationRef,
} from "../public";
import {
  noOperationNavigation,
  operationNavigation,
  projectCapabilityOperation,
} from "./operation-project";
import {
  PublicOperationRegistrySchemaVersion,
  type CapabilityOperationSourceRecord,
  type CapabilityOperationSourcePort,
  type OperationProjectionNavigationContract,
  type PublicCommercialTerms,
  type PublicDataUsePolicy,
  type PublicEffectPolicy,
  type PublicOperationAvailability,
  type PublicOperationDescriptor,
  type PublicOperationNavigationRelation,
} from "./operation-projection-types";

export type OperationSearchTextCandidate<T> = Readonly<{
  value: T;
  operationRef: string;
  searchText: readonly string[];
}>;
export type CurrentOperationSearchFact = Readonly<{
  operationRef: PublicOperationRef;
  networkId: string;
  searchText: readonly string[];
  businessSearchText: string;
  price: PublicCommercialTerms["price"];
  effects: readonly PublicEffectPolicy[number]["class"][];
  dataUse: readonly PublicDataUsePolicy[number]["classification"][];
  integrated: boolean;
  routeable: boolean;
  unavailableReason?: CapabilityOperationSourceRecord["unavailableReason"];
  readiness: CapabilityOperationSourceRecord["readiness"];
}>;
export type OperationSearchRanking = Readonly<{
  operationRef: PublicOperationRef;
  rank: number;
  score: number;
}>;
type RankedOperationSearchTextCandidate<T> = OperationSearchTextCandidate<T> &
  Readonly<{ score: number }>;

export function rankOperationSearchText<T>(
  query: string,
  candidates: readonly OperationSearchTextCandidate<T>[],
): readonly T[] {
  return rankOperationSearchCandidates(query, candidates).map(
    ({ value }) => value,
  );
}

function rankOperationSearchCandidates<T>(
  query: string,
  candidates: readonly OperationSearchTextCandidate<T>[],
): readonly RankedOperationSearchTextCandidate<T>[] {
  const tokens = searchTokens(query);
  // An intentionally empty query is the catalogue-browse operation. A
  // non-empty query whose only words are generic search verbs has no usable
  // relevance signal and must not become the same browse operation by accident.
  if (query.trim().length > 0 && tokens.length === 0) return [];
  // Agent-authored tasks contain runtime constraints (cities, names, symbols)
  // that should shape the eventual call, not exclude an otherwise obvious
  // capability. Keep only tokens with evidence somewhere in the current
  // catalogue, then continue to require those capability tokens to cohere on
  // one candidate. This retains fail-closed behavior for mixed unsupported
  // requests while avoiding a catalogue-wide alias or runtime-value registry.
  const relevantTokens = tokens.filter((token) =>
    candidates.some(({ searchText }) =>
      searchableText(searchText).some(
        (term) => searchTermMatchScore(term, token) > 0,
      ),
    ),
  );
  if (query.trim().length > 0 && relevantTokens.length === 0) return [];
  const exactMatches = candidates.filter(
    ({ searchText }) =>
      relevantTokens.every((token) =>
        searchableText(searchText).some(
          (term) => searchTermMatchScore(term, token) > 0,
        ),
      ),
  );
  const matches =
    relevantTokens.length === 0 || exactMatches.length > 0
      ? exactMatches
      : candidates.filter(({ searchText }) => {
          const terms = searchableText(searchText);
          const matchedTokens = relevantTokens.filter((token) =>
            terms.some((term) => searchTermMatchScore(term, token) > 0),
          ).length;
          const currencyTokenCount = relevantTokens.filter((token) =>
            SEARCH_CURRENCY_CODES.has(token),
          ).length;
          const minimumMatches = currencyTokenCount >= 2
            ? 1
            : Math.max(2, Math.ceil(relevantTokens.length / 2));
          return matchedTokens >= minimumMatches;
        });
  return matches
    .map((candidate) => ({
      ...candidate,
      score: scoreSearchText(candidate.searchText, relevantTokens),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.operationRef.localeCompare(right.operationRef),
    );
}
export type OperationSearchFilters = Readonly<{
  networkId?: string;
  location?: string;
  effects?: readonly PublicEffectPolicy[number]["class"][];
  dataUse?: readonly PublicDataUsePolicy[number]["classification"][];
  availability?: readonly PublicOperationAvailability["posture"][];
  currency?: string;
  maximumPrice?: ExactAmount;
}>;
export type OperationSearchInput = Readonly<{
  query: string;
  limit?: number;
  cursor?: string;
  filters?: OperationSearchFilters;
}>;
export type OperationSearchResult =
  | Readonly<{
      kind: "ok";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      query: string;
      items: readonly PublicOperationDescriptor[];
      matchedCount: number;
      ranking: readonly OperationSearchRanking[];
      pagination: Readonly<{
        limit: number;
        nextCursor?: string;
        hasMore: boolean;
      }>;
      navigation: readonly PublicOperationNavigationRelation[];
    }>
  | Readonly<{
      kind: "no_candidates";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      query: string;
      appliedFilters: OperationSearchFilters;
      matchedCount: number;
      ranking: readonly OperationSearchRanking[];
      navigation: readonly PublicOperationNavigationRelation[];
    }>
  | Readonly<{
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      reason:
        "query_invalid" | "source_unavailable" | "source_capacity_exceeded";
      navigation: readonly PublicOperationNavigationRelation[];
    }>;

const MAX_SOURCE = 256;
const MAX_QUERY = 200;
const MAX_CURSOR = 512;
const MAX_LIMIT = 3;
const SEARCH_CURRENCY_CODES = new Set(
  Intl.supportedValuesOf("currency").map((currency) => currency.toLowerCase()),
);
const SEARCH_MONTHS = new Set([
  "jan", "january", "feb", "february", "mar", "march", "apr", "april",
  "may", "jun", "june", "jul", "july", "aug", "august", "sep",
  "sept", "september", "oct", "october", "nov", "november", "dec",
  "december",
]);
const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "api",
  "for",
  "from",
  "get",
  "how",
  "in",
  "into",
  "is",
  "latest",
  "of",
  "on",
  "or",
  "please",
  "provider",
  "search",
  "that",
  "the",
  "this",
  "to",
  "value",
  "what",
  "when",
  "where",
  "which",
  "who",
  "with",
  "find",
  "current",
  "can",
  "i",
  "me",
  "tell",
  "data",
  "use",
  "want",
  "need",
  "live",
  "result",
  "results",
]);

export async function searchCapabilityOperations(
  port: CapabilityOperationSourcePort,
  input: OperationSearchInput,
  now = Date.now(),
): Promise<OperationSearchResult> {
  const normalized = normalizeSearch(input);
  if (normalized === undefined) return searchUnavailable("query_invalid", port.navigation);
  const source = await port.listCurrent({
    ...(normalized.filters.networkId === undefined
      ? {}
      : { networkId: normalized.filters.networkId }),
    limit: MAX_SOURCE + 1,
    now,
  });
  if (source.sourceCount > MAX_SOURCE)
    return searchUnavailable("source_capacity_exceeded", port.navigation);
  const cursor = decodeCursor(
    normalized.cursor,
    normalized.query,
    normalized.filters,
    source.snapshotKey,
  );
  if (normalized.cursor !== undefined && cursor === undefined)
    return searchUnavailable("query_invalid", port.navigation);
  const projectedMatches: Array<
    OperationSearchTextCandidate<PublicOperationDescriptor>
  > = [];
  for (const record of source.operations) {
    const operation = projectCapabilityOperation(record, now, port.navigation);
    if (matchesFilters(operation, normalized.filters)) {
      projectedMatches.push({
        value: operation,
        operationRef: operation.operationRef,
        searchText: operationSearchText(operation, record.searchTerms),
      });
    }
  }
  const matches = rankOperationSearchCandidates(
    normalized.query,
    projectedMatches,
  );
  const start =
    cursor?.lastOperationRef === undefined
      ? 0
      : Math.max(
          0,
          matches.findIndex(
            (item) => item.operationRef === cursor.lastOperationRef,
          ) + 1,
        );
  const pageMatches = matches.slice(start, start + normalized.limit);
  const items = pageMatches.map(({ value }) => value);
  const ranking = pageMatches.map(({ operationRef, score }, index) => ({
    operationRef: operationRef as PublicOperationRef,
    rank: start + index + 1,
    score,
  }));
  const lastItem = items.at(-1);
  if (lastItem === undefined)
    return {
      kind: "no_candidates",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      query: normalized.query,
      appliedFilters: normalized.filters,
      matchedCount: matches.length,
      ranking: [],
      navigation: noOperationNavigation(port.navigation),
    };
  const hasMore = start + items.length < matches.length;
  return {
    kind: "ok",
    schemaVersion: PublicOperationRegistrySchemaVersion,
    query: normalized.query,
    items,
    matchedCount: matches.length,
    ranking,
    pagination: {
      limit: normalized.limit,
      hasMore,
      ...(hasMore
        ? {
            nextCursor: encodeCursor(
              normalized.query,
              normalized.filters,
              source.snapshotKey,
              lastItem.operationRef,
            ),
          }
        : {}),
    },
    navigation: operationNavigation("inspect_only", port.navigation),
  };
}

export function currentOperationSearchFact(
  record: CapabilityOperationSourceRecord,
  now: number,
  navigation: OperationProjectionNavigationContract,
): CurrentOperationSearchFact {
  const operation = projectCapabilityOperation(record, now, navigation);
  return {
    operationRef: operation.operationRef,
    networkId: record.networkId,
    searchText: operationSearchText(operation, record.searchTerms),
    businessSearchText: `${operation.business.slug} ${operation.business.name}`.toLowerCase(),
    price: operation.commercial.price,
    effects: operation.effects.map((effect) => effect.class),
    dataUse: operation.dataUse.map((entry) => entry.classification),
    integrated: record.integrated,
    routeable: record.routeable,
    ...(record.unavailableReason === undefined
      ? {}
      : { unavailableReason: record.unavailableReason }),
    readiness: record.readiness,
  };
}

export async function searchCurrentOperationFacts(
  input: OperationSearchInput,
  facts: readonly CurrentOperationSearchFact[],
  snapshotKey: string,
  load: (operationRef: PublicOperationRef) => Promise<CapabilityOperationSourceRecord | null>,
  now: number,
  navigation: OperationProjectionNavigationContract,
  expectedCount?: number,
  trustedCursorLastOperationRef?: PublicOperationRef,
): Promise<OperationSearchResult> {
  const normalized = normalizeSearch(input);
  if (normalized === undefined) return searchUnavailable("query_invalid", navigation);
  if (expectedCount !== undefined && facts.length !== expectedCount)
    return searchUnavailable("source_unavailable", navigation);
  if (facts.length > MAX_SOURCE) return searchUnavailable("source_capacity_exceeded", navigation);
  const cursor = trustedCursorLastOperationRef === undefined
    ? decodeCursor(
        normalized.cursor,
        normalized.query,
        normalized.filters,
        snapshotKey,
      )
    : { lastOperationRef: trustedCursorLastOperationRef };
  if (
    normalized.cursor !== undefined &&
    trustedCursorLastOperationRef === undefined &&
    cursor === undefined
  )
    return searchUnavailable("query_invalid", navigation);
  const matches = rankOperationSearchCandidates(
    normalized.query,
    facts.filter((fact) => matchesFactFilters(fact, normalized.filters, now)).map((fact) => ({
      value: fact,
      operationRef: fact.operationRef,
      searchText: fact.searchText,
    })),
  );
  const start = cursor?.lastOperationRef === undefined
    ? 0
    : Math.max(0, matches.findIndex((item) => item.operationRef === cursor.lastOperationRef) + 1);
  const pageMatches = matches.slice(start, start + normalized.limit);
  if (pageMatches.length === 0) {
    return {
      kind: "no_candidates",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      query: normalized.query,
      appliedFilters: normalized.filters,
      matchedCount: matches.length,
      ranking: [],
      navigation: noOperationNavigation(navigation),
    };
  }
  const records = await Promise.all(pageMatches.map(({ operationRef }) => load(operationRef as PublicOperationRef)));
  if (records.some((record) => record === null)) return searchUnavailable("source_unavailable", navigation);
  const items = records.map((record) => projectCapabilityOperation(
    record as CapabilityOperationSourceRecord,
    now,
    navigation,
  ));
  const ranking = pageMatches.map(({ operationRef, score }, index) => ({
    operationRef: operationRef as PublicOperationRef,
    rank: start + index + 1,
    score,
  }));
  const hasMore = start + items.length < matches.length;
  const lastItem = items.at(-1);
  if (lastItem === undefined) return searchUnavailable("source_unavailable", navigation);
  return {
    kind: "ok",
    schemaVersion: PublicOperationRegistrySchemaVersion,
    query: normalized.query,
    items,
    matchedCount: matches.length,
    ranking,
    pagination: {
      limit: normalized.limit,
      hasMore,
      ...(hasMore
        ? {
            nextCursor: encodeCursor(
              normalized.query,
              normalized.filters,
              snapshotKey,
              lastItem.operationRef,
            ),
          }
        : {}),
    },
    navigation: operationNavigation("inspect_only", navigation),
  };
}

function searchUnavailable(
  reason: "query_invalid" | "source_unavailable" | "source_capacity_exceeded",
  navigation: OperationProjectionNavigationContract,
): OperationSearchResult {
  return {
    kind: "unavailable",
    schemaVersion: PublicOperationRegistrySchemaVersion,
    reason,
    navigation: noOperationNavigation(navigation),
  };
}
function normalizeSearch(input: OperationSearchInput):
  | Readonly<{
      query: string;
      limit: number;
      cursor?: string;
      filters: OperationSearchFilters;
    }>
  | undefined {
  if (
    typeof input.query !== "string" ||
    input.query.trim().length > MAX_QUERY ||
    containsConcreteSensitiveInput(input.query)
  )
    return undefined;
  const limit = input.limit ?? MAX_LIMIT;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT ||
    (input.cursor !== undefined &&
      (input.cursor.length === 0 || input.cursor.length > MAX_CURSOR))
  )
    return undefined;
  const filters = input.filters ?? {};
  if (filters.currency !== undefined && !/^[A-Z]{3}$/.test(filters.currency))
    return undefined;
  if (
    filters.maximumPrice !== undefined &&
    !exactAmountSchema.safeParse(filters.maximumPrice).success
  )
    return undefined;
  return {
    query: input.query.trim().toLowerCase(),
    limit,
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    filters: {
      ...(filters.networkId === undefined
        ? {}
        : { networkId: filters.networkId.trim() }),
      ...(filters.location === undefined
        ? {}
        : { location: filters.location.trim().toLowerCase() }),
      ...(filters.effects === undefined
        ? {}
        : { effects: [...new Set(filters.effects)] }),
      ...(filters.dataUse === undefined
        ? {}
        : { dataUse: [...new Set(filters.dataUse)] }),
      ...(filters.availability === undefined
        ? {}
        : { availability: [...new Set(filters.availability)] }),
      ...(filters.currency === undefined ? {} : { currency: filters.currency }),
      ...(filters.maximumPrice === undefined
        ? {}
        : { maximumPrice: { ...filters.maximumPrice } }),
    },
  };
}

function containsConcreteSensitiveInput(query: string): boolean {
  const emailAddress = /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/i;
  const usSocialSecurityNumber = /\b\d{3}[- ]\d{2}[- ]\d{4}\b/;
  return emailAddress.test(query) || usSocialSecurityNumber.test(query);
}
function matchesFilters(
  operation: PublicOperationDescriptor,
  filters: OperationSearchFilters,
): boolean {
  if (
    filters.effects !== undefined &&
    !filters.effects.some((effect) =>
      operation.effects.some((candidate) => candidate.class === effect),
    )
  )
    return false;
  if (
    filters.dataUse !== undefined &&
    !filters.dataUse.some((classification) =>
      operation.dataUse.some(
        (candidate) => candidate.classification === classification,
      ),
    )
  )
    return false;
  if (
    filters.availability !== undefined &&
    !filters.availability.includes(operation.availability.posture)
  )
    return false;
  if (filters.currency !== undefined) {
    const currency =
      operation.commercial.price.kind === "on_request"
        ? undefined
        : operation.commercial.price.kind === "fixed"
          ? operation.commercial.price.amount.currency
          : operation.commercial.price.minimum.currency;
    if (currency !== filters.currency) return false;
  }
  if (
    filters.maximumPrice !== undefined &&
    !priceWithin(operation.commercial.price, filters.maximumPrice)
  )
    return false;
  if (
    filters.location !== undefined &&
    !`${operation.business.slug} ${operation.business.name}`
      .toLowerCase()
      .includes(filters.location)
  )
    return false;
  return true;
}
function matchesFactFilters(
  fact: CurrentOperationSearchFact,
  filters: OperationSearchFilters,
  now: number,
): boolean {
  if (filters.networkId !== undefined && filters.networkId !== fact.networkId) return false;
  if (filters.effects !== undefined && !filters.effects.some((effect) => fact.effects.includes(effect))) return false;
  if (filters.dataUse !== undefined && !filters.dataUse.some((entry) => fact.dataUse.includes(entry))) return false;
  const availability = fact.routeable
    && fact.readiness.validUntil !== undefined
    && fact.readiness.validUntil > now
    ? "routeable"
    : fact.integrated ? "setup_required" : "unavailable";
  if (filters.availability !== undefined && !filters.availability.includes(availability)) return false;
  if (filters.currency !== undefined) {
    const currency = fact.price.kind === "on_request"
      ? undefined
      : fact.price.kind === "fixed" ? fact.price.amount.currency : fact.price.minimum.currency;
    if (currency !== filters.currency) return false;
  }
  if (filters.maximumPrice !== undefined && !priceWithin(fact.price, filters.maximumPrice)) return false;
  return filters.location === undefined || fact.businessSearchText.includes(filters.location);
}
function searchTokens(query: string): string[] {
  const tokens = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return tokens.filter((token, index) =>
    !SEARCH_STOP_WORDS.has(token) &&
    !isRuntimeConstraintToken(token, tokens[index - 1]),
  );
}
function isRuntimeConstraintToken(token: string, previous: string | undefined): boolean {
  if (/^\d+$/.test(token) || SEARCH_MONTHS.has(token)) return true;
  return token.length === 3 && (previous === "from" || previous === "to");
}
function searchableText(searchText: readonly string[]): string[] {
  return (
    searchText
      .join(" ")
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  );
}
function operationSearchText(
  operation: PublicOperationDescriptor,
  searchTerms: readonly string[],
): readonly string[] {
  return [
    operation.operationId,
    operation.contract.capabilityId,
    operation.summary,
    operation.business.slug,
    operation.business.name,
    operation.offering.label,
    operation.offering.summary,
    ...operation.contract.customerAnnotations.map(
      (annotation) => annotation.label,
    ),
    ...searchTerms,
  ];
}
function scoreSearchText(
  searchText: readonly string[],
  tokens: readonly string[],
): number {
  return tokens.reduce(
    (total, token) =>
      total +
      searchableText(searchText).reduce(
        (best, term) => Math.max(best, searchTermMatchScore(term, token)),
        0,
      ),
    0,
  );
}
function searchTermMatchScore(term: string, token: string): number {
  if (term === token) return 4;
  if (SEARCH_CURRENCY_CODES.has(token) && term.startsWith(token)) return 2;
  if (
    Math.min(term.length, token.length) >= 4
    && (term.startsWith(token) || token.startsWith(term))
  ) return 2;
  if (token.length >= 5 && term.length >= 5 && oneTypoApart(term, token)) return 1;
  return token.length >= 5 && term.includes(token) ? 1 : 0;
}
function oneTypoApart(left: string, right: string): boolean {
  if (left.length > 32 || right.length > 32 || Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) {
    const mismatches: number[] = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) mismatches.push(index);
      if (mismatches.length > 2) return false;
    }
    if (mismatches.length === 1) return true;
    const [firstMismatch, secondMismatch] = mismatches;
    return mismatches.length === 2
      && firstMismatch !== undefined
      && secondMismatch !== undefined
      && secondMismatch === firstMismatch + 1
      && left[firstMismatch] === right[secondMismatch]
      && left[secondMismatch] === right[firstMismatch];
  }
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  let skipped = false;
  for (let shortIndex = 0, longIndex = 0; longIndex < longer.length; longIndex += 1) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
  }
  return true;
}
function priceWithin(
  price: PublicCommercialTerms["price"],
  maximum: ExactAmount,
): boolean {
  if (price.kind === "on_request") return false;
  const candidate = price.kind === "fixed" ? price.amount : price.minimum;
  const comparison = compareExactAmounts(candidate, maximum);
  return comparison !== undefined && comparison <= 0;
}
function encodeCursor(
  query: string,
  filters: OperationSearchFilters,
  snapshotKey: string,
  lastOperationRef: PublicOperationRef,
): string {
  return `cursor:v1:${canonicalDigest({ query, filters, snapshotKey, lastOperationRef }).slice(7)}:${encodeURIComponent(snapshotKey)}:${encodeURIComponent(lastOperationRef)}`;
}
type CursorPayload = Readonly<{ lastOperationRef?: PublicOperationRef }>;
function decodeCursor(
  cursor: string | undefined,
  query: string,
  filters: OperationSearchFilters,
  snapshotKey: string,
): CursorPayload | undefined {
  if (cursor === undefined) return {};
  const match = /^cursor:v1:([0-9a-f]{64}):([^:]*):(.+)$/.exec(cursor);
  if (match === null) return undefined;
  const digest = match[1];
  const encodedSnapshot = match[2];
  const encodedRef = match[3];
  if (
    digest === undefined ||
    encodedSnapshot === undefined ||
    encodedRef === undefined
  )
    return undefined;
  let cursorSnapshot: string;
  let lastRef: string;
  try {
    cursorSnapshot = decodeURIComponent(encodedSnapshot);
    lastRef = decodeURIComponent(encodedRef);
  } catch {
    return undefined;
  }
  if (cursorSnapshot !== snapshotKey || !isPublicOperationRef(lastRef))
    return undefined;
  return canonicalDigest({
    query,
    filters,
    snapshotKey: cursorSnapshot,
    lastOperationRef: lastRef,
  }).slice(7) === digest
    ? { lastOperationRef: lastRef }
    : undefined;
}
