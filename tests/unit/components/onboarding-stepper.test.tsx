/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { OnboardingStepper } from '@/components/ae/supply/supplier-onboarding-wizard/components/OnboardingStepper'
import { Stepper } from '@/components/arc/stepper/stepper'

afterEach(cleanup)

describe('Provider setup with actual Arc Stepper', () => {
  it('keeps both stage labels and durations visible and blocks unvisited navigation', () => {
    const onGoToStep = vi.fn()
    render(<OnboardingStepper step="profile" isVisited={id => id === 'profile'} isCompleted={() => false} onGoToStep={onGoToStep} />)
    const nav = screen.getByRole('navigation', { name: 'Provider setup' })
    const profile = within(nav).getByRole('button', { name: /Provider identity/ })
    const next = within(nav).getByRole('button', { name: /First Tool/ })
    expect(profile).toHaveAttribute('aria-current', 'step')
    expect(profile).toHaveTextContent('~2 mins')
    expect(next).toHaveTextContent('~1 min')
    expect(next).toHaveAttribute('aria-disabled', 'true')
    expect(next).toHaveAttribute('tabindex', '-1')
    fireEvent.click(next)
    expect(onGoToStep).not.toHaveBeenCalled()
    profile.focus()
    fireEvent.keyDown(profile, { key: 'End' })
    expect(profile).toHaveFocus()
    expect(onGoToStep).not.toHaveBeenCalled()
  })

  it('lets a visited incomplete stage be selected without claiming completion', () => {
    const onGoToStep = vi.fn()
    render(<OnboardingStepper step="profile" isVisited={() => true} isCompleted={id => id === 'profile'} onGoToStep={onGoToStep} />)
    const nav = screen.getByRole('navigation', { name: 'Provider setup' })
    const profile = within(nav).getByRole('button', { name: /Provider identity/ })
    const next = within(nav).getByRole('button', { name: /First Tool/ })
    expect(profile).toHaveAccessibleName(/Completed/)
    expect(profile).toHaveAttribute('aria-current', 'step')
    expect(next).toHaveAccessibleName(/Visited/)
    expect(next).not.toHaveAttribute('aria-disabled')
    expect(next.closest('li')).toHaveAttribute('data-status', 'upcoming')
    profile.focus()
    fireEvent.keyDown(profile, { key: 'ArrowDown' })
    expect(next).toHaveFocus()
    expect(onGoToStep).not.toHaveBeenCalled()
    fireEvent.click(next)
    expect(onGoToStep).toHaveBeenCalledExactlyOnceWith('first_tool')
    expect(nav).not.toHaveTextContent('All steps complete')
  })

  it('uses current permissions after they change rather than navigating a formerly visited stage', () => {
    const onGoToStep = vi.fn()
    const view = render(<OnboardingStepper step="first_tool" isVisited={() => true} isCompleted={id => id === 'profile'} onGoToStep={onGoToStep} />)
    view.rerender(<OnboardingStepper step="first_tool" isVisited={id => id === 'first_tool'} isCompleted={id => id === 'profile'} onGoToStep={onGoToStep} />)
    const profile = screen.getByRole('button', { name: /Provider identity/ })
    expect(profile).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(profile)
    expect(onGoToStep).not.toHaveBeenCalled()
  })

  it('preserves completed-only navigation for existing Stepper callers that omit the new port', () => {
    const onStepSelect = vi.fn()
    render(<Stepper steps={[{ id: 'one', label: 'Finished' }, { id: 'two', label: 'Current' }, { id: 'three', label: 'Future' }]} current={1} onStepSelect={onStepSelect} />)
    const finished = screen.getByRole('button', { name: /Finished/ })
    fireEvent.click(finished)
    expect(onStepSelect).toHaveBeenCalledExactlyOnceWith(0)
    fireEvent.click(screen.getByRole('button', { name: /Current/ }))
    fireEvent.click(screen.getByRole('button', { name: /Future/ }))
    expect(onStepSelect).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /Current/ })).toHaveAttribute('aria-disabled', 'true')
  })
})
