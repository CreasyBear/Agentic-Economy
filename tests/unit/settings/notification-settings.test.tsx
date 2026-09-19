/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { OwnerNotificationSettings, TACTILE } from '@/components/ae/settings/OwnerNotificationSettings'
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
  revision: 0,
}

afterEach(() => {
  cleanup()
  toastSuccess.mockReset()
  toastError.mockReset()
})

describe('OwnerNotificationSettings', () => {
  it('U1: renders preference switches without a duplicate Email alerts heading', () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    expect(screen.queryByRole('heading', { name: 'Email alerts' })).toBeNull()
    expect(screen.getByRole('switch', { name: 'Low credit balance' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Spend cap warning' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Repeated call failures' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Tax invoice or statement ready' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Team membership changes' })).toBeTruthy()
  })

  it('U2: renders low-balance threshold chips with A$25 (Default) selected', () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    expect(screen.getByRole('radio', { name: 'A$10.00' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'A$25.00 (Default)' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'A$50.00' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'A$25.00 (Default)' })).toHaveAttribute('aria-checked', 'true')
  })

  it('U3: toggling a switch calls onUpdate with the field and expectedRevision', async () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Spend cap warning' }))

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({
        spendCapWarning: false,
        expectedRevision: 0,
      })
    })
  })

  it('U4: disables threshold chips when low credit balance is off', () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings
      preferences={{ ...basePreferences, lowCreditBalance: false }}
      onUpdate={onUpdate}
    />)

    expect(screen.getByRole('radio', { name: 'A$10.00' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'A$25.00 (Default)' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'A$50.00' })).toBeDisabled()
  })

  it('U5: changing threshold calls onUpdate with lowCreditThresholdCents 5000', async () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('radio', { name: 'A$50.00' }))

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({
        lowCreditThresholdCents: 5000,
        expectedRevision: 0,
      })
    })
  })

  it('U6: applies tactile press classes to preference switches', () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    const switchButton = screen.getByRole('switch', { name: 'Low credit balance' })
    for (const token of TACTILE.split(/\s+/u)) {
      expect(switchButton.className).toContain(token)
    }
  })

  it('U7: applies tactile physics and monospace tabular digits to threshold chips', () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    const chip = screen.getByRole('radio', { name: 'A$10.00' })
    expect(chip.className).toContain('font-mono')
    expect(chip.className).toContain('tabular-nums')
    for (const token of TACTILE.split(/\s+/u)) {
      expect(chip.className).toContain(token)
    }
  })

  it('U8: announces the live low-balance threshold statement', () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    expect(screen.getByText('Alert sent when balance drops below A$25.00.')).toBeTruthy()

    cleanup()
    render(<OwnerNotificationSettings
      preferences={{ ...basePreferences, lowCreditBalance: false }}
      onUpdate={onUpdate}
    />)
    expect(screen.getByText('Low-balance alerts are off. Existing spend and call alerts are unchanged.')).toBeTruthy()
  })

  it('U9: shows a success toast when update resolves', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Spend cap warning' }))

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('Notification preferences updated')
    })
  })

  it('U10: shows Rule 4 diagnostic and error toast when update rejects', async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error('network'))
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Spend cap warning' }))

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
