/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import '../../setup/jsdom-platform'
import { MetricsDayTable } from '@/components/ae/admin/metrics/components/MetricsDayTable'
import type { AdminMetricDayRow } from '@/components/ae/admin/metrics/metrics.contracts'

afterEach(cleanup)

it('groups daily measures without dropping precision, evidence or keyboard focus', () => {
  const row: AdminMetricDayRow = {
    day: '2026-10-01', settledCallValue: 'AUD 1.234567', money: 'Settled only',
    settledCalls: '1', attemptedCalls: '2', completedCalls: '1', uncertainCalls: '1',
    quotesCreated: '3', quotesConvertedAtClose: '1', transactingWorkspaces: '1',
    transactingAgents: '2', transactingProviders: '1', transactingTools: '2',
    returningWorkspaces: '1', terminalCalls: '2', terminalCallsWithResolution: '1',
  }
  render(<MetricsDayTable rows={[row]} />)
  expect(screen.getByText('AUD 1.234567').getAttribute('title')).toBe('Settled only')
  expect(within(screen.getByRole('table', { name: 'Daily metrics · Purchases' })).getAllByRole('columnheader')).toHaveLength(6)
  const purchases = screen.getByRole('tab', { name: 'Purchases' })
  purchases.focus()
  fireEvent.keyDown(purchases, { key: 'ArrowRight' })
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Quotes' }))
  expect(screen.getByRole('table', { name: 'Daily metrics · Quotes' })).toBeTruthy()
  expect(screen.getByText('3')).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: 'Participation' }))
  expect(screen.getByRole('columnheader', { name: 'Returning Account-days' })).toBeTruthy()
  fireEvent.click(screen.getByRole('tab', { name: 'Resolution' }))
  expect(screen.getByRole('columnheader', { name: 'With resolution' })).toBeTruthy()
  expect(screen.getByText('2026-10-01')).toBeTruthy()
})
