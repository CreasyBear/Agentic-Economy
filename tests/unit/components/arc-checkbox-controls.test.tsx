// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Checkbox } from '@/components/arc/checkbox/checkbox'

afterEach(cleanup)

describe('shared checkbox control contracts', () => {
  it('allows an uncontrolled mixed default to become checked in one activation', () => {
    const onChange = vi.fn()
    render(<Checkbox aria-label="Select records" defaultChecked="indeterminate" onCheckedChange={onChange} />)
    const control = screen.getByRole('checkbox', { name: 'Select records' })
    expect(control).toHaveAttribute('aria-checked', 'mixed')
    fireEvent.click(control)
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true)
    expect(control).toHaveAttribute('aria-checked', 'true')
  })

  it('keeps controlled mixed state until the caller publishes the next value', () => {
    const onChange = vi.fn()
    const { rerender } = render(<Checkbox aria-label="Select records" checked="indeterminate" onCheckedChange={onChange} />)
    const control = screen.getByRole('checkbox', { name: 'Select records' })
    fireEvent.click(control)
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true)
    expect(control).toHaveAttribute('aria-checked', 'mixed')
    rerender(<Checkbox aria-label="Select records" checked onCheckedChange={onChange} />)
    expect(control).toHaveAttribute('aria-checked', 'true')
  })

  it('retains an external associated label and a focusable native-button ref', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<><Checkbox id="saved-secret" ref={ref} /><label htmlFor="saved-secret">I saved my secret</label></>)
    const control = screen.getByRole('checkbox', { name: 'I saved my secret' })
    expect(ref.current).toBe(control)
    expect(control.tagName).toBe('BUTTON')
    act(() => { ref.current?.focus() })
    expect(control).toHaveFocus()
    fireEvent.click(screen.getByText('I saved my secret'))
    expect(control).toHaveAttribute('aria-checked', 'true')
  })

  it.each(['disabled', 'readOnly'] as const)('does not change a %s control', (guard) => {
    const onChange = vi.fn()
    render(<Checkbox aria-label="Permission" checked={false} onCheckedChange={onChange} {...{ [guard]: true }} />)
    const control = screen.getByRole('checkbox', { name: 'Permission' })
    fireEvent.click(control)
    expect(onChange).not.toHaveBeenCalled()
    expect(control).toHaveAttribute('aria-checked', 'false')
  })

  it('contributes one exact native form value and never submits on toggle', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    const onChange = vi.fn()
    const { container } = render(<form onSubmit={onSubmit}>
      <Checkbox aria-label="Consent" name="consent" value="approved" defaultChecked onCheckedChange={onChange} />
    </form>)
    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    if (form === null) throw new Error('form_missing')
    expect(new FormData(form).getAll('consent')).toEqual(['approved'])
    const control = screen.getByRole('checkbox', { name: 'Consent' })
    fireEvent.click(control)
    expect(new FormData(form).has('consent')).toBe(false)
    fireEvent.click(control)
    expect(new FormData(form).getAll('consent')).toEqual(['approved'])
    expect(onChange.mock.calls).toEqual([[false], [true]])
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('preserves caller-owned descriptions and invalid state', () => {
    render(<><Checkbox aria-label="Consent" aria-describedby="consent-help" aria-invalid="true" /><p id="consent-help">Review the permission before continuing.</p></>)
    const control = screen.getByRole('checkbox', { name: 'Consent' })
    expect(control).toHaveAccessibleDescription('Review the permission before continuing.')
    expect(control).toHaveAttribute('aria-invalid', 'true')
  })

  it('associates the Arc label and description while retaining caller descriptions', () => {
    render(<><Checkbox id="updates" label="Receive updates" description="Choose how often we send them." aria-describedby="frequency-help" /><span id="frequency-help">You can change this later.</span></>)
    const control = screen.getByRole('checkbox', { name: 'Receive updates' })
    expect(control).toHaveAttribute('aria-describedby', 'frequency-help updates-description')
    expect(control).toHaveAccessibleDescription('You can change this later. Choose how often we send them.')
  })

  it('preserves Base UI render, state-class, ID, ref, required, and data-slot ports', () => {
    const ref = createRef<HTMLElement>()
    render(<><form id="external-form" /><Checkbox
      id="custom-control"
      ref={ref}
      nativeButton={false}
      render={<div data-rendered="custom" />}
      className={(state) => state.checked ? 'caller-checked' : 'caller-unchecked'}
      defaultChecked={false}
      form="external-form"
      name="custom-choice"
      value="selected"
      required
      compact
      aria-label="Custom control"
    /></>)
    const control = screen.getByRole('checkbox', { name: 'Custom control' })
    expect(ref.current).toBe(control)
    expect(document.getElementById('custom-control')).toHaveAttribute('type', 'checkbox')
    expect(control).toHaveAttribute('data-rendered', 'custom')
    expect(control).toHaveAttribute('data-slot', 'checkbox')
    expect(control).toHaveAttribute('aria-required', 'true')
    expect(control).toHaveClass('caller-unchecked')
    const form = document.getElementById('external-form') as HTMLFormElement
    expect(new FormData(form).getAll('custom-choice')).toEqual([])
    fireEvent.click(control)
    expect(control).toHaveClass('caller-checked')
    expect(new FormData(form).getAll('custom-choice')).toEqual(['selected'])
  })
})
