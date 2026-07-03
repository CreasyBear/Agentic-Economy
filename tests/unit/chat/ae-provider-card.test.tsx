/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeProviderCard } from '@/components/ae/primitives/AeProviderCard'
import type { AnswerSource } from '@/modules/answer/public'

describe('AeProviderCard answer variant', () => {
  afterEach(() => {
    cleanup()
  })

  it('makes the selected listing and published inquiry path explicit', () => {
    render(<AeProviderCard variant="answer" source={provider({ citationIndex: 2 })} />)

    expect(screen.getByText('Choice 2 in this answer')).toBeTruthy()
    expect(screen.getByText('Inquiry path')).toBeTruthy()
    expect(
      screen.getByText(
        'AE inquiry form published for owner review. The business still confirms timing, quote, and availability.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Open inquiry form')).toBeTruthy()
    expect(screen.getByText('Review listing')).toBeTruthy()
  })

  it('does not imply an AE inquiry form when the listing has no inquiry URL', () => {
    const { inquiryUrl: _inquiryUrl, ...source } = provider({ nextStepLabel: 'Use published contact' })

    render(<AeProviderCard variant="answer" source={source} />)

    expect(
      screen.getByText('No AE inquiry form is published yet. Review the listing before using its contact guidance.'),
    ).toBeTruthy()
    expect(screen.queryByText('Open inquiry form')).toBeNull()
    expect(screen.getByText('Use published contact')).toBeTruthy()
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
    serviceArea: 'Parramatta',
    hoursLabel: 'Hours supplied',
    availabilityLabel: 'Published',
    trustLabel: 'Checked',
    responseTimeLabel: 'Responds ~22m',
    trustCue: 'Responds ~22m - Checked',
    freshnessLabel: 'Updated recently',
    nextStepLabel: 'Send inquiry',
    detailUrl: '/demo-plumbing',
    services: [{ name: 'Emergency plumbing', category: 'Plumber', summary: 'Urgent plumbing support.' }],
    inquiryUrl: '/demo-plumbing/inquiry',
    ...overrides,
  }
}
