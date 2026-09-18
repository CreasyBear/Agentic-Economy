/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { OwnerNotificationSettings } from '@/components/ae/settings/OwnerNotificationSettings'

type NotificationPreferencesView = Readonly<{
  lowCreditBalance: boolean
  lowCreditThresholdCents: number
  spendCapWarning: boolean
  callFailureSpike: boolean
  invoiceReady: boolean
  teamMembershipChanged: boolean
  revision: number
}>

const basePreferences: NotificationPreferencesView = {
  lowCreditBalance: true,
  lowCreditThresholdCents: 2500,
  spendCapWarning: true,
  callFailureSpike: true,
  invoiceReady: true,
  teamMembershipChanged: true,
  revision: 0,
}

afterEach(cleanup)

describe('OwnerNotificationSettings', () => {
  it('U1: renders Email alerts heading and preference switches', () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    expect(screen.getByRole('heading', { name: 'Email alerts' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Low credit balance' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Spend cap warning' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Repeated call failures' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Tax invoice or statement ready' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Team membership changes' })).toBeTruthy()
  })

  it('U2: renders low-balance threshold radios with $25 selected by default', () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    expect(screen.getByRole('radio', { name: '$10' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '$25' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '$50' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '$25' })).toHaveProperty('checked', true)
  })

  it('U3: toggling a switch calls onUpdate with the field and expectedRevision', () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Spend cap warning' }))

    expect(onUpdate).toHaveBeenCalledWith({
      spendCapWarning: false,
      expectedRevision: 0,
    })
  })

  it('U4: disables threshold radios when low credit balance is off', () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings
      preferences={{ ...basePreferences, lowCreditBalance: false }}
      onUpdate={onUpdate}
    />)

    expect(screen.getByRole('radio', { name: '$10' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: '$25' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: '$50' })).toBeDisabled()
  })

  it('U5: changing threshold calls onUpdate with lowCreditThresholdCents 5000', () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('radio', { name: '$50' }))

    expect(onUpdate).toHaveBeenCalledWith({
      lowCreditThresholdCents: 5000,
      expectedRevision: 0,
    })
  })
})
