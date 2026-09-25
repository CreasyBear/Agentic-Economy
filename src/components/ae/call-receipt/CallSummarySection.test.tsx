/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { projectCallReceipt } from '@/modules/capability-execution/call-receipt-view'
import type { FoundCallStatus } from '@/lib/call-recovery/call-status-page-types'
import { CallSummarySection } from './CallSummarySection'

afterEach(cleanup)

describe('Call receipt object continuity', () => {
  it.each(['authorized', 'reconciliation_required', 'terminal'] as const)('keeps the canonical Tool link for %s Calls without guessing a Provider', (state) => {
    const result: FoundCallStatus = { kind: 'found', callRef: 'call:v1:trace', toolRef: 'tool:v1:weather', version: 1, state }
    render(<CallSummarySection result={result} receiptView={projectCallReceipt(result)} />)
    expect(screen.getByRole('region', { name: 'Call outcome' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Tool' })).toHaveAttribute('href', '/tools/tool%3Av1%3Aweather')
    expect(screen.queryByRole('link', { name: /Provider|Host/ })).not.toBeInTheDocument()
    expect(screen.getByText('No verified Provider or directory Host link is recorded for this Call.')).toBeInTheDocument()
  })
})
