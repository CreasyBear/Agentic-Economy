/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ChatHeader } from '@/components/ae/chat/chat-session/components/ChatHeader'
import { AECON_MARK_SRC } from '@/content/brand-assets'
import { chatHistory } from '@/lib/public/chat-ia'

describe('ChatHeader', () => {
  it('keeps local thread controls without app-level brand or auth chrome', () => {
    render(
      <ChatHeader
        authenticated={false}
        threadId={null}
        busy={false}
        sharePath={null}
        copied={false}
        mobileHistory={null}
        onNewChat={() => undefined}
        onIssueShare={() => undefined}
        onRevokeShare={() => undefined}
        onCopyShare={() => undefined}
      />,
    )

    expect(screen.queryByRole('link', { name: /home/i })).toBeNull()
    expect(document.querySelector(`img[src="${AECON_MARK_SRC}"]`)).toBeNull()
    expect(screen.queryByRole('button', { name: chatHistory.signIn })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Account menu' })).toBeNull()
    expect(screen.getByRole('button', { name: chatHistory.newChat })).toBeTruthy()
  })
})
