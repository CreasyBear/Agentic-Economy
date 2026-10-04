// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AgentAccessAuthorityMode } from '@/modules/agent-access/contract'

import { AuthorityModeRadioGroup } from './AuthorityModeRadioGroup'

afterEach(() => cleanup())

describe('AuthorityModeRadioGroup', () => {
  it('keeps the selected value controlled by its parent', () => {
    const onSelectMode = vi.fn()
    const { rerender } = render(
      <AuthorityModeRadioGroup
        pending={false}
        selectedMode="read_only"
        ceiling="spending_policy"
        onSelectMode={onSelectMode}
      />,
    )

    const browseOnly = screen.getByRole('radio', { name: 'Browse only' })
    const askEachTime = screen.getByRole('radio', { name: 'Ask each time' })
    expect(screen.getByText('Discover, compare, and run free read-only Tools.')).toBeTruthy()
    expect(screen.getByText('Paid or consequential work comes back to you first.')).toBeTruthy()
    fireEvent.click(askEachTime)

    expect(onSelectMode).toHaveBeenCalledExactlyOnceWith('approval_required')
    expect(browseOnly.getAttribute('aria-checked')).toBe('true')
    expect(askEachTime.getAttribute('aria-checked')).toBe('false')

    rerender(
      <AuthorityModeRadioGroup
        pending={false}
        selectedMode="approval_required"
        ceiling="spending_policy"
        onSelectMode={onSelectMode}
      />,
    )

    expect(screen.getByRole('radio', { name: 'Ask each time' }).getAttribute('aria-checked')).toBe('true')
  })

  it('explains and blocks broader authority choices by pointer and keyboard', () => {
    const onSelectMode = vi.fn()
    render(
      <AuthorityModeRadioGroup
        pending={false}
        selectedMode="approval_required"
        ceiling="approval_required"
        onSelectMode={onSelectMode}
      />,
    )

    const workWithinLimits = screen.getByRole('radio', { name: 'Work within limits' })
    expect(workWithinLimits.getAttribute('aria-disabled')).toBe('true')
    expect(workWithinLimits.getAttribute('tabindex')).toBe('-1')
    expect(screen.getByText('This agent requested narrower access.')).toBeTruthy()

    fireEvent.click(workWithinLimits)
    fireEvent.keyDown(workWithinLimits, { key: 'Enter' })
    fireEvent.keyDown(workWithinLimits, { key: ' ' })
    expect(onSelectMode).not.toHaveBeenCalled()
  })

  it('keeps one tab stop and moves among only ceiling-allowed modes', () => {
    const onSelectMode = vi.fn()
    const renderMode = (selectedMode: AgentAccessAuthorityMode) => (
      <AuthorityModeRadioGroup
        pending={false}
        selectedMode={selectedMode}
        ceiling="approval_required"
        onSelectMode={onSelectMode}
      />
    )
    const { rerender } = render(renderMode('read_only'))
    const radios = screen.getAllByRole('radio')
    expect(radios.filter((radio) => radio.getAttribute('tabindex') === '0')).toHaveLength(1)
    expect(radios.find((radio) => radio.getAttribute('aria-disabled') === 'true')?.getAttribute('tabindex')).toBe('-1')

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Browse only' }), { key: 'ArrowDown' })
    expect(onSelectMode).toHaveBeenLastCalledWith('approval_required')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Ask each time' }))

    rerender(renderMode('approval_required'))
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Ask each time' }), { key: 'Home' })
    expect(onSelectMode).toHaveBeenLastCalledWith('read_only')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Browse only' }))

    rerender(renderMode('read_only'))
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Browse only' }), { key: 'End' })
    expect(onSelectMode).toHaveBeenLastCalledWith('approval_required')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Ask each time' }))
    expect(onSelectMode.mock.calls.flat()).not.toContain('spending_policy')
  })

  it('keeps radios inert while pending, including inside the disabled fieldset', () => {
    const onSelectMode = vi.fn()
    render(
      <AuthorityModeRadioGroup
        pending
        selectedMode="read_only"
        ceiling="spending_policy"
        onSelectMode={onSelectMode}
      />,
    )

    const fieldset = screen.getByRole('group', { name: 'Authority' })
    const radiogroup = screen.getByRole('radiogroup', { name: 'Authority' })
    const browseOnly = screen.getByRole('radio', { name: 'Browse only' })
    expect(fieldset.hasAttribute('disabled')).toBe(true)
    expect(radiogroup.getAttribute('aria-disabled')).toBe('true')
    expect(browseOnly.getAttribute('aria-disabled')).toBe('true')

    fireEvent.click(browseOnly)
    fireEvent.click(screen.getByRole('radio', { name: 'Ask each time' }))
    fireEvent.keyDown(browseOnly, { key: 'ArrowDown' })
    expect(onSelectMode).not.toHaveBeenCalled()
  })

  it('labels the radiogroup and preserves the expiry description', () => {
    render(
      <>
        <AuthorityModeRadioGroup
          pending={false}
          selectedMode="read_only"
          ceiling="spending_policy"
          onSelectMode={vi.fn()}
        />
        <p id="consent-expiry">Access expires after issue.</p>
      </>,
    )

    const radiogroup = screen.getByRole('radiogroup', { name: 'Authority' })
    expect(radiogroup.getAttribute('aria-describedby')).toBe('consent-expiry')
    const fieldset = screen.getByRole('group', { name: 'Authority' })
    expect(fieldset.tagName).toBe('FIELDSET')
    expect(fieldset.classList.contains('arc-market')).toBe(true)
    expect(fieldset.classList.contains('arc-consent-authority')).toBe(true)
    expect(screen.getByText('Authority', { selector: 'legend' })).toBeTruthy()
    expect(radiogroup.querySelector('input[type="hidden"]')).toBeNull()
  })
})
