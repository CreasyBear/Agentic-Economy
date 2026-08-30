import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { isRecord } from '@/modules/common/is-record'
import { validateDiscoveryExtensionSpec } from '@x402/extensions/bazaar'

import {
  admitBazaarDiscoveryInfo,
  type BazaarAdmission,
} from './publication-importer-x402-bazaar'
import {
  FACILITATOR_DISCOVERY_DEFAULT_PAGE_SIZE,
  FACILITATOR_DISCOVERY_URLS,
  parseFacilitatorDiscoveryPage,
} from './facilitator-discovery-ingest'

export const FACILITATOR_DISCOVERY_MAX_PAGES = 4 as const
export const FACILITATOR_DISCOVERY_MAX_BODY_BYTES = 2_097_152 as const
export const FACILITATOR_DISCOVERY_REQUEST_TIMEOUT_MS = 10_000 as const
export const FACILITATOR_DISCOVERY_JOB_TIMEOUT_MS = 20_000 as const

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

type DiscoveryPage = Readonly<{
  items: readonly unknown[]
  nextOffset?: number
  nextCursor?: string
}>

export type FacilitatorDiscoveryFetchedPage = Readonly<{
  sourceUrl: string
  requestUrl: string
  page: DiscoveryPage
}>

export type FacilitatorDiscoveryFetchResult = Readonly<{
  pages: readonly FacilitatorDiscoveryFetchedPage[]
  complete: boolean
}>

export function admitOfficialBazaarFromPaymentRequired(
  paymentRequired: Readonly<Record<string, unknown>>,
): BazaarAdmission {
  const extensions = paymentRequired.extensions
  const extension = isRecord(extensions) ? extensions.bazaar : undefined
  if (extension === undefined) {
    return { kind: 'absent' }
  }
  if (!isRecord(extension)) {
    return { kind: 'refused', reason: 'bazaar_discovery_invalid' }
  }
  try {
    const validation = validateDiscoveryExtensionSpec(extension)
    if (!validation.valid) {
      return { kind: 'refused', reason: 'bazaar_discovery_invalid' }
    }
    const info = isRecord(extension.info) ? extension.info : undefined
    if (info === undefined || !isRecord(info.input)) {
      return { kind: 'refused', reason: 'bazaar_discovery_invalid' }
    }
    return admitBazaarDiscoveryInfo(extension, { input: info.input, output: info.output })
  } catch {
    return { kind: 'refused', reason: 'bazaar_discovery_invalid' }
  }
}

export async function fetchFacilitatorDiscoveryPages(input: Readonly<{
  fetcher?: Fetcher
  now?: () => number
  jobTimeoutMs?: number
  sourceUrls?: readonly string[]
}> = {}): Promise<FacilitatorDiscoveryFetchResult> {
  const fetcher = input.fetcher ?? fetch
  const now = input.now ?? Date.now
  const jobTimeoutMs = input.jobTimeoutMs ?? FACILITATOR_DISCOVERY_JOB_TIMEOUT_MS
  const sourceUrls = input.sourceUrls ?? FACILITATOR_DISCOVERY_URLS
  const deadline = now() + Math.max(0, jobTimeoutMs)
  const pages: FacilitatorDiscoveryFetchedPage[] = []
  let complete = true

  for (const sourceUrl of sourceUrls) {
    if (!FACILITATOR_DISCOVERY_URLS.includes(sourceUrl as (typeof FACILITATOR_DISCOVERY_URLS)[number])) {
      complete = false
      continue
    }
    let offset = 0
    let cursor: string | undefined
    let hasNext = true
    while (hasNext) {
      if (pages.length >= FACILITATOR_DISCOVERY_MAX_PAGES || now() >= deadline) {
        complete = false
        break
      }
      const requestUrl = discoveryPageUrl(sourceUrl, offset, cursor)
      const page = await fetchPage(fetcher, requestUrl)
      if (page === undefined) {
        complete = false
        break
      }
      pages.push({ sourceUrl, requestUrl, page })
      if (page.nextCursor !== undefined) {
        cursor = page.nextCursor
        continue
      }
      if (page.nextOffset !== undefined) {
        offset = page.nextOffset
        cursor = undefined
        continue
      }
      hasNext = false
    }
    if (!complete) break
  }
  return { pages, complete }
}

async function fetchPage(fetcher: Fetcher, requestUrl: string): Promise<DiscoveryPage | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FACILITATOR_DISCOVERY_REQUEST_TIMEOUT_MS)
  try {
    const response = await fetcher(requestUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) return undefined
    const body = await readBoundedRequestText(response, FACILITATOR_DISCOVERY_MAX_BODY_BYTES)
    if (!body.ok) return undefined
    let document: unknown
    try {
      document = JSON.parse(body.text) as unknown
    } catch {
      return undefined
    }
    return parseFacilitatorDiscoveryPage(document)
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

function discoveryPageUrl(sourceUrl: string, offset: number, cursor: string | undefined): string {
  const url = new URL(sourceUrl)
  url.searchParams.set('limit', String(FACILITATOR_DISCOVERY_DEFAULT_PAGE_SIZE))
  if (cursor === undefined) url.searchParams.set('offset', String(offset))
  else url.searchParams.set('cursor', cursor)
  return url.toString()
}
