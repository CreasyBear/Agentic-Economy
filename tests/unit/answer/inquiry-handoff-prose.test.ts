import { describe, expect, it } from 'vitest'

import {
  buildInquiryHandoffNextStep,
  buildInquiryHandoffOneLine,
  buildInquiryHandoffSummary,
  resolveInquiryHandoff,
} from '@/modules/answer/internal/inquiry-handoff-prose'
import type { AnswerSource } from '@/modules/answer/public'

describe('inquiry handoff prose', () => {
  it('resolves ordinal follow-ups to the selected prior provider', () => {
    const resolution = resolveInquiryHandoff({
      query: 'message the second one',
      providers: [provider(), provider({ citationIndex: 2, slug: 'northside', name: 'Northside Plumbing' })],
    })

    expect(resolution.kind).toBe('resolved')
    if (resolution.kind !== 'resolved') {
      throw new Error('expected resolved provider')
    }
    expect(resolution.provider.slug).toBe('northside')
    expect(buildInquiryHandoffOneLine(resolution)).toBe(
      "Ready to open Northside Plumbing's qualified inquiry form.",
    )
  })

  it('asks the user to choose when multiple providers could be messaged', () => {
    const resolution = resolveInquiryHandoff({
      query: 'message them',
      providers: [provider(), provider({ citationIndex: 2, slug: 'northside', name: 'Northside Plumbing' })],
    })

    expect(resolution.kind).toBe('choose_provider')
    expect(buildInquiryHandoffNextStep(resolution)).toContain('listed businesses in this answer')
    expect(buildInquiryHandoffNextStep(resolution)).toContain('name the business')
  })

  it('does not imply a missing inquiry path is available', () => {
    const resolution = resolveInquiryHandoff({
      query: 'message the first one',
      providers: [providerWithoutInquiry()],
    })

    expect(resolution.kind).toBe('provider_unavailable')
    expect(buildInquiryHandoffOneLine(resolution)).toBe('Demo Plumbing does not publish an AE inquiry form yet.')
    expect(buildInquiryHandoffNextStep(resolution)).toContain('published contact guidance')
  })

  it('routes no-provider inquiry requests back to choosing a listed business', () => {
    const resolution = resolveInquiryHandoff({
      query: 'send an inquiry',
      providers: [],
    })

    expect(resolution.kind).toBe('no_provider')
    expect(buildInquiryHandoffSummary(resolution)).toContain('choose a business that publishes an inquiry path')
  })
})

function provider(overrides: Partial<AnswerSource> = {}): AnswerSource {
  return {
    citationIndex: 1,
    slug: 'demo',
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
    detailUrl: '/demo',
    services: [],
    inquiryUrl: '/demo/inquiry',
    ...overrides,
  }
}

function providerWithoutInquiry(): AnswerSource {
  const { inquiryUrl: _inquiryUrl, ...source } = provider()
  return source
}
