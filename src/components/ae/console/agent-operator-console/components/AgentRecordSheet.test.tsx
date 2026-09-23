// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AgentRecordSheet } from './AgentRecordSheet'

describe('AgentRecordSheet', () => {
  it('renders sheet body disclosures when showSheetBody is true', () => {
    render(
      <AgentRecordSheet
        open
        onOpenChange={() => undefined}
        title="Agent A"
        description="Connected"
        headerFacts={[{ label: 'Authority', value: 'Spending policy' }]}
        showSheetBody
        showActivityTruncatedNote={false}
        spendingPolicyFacts={[]}
        spendingLimitsForm={<div>limits-form</div>}
        activityFacts={[]}
        activityTable={<div>activity-table</div>}
        accessFacts={[]}
        authorizedTools={<div>tools</div>}
        connectionReceipts={<div>connections</div>}
        technicalFacts={[]}
        credentialHistory={<div>credential-history</div>}
        removeAgentDisabled={false}
        onRemoveAgent={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Spending policy' }))
    expect(screen.getByText('limits-form')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Technical details' }))
    expect(screen.getByRole('button', { name: 'Remove agent everywhere' })).toBeDefined()
  })
})
