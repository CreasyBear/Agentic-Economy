import { describe, expect, it } from 'vitest'

import { buildPublicThreadSeo } from '@/modules/seo/public'

describe('public thread SEO builder', () => {
  it('builds a noindex article share preview from the first turn one-line', () => {
    const seo = buildPublicThreadSeo({
      threadId: 'thr_123',
      title: 'plumber in parramatta',
      firstTurnOneLine: '3 listed businesses match.',
      options: { canonicalBaseUrl: 'https://ae.example/' },
    })

    expect(seo).toMatchObject({
      threadId: 'thr_123',
      title: 'plumber in parramatta | Agentic Economy',
      description: '3 listed businesses match.',
      canonicalUrl: 'https://ae.example/t/thr_123',
      indexDirective: 'noindex',
      ogType: 'article',
    })
  })

  it('falls back to the thread title when no turn one-line is available', () => {
    const seo = buildPublicThreadSeo({
      threadId: 'thr_456',
      title: 'dentist bondi',
      options: { canonicalBaseUrl: 'https://ae.example' },
    })

    expect(seo.description).toBe('dentist bondi')
    expect(seo.canonicalUrl).toBe('https://ae.example/t/thr_456')
    expect(seo.indexDirective).toBe('noindex')
  })

  it('uses the title verbatim and never claims booking or payment', () => {
    const seo = buildPublicThreadSeo({
      threadId: 'thr_789',
      title: 'electrician newcastle',
      firstTurnOneLine: 'The business handles timing, price, and availability.',
    })

    expect(seo.title).toBe('electrician newcastle | Agentic Economy')
    expect(seo.description).not.toMatch(/book now|booking confirmed|pay now|payment required/i)
  })
})
