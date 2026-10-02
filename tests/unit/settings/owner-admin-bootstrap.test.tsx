/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const boundary = vi.hoisted(() => ({ submit: vi.fn(), read: vi.fn() }))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/modules/security/owner-admin-bootstrap.functions', () => ({ bootstrapOwnerAdminServer: boundary.submit, readOwnerAdminBootstrapServer: boundary.read }))

import { AeOwnerAdminBootstrap } from '@/components/ae/settings/AeOwnerAdminBootstrap'

afterEach(() => { cleanup(); boundary.submit.mockReset(); boundary.read.mockReset() })
const fill = () => {
  fireEvent.change(screen.getByLabelText('Reason for initial setup'), { target: { value: 'Initial platform administration' } })
  fireEvent.change(screen.getByLabelText('Authorization evidence reference'), { target: { value: 'approval:board:one' } })
}

describe('owner bootstrap setup card', () => {
  it('requires explicit reason, evidence and a click; rendering never grants authority', async () => {
    boundary.submit.mockResolvedValue({ kind: 'active', auditEventRef: 'audit:bootstrap:one' })
    render(<AeOwnerAdminBootstrap initialStatus={{ kind: 'eligible' }} />)
    expect(boundary.submit).not.toHaveBeenCalled()
    expect(screen.getByText(/Setup does not enable payments or enroll MFA/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Set up Admin owner access' }))
    expect(screen.getByText(/Enter a reason and an external authorization evidence reference/u)).toBeTruthy()
    expect(boundary.submit).not.toHaveBeenCalled()
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Set up Admin owner access' }))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Open Admin' }).getAttribute('href')).toBe('/admin'))
    expect(boundary.submit).toHaveBeenCalledOnce()
    expect(boundary.submit).toHaveBeenCalledWith({ data: {
      reasonCode: 'Initial platform administration', evidenceRefs: ['approval:board:one'],
      operationKey: expect.stringMatching(/^admin-bootstrap:/u), correlationId: expect.stringMatching(/^admin-bootstrap:correlation:/u),
    } })
    expect(screen.getByText('Recorded setup: audit:bootstrap:one')).toBeTruthy()
    expect(screen.getByText(/Guarded changes still require MFA/u)).toBeTruthy()
  })

  it('freezes an unknown attempt until an explicit read succeeds, then retries only the exact reviewed command', async () => {
    boundary.submit.mockResolvedValueOnce({ kind: 'unknown' }).mockResolvedValueOnce({ kind: 'active', auditEventRef: 'audit:retry' })
    boundary.read.mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValueOnce({ kind: 'eligible' })
    render(<AeOwnerAdminBootstrap initialStatus={{ kind: 'eligible' }} />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Set up Admin owner access' }))
    await waitFor(() => expect(screen.getByText(/The setup result could not be confirmed/u)).toBeTruthy())
    const attempted = boundary.submit.mock.calls[0]?.[0]
    expect(screen.queryByRole('button', { name: 'Retry reviewed setup' })).toBeNull()
    expect((screen.getByLabelText('Reason for initial setup').closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true)
    expect(boundary.read).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Check setup status' }))
    await waitFor(() => expect(screen.getByText(/Current setup eligibility is unavailable/u)).toBeTruthy())
    expect(boundary.submit).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Retry reviewed setup' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Check setup status' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry reviewed setup' })).toBeTruthy())
    expect(boundary.read).toHaveBeenLastCalledWith({ data: { operationKey: attempted.data.operationKey } })
    expect(boundary.submit).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Retry reviewed setup' }))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Open Admin' })).toBeTruthy())
    expect(boundary.submit).toHaveBeenNthCalledWith(2, attempted)
  })

  it('recovers a committed unknown attempt through a read without resubmission', async () => {
    boundary.submit.mockRejectedValue(new Error('connection lost'))
    boundary.read.mockResolvedValue({ kind: 'active', auditEventRef: 'audit:recovered' })
    render(<AeOwnerAdminBootstrap initialStatus={{ kind: 'eligible' }} />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Set up Admin owner access' }))
    await waitFor(() => expect(screen.getByText(/The setup result could not be confirmed/u)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Check setup status' }))
    await waitFor(() => expect(screen.getByText('Recorded setup: audit:recovered')).toBeTruthy())
    expect(boundary.submit).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Retry reviewed setup' })).toBeNull()
  })

  it('coalesces rapid activation clicks while the result is in flight', async () => {
    let resolve: ((result: { kind: 'active'; auditEventRef: null }) => void) | undefined
    const pending = new Promise(resolvePromise => { resolve = resolvePromise })
    boundary.submit.mockReturnValue(pending)
    render(<AeOwnerAdminBootstrap initialStatus={{ kind: 'eligible' }} />)
    fill()
    const button = screen.getByRole('button', { name: 'Set up Admin owner access' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(boundary.submit).toHaveBeenCalledOnce()
    await act(async () => { resolve?.({ kind: 'active', auditEventRef: null }); await pending })
  })

  it('hides initial setup for ineligible accounts and never offers reactivation from a historical receipt', () => {
    const { rerender } = render(<AeOwnerAdminBootstrap initialStatus={{ kind: 'ineligible', reason: 'unauthorized_bootstrap_principal' }} />)
    expect(screen.queryByText('Admin owner setup')).toBeNull()
    rerender(<AeOwnerAdminBootstrap key="recorded" initialStatus={{ kind: 'recorded', auditEventRef: 'audit:old' }} />)
    expect(screen.getByText(/no longer has active Admin owner access/u)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(boundary.submit).not.toHaveBeenCalled()
  })
})
