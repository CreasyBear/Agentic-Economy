// @vitest-environment jsdom

import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

type AttachStreamInput = Parameters<
  typeof import('@/components/ae/chat/turn-stream-session').attachAnswerTurnStream
>[0]

const streamSession = vi.hoisted(() => ({
  abort: vi.fn(),
  attach: vi.fn<(input: AttachStreamInput) => () => void>(() => vi.fn()),
}))

vi.mock('@/components/ae/chat/turn-stream-session', () => ({
  abortAnswerTurnStream: streamSession.abort,
  attachAnswerTurnStream: streamSession.attach,
}))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
vi.mock('@/components/ae/artifacts/AeGenerativeAnswer', () => ({ AeGenerativeAnswer: () => <div data-testid="generic-answer" /> }))
vi.mock('@/components/ae/chat/AePlanWork', () => ({ AePlanWork: () => <div data-testid="legacy-plan" /> }))
vi.mock('@/components/ae/decision-map/AeDecisionMapJourney', () => ({
  AeDecisionMapJourney: () => <div data-testid="decision-map-journey" />,
}))
vi.mock('@/components/ai-elements/message', () => ({
  Message: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MessageContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/ae/chat/AeAnswerThinkingTrace', () => ({ AeAnswerThinkingTrace: () => <div /> }))
vi.mock('@/components/ae/chat/AeThreadTurnQueryHeader', () => ({ AeThreadTurnQueryHeader: () => <div /> }))
vi.mock('@/components/ae/chat/AeTurnContextLine', () => ({ AeTurnContextLine: () => <div /> }))

import type { AnswerEvent } from '@/modules/answer/public'
import type { DecisionMapSnapshot } from '@/modules/decision-map/public'

import { AeThreadTurnStreamSection } from '@/components/ae/chat/AeThreadTurnStreamSection'

describe('thread turn stream lifecycle', () => {
  it('keeps one attachment per generation while callbacks stay fresh', () => {
    const firstThreadCreated = vi.fn()
    const freshThreadCreated = vi.fn()
    const freshStreamEnd = vi.fn()
    const view = render(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        generation={1}
        intent="refine_search"
        onThreadCreated={firstThreadCreated}
      />,
    )
    expect(streamSession.attach).toHaveBeenCalledTimes(1)
    const firstAttachment = streamSession.attach.mock.calls[0]?.[0]
    if (firstAttachment === undefined) throw new Error('missing first stream attachment')

    view.rerender(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        generation={1}
        intent="compare_known"
        threadId="thread:promoted"
        onThreadCreated={freshThreadCreated}
        onStreamEnd={freshStreamEnd}
      />,
    )
    expect(streamSession.attach).toHaveBeenCalledTimes(1)
    firstAttachment.subscriber.onThread?.({ threadId: 'thread:created', turnId: 'turn:1', turnSeq: 1 })
    firstAttachment.subscriber.onResult('rate_limited')
    expect(firstThreadCreated).not.toHaveBeenCalled()
    expect(freshThreadCreated).toHaveBeenCalledWith('thread:created', { turnId: 'turn:1', turnSeq: 1 })
    expect(freshStreamEnd).toHaveBeenCalledWith('rate_limited')

    view.rerender(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        generation={2}
        intent="compare_known"
        threadId="thread:promoted"
        onThreadCreated={freshThreadCreated}
      />,
    )
    expect(streamSession.attach).toHaveBeenCalledTimes(2)
    expect(streamSession.attach.mock.calls[1]?.[0]).toMatchObject({
      key: expect.stringContaining('2:Find a plumber:'),
      threadId: 'thread:promoted',
    })
    expect(streamSession.abort).toHaveBeenCalledWith(expect.stringContaining('1:Find a plumber:'))

    firstAttachment.subscriber.onThread?.({ threadId: 'thread:late', turnId: 'turn:late', turnSeq: 2 })
    expect(freshThreadCreated).toHaveBeenCalledTimes(1)
  })
  it('suppresses the generic answer and legacy plan presenter when a decision map arrives', () => {
    streamSession.attach.mockClear()
    const view = render(
      <AeThreadTurnStreamSection
        query="We’re getting married next October — 120 people, no idea where to start"
        generation={1}
      />,
    )
    const attachment = streamSession.attach.mock.calls[0]?.[0]
    if (attachment === undefined) throw new Error('missing stream attachment')

    const snapshot = {
      projectId: 'project-1',
      threadId: 'thread-1',
    } as unknown as DecisionMapSnapshot
    const event: AnswerEvent = { type: 'decision-map', snapshot }
    const planEvent: AnswerEvent = {
      type: 'plan-contract',
      planId: 'plan-1',
      revision: 1,
      goalText: 'A legacy engine plan',
      steps: [{ id: 'step-1', title: 'An action', status: 'pending' }],
    }
    act(() => {
      attachment.subscriber.onFrame?.({ seq: 1, event: planEvent })
      attachment.subscriber.onFrame?.({ seq: 2, event })
    })

    expect(view.container.querySelector('[data-testid="decision-map-journey"]')).not.toBeNull()
    expect(view.container.querySelector('[data-testid="generic-answer"]')).toBeNull()
    expect(view.container.querySelector('[data-testid="legacy-plan"]')).toBeNull()
  })
})
