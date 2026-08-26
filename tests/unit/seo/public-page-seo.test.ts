import { describe, expect, it } from 'vitest'

import { HOME, HOME_FAQ } from '@/content/brand-copy'
import {
  buildFaqPageJsonLd,
  buildPublicPageHead,
  buildSiteJsonLd,
  serializeJsonLd,
} from '@/modules/seo/public'

describe('public page SEO', () => {
  it('emits canonical, Open Graph, and Twitter tags from one helper', () => {
    const head = buildPublicPageHead({
      path: '/about',
      title: 'About | Agentic Economy',
      description: 'A market for agent-callable work.',
      canonicalBaseUrl: 'https://ae.example/',
    })

    expect(head.meta).toContainEqual({ title: 'About | Agentic Economy' })
    expect(head.meta).toContainEqual({ name: 'robots', content: 'index,follow' })
    expect(head.meta).toContainEqual({ property: 'og:url', content: 'https://ae.example/about' })
    expect(head.meta).toContainEqual({ name: 'twitter:card', content: 'summary' })
    expect(head.links).toEqual([{ rel: 'canonical', href: 'https://ae.example/about' }])
    expect(head.scripts).toBeUndefined()
  })

  it('keeps the home URL unslashed and attaches site plus FAQ JSON-LD', () => {
    const jsonLd = [...buildSiteJsonLd('https://ae.example/'), buildFaqPageJsonLd(HOME_FAQ)]
    const head = buildPublicPageHead({
      path: '/',
      title: HOME.metaTitle,
      description: HOME.metaDescription,
      canonicalBaseUrl: 'https://ae.example/',
      jsonLd,
    })

    expect(head.links).toEqual([{ rel: 'canonical', href: 'https://ae.example' }])
    expect(head.scripts?.[0]?.type).toBe('application/ld+json')
    const serialized = head.scripts?.[0]?.children ?? ''
    expect(serialized).toContain('WebSite')
    expect(serialized).toContain('FAQPage')
    expect(serialized).toContain('/market?query={search_term_string}\\u0026window=30d')
    expect(serializeJsonLd(jsonLd)).not.toContain('<')
  })

  it('marks a page noindex without dropping follow', () => {
    const head = buildPublicPageHead({
      path: '/sign-in',
      title: 'Sign in | Agentic Economy',
      description: 'Sign in to Agentic Economy.',
      index: false,
    })

    expect(head.meta).toContainEqual({ name: 'robots', content: 'noindex,follow' })
    expect(head.links).toEqual([])
  })
})
