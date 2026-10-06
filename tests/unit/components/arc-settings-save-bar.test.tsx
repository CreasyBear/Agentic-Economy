/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { SettingsSaveBar } from '@/components/ae/shared/arc-pro/settings-page/settings-page'
import { Button } from '@/components/arc/button/button'

afterEach(cleanup)

function Form({ state, count = 1, disabled = false, onSave }: {
  state: 'edit' | 'saving' | 'saved' | null
  count?: number
  disabled?: boolean
  onSave: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return <>
    <input aria-label="Other form" />
    <form onSubmit={event => { event.preventDefault(); onSave() }}>
      <input ref={input} aria-label="Settings draft" />
      <SettingsSaveBar state={state} count={count} focusReturnRef={input} savedLabel="Test settings saved">
        <Button type="submit" disabled={disabled || state === 'saving'}>Save settings</Button>
      </SettingsSaveBar>
    </form>
  </>
}

describe('Arc settings SaveBar', () => {
  it('uses the supplied count and phase without saving or inventing confirmation', () => {
    const onSave = vi.fn()
    const page = render(<Form state={null} count={0} onSave={onSave} />)
    expect(screen.queryByRole('group', { name: 'Unsaved changes' })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    page.rerender(<Form state="edit" count={2} onSave={onSave} />)
    expect(screen.getByRole('group', { name: 'Unsaved changes' })).toHaveTextContent('2 unsaved changes')
    page.rerender(<Form state="saving" count={2} onSave={onSave} />)
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
    expect(screen.queryByRole('status')).toBeNull()
    page.rerender(<Form state="saved" count={0} onSave={onSave} />)
    expect(screen.getByRole('group', { name: 'Save status' })).toHaveTextContent('Test settings saved')
    expect(screen.getByRole('status')).toHaveTextContent('Test settings saved')
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it.each(['ctrlKey', 'metaKey'] as const)('submits the current native form with %s+S, while keeping other forms independent', key => {
    const onSave = vi.fn()
    render(<Form state="edit" onSave={onSave} />)
    fireEvent.keyDown(screen.getByLabelText('Other form'), { key: 's', [key]: true })
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByLabelText('Settings draft'), { key: 's', [key]: true })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('does not submit a disabled or pending save shortcut', () => {
    const onSave = vi.fn()
    const page = render(<Form state="edit" disabled onSave={onSave} />)
    fireEvent.keyDown(screen.getByLabelText('Settings draft'), { key: 's', ctrlKey: true })
    page.rerender(<Form state="saving" onSave={onSave} />)
    fireEvent.keyDown(screen.getByLabelText('Settings draft'), { key: 's', metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it.each(['saved', null] as const)('returns focus when focused actions leave in phase %s', state => {
    const onSave = vi.fn()
    const page = render(<Form state="edit" onSave={onSave} />)
    screen.getByRole('button', { name: 'Save settings' }).focus()
    page.rerender(<Form state={state} count={0} onSave={onSave} />)
    expect(screen.getByLabelText('Settings draft')).toHaveFocus()
  })

  it('keeps focus on the field being edited when confirmation arrives', () => {
    const onSave = vi.fn()
    const page = render(<Form state="saving" onSave={onSave} />)
    screen.getByLabelText('Other form').focus()
    page.rerender(<Form state="saved" count={0} onSave={onSave} />)
    expect(screen.getByLabelText('Other form')).toHaveFocus()
  })
})
