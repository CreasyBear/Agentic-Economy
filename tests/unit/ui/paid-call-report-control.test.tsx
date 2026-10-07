/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const calls = vi.hoisted(() => ({ read: vi.fn(), report: vi.fn() }))
const tokens = vi.hoisted(() => ({ read: Symbol('read'), report: Symbol('report') }))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  useServerFn: (token: symbol) => token === tokens.read ? calls.read : calls.report,
}))
vi.mock('@/modules/capability-execution/paid-call-report.functions', () => ({
  readOwnerPaidCallReportServer: tokens.read,
  reportOwnerPaidCallServer: tokens.report,
}))

import { PaidCallReportControl } from '@/components/ae/call-receipt/PaidCallReportControl'

afterEach(() => {
  cleanup()
  calls.read.mockReset()
  calls.report.mockReset()
})

describe('paid Call report control', () => {
  it('requires an authoritative eligible read before offering the report action', async () => {
    calls.read.mockResolvedValue({ kind: 'refused', callRef: 'call:one', code: 'call_not_eligible', retryable: false })
    render(<PaidCallReportControl callRef="call:one" paidLabel="Paid A$2.00" />)
    expect(screen.getByText('Paid A$2.00')).toBeTruthy()
    await waitFor(() => expect(calls.read).toHaveBeenCalledWith({ data: { callRef: 'call:one' } }))
    expect(screen.queryByRole('button', { name: 'Report this answer' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Contact support' })).toBeNull()
    expect(calls.report).not.toHaveBeenCalled()
  })

  it('reports once, preserves pending uncertainty and shows credit returned only when posted', async () => {
    calls.read.mockResolvedValue({ kind: 'eligible', callRef: 'call:one', amountUnits: '2000000', expiredPromotionalUnits: '0', remainingToday: 2 })
    calls.report
      .mockResolvedValueOnce({ kind: 'pending', callRef: 'call:one', reportRef: 'report:one', amountUnits: '2000000', expiredPromotionalUnits: '0' })
      .mockResolvedValueOnce({ kind: 'posted', callRef: 'call:one', reportRef: 'report:one', amountUnits: '2000000', expiredPromotionalUnits: '0' })
    const onPosted = vi.fn()
    render(<PaidCallReportControl callRef="call:one" paidLabel="Paid A$2.00" onPosted={onPosted} />)
    const report = await screen.findByRole('button', { name: 'Report this answer' })
    expect(screen.getByText('Reports remaining today: 2. Resets at midnight UTC.')).toBeTruthy()
    fireEvent.click(report)
    await screen.findByRole('button', { name: 'Check refund' })
    expect(screen.getByText(/not yet confirmed in your balance/u)).toBeTruthy()
    expect(screen.getByText('Paid A$2.00')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check refund' }))
    await screen.findByText('Credit returned: A$2.00.')
    expect(screen.getByText('Credit returned')).toBeTruthy()
    expect(calls.report).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(onPosted).toHaveBeenCalledOnce())
  })

  it('keeps expired promotional credit explicit and leaves failure open to checking', async () => {
    calls.read.mockResolvedValue({ kind: 'eligible', callRef: 'call:one', amountUnits: '2000000', expiredPromotionalUnits: '500000', remainingToday: 2 })
    calls.report.mockRejectedValue(new Error('unknown outcome'))
    render(<PaidCallReportControl callRef="call:one" />)
    expect(await screen.findByText(/original promotional credit of A\$0\.50 has expired/iu)).toBeTruthy()
    expect(screen.queryByText(/A\$2\.00 credit for an answer/u)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Report this answer' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('could not confirm'))
    expect(screen.getByRole('button', { name: 'Check refund' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Contact support' }).getAttribute('href')).toBe('/support?callRef=call%3Aone')
  })
})
