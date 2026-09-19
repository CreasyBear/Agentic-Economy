// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/tanstack-react-start', () => ({
  SignInButton: ({ children }: { children: ReactNode }) => children,
}))

import { chatComposer } from '@/lib/public/chat-ia'

import type { ChatSessionModel } from '../chat-session.contracts'
import { ChatLayout } from './ChatLayout'

function buildModel(overrides: Partial<ChatSessionModel> = {}): ChatSessionModel {
  return {
    showHistoryRail: false,
    createHistoryPanel: () => null,
    header: {
      authenticated: false,
      threadId: null,
      busy: false,
      sharePath: null,
      copied: false,
      onNewChat: vi.fn(),
      onIssueShare: vi.fn(),
      onRevokeShare: vi.fn(),
      onCopyShare: vi.fn(),
    },
    composer: {
      prompt: '',
      busy: false,
      disabled: false,
      error: '',
      browseMarketOnError: false,
      status: '',
      anonymousMessageLimitReached: false,
      onPromptChange: vi.fn(),
      onSubmit: vi.fn(),
    },
    transcript: {
      messages: [],
    },
    pageBusy: false,
    ...overrides,
  }
}

describe('ChatLayout', () => {
  it('renders the composer dock from the session model', () => {
    render(<ChatLayout model={buildModel()} />)

    expect(screen.getByRole('textbox', { name: chatComposer.promptLabel })).toBeTruthy()
  })
})
