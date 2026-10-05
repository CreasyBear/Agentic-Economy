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
  const calls = screen.getByRole('button', { name: 'Calls' })
  calls.focus()
  fireEvent.keyDown(calls, { key: 'ArrowRight' })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Money' }))
  expect(screen.getByRole('table', { name: 'Daily metrics: Money' })).toBeTruthy()
  expect(screen.getByText('AUD 1.234567').getAttribute('title')).toBe('AUD 1.234567')
  expect(screen.getByText('Settled only')).toBeTruthy()
  fireEvent.keyDown(screen.getByRole('button', { name: 'Money' }), { key: 'ArrowRight' })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Quotes' }))
  expect(within(screen.getByRole('table', { name: 'Daily metrics: Quotes' })).getAllByRole('columnheader')).toHaveLength(4)
  expect(screen.getByText('3')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Participants' }))
  expect(screen.getByRole('columnheader', { name: /Returning/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Resolution' }))
  expect(screen.getByRole('columnheader', { name: /Resolved Calls/ })).toBeTruthy()
  expect(screen.getByText('2026-10-01')).toBeTruthy()
})
