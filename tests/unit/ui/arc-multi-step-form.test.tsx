// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MultiStepForm } from '@/components/arc/blocks/multi-step-form/multi-step-form'

afterEach(cleanup)
const steps = [{ id: 'source', title: 'Source' }, { id: 'terms', title: 'Terms' }] as const

describe('Arc controlled form progress', () => {
  it('derives progress from the confirmed stage and never creates a local completion', () => {
    const command = vi.fn()
    const view = render(<MultiStepForm steps={steps} activeStep="source" progressLabel="Add Tool progress">
      <button type="button" onClick={command}>Read endpoint</button>
    </MultiStepForm>)
    fireEvent.click(screen.getByRole('button', { name: 'Read endpoint' }))
    expect(command).toHaveBeenCalledOnce()
    const progress = screen.getByRole('navigation', { name: 'Add Tool progress' })
    expect(within(progress).getByText('Source').closest('li')?.getAttribute('aria-current')).toBe('step')
    expect(screen.queryByText('All set')).toBeNull()
    view.rerender(<MultiStepForm steps={steps} activeStep="terms" progressLabel="Add Tool progress">
      <label>Exact terms<input name="terms" defaultValue="Projected price" /></label>
    </MultiStepForm>)
    expect(within(progress).getByText('Terms').closest('li')?.getAttribute('aria-current')).toBe('step')
    expect(screen.getByLabelText('Exact terms')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Read endpoint' })).toBeNull()
  })

  it('keeps feedback stable and supplied edit commands guarded across confirmed stages', () => {
    const edit = vi.fn()
    const view = render(<MultiStepForm steps={steps} activeStep="source" feedback={<p role="alert">Refresh required</p>}>
      <p>Source fields</p>
    </MultiStepForm>)
    const alert = screen.getByRole('alert')
    const completed = { id: 'source', title: 'Source', detail: 'POST https://exact.example/paid', disabled: true, onEdit: edit }
    view.rerender(<MultiStepForm steps={steps} activeStep="terms" feedback={<p role="alert">Refresh required</p>} completedSteps={[completed]}>
      <p>Terms fields</p>
    </MultiStepForm>)
    expect(screen.getByRole('alert')).toBe(alert)
    expect(screen.getByText(completed.detail)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Source' }))
    expect(edit).not.toHaveBeenCalled()
    view.rerender(<MultiStepForm steps={steps} activeStep="terms" completedSteps={[{ ...completed, disabled: false }]}>
      <p>Terms fields</p>
    </MultiStepForm>)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Source' }))
    expect(edit).toHaveBeenCalledOnce()
    expect(screen.getByText('Terms fields')).toBeTruthy()
  })

  it('renders no progress or commands for an unmatched stage', () => {
    const { container } = render(<MultiStepForm steps={steps} activeStep="unavailable"><button type="button">Publish Tool</button></MultiStepForm>)
    expect(container.childElementCount).toBe(0)
  })
})
