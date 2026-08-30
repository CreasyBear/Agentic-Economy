/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/tanstack-react-start', () => ({
  SignInButton: ({ children }: { children: ReactNode }) => children,
}))

import { OperationChatHeader } from '@/components/ae/operation-chat/OperationChatHeader'
import { AECON_MARK_SRC } from '@/content/brand-assets'

describe('OperationChatHeader', () => {
  it('keeps a home escape on the thread chrome', () => {
    render(
      <OperationChatHeader
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

    expect(screen.getByRole('link', { name: 'Agentic Economy home' }).getAttribute('href')).toBe('/')
    expect(document.querySelector(`img[src="${AECON_MARK_SRC}"]`)).toBeTruthy()
  })
})
