import type { SourceHash } from '@/modules/common/ids'
import {
  documentMatchesRegistryQuery,
  normalizeRegistrySearchText,
  resolveRegistrySearchLocation,
  type RegistrySearchDocument,
} from './search-documents'
import type { PublicBusinessCatalogSearchInput } from './search'

const CatalogSearchBackendValues = ['convex', 'dual', 'meilisearch'] as const
export type CatalogSearchBackend = (typeof CatalogSearchBackendValues)[number]

export type CatalogSearchHit = {
  documentId: string
  businessSlug: string
  serviceSlug: string
  generatedHash: SourceHash
  rank: number
}

export type CatalogSearchResult = {
  kind: 'ok'
  backend: 'meilisearch'
  query: string
  hits: readonly CatalogSearchHit[]
  estimatedTotalHits?: number
  processingTimeMs?: number
}

export type CatalogSearchTaskStatus =
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled'

export type CatalogSearchTaskReadback = {
  taskUid: string
  indexUid: string
  status: CatalogSearchTaskStatus
  type?: string
  enqueuedAt?: string
  startedAt?: string
  finishedAt?: string
  errorCode?: string
  errorMessage?: string
}

export type CatalogSearchPort = {
  search: (input: PublicBusinessCatalogSearchInput) => Promise<CatalogSearchResult>
  addOrReplaceDocuments: (
    documents: readonly RegistrySearchDocument[],
  ) => Promise<CatalogSearchTaskReadback>
  deleteDocuments: (
    documentIds: readonly string[],
  ) => Promise<CatalogSearchTaskReadback>
  configureIndex: () => Promise<CatalogSearchTaskReadback>
  readTask: (taskUid: string) => Promise<CatalogSearchTaskReadback>
}

export type MeiliCatalogSearchPortOptions = {
  host: string
  apiKey: string
  indexUid: string
  timeoutMs?: number
  fetcher?: typeof fetch
}

type MeiliTaskResponse = {
  taskUid?: number | string
  uid?: number | string
  indexUid?: string
  status?: string
  type?: string
  enqueuedAt?: string
  startedAt?: string
  finishedAt?: string
  error?: {
    code?: string
    message?: string
  }
}

type MeiliSearchResponse = {
  hits?: unknown[]
  estimatedTotalHits?: number
  processingTimeMs?: number
}

const DEFAULT_SEARCH_TIMEOUT_MS = 1500
const DEFAULT_SEARCH_LIMIT = 20
const MAX_SEARCH_LIMIT = 50

export class CatalogSearchPortError extends Error {
  readonly code: string

  constructor(code: string, message = code) {
    super(message)
    this.name = 'CatalogSearchPortError'
    this.code = code
  }
}

export function readCatalogSearchBackend(
  env: Record<string, string | undefined> = process.env,
): CatalogSearchBackend {
  const value = env.AE_SEARCH_BACKEND
  return value === 'dual' || value === 'meilisearch' || value === 'convex'
    ? value
    : 'convex'
}

function readCatalogSearchTimeoutMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const parsed = Number(env.AE_SEARCH_TIMEOUT_MS)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SEARCH_TIMEOUT_MS
  }
  return Math.min(Math.max(Math.trunc(parsed), 250), 10_000)
}

export function createMeiliCatalogSearchPort(
  options: MeiliCatalogSearchPortOptions,
): CatalogSearchPort {
  const host = options.host.replace(/\/+$/, '')
  const timeoutMs = options.timeoutMs ?? DEFAULT_SEARCH_TIMEOUT_MS
  const fetcher = options.fetcher ?? fetch

  async function requestJson<T>(
    path: string,
    init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
  ): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetcher(`${host}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new CatalogSearchPortError(
          'meilisearch_request_failed',
          `Meilisearch request failed with status ${response.status}.`,
        )
      }

      return (await response.json()) as T
    } catch (cause) {
      if (cause instanceof CatalogSearchPortError) {
        throw cause
      }
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        throw new CatalogSearchPortError('meilisearch_timeout')
      }
      throw new CatalogSearchPortError('meilisearch_unavailable')
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    async search(input) {
      const query = normalizeRegistrySearchText(input.query)
      if (query.length === 0) {
        return {
          kind: 'ok',
          backend: 'meilisearch',
          query: '',
          hits: [],
          estimatedTotalHits: 0,
        }
      }

      const limit = normalizeSearchLimit(input.limit)
      const body = {
        q: input.query.trim(),
        limit: Math.min(limit * 3, MAX_SEARCH_LIMIT),
        filter: buildMeiliSearchFilter(input),
        attributesToRetrieve: [
          'documentId',
          'schemaVersion',
          'businessSlug',
          'serviceSlug',
          'businessName',
          'serviceName',
          'serviceCategory',
          'serviceCategoryKey',
          'suburb',
          'stateTerritory',
          'postcode',
          'publicStatus',
          'trustTier',
          'firstRequestMode',
          'placeKeys',
          'serviceKeywords',
          'searchText',
          'serviceArea',
          'updatedAt',
          'generatedHash',
        ],
      }
      const response = await requestJson<MeiliSearchResponse>(
        `/indexes/${encodeURIComponent(options.indexUid)}/search`,
        { method: 'POST', body: JSON.stringify(body) },
      )

      const hits: CatalogSearchHit[] = []
      for (const hit of response.hits ?? []) {
        const document = toRegistrySearchDocument(hit)
        if (document === undefined || !documentMatchesRegistryQuery(document, input)) {
          continue
        }
        hits.push({
          documentId: document.documentId,
          businessSlug: document.businessSlug,
          serviceSlug: document.serviceSlug,
          generatedHash: document.generatedHash,
          rank: hits.length + 1,
        })
        if (hits.length >= limit) {
          break
        }
      }

      return {
        kind: 'ok',
        backend: 'meilisearch',
        query,
        hits,
        ...(response.estimatedTotalHits === undefined
          ? {}
          : { estimatedTotalHits: response.estimatedTotalHits }),
        ...(response.processingTimeMs === undefined
          ? {}
          : { processingTimeMs: response.processingTimeMs }),
      }
    },

    async addOrReplaceDocuments(documents) {
      const response = await requestJson<MeiliTaskResponse>(
        `/indexes/${encodeURIComponent(options.indexUid)}/documents?primaryKey=documentId`,
        { method: 'POST', body: JSON.stringify(documents) },
      )
      return toTaskReadback(response, options.indexUid)
    },

    async deleteDocuments(documentIds) {
      const response = await requestJson<MeiliTaskResponse>(
        `/indexes/${encodeURIComponent(options.indexUid)}/documents/delete-batch`,
        { method: 'POST', body: JSON.stringify(documentIds) },
      )
      return toTaskReadback(response, options.indexUid)
    },

    async configureIndex() {
      const response = await requestJson<MeiliTaskResponse>(
        `/indexes/${encodeURIComponent(options.indexUid)}/settings`,
        { method: 'PATCH', body: JSON.stringify(registrySearchIndexSettings()) },
      )
      return toTaskReadback(response, options.indexUid)
    },

    async readTask(taskUid) {
      const response = await requestJson<MeiliTaskResponse>(
        `/tasks/${encodeURIComponent(taskUid)}`,
        { method: 'GET' },
      )
      return toTaskReadback(response, options.indexUid)
    },
  }
}

export function createConfiguredMeiliCatalogSearchPort(
  env: Record<string, string | undefined> = process.env,
): CatalogSearchPort | undefined {
  const host = env.MEILISEARCH_HOST
  const apiKey = env.MEILISEARCH_ADMIN_KEY
  const indexUid = env.AE_SEARCH_INDEX_UID
  if (
    host === undefined ||
    host.trim().length === 0 ||
    apiKey === undefined ||
    apiKey.trim().length === 0 ||
    indexUid === undefined ||
    indexUid.trim().length === 0
  ) {
    return undefined
  }

  return createMeiliCatalogSearchPort({
    host,
    apiKey,
    indexUid,
    timeoutMs: readCatalogSearchTimeoutMs(env),
  })
}

export function buildMeiliSearchFilter(
  input: Pick<PublicBusinessCatalogSearchInput, 'query' | 'mode' | 'location'>,
): string {
  const filters = ['publicStatus = "published"']
  const location = resolveRegistrySearchLocation(input)
  if (location !== undefined) {
    filters.push(`placeKeys = "${escapeMeiliFilterString(location.key)}"`)
  }
  return filters.join(' AND ')
}

export function registrySearchIndexSettings(): Record<string, unknown> {
  return {
    filterableAttributes: [
      'publicStatus',
      'placeKeys',
      'businessSlug',
      'serviceSlug',
      'serviceCategoryKey',
      'suburb',
      'stateTerritory',
    ],
    searchableAttributes: [
      'businessName',
      'serviceName',
      'serviceCategory',
      'serviceKeywords',
      'searchText',
      'serviceArea',
      'suburb',
      'stateTerritory',
    ],
    sortableAttributes: ['updatedAt'],
    typoTolerance: {
      enabled: false,
    },
  }
}

function normalizeSearchLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_SEARCH_LIMIT
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_LIMIT)
}

function toRegistrySearchDocument(value: unknown): RegistrySearchDocument | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const record = value as Record<string, unknown>
  if (
    typeof record.documentId !== 'string' ||
    record.schemaVersion !== 'registry-search-document:v1' ||
    typeof record.businessSlug !== 'string' ||
    typeof record.serviceSlug !== 'string' ||
    typeof record.businessName !== 'string' ||
    typeof record.serviceName !== 'string' ||
    typeof record.serviceCategory !== 'string' ||
    typeof record.serviceCategoryKey !== 'string' ||
    typeof record.suburb !== 'string' ||
    typeof record.stateTerritory !== 'string' ||
    record.publicStatus !== 'published' ||
    typeof record.trustTier !== 'string' ||
    typeof record.firstRequestMode !== 'string' ||
    !Array.isArray(record.placeKeys) ||
    !Array.isArray(record.serviceKeywords) ||
    typeof record.searchText !== 'string' ||
    typeof record.serviceArea !== 'string' ||
    typeof record.updatedAt !== 'number' ||
    typeof record.generatedHash !== 'string'
  ) {
    return undefined
  }

  return {
    documentId: record.documentId,
    schemaVersion: 'registry-search-document:v1',
    businessSlug: record.businessSlug,
    serviceSlug: record.serviceSlug,
    businessName: record.businessName,
    serviceName: record.serviceName,
    serviceCategory: record.serviceCategory,
    serviceCategoryKey: record.serviceCategoryKey,
    suburb: record.suburb,
    stateTerritory: record.stateTerritory,
    ...(typeof record.postcode === 'string' ? { postcode: record.postcode } : {}),
    publicStatus: 'published',
    trustTier: record.trustTier as RegistrySearchDocument['trustTier'],
    firstRequestMode: record.firstRequestMode as RegistrySearchDocument['firstRequestMode'],
    placeKeys: record.placeKeys.filter((item): item is string => typeof item === 'string'),
    serviceKeywords: record.serviceKeywords.filter((item): item is string => typeof item === 'string'),
    searchText: record.searchText,
    serviceArea: record.serviceArea,
    updatedAt: record.updatedAt,
    generatedHash: record.generatedHash as SourceHash,
  }
}

function toTaskReadback(
  response: MeiliTaskResponse,
  fallbackIndexUid: string,
): CatalogSearchTaskReadback {
  const taskUid = response.taskUid ?? response.uid
  if (taskUid === undefined) {
    throw new CatalogSearchPortError('meilisearch_task_missing')
  }

  return {
    taskUid: String(taskUid),
    indexUid: response.indexUid ?? fallbackIndexUid,
    status: normalizeTaskStatus(response.status),
    ...(response.type === undefined ? {} : { type: response.type }),
    ...(response.enqueuedAt === undefined ? {} : { enqueuedAt: response.enqueuedAt }),
    ...(response.startedAt === undefined ? {} : { startedAt: response.startedAt }),
    ...(response.finishedAt === undefined ? {} : { finishedAt: response.finishedAt }),
    ...(response.error?.code === undefined ? {} : { errorCode: response.error.code }),
    ...(response.error?.message === undefined ? {} : { errorMessage: response.error.message }),
  }
}

function normalizeTaskStatus(value: string | undefined): CatalogSearchTaskStatus {
  switch (value) {
    case 'enqueued':
      return 'queued'
    case 'processing':
    case 'succeeded':
    case 'failed':
    case 'canceled':
      return value
    default:
      return 'queued'
  }
}

function escapeMeiliFilterString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
