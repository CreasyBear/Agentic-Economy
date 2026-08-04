import sindreSlugify from '@sindresorhus/slugify'
import { Agent } from 'undici'

import { createGuardedLookup, defaultDnsResolver, isPublicHttpTarget, type DnsResolver } from '@/modules/network-guard/public'

import type { PublicOwnerClaimFlowInput } from '@/modules/catalog/public'

export const StorefrontImportSourceLabel = 'imported-from-website' as const
export const StorefrontEnrichmentSourceLabel = 'gathered-from-web-search' as const
export const StorefrontImportConfirmationState = 'unconfirmed' as const

/**
 * A drafted fact is either read from a business website or gathered by a web
 * search. Both stay unconfirmed until the owner reviews them.
 */
export type StorefrontDraftSourceLabel =
  | typeof StorefrontImportSourceLabel
  | typeof StorefrontEnrichmentSourceLabel

export type StorefrontImportInput = {
  websiteUrl: string
  abn?: string | undefined
}

export type StorefrontImportedFactField =
  | keyof PublicOwnerClaimFlowInput
  | 'websiteUrl'
  | 'abn'
  | 'contactHint'

export type StorefrontImportedFact = {
  field: StorefrontImportedFactField
  label: string
  value: string
  sourceLabel: StorefrontDraftSourceLabel
  confirmation: typeof StorefrontImportConfirmationState
  evidenceRef: string
}

export type StorefrontImportDraft = {
  kind: 'draft'
  schemaVersion: 'storefront-import-draft:v1'
  status: 'draft_unconfirmed'
  profile: PublicOwnerClaimFlowInput
  facts: readonly StorefrontImportedFact[]
  source: {
    kind: 'website' | 'web_search'
    url: string
    label: StorefrontDraftSourceLabel
    confirmation: typeof StorefrontImportConfirmationState
  }
  boundaryStatement: string
}

export type StorefrontImportResult =
  | { kind: 'ok'; draft: StorefrontImportDraft }
  | { kind: 'error'; code: 'storefront_import_invalid_url' | 'storefront_import_fetch_failed' | 'storefront_import_no_facts'; retryable: boolean; reason: string }

export type StorefrontDraftConfirmationResult =
  | { kind: 'confirmed'; input: PublicOwnerClaimFlowInput }
  | { kind: 'error'; code: 'storefront_import_unconfirmed'; retryable: false; reason: string }

type StorefrontFetchInput = Parameters<typeof fetch>[0]
type StorefrontFetchInit = NonNullable<Parameters<typeof fetch>[1]>

export type StorefrontImportFetch = (input: StorefrontFetchInput, init?: StorefrontFetchInit) => Promise<Response>


type StorefrontImportWebsiteOptions = {
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
  options: StorefrontImportWebsiteOptions = {}
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

  const dispatcher = options.fetch === undefined ? new Agent({ connect: { lookup: createGuardedLookup(dnsResolver) } }) : undefined

  let currentUrl = parsedUrl
  let redirectsFollowed = 0
  let response: Response
  try {
    while (true) {
      if (!(await isPublicHttpTarget(currentUrl, dnsResolver))) {
        return fetchFailed(false)
      }

      const controller = new AbortController()
      const requestInit: StorefrontFetchInit = {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'AgenticEconomyStorefrontImporter/0.1',
        },
        redirect: 'manual',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]),
      }
      if (dispatcher !== undefined) {
        Reflect.set(requestInit, 'dispatcher', dispatcher)
      }

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

        if (!isHtmlResponse(response)) {
          return fetchFailed(false)
        }

        const html = await readResponseTextWithCap(response, maxResponseBytes, controller)
        const abn = cleanOptionalText(input.abn)
        return extractStorefrontDraftFromHtml(abn === undefined ? { websiteUrl: currentUrl.toString(), html } : { websiteUrl: currentUrl.toString(), abn, html })
      }

      const location = response.headers.get('location')
      if (location === null || redirectsFollowed >= maxRedirects) {
        return fetchFailed(false)
      }

      const redirectUrl = parseHttpUrl(new URL(location, currentUrl).toString())
      if (redirectUrl === undefined) {
        return fetchFailed(false)
      }
      currentUrl = redirectUrl
      redirectsFollowed += 1
    }
  } catch {
    return fetchFailed(true)
  } finally {
    if (dispatcher !== undefined) {
      await dispatcher.close().catch(() => undefined)
    }
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
  if (response.body === null) {
    return ''
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let totalBytes = 0
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      return text + decoder.decode()
    }

    totalBytes += value.byteLength
    if (totalBytes > maxBytes) {
      controller.abort()
      throw new Error('Storefront import response exceeded the byte cap.')
    }

    text += decoder.decode(value, { stream: true })
  }
}

export function extractStorefrontDraftFromHtml(input: StorefrontImportInput & { html: string }): StorefrontImportResult {
  const parsedUrl = parseHttpUrl(input.websiteUrl)
  if (parsedUrl === undefined) {
    return {
      kind: 'error',
      code: 'storefront_import_invalid_url',
      retryable: false,
      reason: 'Enter a valid http or https website URL.',
    }
  }

  const sourceUrl = parsedUrl.toString()
  const html = input.html
  const title = firstText([
    readMetaContent(html, 'property', 'og:site_name'),
    readMetaContent(html, 'property', 'og:title'),
    readTitle(html),
    readFirstTagText(html, 'h1'),
  ])
  const description = firstText([
    readMetaContent(html, 'name', 'description'),
    readMetaContent(html, 'property', 'og:description'),
    readFirstTagText(html, 'p'),
  ])
  const heading = firstText([readFirstTagText(html, 'h1'), title])
  const visibleText = htmlToText(html)
  const contactHint = readContactHint(visibleText)
  const category = inferCategory(`${title} ${description} ${visibleText}`)
  const serviceName = inferServiceName(heading, category)
  const businessName = cleanBusinessName(title, parsedUrl.hostname)
  const sourceLabel = `Website import reviewed by owner: ${parsedUrl.origin}`
  const profile: PublicOwnerClaimFlowInput = {
    businessName,
    category,
    suburb: '',
    stateTerritory: '',
    requestedSlug: normalizeStorefrontSlug(businessName),
    publishedPhone: '',
    ownerMessage: 'Draft imported from the business website for owner review before publication.',
    sourceLabel,
    serviceName,
    serviceCategory: category,
    serviceSummary: description ?? `Owner should review the service details imported from ${parsedUrl.hostname}.`,
    serviceArea: '',
    hoursOrUnknown: '',
    photoUrl: firstText([readMetaContent(html, 'property', 'og:image')]) ?? '',
    responseTimeMinutes: '',
    firstRequestMode: 'not_available_yet',
    publicDisclosure: 'First request instructions are not available yet.',
    noContactReason: 'Owner has not confirmed public contact instructions for this page.',
  }

  const facts = buildFacts(sourceUrl, profile, input.abn, contactHint)
  if (facts.length === 0) {
    return {
      kind: 'error',
      code: 'storefront_import_no_facts',
      retryable: false,
      reason: 'No useful public facts were found on that page. Enter the page details manually.',
    }
  }

  return {
    kind: 'ok',
    draft: {
      kind: 'draft',
      schemaVersion: 'storefront-import-draft:v1',
      status: 'draft_unconfirmed',
      profile,
      facts,
      source: {
        kind: 'website',
        url: sourceUrl,
        label: StorefrontImportSourceLabel,
        confirmation: StorefrontImportConfirmationState,
      },
      boundaryStatement: 'This draft is not published until the owner confirms it. AE does not book, charge, dispatch, or auto-fulfil.',
    },
  }
}

export function confirmStorefrontImportDraft(
  draft: StorefrontImportDraft,
  ownerConfirmed: boolean
): StorefrontDraftConfirmationResult {
  if (!ownerConfirmed) {
    return {
      kind: 'error',
      code: 'storefront_import_unconfirmed',
      retryable: false,
      reason: 'Review and confirm imported facts before publishing this service page.',
    }
  }

  return { kind: 'confirmed', input: draft.profile }
}

function buildFacts(
  sourceUrl: string,
  profile: PublicOwnerClaimFlowInput,
  abn: string | undefined,
  contactHint: string | undefined
): StorefrontImportedFact[] {
  const facts: StorefrontImportedFact[] = [
    fact('websiteUrl', 'Website URL', sourceUrl, sourceUrl),
    fact('businessName', 'Business name', profile.businessName, sourceUrl),
    fact('category', 'Business category', profile.category, sourceUrl),
    fact('requestedSlug', 'Suggested public slug', profile.requestedSlug, sourceUrl),
    fact('serviceName', 'Service name', profile.serviceName, sourceUrl),
    fact('serviceCategory', 'Service category', profile.serviceCategory, sourceUrl),
    fact('serviceSummary', 'Service summary', profile.serviceSummary, sourceUrl),
  ]

  if (profile.photoUrl.length > 0) {
    facts.push(fact('photoUrl', 'Photo URL', profile.photoUrl, sourceUrl))
  }

  if (abn !== undefined) {
    facts.push(fact('abn', 'ABN supplied for owner review', abn, sourceUrl))
  }

  if (contactHint !== undefined) {
    facts.push(fact('contactHint', 'Contact hint', contactHint, sourceUrl))
  }

  return facts.filter((item) => item.value.trim().length > 0)
}

function fact(field: StorefrontImportedFactField, label: string, value: string, sourceUrl: string): StorefrontImportedFact {
  return {
    field,
    label,
    value,
    sourceLabel: StorefrontImportSourceLabel,
    confirmation: StorefrontImportConfirmationState,
    evidenceRef: sourceUrl,
  }
}

function parseHttpUrl(value: string): URL | undefined {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined
    }
    url.hash = ''
    return url
  } catch {
    return undefined
  }
}

function readTitle(html: string): string | undefined {
  return cleanOptionalText(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/iu))
}

function readFirstTagText(html: string, tag: string): string | undefined {
  return cleanOptionalText(matchFirst(html, new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'iu')))
}

function readMetaContent(html: string, attrName: 'name' | 'property', attrValue: string): string | undefined {
  const escaped = escapeRegExp(attrValue)
  const attr = escapeRegExp(attrName)
  const patterns = [
    new RegExp(`<meta[^>]*${attr}=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'iu'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${escaped}["'][^>]*>`, 'iu'),
  ]
  for (const pattern of patterns) {
    const value = cleanOptionalText(matchFirst(html, pattern))
    if (value !== undefined) {
      return value
    }
  }
  return undefined
}

function matchFirst(value: string, pattern: RegExp): string | undefined {
  return pattern.exec(value)?.[1]
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replaceAll(/<script[\s\S]*?<\/script>/giu, ' ')
      .replaceAll(/<style[\s\S]*?<\/style>/giu, ' ')
      .replaceAll(/<[^>]+>/gu, ' ')
      .replaceAll(/\s+/gu, ' ')
      .trim()
  )
}

function firstText(values: readonly (string | undefined)[]): string | undefined {
  for (const value of values) {
    const cleaned = cleanOptionalText(value)
    if (cleaned !== undefined) {
      return cleaned
    }
  }
  return undefined
}

function cleanOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const cleaned = decodeHtmlEntities(value.replaceAll(/<[^>]+>/gu, ' '))
    .replaceAll(/[<>]/g, '')
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .slice(0, 280)
  return cleaned.length === 0 ? undefined : cleaned
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&ndash;', '–')
    .replaceAll('&mdash;', '—')
}

function cleanBusinessName(title: string | undefined, hostname: string): string {
  const fallback = hostname.replace(/^www\./iu, '').split('.').filter(Boolean).at(0) ?? 'Business'
  const raw = title ?? fallback
  const [firstPart] = raw.split(/\s+[|–—-]\s+/u)
  return cleanOptionalText(firstPart) ?? 'Business'
}

function inferCategory(text: string): string {
  const lower = text.toLowerCase()
  const matches: readonly [RegExp, string][] = [
    [/plumb|pipe|drain|hot water/u, 'Plumbing'],
    [/electric|switchboard|power|lighting/u, 'Electrical services'],
    [/clean|carpet|window washing/u, 'Cleaning services'],
    [/roof|gutter/u, 'Roofing services'],
    [/account|bookkeeping|tax/u, 'Accounting services'],
    [/law|legal|solicitor/u, 'Legal services'],
    [/dentist|dental/u, 'Dental services'],
    [/physio|health|clinic/u, 'Health services'],
    [/software|saas|developer|technology/u, 'Software services'],
  ]
  for (const [pattern, category] of matches) {
    if (pattern.test(lower)) {
      return category
    }
  }
  return 'Business service'
}

function inferServiceName(heading: string | undefined, category: string): string {
  const cleaned = cleanOptionalText(heading)
  if (cleaned === undefined || cleaned.length > 80) {
    return category
  }
  return cleaned
}

function readContactHint(text: string): string | undefined {
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(text)
  const hasPhone = /(?:\+?61|0)[\s().-]*\d(?:[\s().-]*\d){7,9}/u.test(text)
  if (!hasEmail && !hasPhone) {
    return undefined
  }
  if (hasEmail && hasPhone) {
    return 'Email and phone contact details were observed on the source website. Confirm what should appear before publishing.'
  }
  return hasEmail
    ? 'An email contact detail was observed on the source website. Confirm what should appear before publishing.'
    : 'A phone contact detail was observed on the source website. Confirm what should appear before publishing.'
}

/** Storefront drafts delegate to the shared library, then apply an 80-character cap, trailing-dash removal, and business fallback. */
export function normalizeStorefrontSlug(value: string): string {
  const slug = sindreSlugify(value).slice(0, 80).replace(/-+$/, '')
  return slug.length === 0 ? 'business' : slug
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
