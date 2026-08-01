// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ae/artifacts/AeGenerativeAnswer', () => ({
  AeGenerativeAnswer: () => <div data-testid="generic-answer" />,
}))
vi.mock('@/components/ae/decision-map/AeDecisionMapReadback', () => ({
  AeDecisionMapReadback: ({ threadId }: { threadId: string }) => <div data-testid="decision-map-readback">{threadId}</div>,
}))
vi.mock('@/components/ai-elements/message', () => ({
  Message: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MessageContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/ae/chat/AeAnswerThinkingTrace', () => ({ AeAnswerThinkingTrace: () => null }))
vi.mock('@/components/ae/chat/AeThreadTurnQueryHeader', () => ({ AeThreadTurnQueryHeader: () => null }))
vi.mock('@/components/ae/chat/AeTurnContextLine', () => ({ AeTurnContextLine: () => null }))

import { AeThreadTurnReplaySection } from '@/components/ae/chat/AeThreadTurnReplaySection'

const turn = {
  query: 'Plan our wedding',
  intent: 'refine_search' as const,
  seq: 1,
  oneLine: 'Here is the answer.',
  artifacts: [],
  workLog: [],
}

afterEach(cleanup)

describe('thread turn replay decision-map marker', () => {
  it('keeps ordinary turns on the generic presenter even when the thread has a map', () => {
    render(<AeThreadTurnReplaySection {...turn} threadId="thread-1" />)
    expect(screen.getByTestId('generic-answer')).toBeTruthy()
    expect(screen.queryByTestId('decision-map-readback')).toBeNull()
  })

  it('rehydrates the canonical map only for a map-authored turn', () => {
    render(<AeThreadTurnReplaySection {...turn} threadId="thread-1" decisionMapRevision={1} />)
    expect(screen.getByTestId('decision-map-readback').textContent).toBe('thread-1')
    expect(screen.queryByTestId('generic-answer')).toBeNull()
  })
})
