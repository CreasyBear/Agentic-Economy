/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@tanstack/react-router', () => ({ Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => <a href={to} {...props}>{children}</a> }))
vi.mock('@/lib/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
import { AeSupplierOnboardingWizard } from '@/components/ae/supply/supplier-onboarding-wizard/AeSupplierOnboardingWizard'
afterEach(cleanup)
describe('Provider identity setup', () => {
  it('collects the supported public profile and focuses setup after a successful advance', async () => {
    const save = vi.fn().mockResolvedValue({ kind: 'ok' })
    render(<AeSupplierOnboardingWizard onSaveProfile={save} />)
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { name: 'Provider setup' }))
    expect(screen.queryByLabelText(/Australian business number/i)).toBeNull()
    fireEvent.change(screen.getByLabelText(/Provider or brand name/i), { target: { value: 'Acme' } })
    fireEvent.change(screen.getByLabelText(/Provider website/i), { target: { value: 'https://acme.example' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to add Tool/i }))
    await screen.findByRole('link', { name: 'Add Tool' })
    expect(save).toHaveBeenCalledWith({ name: 'Acme', website: 'https://acme.example' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Provider setup' })))
  })
  it('keeps validation focus on the invalid field and never saves an invalid profile', async () => {
    const save = vi.fn()
    render(<AeSupplierOnboardingWizard onSaveProfile={save} />)
    fireEvent.click(screen.getByRole('button', { name: /Continue to add Tool/i }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Provider or brand name/i)))
    expect(save).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/Provider or brand name/i), { target: { value: 'Acme' } })
    fireEvent.change(screen.getByLabelText(/Provider website/i), { target: { value: 'http://insecure.example' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to add Tool/i }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Provider website/i)))
    expect(save).not.toHaveBeenCalled()
  })
  it('retains entered values and profile step on a refused save', async () => {
    const save = vi.fn().mockResolvedValue({ kind: 'error', message: 'Profile source unavailable' })
    render(<AeSupplierOnboardingWizard onSaveProfile={save} />)
    fireEvent.change(screen.getByLabelText(/Provider or brand name/i), { target: { value: 'Acme' } })
    fireEvent.change(screen.getByLabelText(/Provider website/i), { target: { value: 'https://acme.example' } })
    fireEvent.click(screen.getByRole('button', { name: /Continue to add Tool/i }))
    await screen.findByText('Profile source unavailable')
    expect((screen.getByLabelText(/Provider or brand name/i) as HTMLInputElement).value).toBe('Acme')
    expect(screen.queryByRole('link', { name: 'Add Tool' })).toBeNull()
  })
})
