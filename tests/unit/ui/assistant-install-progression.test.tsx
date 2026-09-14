// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'

afterEach(cleanup)

describe('Agent connection progression', () => {
  it('presents one ordered connect, sign-in and authoritative confirmation path', () => {
    const checkConnection = vi.fn()
    render(
      <AeAssistantInstallFunnel
        canonicalBaseUrl="https://ae.example/"
        onCheckConnection={checkConnection}
      />,
    )

    const progression = screen.getByRole('list', { name: 'Agent connection steps' })
    expect(within(progression).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      expect.stringContaining('Start the connection'),
      expect.stringContaining('Approve access in the browser'),
      expect.stringContaining('Confirm the connection'),
    ])
    expect(screen.getByText(/Connection is complete only when it appears in Agents/u)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))
    expect(checkConnection).toHaveBeenCalledOnce()
  })

  it('makes an in-progress confirmation explicit and non-repeatable', () => {
    render(
      <AeAssistantInstallFunnel
        canonicalBaseUrl="https://ae.example/"
        checkingConnection
        onCheckConnection={() => undefined}
      />,
    )

    const action = screen.getByRole('button', { name: 'Checking connection…' })
    expect(action.hasAttribute('disabled')).toBe(true)
  })
})
