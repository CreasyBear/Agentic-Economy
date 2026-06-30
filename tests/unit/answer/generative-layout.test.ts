import { describe, expect, it } from 'vitest'

import { computeLayoutProfile, resolveLayoutProfile } from '@/modules/answer/internal/answer-layout-profile'
import { buildMessagePartsFromSnapshot } from '@/modules/answer/internal/build-message-parts'
import { buildArtifactsFromSnapshot } from '@/modules/answer/internal/snapshot-artifacts'
import { buildPublicThreadProjection } from '@/modules/answer-thread/internal/public-projection'
import type { AnswerTurnRecord, AnswerThreadRecord } from '@/modules/answer-thread/public'
import type { AnswerSource } from '@/modules/answer/public'

const provider = (overrides: Partial<AnswerSource> = {}): AnswerSource => ({
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
  trustCue: 'Responds ~22m · Checked',
  nextStepLabel: 'Send inquiry',
  detailUrl: '/demo',
  services: [],
  inquiryUrl: '/demo/inquiry',
  ...overrides,
})

describe('answer layout profile', () => {
  it('maps compact follow-ups to refinement_compact', () => {
    expect(
      computeLayoutProfile({
        compactLayout: true,
        followUpIntent: 'filter_known',
        providerCount: 2,
      }),
    ).toBe('refinement_compact')
  })

  it('maps compare intent to compare_pair', () => {
    expect(
      computeLayoutProfile({
        followUpIntent: 'compare_known',
        providerCount: 2,
      }),
    ).toBe('compare_pair')
  })

  it('maps zero providers to empty_state', () => {
    expect(computeLayoutProfile({ providerCount: 0 })).toBe('empty_state')
  })

  it('restores compact layout on replay projection', () => {
    const thread: AnswerThreadRecord = {
      threadId: 'thread-1',
      pseudonymousSessionId: 'session',
      title: 'plumber',
      sharePolicy: 'public',
      createdAt: 1,
      updatedAt: 1,
    }

    const turn: AnswerTurnRecord = {
      turnId: 'turn-2',
      threadId: 'thread-1',
      seq: 2,
      query: 'Narrow to Parramatta',
      intent: 'refine_search',
      evidenceJson: JSON.stringify({
        providers: [provider()],
        allowedSlugs: ['demo'],
        agentJsonUrl: '/api/businesses/search?q=plumber',
      }),
      snapshotHash: 'hash',
      proseJson: JSON.stringify({
        oneLine: '1 listed in Parramatta.',
        summary: 'No booking or payment happens on this page.',
        nextStep: 'Open a listed provider page.',
        compactLayout: true,
        layoutProfile: 'refinement_compact',
      }),
      artifactKindsJson: JSON.stringify(['one-line', 'provider-cards', 'what-to-do-now']),
      status: 'complete',
      createdAt: 2,
    }

    const projection = buildPublicThreadProjection(thread, [turn])
    const publicTurn = projection.turns[0]
    expect(publicTurn?.layoutProfile).toBe('refinement_compact')
    expect(publicTurn?.artifacts.map((artifact) => artifact.kind)).toEqual([
      'one-line',
      'provider-cards',
      'what-to-do-now',
    ])
  })
})

describe('buildMessagePartsFromSnapshot', () => {
  it('marks provider cards as scrollable for compact profiles', () => {
    const result = buildMessagePartsFromSnapshot({
      query: 'plumber Parramatta',
      oneLine: '2 listed in Parramatta.',
      providers: [provider(), provider({ citationIndex: 2, slug: 'other' })],
      summary: 'No booking or payment happens on this page.',
      nextStep: 'Open a listed provider page.',
      agentJsonUrl: '/api/businesses/search?q=plumber',
      compactLayout: true,
      layoutProfile: 'refinement_compact',
    })

    expect(result.profile).toBe('refinement_compact')
    const cards = result.parts.find((part) => part.kind === 'provider-cards')
    expect(cards?.kind).toBe('provider-cards')
    if (cards?.kind === 'provider-cards') {
      expect(cards.scroll).toBe(true)
    }
  })

  it('omits thread footer artifacts from compact snapshots', () => {
    const artifacts = buildArtifactsFromSnapshot({
      query: 'plumber',
      oneLine: '1 listed business accepts inquiries.',
      providers: [provider()],
      summary: 'No booking or payment happens on this page.',
      nextStep: 'Open a listed provider page.',
      agentJsonUrl: '/api/businesses/search?q=plumber',
      layoutProfile: 'refinement_compact',
      compactLayout: true,
    })

    expect(artifacts.some((artifact) => artifact.kind === 'agent-json')).toBe(false)
    expect(artifacts.some((artifact) => artifact.kind === 'protected-by-ae')).toBe(false)
  })

  it('resolves profile from compactLayout when layoutProfile missing', () => {
    expect(
      resolveLayoutProfile({
        compactLayout: true,
        providerCount: 1,
      }),
    ).toBe('refinement_compact')
  })
})
