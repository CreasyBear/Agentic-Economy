import { Agent } from 'undici'

import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget, type DnsResolver } from '@/modules/network-guard/public'

import {
  cleanOptionalText,
  extractStorefrontDraftFromHtml,
  parseHttpUrl,
  type StorefrontImportInput,
  type StorefrontImportResult,
} from './internal/import-draft'

type StorefrontFetchInput = Parameters<typeof fetch>[0]
type StorefrontFetchInit = NonNullable<Parameters<typeof fetch>[1]>
export type StorefrontImportFetch = (input: StorefrontFetchInput, init?: StorefrontFetchInit) => Promise<Response>

export type StorefrontImportWebsiteOptions = {
  fetch?: StorefrontImportFetch
  dns?: DnsResolver
  maxRedirects?: number
  maxResponseBytes?: number
  timeoutMs?: number
}

const StorefrontImportMaxRedirects = 5
const StorefrontImportMaxResponseBytes = 2 * 1024 * 1024
const StorefrontImportTimeoutMs = 10_000

export async function importStorefrontDraftFromWebsite(
  input: StorefrontImportInput,
  options: StorefrontImportWebsiteOptions = {},
): Promise<StorefrontImportResult> {
  const parsedUrl = parseHttpUrl(input.websiteUrl)
  if (parsedUrl === undefined) {
    return {
      kind: 'error',
      code: 'storefront_import_invalid_url',
      retryable: false,
      reason: 'Enter a valid http or https website URL.',
    }
  }

  const fetchImpl = options.fetch ?? fetch
  const dnsResolver = options.dns ?? defaultDnsResolver
  const maxRedirects = options.maxRedirects ?? StorefrontImportMaxRedirects
  const maxResponseBytes = options.maxResponseBytes ?? StorefrontImportMaxResponseBytes
  const timeoutMs = options.timeoutMs ?? StorefrontImportTimeoutMs
  const dispatcher = options.fetch === undefined
    ? new Agent({ connect: { lookup: createGuardedLookup(dnsResolver) } })
    : undefined

  let currentUrl = parsedUrl
  let redirectsFollowed = 0
  let response: Response
  try {
    while (true) {
      if (!(await isPublicHttpTarget(currentUrl, dnsResolver))) return fetchFailed(false)

      const controller = new AbortController()
      const requestInit: StorefrontFetchInit = {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'AgenticEconomyStorefrontImporter/0.1',
        },
        redirect: 'manual',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]),
      }
      if (dispatcher !== undefined) Reflect.set(requestInit, 'dispatcher', dispatcher)

      response = await fetchImpl(currentUrl, requestInit)
      if (response.status < 300 || response.status >= 400) {
        if (!response.ok) {
          return {
            kind: 'error',
            code: 'storefront_import_fetch_failed',
            retryable: response.status >= 500,
            reason: 'The website did not return a readable page.',
          }
        }
        if (!isHtmlResponse(response)) return fetchFailed(false)
        const html = await readResponseTextWithCap(response, maxResponseBytes, controller)
        const abn = cleanOptionalText(input.abn)
        return extractStorefrontDraftFromHtml(
          abn === undefined
            ? { websiteUrl: currentUrl.toString(), html }
            : { websiteUrl: currentUrl.toString(), abn, html },
        )
      }

      const location = response.headers.get('location')
      if (location === null || redirectsFollowed >= maxRedirects) return fetchFailed(false)
      const redirectUrl = parseHttpUrl(new URL(location, currentUrl).toString())
      if (redirectUrl === undefined) return fetchFailed(false)
      currentUrl = redirectUrl
      redirectsFollowed += 1
    }
  } catch {
    return fetchFailed(true)
  } finally {
    if (dispatcher !== undefined) await dispatcher.close().catch(() => undefined)
  }
}

function fetchFailed(retryable: boolean): StorefrontImportResult {
  return {
    kind: 'error',
    code: 'storefront_import_fetch_failed',
    retryable,
    reason: 'The website could not be fetched. Check the URL and try again.',
  }
}

function isHtmlResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  return contentType === 'text/html' || contentType === 'application/xhtml+xml'
}

async function readResponseTextWithCap(response: Response, maxBytes: number, controller: AbortController): Promise<string> {
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let totalBytes = 0
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) return text + decoder.decode()
    totalBytes += value.byteLength
    if (totalBytes > maxBytes) {
      controller.abort()
      throw new Error('Storefront import response exceeded the byte cap.')
    }
    text += decoder.decode(value, { stream: true })
  }
}
