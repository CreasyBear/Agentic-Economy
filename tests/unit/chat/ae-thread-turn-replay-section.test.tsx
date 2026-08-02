// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ae/artifacts/AeGenerativeAnswer', () => ({
  AeGenerativeAnswer: () => <div data-testid="generic-answer" />,
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

describe('thread turn replay', () => {
  it('uses the generic presenter for every persisted turn', () => {
    render(<AeThreadTurnReplaySection {...turn} threadId="thread-1" />)
    expect(screen.getByTestId('generic-answer')).toBeTruthy()
  })
})
