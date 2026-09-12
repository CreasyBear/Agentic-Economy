import {
  compareExactAmounts,
  exactAmountSchema,
  type ExactAmount,
} from "@/modules/money/public";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import { SEARCH_STOP_WORDS } from "@/modules/common/normalize-search-text";
import {
  isPublicToolRef,
  type PublicToolRef,
} from "../public";
import {
  noToolNavigation,
  toolNavigation,
  projectCapabilityTool,
} from "./tool-project";
import {
  PublicToolRegistrySchemaVersion,
  type CapabilityToolSourceRecord,
  type CapabilityToolSourcePort,
  type ToolProjectionNavigationContract,
  type PublicCommercialTerms,
  type PublicDataUsePolicy,
  type PublicEffectPolicy,
  type PublicToolAvailability,
  type PublicToolDescriptor,
  type PublicToolNavigationRelation,
} from "./tool-projection-types";
import { degradeBackend } from "@/lib/observability/degrade-backend";

const TOOL_SEARCH_INTENT_WORDS = new Set([
  "api",
  "current",
  "data",
  "latest",
  "live",
  "provider",
  "result",
  "results",
  "search",
  "value",
]);
const TOOL_STOP_WORDS = new Set([
  ...SEARCH_STOP_WORDS,
  ...TOOL_SEARCH_INTENT_WORDS,
]);

export type ToolSearchTextCandidate<T> = Readonly<{
  value: T;
  toolRef: string;
  searchText: readonly string[];
}>;
export type CurrentToolSearchFact = Readonly<{
  toolRef: PublicToolRef;
  networkId: string;
  searchText: readonly string[];
  businessSearchText: string;
  price: PublicCommercialTerms["price"];
  effects: readonly PublicEffectPolicy[number]["class"][];
  dataUse: readonly PublicDataUsePolicy[number]["classification"][];
  integrated: boolean;
  routeable: boolean;
  unavailableReason?: CapabilityToolSourceRecord["unavailableReason"];
  readiness: CapabilityToolSourceRecord["readiness"];
}>;
export type ToolSearchRanking = Readonly<{
  toolRef: PublicToolRef;
  rank: number;
  score: number;
}>;
type RankedToolSearchTextCandidate<T> = ToolSearchTextCandidate<T> &
  Readonly<{ score: number }>;

export function rankToolSearchText<T>(
  query: string,
  candidates: readonly ToolSearchTextCandidate<T>[],
): readonly T[] {
  return rankToolSearchCandidates(query, candidates).map(
    ({ value }) => value,
  );
}

function rankToolSearchCandidates<T>(
  query: string,
  candidates: readonly ToolSearchTextCandidate<T>[],
): readonly RankedToolSearchTextCandidate<T>[] {
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
        left.toolRef.localeCompare(right.toolRef),
    );
}
export type ToolSearchFilters = Readonly<{
  networkId?: string;
  location?: string;
  effects?: readonly PublicEffectPolicy[number]["class"][];
  dataUse?: readonly PublicDataUsePolicy[number]["classification"][];
  availability?: readonly PublicToolAvailability["posture"][];
  currency?: string;
  maximumPrice?: ExactAmount;
}>;
export type ToolSearchInput = Readonly<{
  query: string;
  source?: "current" | "coinbase" | "payai";
  limit?: number;
  cursor?: string;
  filters?: ToolSearchFilters;
}>;
export type ToolSearchResult =
  | Readonly<{
      kind: "ok";
      schemaVersion: PublicToolRegistrySchemaVersion;
      query: string;
      items: readonly PublicToolDescriptor[];
      matchedCount?: number;
      partialResults?: boolean;
      ranking: readonly ToolSearchRanking[];
      pagination: Readonly<{
        limit: number;
        nextCursor?: string;
        hasMore: boolean;
      }>;
      navigation: readonly PublicToolNavigationRelation[];
    }>
  | Readonly<{
      kind: "no_candidates";
      schemaVersion: PublicToolRegistrySchemaVersion;
      query: string;
      appliedFilters: ToolSearchFilters;
      matchedCount?: number;
      partialResults?: boolean;
      ranking: readonly ToolSearchRanking[];
      navigation: readonly PublicToolNavigationRelation[];
    }>
  | Readonly<{
      kind: "unavailable";
      schemaVersion: PublicToolRegistrySchemaVersion;
      reason:
        "query_invalid" | "source_unavailable" | "source_capacity_exceeded";
      navigation: readonly PublicToolNavigationRelation[];
    }>;

const MAX_SOURCE = 256;
const MAX_QUERY = 256;
const MAX_CURSOR = 512;
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 100;
const MAX_NETWORK_ID_LENGTH = 200;
const MAX_LOCATION_LENGTH = 200;
const MAX_EFFECT_FILTERS = 3;
const MAX_DATA_USE_FILTERS = 4;
const MAX_AVAILABILITY_FILTERS = 3;
const SEARCH_CURRENCY_CODES = new Set(
  Intl.supportedValuesOf("currency").map((currency) => currency.toLowerCase()),
);
const SEARCH_MONTHS = new Set([
  "jan", "january", "feb", "february", "mar", "march", "apr", "april",
  "may", "jun", "june", "jul", "july", "aug", "august", "sep",
  "sept", "september", "oct", "october", "nov", "november", "dec",
  "december",
]);

export async function searchCapabilityTools(
  port: CapabilityToolSourcePort,
  input: ToolSearchInput,
  now = Date.now(),
): Promise<ToolSearchResult> {
  const normalized = normalizeToolSearchInput(input);
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
    ToolSearchTextCandidate<PublicToolDescriptor>
  > = [];
  for (const record of source.tools) {
    const tool = projectCapabilityTool(record, now, port.navigation);
    if (matchesToolFilters(tool, normalized.filters)) {
      projectedMatches.push({
        value: tool,
        toolRef: tool.toolRef,
        searchText: toolSearchText(tool, record.searchTerms),
      });
    }
  }
  const matches = rankToolSearchCandidates(
    normalized.query,
    projectedMatches,
  );
  const start =
    cursor?.lastToolRef === undefined
      ? 0
      : Math.max(
          0,
          matches.findIndex(
            (item) => item.toolRef === cursor.lastToolRef,
          ) + 1,
        );
  const pageMatches = matches.slice(start, start + normalized.limit);
  const items = pageMatches.map(({ value }) => value);
  const ranking = pageMatches.map(({ toolRef, score }, index) => ({
    toolRef: toolRef as PublicToolRef,
    rank: start + index + 1,
    score,
  }));
  const lastItem = items.at(-1);
  if (lastItem === undefined)
    return {
      kind: "no_candidates",
      schemaVersion: PublicToolRegistrySchemaVersion,
      query: normalized.query,
      appliedFilters: normalized.filters,
      matchedCount: matches.length,
      ranking: [],
      navigation: noToolNavigation(port.navigation),
    };
  const hasMore = start + items.length < matches.length;
  return {
    kind: "ok",
    schemaVersion: PublicToolRegistrySchemaVersion,
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
              lastItem.toolRef,
            ),
          }
        : {}),
    },
    navigation: toolNavigation("read_only", port.navigation),
  };
}

export function currentToolSearchFact(
  record: CapabilityToolSourceRecord,
  now: number,
  navigation: ToolProjectionNavigationContract,
): CurrentToolSearchFact {
  const tool = projectCapabilityTool(record, now, navigation);
  return {
    toolRef: tool.toolRef,
    networkId: record.networkId,
    searchText: toolSearchText(tool, record.searchTerms),
    businessSearchText: `${tool.business.slug} ${tool.business.name}`.toLowerCase(),
    price: tool.commercial.price,
    effects: tool.effects.map((effect) => effect.class),
    dataUse: tool.dataUse.map((entry) => entry.classification),
    integrated: record.integrated,
    routeable: record.routeable,
    ...(record.unavailableReason === undefined
      ? {}
      : { unavailableReason: record.unavailableReason }),
    readiness: record.readiness,
  };
}

export async function searchCurrentToolFacts(
  input: ToolSearchInput,
  facts: readonly CurrentToolSearchFact[],
  snapshotKey: string,
  load: (toolRef: PublicToolRef) => Promise<CapabilityToolSourceRecord | null>,
  now: number,
  navigation: ToolProjectionNavigationContract,
  expectedCount?: number,
  trustedCursorLastToolRef?: PublicToolRef,
): Promise<ToolSearchResult> {
  const normalized = normalizeToolSearchInput(input);
  if (normalized === undefined) return searchUnavailable("query_invalid", navigation);
  if (expectedCount !== undefined && facts.length !== expectedCount)
    return searchUnavailable("source_unavailable", navigation);
  if (facts.length > MAX_SOURCE) return searchUnavailable("source_capacity_exceeded", navigation);
  const cursor = trustedCursorLastToolRef === undefined
    ? decodeCursor(
        normalized.cursor,
        normalized.query,
        normalized.filters,
        snapshotKey,
      )
    : { lastToolRef: trustedCursorLastToolRef };
  if (
    normalized.cursor !== undefined &&
    trustedCursorLastToolRef === undefined &&
    cursor === undefined
  )
    return searchUnavailable("query_invalid", navigation);
  const matches = rankToolSearchCandidates(
    normalized.query,
    facts.filter((fact) => matchesFactFilters(fact, normalized.filters, now)).map((fact) => ({
      value: fact,
      toolRef: fact.toolRef,
      searchText: fact.searchText,
    })),
  );
  const start = cursor?.lastToolRef === undefined
    ? 0
    : Math.max(0, matches.findIndex((item) => item.toolRef === cursor.lastToolRef) + 1);
  const pageMatches = matches.slice(start, start + normalized.limit);
  if (pageMatches.length === 0) {
    return {
      kind: "no_candidates",
      schemaVersion: PublicToolRegistrySchemaVersion,
      query: normalized.query,
      appliedFilters: normalized.filters,
      matchedCount: matches.length,
      ranking: [],
      navigation: noToolNavigation(navigation),
    };
  }
  const records = await Promise.all(pageMatches.map(({ toolRef }) => load(toolRef as PublicToolRef)));
  if (records.some((record) => record === null)) return searchUnavailable("source_unavailable", navigation);
  const items = records.map((record) => projectCapabilityTool(
    record as CapabilityToolSourceRecord,
    now,
    navigation,
  ));
  const ranking = pageMatches.map(({ toolRef, score }, index) => ({
    toolRef: toolRef as PublicToolRef,
    rank: start + index + 1,
    score,
  }));
  const hasMore = start + items.length < matches.length;
  const lastItem = items.at(-1);
  if (lastItem === undefined) return searchUnavailable("source_unavailable", navigation);
  return {
    kind: "ok",
    schemaVersion: PublicToolRegistrySchemaVersion,
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
              lastItem.toolRef,
            ),
          }
        : {}),
    },
    navigation: toolNavigation("read_only", navigation),
  };
}

function searchUnavailable(
  reason: "query_invalid" | "source_unavailable" | "source_capacity_exceeded",
  navigation: ToolProjectionNavigationContract,
): ToolSearchResult {
  return {
    kind: "unavailable",
    schemaVersion: PublicToolRegistrySchemaVersion,
    reason,
    navigation: noToolNavigation(navigation),
  };
}
export function normalizeToolSearchInput(input: ToolSearchInput):
  | Readonly<{
      query: string;
      limit: number;
      cursor?: string;
      filters: ToolSearchFilters;
    }>
  | undefined {
  if (
    typeof input.query !== "string" ||
    input.query.trim().length > MAX_QUERY ||
    containsConcreteSensitiveInput(input.query)
  )
    return undefined;
  const limit = input.limit ?? DEFAULT_LIMIT;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT ||
    (input.cursor !== undefined &&
      (input.cursor.length === 0 || input.cursor.length > MAX_CURSOR))
  )
    return undefined;
  const filters = input.filters ?? {};
  if (
    (filters.networkId !== undefined &&
      filters.networkId.length > MAX_NETWORK_ID_LENGTH) ||
    (filters.location !== undefined &&
      filters.location.length > MAX_LOCATION_LENGTH) ||
    (filters.effects !== undefined &&
      filters.effects.length > MAX_EFFECT_FILTERS) ||
    (filters.dataUse !== undefined &&
      filters.dataUse.length > MAX_DATA_USE_FILTERS) ||
    (filters.availability !== undefined &&
      filters.availability.length > MAX_AVAILABILITY_FILTERS)
  )
    return undefined;
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
export function matchesToolFilters(
  tool: PublicToolDescriptor,
  filters: ToolSearchFilters,
): boolean {
  if (
    filters.effects !== undefined &&
    !filters.effects.some((effect) =>
      tool.effects.some((candidate) => candidate.class === effect),
    )
  )
    return false;
  if (
    filters.dataUse !== undefined &&
    !filters.dataUse.some((classification) =>
      tool.dataUse.some(
        (candidate) => candidate.classification === classification,
      ),
    )
  )
    return false;
  if (
    filters.availability !== undefined &&
    !filters.availability.includes(tool.availability.posture)
  )
    return false;
  if (filters.currency !== undefined) {
    const currency =
      tool.commercial.price.kind === "on_request"
        ? undefined
        : tool.commercial.price.kind === "fixed"
          ? tool.commercial.price.amount.currency
          : tool.commercial.price.minimum.currency;
    if (currency !== filters.currency) return false;
  }
  if (
    filters.maximumPrice !== undefined &&
    !priceWithin(tool.commercial.price, filters.maximumPrice)
  )
    return false;
  if (
    filters.location !== undefined &&
    !`${tool.business.slug} ${tool.business.name}`
      .toLowerCase()
      .includes(filters.location)
  )
    return false;
  return true;
}
function matchesFactFilters(
  fact: CurrentToolSearchFact,
  filters: ToolSearchFilters,
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
    !TOOL_STOP_WORDS.has(token) &&
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
function toolSearchText(
  tool: PublicToolDescriptor,
  searchTerms: readonly string[],
): readonly string[] {
  return [
    tool.toolId,
    tool.contract.capabilityId,
    tool.summary,
    tool.business.slug,
    tool.business.name,
    tool.listing.label,
    tool.listing.summary,
    ...tool.contract.customerAnnotations.map(
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
  filters: ToolSearchFilters,
  snapshotKey: string,
  lastToolRef: PublicToolRef,
): string {
  return `cursor:v1:${canonicalDigest({ query, filters, snapshotKey, lastOperationRef: lastToolRef }).slice(7)}:${encodeURIComponent(snapshotKey)}:${encodeURIComponent(lastToolRef)}`;
}
type CursorPayload = Readonly<{ lastToolRef?: PublicToolRef }>;
function decodeCursor(
  cursor: string | undefined,
  query: string,
  filters: ToolSearchFilters,
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
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: "decodeCursor", reason: "invalid_response" });
  }
  if (cursorSnapshot !== snapshotKey || !isPublicToolRef(lastRef))
    return undefined;
  return canonicalDigest({
    query,
    filters,
    snapshotKey: cursorSnapshot,
    lastOperationRef: lastRef,
  }).slice(7) === digest
    ? { lastToolRef: lastRef }
    : undefined;
}
