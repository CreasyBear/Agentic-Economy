import { describe, expect, it } from 'vitest'
import { resolvePublicDocumentationLinks } from '@/lib/documentation/public-documentation'
import { docsAppReturnUrl } from '../../../packages/docs/src/lib/app-return'
import { supportTopicForHash } from '@/components/ae/support/help/help.contracts'

describe('deliberate documentation handoffs', () => {
  it('does not invent a public docs host and keeps every guide under the configured docs root', () => {
    expect(resolvePublicDocumentationLinks(undefined)).toBeUndefined()
    expect(resolvePublicDocumentationLinks('https://guides.example/docs/')?.recovery).toBe('https://guides.example/docs/guides/recovery')
    expect(resolvePublicDocumentationLinks('http://localhost:4000/docs')?.api).toBe('http://localhost:4000/docs/reference')
  })
  it.each(['javascript:alert(1)', 'https://user:password@guides.example/docs', 'https://guides.example/docs?callRef=private', 'https://guides.example/docs#private', 'http://guides.example/docs'])('rejects a malformed or context-bearing public docs setting: %s', value => {
    expect(resolvePublicDocumentationLinks(value)).toBeUndefined()
  })
  it('returns only to the configured app Market or the established canonical app origin', () => {
    expect(docsAppReturnUrl(undefined)).toBe('https://app.aecon.ai/market')
    expect(docsAppReturnUrl('http://localhost:3000')).toBe('http://localhost:3000/market')
    expect(docsAppReturnUrl('https://app.example/')).toBe('https://app.example/market')
    expect(docsAppReturnUrl('javascript:alert(1)')).toBe('https://app.aecon.ai/market')
    expect(docsAppReturnUrl('https://app.example/calls/private')).toBe('https://app.aecon.ai/market')
    expect(docsAppReturnUrl('https://app.example?returnTo=https://other.example')).toBe('https://app.aecon.ai/market')
  })
  it('uses fixed Help anchors and defaults an unknown anchor to current status', () => {
    expect(supportTopicForHash('agent-connection')).toBe('connection')
    expect(supportTopicForHash('private-support')).toBe('private')
    expect(supportTopicForHash('untrusted')).toBe('status')
  })
})
