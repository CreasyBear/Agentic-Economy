import { describe, expect, it } from 'vitest'

import { withUtm } from '@/lib/attribution/with-utm'

describe('withUtm', () => {
  it('adds the four UTM fields given and keeps existing query and hash', () => {
    const tagged = withUtm('https://app.aecon.ai/owner/credit?ref=abc#top', {
      source: 'aecon', medium: 'email', campaign: 'approval', content: 'cta',
    })
    const url = new URL(tagged)
    expect(url.searchParams.get('utm_source')).toBe('aecon')
    expect(url.searchParams.get('utm_medium')).toBe('email')
    expect(url.searchParams.get('utm_campaign')).toBe('approval')
    expect(url.searchParams.get('utm_content')).toBe('cta')
    expect(url.searchParams.get('ref')).toBe('abc')
    expect(url.hash).toBe('#top')
  })

  it('omits utm_content when none is given', () => {
    const url = new URL(withUtm('https://app.aecon.ai/market', { source: 'aecon', medium: 'email', campaign: 'stalled_first_call' }))
    expect(url.searchParams.has('utm_content')).toBe(false)
  })

  it('overwrites a UTM field already on the URL rather than duplicating it', () => {
    const url = new URL(withUtm('https://app.aecon.ai/market?utm_source=old', { source: 'aecon', medium: 'email', campaign: 'x' }))
    expect(url.searchParams.getAll('utm_source')).toEqual(['aecon'])
  })

  it('rejects values that are not lowercase words joined by underscores', () => {
    expect(() => withUtm('https://app.aecon.ai/', { source: 'aecon', medium: 'email', campaign: 'Stalled Nudge' })).toThrow()
    expect(() => withUtm('https://app.aecon.ai/', { source: 'aecon', medium: 'Email', campaign: 'approval' })).toThrow()
  })

  it('rejects a relative or malformed URL', () => {
    expect(() => withUtm('/owner/credit', { source: 'aecon', medium: 'email', campaign: 'approval' })).toThrow()
  })
})
