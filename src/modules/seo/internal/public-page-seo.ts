import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import { serializeJsonLd, type JsonLdObject } from './json-ld'

export const SeoSiteName = 'Agentic Economy' as const

export type PublicPageSeoInput = {
  path: string
  title: string
  description: string
  canonicalBaseUrl?: string
  index?: boolean
  jsonLd?: readonly JsonLdObject[]
}

export type PublicPageHeadMeta = {
  title?: string
  name?: string
  property?: string
  content?: string
}

export type PublicPageHead = {
  meta: PublicPageHeadMeta[]
  links: Array<{ rel: string; href: string }>
  scripts?: Array<{ type: string; children: string }>
}

export function buildPublicPageHead(input: PublicPageSeoInput): PublicPageHead {
  const canonicalUrl = absoluteUrl(input.canonicalBaseUrl, input.path)
  const indexDirective = input.index === false ? 'noindex,follow' : 'index,follow'
  const meta: PublicPageHeadMeta[] = [
    { title: input.title },
    { name: 'description', content: input.description },
    { name: 'robots', content: indexDirective },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: SeoSiteName },
    { property: 'og:title', content: input.title },
    { property: 'og:description', content: input.description },
    { name: 'twitter:card', content: 'summary' },
    { name: 'twitter:title', content: input.title },
    { name: 'twitter:description', content: input.description },
  ]
  if (canonicalUrl !== undefined) {
    meta.push(
      { property: 'og:url', content: canonicalUrl },
    )
  }

  const links = canonicalUrl === undefined
    ? []
    : [{ rel: 'canonical', href: canonicalUrl }]

  const jsonLd = input.jsonLd
  if (jsonLd === undefined || jsonLd.length === 0) {
    return { meta, links }
  }

  return {
    meta,
    links,
    scripts: [
      {
        type: 'application/ld+json',
        children: serializeJsonLd(jsonLd),
      },
    ],
  }
}

export function buildSiteJsonLd(canonicalBaseUrl: string): readonly JsonLdObject[] {
  const origin = trimTrailingSlashes(canonicalBaseUrl)
  const organizationId = `${origin}#organization`
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': organizationId,
      name: SeoSiteName,
      url: origin,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${origin}#website`,
      name: SeoSiteName,
      url: origin,
      publisher: { '@id': organizationId },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${origin}/market?query={search_term_string}&window=30d`,
        'query-input': 'required name=search_term_string',
      },
    },
  ]
}

export function buildFaqPageJsonLd(
  questions: readonly { question: string; answer: string }[],
): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.answer,
      },
    })),
  }
}

function absoluteUrl(canonicalBaseUrl: string | undefined, path: string): string | undefined {
  if (canonicalBaseUrl === undefined) {
    return undefined
  }

  const origin = trimTrailingSlashes(canonicalBaseUrl)
  if (path === '/') {
    return origin
  }

  return `${origin}${path}`
}
