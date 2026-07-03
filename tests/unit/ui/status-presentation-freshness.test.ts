import { describe, expect, it } from 'vitest'

import { plainFreshnessLabel } from '@/lib/ui/status-presentation'

const DAY_MS = 24 * 60 * 60 * 1000

describe('plainFreshnessLabel', () => {
  it('returns empty for an unknown timestamp', () => {
    expect(plainFreshnessLabel(undefined)).toBe('')
  })

  it('returns empty for the zero epoch, not "Updated 56 years ago"', () => {
    expect(plainFreshnessLabel(0)).toBe('')
  })

  it('returns empty for a negative timestamp', () => {
    expect(plainFreshnessLabel(-1)).toBe('')
  })

  it('returns empty for non-finite timestamps', () => {
    expect(plainFreshnessLabel(Number.NaN)).toBe('')
    expect(plainFreshnessLabel(Number.POSITIVE_INFINITY)).toBe('')
    expect(plainFreshnessLabel(Number.NEGATIVE_INFINITY)).toBe('')
  })

  it('labels a recent update honestly: "Updated ..." and never a verification claim', () => {
    const label = plainFreshnessLabel(Date.now())

    expect(label).not.toBe('')
    expect(label.startsWith('Updated ')).toBe(true)
    // AE trust doctrine: updatedAt is a record-update timestamp, NOT a passed
    // check. "Verified"/"Checked" are reserved for the registry_verified tier.
    expect(label).not.toContain('Verified')
    expect(label).not.toContain('Checked')
  })

  it('keeps the "Updated ..." wording for an older update', () => {
    const label = plainFreshnessLabel(Date.now() - 3 * DAY_MS)

    expect(label.startsWith('Updated ')).toBe(true)
    expect(label).not.toContain('Verified')
    expect(label).not.toContain('Checked')
  })
})
