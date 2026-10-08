/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest'
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const routeMocks = vi.hoisted(() => ({
  openRemoval: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...await importOriginal(),
  createClientOnlyFn: (fn: (...args: never[]) => unknown) => fn,
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      handler: () => Symbol('open-removal-server'),
    }
    return builder
  },
  useServerFn: () => routeMocks.openRemoval,
}))

vi.mock('@/hooks/use-client-mounted', () => ({ useClientMounted: () => true }))
vi.mock('@/components/ae/layout/AePublicPage', () => ({
  AePublicPage: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/lib/ui/toast', () => ({ toast: { success: vi.fn() } }))

import { WorkspacePresentationVisibility } from '@/lib/client/workspace-presentation'
import { toast } from '@/lib/ui/toast'
import { Route as PrivacyRemovalRoute } from '@/routes/privacy.remove-business'

afterEach(() => {
  cleanup()
  routeMocks.openRemoval.mockReset()
})

describe('privacy removal unknown outcomes', () => {
  it.each(['recorded', 'unknown'] as const)('preserves %s removal recovery across role refresh while withholding the obsolete private toast', async outcome => {
    vi.mocked(toast.success).mockClear()
    const completion = Promise.withResolvers<unknown>()
    routeMocks.openRemoval.mockReturnValue(completion.promise)
    const Component = PrivacyRemovalRoute.options.component
    if (Component === undefined) throw new Error('privacy_removal_component_missing')
    let visible = true
    const fixture = () => <WorkspacePresentationVisibility value={visible}><div hidden={!visible}><Component /></div></WorkspacePresentationVisibility>
    const view = render(fixture())
    fireEvent.change(screen.getByLabelText('Your email'), { target: { value: 'owner@example.com' } })
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'Remove duplicate.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }))
    expect(routeMocks.openRemoval).toHaveBeenCalledOnce()
    visible = false
    view.rerender(fixture())
    await act(async () => {
      completion.resolve(outcome === 'recorded'
        ? { kind: 'ok', receipt: { disputeId: 'dispute:retained-reference', status: 'opened' } }
        : { kind: 'error', code: 'dispute_invalid_target', retryable: true, reason: 'Please try again.' })
      await completion.promise
    })
    expect(toast.success).not.toHaveBeenCalled()
    visible = true
    view.rerender(fixture())
    if (outcome === 'recorded') {
      expect(screen.getByText('Request recorded').closest('[role="status"]')).toHaveTextContent('Reference dispute:retained-reference.')
    } else {
      const submit = screen.getByRole('button', { name: 'Outcome not confirmed' })
      expect(submit).toBeDisabled()
      const form = submit.closest('form')
      if (form === null) throw new Error('privacy_removal_form_missing')
      fireEvent.submit(form)
      expect(routeMocks.openRemoval).toHaveBeenCalledOnce()
    }
  })

  it('retains entered information and prevents a blind duplicate submission', async () => {
    routeMocks.openRemoval.mockRejectedValue(new Error('private transport detail'))
    const Component = PrivacyRemovalRoute.options.component
    if (Component === undefined) throw new Error('privacy_removal_component_missing')
    render(<Component />)

    fireEvent.change(screen.getByLabelText('Your email'), {
      target: { value: 'owner@example.com' },
    })
    fireEvent.change(screen.getByLabelText('What should change?'), {
      target: { value: 'Remove the duplicate supplier profile.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }))

    await waitFor(() => expect(routeMocks.openRemoval).toHaveBeenCalledTimes(1))
    expect((await screen.findByRole('alert')).textContent).toContain('The request outcome could not be confirmed.')
    expect(screen.getByRole('alert').textContent).not.toContain('private transport detail')
    expect(screen.getByDisplayValue('owner@example.com')).toBeTruthy()
    expect(screen.getByDisplayValue('Remove the duplicate supplier profile.')).toBeTruthy()
    const disabled = screen.getByRole<HTMLButtonElement>('button', { name: 'Outcome not confirmed' })
    expect(disabled.disabled).toBe(true)

    const form = disabled.closest('form')
    if (form === null) throw new Error('privacy_removal_form_missing')
    fireEvent.submit(form)
    expect(routeMocks.openRemoval).toHaveBeenCalledTimes(1)
  })

  it('also blocks a duplicate when the server resolves a retryable source outage', async () => {
    routeMocks.openRemoval.mockResolvedValue({
      kind: 'error',
      code: 'dispute_invalid_target',
      retryable: true,
      reason: 'Please try again.',
    })
    const Component = PrivacyRemovalRoute.options.component
    if (Component === undefined) throw new Error('privacy_removal_component_missing')
    render(<Component />)

    fireEvent.change(screen.getByLabelText('Your email'), { target: { value: 'owner@example.com' } })
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'Remove duplicate.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }))

    expect(await screen.findByRole('button', { name: 'Outcome not confirmed' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('alert').textContent).toContain('Contact support before submitting another request.')
    expect(routeMocks.openRemoval).toHaveBeenCalledTimes(1)
  })

  it('shows the request reference and status support path after submission', async () => {
    routeMocks.openRemoval.mockResolvedValue({
      kind: 'ok',
      receipt: {
        disputeId: 'dispute:test-reference',
        status: 'opened',
      },
    })
    const Component = PrivacyRemovalRoute.options.component
    if (Component === undefined) throw new Error('privacy_removal_component_missing')
    render(<Component />)

    expect(screen.getByRole('button', { name: 'Submit request' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Provider slug'), { target: { value: 'example-provider' } })
    fireEvent.change(screen.getByLabelText('Your email'), { target: { value: 'owner@example.com' } })
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'Remove duplicate.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }))

    expect(await screen.findByText('Request recorded')).toBeTruthy()
    const alert = screen.getByText('Request recorded').closest('[role="status"]')
    expect(alert?.textContent).toContain('Request opened. Reference dispute:test-reference.')
    expect(alert?.textContent).toContain('Quote this reference and status if you contact support.')
  })

  it('focuses invalid contact fields and resolves each Arc description and error reference once', async () => {
    const Component = PrivacyRemovalRoute.options.component
    if (Component === undefined) throw new Error('privacy_removal_component_missing')
    render(<Component />)

    const email = screen.getByLabelText<HTMLInputElement>('Your email')
    const evidence = screen.getByLabelText<HTMLTextAreaElement>('What should change?')
    const form = email.closest('form')
    if (form === null) throw new Error('privacy_removal_form_missing')

    fireEvent.submit(form)

    await waitFor(() => expect(document.activeElement).toBe(email))
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email).toHaveAccessibleDescription('Used only to follow up. A contact email is required.')
    expect(document.querySelectorAll('#contactEmail-description')).toHaveLength(1)
    expect(document.getElementById('contactEmail-error')?.textContent).toBeTruthy()
    const emailDescriptionRefs = (email.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
    expect(emailDescriptionRefs.filter((id) => id === 'contactEmail-description')).toHaveLength(1)
    expect(emailDescriptionRefs.filter((id) => id === 'contactEmail-error')).toHaveLength(1)

    fireEvent.change(email, { target: { value: 'owner@example.com' } })
    fireEvent.submit(form)

    await waitFor(() => expect(document.activeElement).toBe(evidence))
    expect(evidence.getAttribute('aria-invalid')).toBe('true')
    expect(evidence).toHaveAccessibleDescription('A short note is enough. What should change? is required.')
    expect(document.querySelectorAll('#evidenceSummary-description')).toHaveLength(1)
    expect(document.getElementById('evidenceSummary-error')?.textContent).toBeTruthy()
    const evidenceDescriptionRefs = (evidence.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
    expect(evidenceDescriptionRefs.filter((id) => id === 'evidenceSummary-description')).toHaveLength(1)
    expect(evidenceDescriptionRefs.filter((id) => id === 'evidenceSummary-error')).toHaveLength(1)
    expect(routeMocks.openRemoval).not.toHaveBeenCalled()
  })

  it('disables all fields while a request is pending', async () => {
    routeMocks.openRemoval.mockReturnValue(new Promise(() => {}))
    const Component = PrivacyRemovalRoute.options.component
    if (Component === undefined) throw new Error('privacy_removal_component_missing')
    render(<Component />)

    fireEvent.change(screen.getByLabelText('Provider slug'), { target: { value: 'example-provider' } })
    fireEvent.change(screen.getByLabelText('Your email'), { target: { value: 'owner@example.com' } })
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'Remove duplicate.' } })
    const submit = screen.getByRole('button', { name: 'Submit request' })
    const form = submit.closest('form')
    if (form === null) throw new Error('privacy_removal_form_missing')
    fireEvent.submit(form)

    await waitFor(() => expect(routeMocks.openRemoval).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Provider slug')).toHaveProperty('disabled', true)
    expect(screen.getByLabelText('Your email')).toHaveProperty('disabled', true)
    expect(screen.getByRole('combobox', { name: 'Reason' })).toHaveProperty('disabled', true)
    expect(screen.getByLabelText('What should change?')).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Submit request' })).toHaveProperty('disabled', true)

    fireEvent.submit(form)
    expect(routeMocks.openRemoval).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Provider slug')).toHaveValue('example-provider')
    expect(screen.getByLabelText('Your email')).toHaveValue('owner@example.com')
    expect(screen.getByLabelText('What should change?')).toHaveValue('Remove duplicate.')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('excludes a second request before React commits the pending state and unlocks after a known refusal', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined
    routeMocks.openRemoval.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve }))
    const Component = PrivacyRemovalRoute.options.component
    if (Component === undefined) throw new Error('privacy_removal_component_missing')
    render(<Component />)
    fireEvent.change(screen.getByLabelText('Provider slug'), { target: { value: 'example-provider' } })
    fireEvent.change(screen.getByLabelText('Your email'), { target: { value: 'owner@example.com' } })
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'Remove duplicate.' } })
    const form = screen.getByLabelText('Your email').closest('form')
    if (form === null) throw new Error('privacy_removal_form_missing')
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })
    expect(routeMocks.openRemoval).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Your email')).toHaveValue('owner@example.com')
    if (resolveRequest === undefined) throw new Error('privacy_removal_request_missing')
    resolveRequest({ kind: 'error', code: 'dispute_invalid_target', retryable: false, reason: 'Provider not found.' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Provider not found.')
    expect(screen.getByRole('button', { name: 'Submit request' })).toBeEnabled()
    routeMocks.openRemoval.mockResolvedValueOnce({ kind: 'error', code: 'dispute_invalid_target', retryable: false, reason: 'Provider not found.' })
    fireEvent.submit(form)
    await waitFor(() => expect(routeMocks.openRemoval).toHaveBeenCalledTimes(2))
  })

  it('submits the selected reason through the native reasonCode field', async () => {
    routeMocks.openRemoval.mockResolvedValue({
      kind: 'ok',
      receipt: {
        disputeId: 'dispute:reason-selection',
        status: 'opened',
      },
    })
    const Component = PrivacyRemovalRoute.options.component
    if (Component === undefined) throw new Error('privacy_removal_component_missing')
    render(<Component />)

    const reason = screen.getByRole('combobox', { name: 'Reason' })
    const form = reason.closest('form')
    if (form === null) throw new Error('privacy_removal_form_missing')
    expect(new FormData(form).getAll('reasonCode')).toEqual(['privacy_removal_requested'])

    fireEvent.click(reason)
    const options = await screen.findAllByRole('option')
    const firstOption = options[0]
    if (firstOption === undefined) throw new Error('privacy_removal_reason_options_missing')
    const targetOption = screen.getByRole('option', { name: 'Incorrect Tool or Provider facts' })
    fireEvent.keyDown(firstOption, { key: 'End' })
    await waitFor(() => expect(document.activeElement).toBe(targetOption))
    fireEvent.keyDown(targetOption, { key: 'Enter' })
    fireEvent.keyUp(targetOption, { key: 'Enter' })
    await waitFor(() => expect(document.activeElement).toBe(reason))

    const selectedReasonCode = 'unsafe_or_inaccurate'
    expect(new FormData(form).getAll('reasonCode')).toEqual([selectedReasonCode])

    fireEvent.change(screen.getByLabelText('Provider slug'), { target: { value: 'example-provider' } })
    fireEvent.change(screen.getByLabelText('Your email'), { target: { value: 'owner@example.com' } })
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'Remove duplicate.' } })
    fireEvent.submit(form)

    await waitFor(() => expect(routeMocks.openRemoval).toHaveBeenCalledTimes(1))
    expect(new FormData(form).getAll('reasonCode')).toEqual([selectedReasonCode])
    expect(routeMocks.openRemoval).toHaveBeenCalledWith({
      data: {
        slug: 'example-provider',
        contactEmail: 'owner@example.com',
        reasonCode: selectedReasonCode,
        evidenceSummary: 'Remove duplicate.',
      },
    })
  })
})
