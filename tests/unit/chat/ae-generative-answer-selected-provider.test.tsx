/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import type { AnswerArtifact, AnswerSource } from '@/modules/answer/public'

describe('AeGenerativeAnswer selected provider confirmation', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows the chosen provider before routing to the inquiry form', () => {
    const selected = provider()
    const artifacts: AnswerArtifact[] = [
      { kind: 'one-line', text: 'Ready to send a qualified inquiry to Demo Plumbing.' },
      { kind: 'selected-provider', provider: selected },
      {
        kind: 'what-to-do-now',
        text: 'Open Demo Plumbing\'s inquiry form, describe the job, and submit it for owner review.',
      },
    ]

    render(
      <AeGenerativeAnswer
        artifacts={artifacts}
        query="message the first one"
        layoutProfile="refinement_compact"
        phase="complete"
        threadId="thread-123"
      />,
    )

    expect(screen.getByText('Selected provider')).toBeTruthy()
    expect(screen.getByText('Demo Plumbing')).toBeTruthy()
    expect(screen.getByText('Choice 1 in this answer · Plumber · Parramatta')).toBeTruthy()
    expect(screen.getByText('Inquiry form published')).toBeTruthy()
    expect(screen.getByText('Open inquiry form').closest('a')?.getAttribute('href')).toBe(
      '/demo-plumbing/inquiry?from=thread&id=thread-123',
    )
    expect(screen.getByText('Review listing').closest('a')?.getAttribute('href')).toBe(
      '/demo-plumbing?from=thread&id=thread-123',
    )
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
    nextStepLabel: 'Send inquiry',
    detailUrl: '/demo-plumbing',
    services: [],
    inquiryUrl: '/demo-plumbing/inquiry',
    ...overrides,
  }
}
