/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { OwnerNotificationSettings } from '@/components/ae/settings/OwnerNotificationSettings'
import type { NotificationPreferencesView } from '@/modules/principal-account/notification-preferences.view-model'

const toastSuccess = vi.fn()
const toastError = vi.fn()

vi.mock('@/lib/ui/toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

const basePreferences: NotificationPreferencesView = {
  lowCreditBalance: true,
  lowCreditThresholdCents: 2500,
  spendCapWarning: true,
  callFailureSpike: true,
  invoiceReady: true,
  teamMembershipChanged: true,
  agentApprovalRequested: true,
  revision: 0,
}

afterEach(() => {
  cleanup()
  toastSuccess.mockReset()
  toastError.mockReset()
})

describe('OwnerNotificationSettings', () => {
  it('renders email alert choices with descriptive guidance', () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    expect(screen.getByRole('heading', { name: 'Email alerts' })).toBeTruthy()
    const approvalSwitch = screen.getByRole('switch', { name: 'Email when an Agent needs your approval' })
    expect(approvalSwitch).toBeChecked()
    expect(screen.queryByRole('switch', { name: 'Email when credit balance is low' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Email when spend cap is reached' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Email when calls fail repeatedly' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Email when a tax invoice or statement is ready' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Email when team membership changes' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Credit balance alert' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'A$10.00' })).toBeNull()
  })


  it('U3: toggling approval email calls onUpdate with the field and expectedRevision', async () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Email when an Agent needs your approval' }))

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({
        agentApprovalRequested: false,
        expectedRevision: 0,
      })
    })
  })

  it('U9: shows a success toast when update resolves', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Email when an Agent needs your approval' }))

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('Notification preferences updated')
    })
  })

  it('U10: shows Rule 4 diagnostic and error toast when update rejects', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('network'))
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Email when an Agent needs your approval' }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'Could not update notification preferences.',
        { description: 'Please check your connection and try again.' },
      )
    })
    expect(screen.getByText(/What happened:/u)).toBeTruthy()
    expect(screen.getByText(/Could not update notification preferences\./u)).toBeTruthy()
    expect(screen.getByText(/A\$0\.00 affected — existing preferences remain active\./u)).toBeTruthy()
    expect(screen.getByText(/Please check your connection and try again\./u)).toBeTruthy()
  })
})
