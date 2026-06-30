import { describe, expect, it } from 'vitest'

import {
  categoryIllustrationPath,
  formatProviderTrustCue,
  plainResponseTimeLabel,
} from '@/lib/ui/status-presentation'

describe('plainResponseTimeLabel', () => {
  it('formats minutes under one hour', () => {
    expect(plainResponseTimeLabel(22)).toBe('Responds ~22m')
  })

  it('returns empty when unknown', () => {
    expect(plainResponseTimeLabel(undefined)).toBe('')
  })
})

describe('formatProviderTrustCue', () => {
  it('joins response time and trust with a middle dot', () => {
    expect(formatProviderTrustCue({ responseTimeMinutes: 22, trustLabel: 'Checked' })).toBe(
      'Responds ~22m · Checked',
    )
  })
})

describe('categoryIllustrationPath', () => {
  it('maps plumbing categories to the pen-and-ink mark', () => {
    expect(categoryIllustrationPath('Emergency plumbing')).toBe('/images/illustration/cat-plumbing.png')
  })
})
