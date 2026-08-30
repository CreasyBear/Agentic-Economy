/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeChatPage } from '@/components/ae/layout/AeChatPage'

afterEach(cleanup)

describe('AeChatPage', () => {
  it('keeps the composer dock on ask and omits a history rail until one is provided', () => {
    render(
      <AeChatPage
        header={<p>Ask</p>}
        dock={<button type="button">Send message</button>}
      >
        <p>Empty stage</p>
      </AeChatPage>,
    )

    expect(screen.getByRole('region', { name: 'Chat' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy()
    expect(screen.queryByRole('complementary', { name: 'Conversation history' })).toBeNull()
  })

  it('cannot grow a composer on shared threads', () => {
    render(
      <AeChatPage kind="shared" header={<h1>Shared weather chat</h1>}>
        <p>Oldest question</p>
      </AeChatPage>,
    )

    expect(screen.getByRole('region', { name: 'Shared chat' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Shared weather chat' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /send/i })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
