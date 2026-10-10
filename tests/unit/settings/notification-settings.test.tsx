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
  stalledStepEmails: false,
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

  it('U10: stalled step reminder is off by default and toggles on', async () => {
    const onUpdate = vi.fn()
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)

    const stalledSwitch = screen.getByRole('switch', { name: "Remind me when I'm stuck on a setup step" })
    expect(stalledSwitch).not.toBeChecked()
    fireEvent.click(stalledSwitch)

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({ stalledStepEmails: true, expectedRevision: 0 })
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
        { description: 'Check the saved preferences before trying again.' },
      )
    })
    expect(screen.getByText(/What happened:/u)).toBeTruthy()
    expect(screen.getByText(/Could not update notification preferences\./u)).toBeTruthy()
    expect(screen.getByText(/No spending authority changed\./u)).toBeTruthy()
    expect(screen.getByText(/Check the saved preferences before trying again\./u)).toBeTruthy()
  })
  it('requires an explicit enable action with valid thresholds and prevents duplicate pending changes', async () => {
    let finish: (()=>void)|undefined
    const onUpdate=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve}))
    render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)
    const enable=screen.getByRole('button',{name:'Save and enable usage alerts'})
    fireEvent.change(screen.getByRole('textbox',{name:'Minimum Calls for alert'}),{target:{value:'0'}});expect(enable).toBeDisabled();expect(onUpdate).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox',{name:'Minimum Calls for alert'}),{target:{value:'40'}})
    fireEvent.click(enable);fireEvent.click(enable)
    expect(onUpdate).toHaveBeenCalledTimes(1);expect(onUpdate).toHaveBeenCalledWith({expectedRevision:0,usageAlertPolicy:{enabled:true,failurePercent:20,minimumCalls:40,spendWarningPercent:80}})
    expect(screen.getByRole('switch',{name:'Email when an Agent needs your approval'})).toBeDisabled()
    finish?.();await waitFor(()=>expect(enable).not.toBeDisabled())
  })
  it('disables alerts with their saved thresholds and current revision',async()=>{
    const onUpdate=vi.fn().mockResolvedValue(undefined)
    render(<OwnerNotificationSettings preferences={{...basePreferences,revision:7,usageAlertPolicy:{enabled:true,failurePercent:35,minimumCalls:50,spendWarningPercent:90}}} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('button',{name:'Disable usage alerts'}))
    await waitFor(()=>expect(onUpdate).toHaveBeenCalledWith({expectedRevision:7,usageAlertPolicy:{enabled:false,failurePercent:35,minimumCalls:50,spendWarningPercent:90}}))
  })
})

it('retains threshold drafts when an independent email preference advances the revision', () => {
  const onUpdate = vi.fn()
  const view = render(<OwnerNotificationSettings preferences={basePreferences} onUpdate={onUpdate} />)
  const field = screen.getByRole('textbox', { name: 'Minimum Calls for alert' })
  fireEvent.change(field, { target: { value: '41' } })
  view.rerender(<OwnerNotificationSettings preferences={{ ...basePreferences, revision: 1, agentApprovalRequested: false }} onUpdate={onUpdate} />)
  expect(field).toHaveValue('41')
})
