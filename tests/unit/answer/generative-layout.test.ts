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

  it('keeps boundary turns in the boundary profile even without providers', () => {
    expect(
      computeLayoutProfile({
        followUpIntent: 'unsupported',
        providerCount: 0,
      }),
    ).toBe('boundary_explain')
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
        summary: 'The business handles timing, price, and availability.',
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
      summary: 'The business handles timing, price, and availability.',
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
      summary: 'The business handles timing, price, and availability.',
      nextStep: 'Open a listed provider page.',
      agentJsonUrl: '/api/businesses/search?q=plumber',
      layoutProfile: 'refinement_compact',
      compactLayout: true,
    })

    expect(artifacts.some((artifact) => artifact.kind === 'agent-json')).toBe(false)
    expect(artifacts.some((artifact) => artifact.kind === 'protected-by-ae')).toBe(false)
  })

  it('uses a selected-provider confirmation instead of full cards for inquiry handoffs', () => {
    const selected = provider()
    const result = buildMessagePartsFromSnapshot({
      query: 'message the first one',
      oneLine: "Ready to open Demo Plumbing's qualified inquiry form.",
      providers: [selected],
      selectedProvider: selected,
      summary: 'Demo Plumbing publishes an inquiry path for owner review.',
      nextStep: 'Open Demo Plumbing\'s inquiry form. The business confirms timing, price, availability, and the work.',
      agentJsonUrl: '/api/businesses/search?q=plumber',
      compactLayout: true,
      layoutProfile: 'refinement_compact',
    })

    expect(result.parts.map((part) => part.kind)).toEqual([
      'one-line',
      'selected-provider',
      'what-to-do-now',
    ])
  })

  it('resolves profile from compactLayout when layoutProfile missing', () => {
    expect(
      resolveLayoutProfile({
        compactLayout: true,
        providerCount: 1,
      }),
    ).toBe('refinement_compact')
  })

  it('restores selected-provider confirmation on inquiry handoff replay', () => {
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
      query: 'message the first one',
      intent: 'inquiry_handoff',
      evidenceJson: JSON.stringify({
        providers: [provider()],
        allowedSlugs: ['demo'],
        agentJsonUrl: '/api/businesses/search?q=plumber',
      }),
      snapshotHash: 'hash',
      proseJson: JSON.stringify({
        oneLine: "Ready to open Demo Plumbing's qualified inquiry form.",
        summary: 'Demo Plumbing publishes an inquiry path for owner review.',
        nextStep: 'Open the inquiry form.',
        compactLayout: true,
        layoutProfile: 'refinement_compact',
      }),
      artifactKindsJson: JSON.stringify(['one-line', 'selected-provider', 'what-to-do-now']),
      status: 'complete',
      createdAt: 2,
    }

    const projection = buildPublicThreadProjection(thread, [turn])
    expect(projection.turns[0]?.artifacts.map((artifact) => artifact.kind)).toEqual([
      'one-line',
      'selected-provider',
      'what-to-do-now',
    ])
  })
})

describe('buildArtifactsFromSnapshot artifact budgets', () => {
  it('budgets compare turns to one comparison surface, prose, and next step', () => {
    const artifacts = buildArtifactsFromSnapshot({
      query: 'compare these plumbers',
      oneLine: '2 listed businesses can be compared.',
      providers: [provider(), provider({ citationIndex: 2, slug: 'other', name: 'Other Plumbing' })],
      summary: 'The business handles timing, price, and availability.',
      nextStep: 'Open a listed provider page.',
      agentJsonUrl: '/api/businesses/search?q=plumber',
      layoutProfile: 'compare_pair',
    })

    expect(artifacts.map((artifact) => artifact.kind)).toEqual([
      'one-line',
      'provider-compare-table',
      'prose',
      'what-to-do-now',
    ])
  })

  it('exposes hours, trust, and freshness columns on the compare table', () => {
    const artifacts = buildArtifactsFromSnapshot({
      query: 'compare these plumbers',
      oneLine: '2 listed businesses can be compared.',
      providers: [
        provider({ freshnessLabel: 'Updated 2 days ago' }),
        provider({
          citationIndex: 2,
          slug: 'other',
          name: 'Other Plumbing',
          freshnessLabel: 'Updated 5 days ago',
        }),
      ],
      summary: 'The business handles timing, price, and availability.',
      nextStep: 'Open a listed provider page.',
      agentJsonUrl: '/api/businesses/search?q=plumber',
      layoutProfile: 'compare_pair',
    })

    const table = artifacts.find((artifact) => artifact.kind === 'provider-compare-table')
    expect(table?.kind).toBe('provider-compare-table')
    if (table?.kind !== 'provider-compare-table') {
      throw new Error('expected a provider-compare-table artifact')
    }

    // The trust-surfacing columns must all be declared, freshness alongside the
    // established area/response/availability/nextStep and the newer hours/trust.
    expect(table.fields).toEqual([
      'area',
      'response',
      'availability',
      'hours',
      'trust',
      'freshness',
      'nextStep',
    ])

    // The declared freshness column is backed by real per-provider data, so the
    // column renders "Updated ..." rather than empty cells.
    expect(table.providers.map((source) => source.freshnessLabel)).toEqual([
      'Updated 2 days ago',
      'Updated 5 days ago',
    ])
  })

  it('adds only the earned location map for place-shaped discovery turns', () => {
    const artifacts = buildArtifactsFromSnapshot({
      query: 'urgent plumber near Parramatta 2150',
      oneLine: '2 listed businesses near Parramatta.',
      providers: [provider(), provider({ citationIndex: 2, slug: 'other', name: 'Other Plumbing' })],
      summary: 'The business handles timing, price, and availability.',
      nextStep: 'Open a listed provider page.',
      agentJsonUrl: '/api/businesses/search?q=plumber',
      layoutProfile: 'discovery_full',
    })

    const kinds = artifacts.map((artifact) => artifact.kind)
    expect(kinds).toContain('location-map')
    expect(kinds).not.toContain('service-area-fit')
    expect(kinds).not.toContain('published-details-rail')
  })

  it('keeps the agent JSON affordance on full discovery answers', () => {
    const artifacts = buildArtifactsFromSnapshot({
      query: 'urgent plumber near Parramatta 2150',
      oneLine: '1 listed business near Parramatta.',
      providers: [provider()],
      summary: 'The business handles timing, price, and availability.',
      nextStep: 'Open a listed provider page.',
      agentJsonUrl: '/api/businesses/search?q=plumber',
      layoutProfile: 'discovery_full',
    })

    expect(artifacts.map((artifact) => artifact.kind)).toContain('agent-json')
  })

  it('does not create an editable inquiry starter from answer shape alone', () => {
    const artifacts = buildArtifactsFromSnapshot({
      query: 'need urgent plumbing help today',
      oneLine: '1 listed business accepts inquiries.',
      providers: [provider()],
      summary: 'The business handles timing, price, and availability.',
      nextStep: 'Send a qualified inquiry if the listing fits.',
      agentJsonUrl: '/api/businesses/search?q=plumber',
      layoutProfile: 'discovery_full',
    })

    expect(artifacts.map((artifact) => artifact.kind)).not.toContain('message-starter')
  })

  it('adds recovery prompts for empty states', () => {
    const artifacts = buildArtifactsFromSnapshot({
      query: 'emergency roofer nowhere',
      oneLine: 'No listed businesses match yet.',
      providers: [],
      summary: 'No listed businesses match that search yet.',
      nextStep: 'Try a nearby suburb or browse services.',
      agentJsonUrl: '/api/businesses/search?q=roofer',
      layoutProfile: 'empty_state',
    })

    expect(artifacts.map((artifact) => artifact.kind)).toContain('recovery-prompts')
  })

  it('renders web discovery as a separate imported-claims artifact with citation provenance', () => {
    const artifacts = buildArtifactsFromSnapshot({
      query: 'funeral parlours in Parramatta',
      oneLine: 'No listed businesses match yet.',
      providers: [],
      importedClaims: [{
        businessName: 'Example Funerals',
        suburb: 'Parramatta',
        phone: '02 0000 0000',
        sourceUrl: 'https://example.test/funerals',
      }],
      summary: 'No listed businesses match this request yet.',
      nextStep: 'Review nearby providers.',
      agentJsonUrl: '/api/businesses/search?q=funeral',
      layoutProfile: 'empty_state',
    })

    expect(artifacts).toContainEqual({
      kind: 'imported-claims',
      claims: [{
        businessName: 'Example Funerals',
        suburb: 'Parramatta',
        phone: '02 0000 0000',
        sourceUrl: 'https://example.test/funerals',
      }],
    })
    expect(artifacts.map((artifact) => artifact.kind)).not.toContain('provider-cards')
  })

  it('keeps boundary turns to answer text and next step', () => {
    const artifacts = buildArtifactsFromSnapshot({
      query: 'can you book a plumber for me',
      oneLine: 'Agentic Economy cannot book, charge, or dispatch on your behalf.',
      providers: [],
      summary: 'Browse services, then open a provider page when you find a match.',
      nextStep:
        'Find a listed provider first, then use an inquiry option when it is published.',
      agentJsonUrl: '/api/businesses/search?q=can+you+book+a+plumber+for+me',
      layoutProfile: 'boundary_explain',
    })
    const kinds = artifacts.map((artifact) => artifact.kind)

    expect(kinds).toContain('prose')
    expect(kinds).toContain('what-to-do-now')
    expect(kinds).not.toContain('recovery-prompts')
  })
})
