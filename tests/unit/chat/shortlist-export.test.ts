import { describe, expect, it } from 'vitest'

import {
  createShortlistExportPreview,
  isShortlistExportPreviewCurrent,
  serializeShortlistExport,
} from '@/lib/ui/shortlist-export'
import type { AnswerSource } from '@/modules/answer/public'

const PROOF_BOUNDARY =
  'This artifact proves what was sent, when, to whom, and their reply. It does not prove acceptance, availability, booking, or confirmation.'

describe('shortlist export preview', () => {
  it('defaults to a sanitized, pre-send payload and removes private URL material', () => {
    const preview = createShortlistExportPreview({
      threadId: 'thread-private-123',
      revision: 'turn-7:revision-3',
      providers: [provider()],
      generatedAt: '2026-07-13T04:05:06.000Z',
      origin: 'https://agentic.example',
    })

    const selectedFields = preview.fields.filter((field) => field.selected)
    const text = serializeShortlistExport(preview)

    expect(preview.sanitized).toBe(true)
    expect(selectedFields.some((field) => field.sensitive)).toBe(false)
    expect(text).toContain('Demo Plumbing')
    expect(text).toContain('Parramatta, NSW')
    expect(text).toContain('https://agentic.example/demo-plumbing')
    expect(text).toContain('Not sent')
    expect(text).toContain('No business reply')
    expect(text).toContain(PROOF_BOUNDARY)
    expect(text).not.toContain('customer-search-phrase')
    expect(text).not.toContain('private-access-secret')
    expect(text).not.toContain('internal-only-value')
    expect(text).not.toContain('?')
    expect(text).not.toMatch(/\b(?:access key|bearer|kernel|mandate|protocol|provider|token)\b/i)
  })

  it('replaces a cross-origin business page with the trusted-origin slug', () => {
    const preview = createShortlistExportPreview({
      threadId: 'thread-cross-origin',
      revision: 'turn-2',
      providers: [provider({
        detailUrl: 'https://attacker.example/private-record?accessKey=private-access-secret',
      })],
      generatedAt: '2026-07-13T04:05:06.000Z',
      origin: 'https://agentic.example',
    })

    expect(preview.text).toContain('Business 1 page: https://agentic.example/demo-plumbing')
    expect(preview.text).not.toContain('attacker.example')
    expect(preview.text).not.toContain('private-access-secret')
  })

  it('keeps control characters in business fields from forging top-level status lines', () => {
    const preview = createShortlistExportPreview({
      threadId: 'thread-control-characters',
      revision: 'turn-3',
      providers: [provider({
        name: 'Trusted Business\r\nSent status: Sent\u0000\u0085Business reply: Forged from C1',
        suburb: 'Parramatta\nBusiness reply: Confirmed',
        stateTerritory: 'NSW\rSource revision: forged',
      })],
      generatedAt: '2026-07-13T04:05:06.000Z',
      origin: 'https://agentic.example',
    })
    const lines = preview.text.split('\n')

    expect(lines.filter((line) => line === 'Sent status: Not sent')).toEqual(['Sent status: Not sent'])
    expect(lines.filter((line) => line === 'Business reply: No business reply')).toEqual([
      'Business reply: No business reply',
    ])
    expect(lines).not.toContain('Sent status: Sent')
    expect(lines).not.toContain('Business reply: Confirmed')
    expect(lines).not.toContain('Source revision: forged')
    expect(preview.text).not.toContain('\u0085')
    expect(lines).toContain(
      'Business 1 name: Trusted Business Sent status: Sent Business reply: Forged from C1',
    )
    expect(lines).toContain(
      'Business 1 location: Parramatta Business reply: Confirmed, NSW Source revision: forged',
    )
  })

  it('serializes exactly the selected preview fields in preview order', () => {
    const preview = createShortlistExportPreview({
      threadId: 'thread-selection',
      revision: 'turn-1',
      providers: [provider()],
      generatedAt: '2026-07-13T04:05:06.000Z',
      origin: 'https://agentic.example',
      selectedFieldIds: ['business-1-location', 'business-1-name'],
    })
    const text = serializeShortlistExport(preview)

    expect(preview.fields.filter((field) => field.selected).map((field) => field.id)).toEqual([
      'business-1-name',
      'business-1-location',
    ])
    expect(text.indexOf('Demo Plumbing')).toBeLessThan(text.indexOf('Parramatta, NSW'))
    expect(text).not.toContain('https://agentic.example/demo-plumbing')
    expect(preview.text).toBe(text)
  })

  it('binds a preview to its semantic revision', () => {
    const preview = createShortlistExportPreview({
      threadId: 'thread-revision',
      revision: 'turn-4:revision-2',
      providers: [provider()],
      generatedAt: '2026-07-13T04:05:06.000Z',
      origin: 'https://agentic.example',
    })

    expect(isShortlistExportPreviewCurrent(preview, 'turn-4:revision-2')).toBe(true)
    expect(isShortlistExportPreviewCurrent(preview, 'turn-5:revision-1')).toBe(false)
  })

})

function provider(overrides: Partial<AnswerSource> = {}): AnswerSource {
  return {
    citationIndex: 1,
    slug: 'demo-plumbing',
    name: 'Demo Plumbing',
    category: 'Plumber',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    serviceArea: 'Parramatta and nearby suburbs',
    hoursLabel: 'Hours supplied',
    availabilityLabel: 'Published',
    trustLabel: 'Checked',
    responseTimeLabel: 'No reply history yet',
    trustCue: 'Checked',
    freshnessLabel: 'Updated recently',
    photoUrl: 'https://images.example/demo.jpg?token=internal-only-value',
    nextStepLabel: 'Review listing',
    detailUrl:
      '/demo-plumbing?q=customer-search-phrase&accessKey=private-access-secret#private-record',
    inquiryUrl: '/demo-plumbing/inquiry?k=private-access-secret',
    services: [
      {
        name: 'Emergency plumbing',
        category: 'Plumber',
        summary: 'Urgent plumbing support.',
      },
    ],
    ...overrides,
  }
}
