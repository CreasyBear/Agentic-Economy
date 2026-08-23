/**
 * @vitest-environment jsdom
 */
import {
  buildProjection,
  expectComposerCopy,
  provider,
  providerWithoutContact,
  submitQuery,
  testState,
  withProviderlessFollowUp,
} from './ae-chat-route-promotion-harness'
import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { PublicThreadProjection } from '@/modules/answer-thread/public'
import { AeChat } from '@/components/ae/chat/AeChat'

describe('AeChat route promotion composer', () => {
  it('keeps the composer empty after a completed turn until the person types', async () => {
    const baseProjection = buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [provider({ publishedPhone: '0412 345 678' })] },
    ])
    const projection: PublicThreadProjection = {
      ...baseProjection,
      turns: baseProjection.turns.map((turn) => ({ ...turn, timing: 'today' })),
    }

    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    const transcript = screen.getByTestId('thread-transcript')
    const settledTurnCount = transcript.getAttribute('data-turn-count')
    const existingComposer = screen.getByRole('searchbox') as HTMLTextAreaElement
    expect(existingComposer.value).toBe('')
    expect(screen.queryByRole('button', { name: 'Change criteria' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'When do you need this?' }).textContent).toContain('Today')
    expect(screen.queryByTestId('live-turn')).toBeNull()
    expect(screen.getByTestId('no-live-turn')).toBeTruthy()
    expect(transcript.getAttribute('data-turn-count')).toBe(settledTurnCount)
    expect(testState.latestTranscriptProps?.liveTurn ?? null).toBeNull()
  })

  it('does not prefill the composer when switching chats', async () => {
    const firstProjection = buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [provider({ publishedPhone: '0412 345 678' })] },
    ])
    const secondBaseProjection = buildProjection('thread-two', 'Second answer', [
      { kind: 'provider-cards', providers: [provider({
        slug: 'fremantle-roof-repairs',
        name: 'Fremantle Roof Repairs',
        detailUrl: '/fremantle-roof-repairs',
        publishedPhone: '0488 123 456',
      })] },
    ])
    const secondProjection = {
      ...secondBaseProjection,
      turns: secondBaseProjection.turns.map((turn) => ({
        ...turn,
        query: 'urgent roof repairs in Fremantle',
      })),
    } satisfies PublicThreadProjection
    const { rerender } = render(<AeChat threadId="thread-one" initialProjection={firstProjection} />)

    expect((screen.getByRole('searchbox') as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByRole('button', { name: 'Change criteria' })).toBeNull()

    rerender(<AeChat threadId="thread-two" initialProjection={secondProjection} />)
    await waitFor(() => {
      expect((screen.getByRole('searchbox') as HTMLTextAreaElement).value).toBe('')
    })
    expect(screen.getByTestId('thread-transcript').getAttribute('data-route-thread-id')).toBe('thread-two')
    expect(screen.getByTestId('thread-transcript').getAttribute('data-projection-thread-id')).toBe('thread-two')
    expect(screen.queryByRole('button', { name: 'Change criteria' })).toBeNull()
  })

  it('passes the classified follow-up intent to live turns before replay catches up', async () => {
    const projection = buildProjection('thread-one', 'First answer')
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    await submitQuery('message the first one', 'Refine the request or ask what can happen next')

    expect(testState.latestTranscriptProps?.liveTurn?.intent).toBe('unsupported')
    expectComposerCopy('Working on your ask')
  })

  it('uses the refreshed route projection after a completed follow-up turn', async () => {
    const initialProjection = buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [provider()] },
    ])
    const refreshedProjection = {
      ...initialProjection,
      turns: [
        ...initialProjection.turns,
        {
          turnId: 'thread-one-turn-2',
          seq: 2,
          query: 'Message the first listed business',
          intent: 'unsupported' as const,
          status: 'complete' as const,
          oneLine: 'Ready to ask Demo inquiry provider for a response.',
          workLog: [],
          artifacts: [{ kind: 'selected-provider' as const, provider: provider() }],
        },
      ],
    } satisfies PublicThreadProjection
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/answer/threads/thread-one')) {
        return new Response(JSON.stringify(refreshedProjection))
      }
      if (url.includes('/api/answer/threads')) {
        return new Response(JSON.stringify({ threads: [] }))
      }
      return new Response(JSON.stringify({}), { status: 404 })
    })

    render(<AeChat threadId="thread-one" initialProjection={initialProjection} />)

    await act(async () => {
      testState.latestTranscriptProps?.onFollowUp?.('Message the first listed business')
      await Promise.resolve()
    })
    expect(testState.latestTranscriptProps?.liveTurn?.intent).toBe('unsupported')

    await act(async () => {
      testState.latestTranscriptProps?.onStreamEnd?.('complete')
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByTestId('thread-transcript').getAttribute('data-turn-count')).toBe('2')
    })
  })

  it('restores Today as the selected timing for a completed persisted turn', () => {
    const baseProjection = buildProjection('thread-one', 'First answer')
    const projection: PublicThreadProjection = {
      ...baseProjection,
      turns: baseProjection.turns.map((turn) => ({ ...turn, timing: 'today' })),
    }

    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expect(screen.getByRole('combobox', { name: 'When do you need this?' }).textContent).toContain('Today')
  })

  it.each([
    ['data_answer', 'Ask a follow-up'],
    ['empty_state', 'Ask a follow-up'],
    ['boundary_explain', 'Ask a follow-up'],
    ['safety_refusal', 'Ask a follow-up'],
  ] as const)('keeps a follow-up composer for the %s terminal profile', (layoutProfile, placeholder) => {
    const baseProjection = buildProjection('thread-one', 'Terminal answer')
    const projection: PublicThreadProjection = {
      ...baseProjection,
      turns: baseProjection.turns.map((turn) => ({ ...turn, layoutProfile })),
    }

    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    const composer = screen.getByRole('searchbox', { name: 'Search the operation market' })
    expect(composer.getAttribute('placeholder')).toBe(placeholder)
    expect(screen.getByRole('combobox', { name: 'When do you need this?' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Change criteria' })).toBeNull()
    expect(screen.queryByText(/match is needed|selected business|contacting a business/i)).toBeNull()
  })

  it('keeps timing controls after a clarification profile', () => {
    const baseProjection = buildProjection('thread-one', 'Clarification needed')
    const projection: PublicThreadProjection = {
      ...baseProjection,
      turns: baseProjection.turns.map((turn) => ({ ...turn, layoutProfile: 'clarification' })),
    }

    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expect(screen.getByRole('combobox', { name: 'When do you need this?' }).textContent).toContain('Flexible')
    expect(screen.queryByRole('button', { name: 'Change criteria' })).toBeNull()
  })

  it('uses a follow-up placeholder when no listed business is available', () => {
    const projection = buildProjection('thread-one', 'First answer')
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy('Ask a follow-up')
  })

  it('guides the composer toward inquiry once a listed business publishes that path', () => {
    const projection = withProviderlessFollowUp(buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [provider()] },
    ]))
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy('Ask a follow-up')
  })

  it('guides the composer toward contact limits when listings lack inquiry paths', () => {
    const projection = withProviderlessFollowUp(buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [providerWithoutContact()] },
    ]))
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy('Ask a follow-up')
  })

  it('guides the composer around the selected inquiry business after handoff', () => {
    const projection = buildProjection('thread-one', 'First answer', [
      { kind: 'selected-provider', provider: provider() },
    ])
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy('Ask a follow-up')
  })
})
