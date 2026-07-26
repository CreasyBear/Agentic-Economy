/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { WorkingUnderstanding } from '@/components/ae/customer-request/panels/shared'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'

const KEYWORD_LABEL = 'AE matched keywords in your words, not the whole meaning.'

describe('keyword-matched understanding label', () => {
  afterEach(cleanup)

  it('tells the customer when AE only matched keywords, even with nothing else understood', () => {
    render(<WorkingUnderstanding projection={view({ interpretationBasis: 'keyword_match' })} correct={() => undefined} />)

    expect(screen.getByText(KEYWORD_LABEL)).toBeTruthy()
  })

  it('stays silent on an ordinary interpretation so the label means something', () => {
    render(<WorkingUnderstanding
      projection={view({ criteria: [{
        label: 'Area', value: 'Fremantle', basis: 'extracted_from_request',
        impact: 'eligibility_and_comparison',
      }] })}
      correct={() => undefined}
    />)

    expect(screen.getByText('Area:')).toBeTruthy()
    expect(screen.queryByText(KEYWORD_LABEL)).toBeNull()
  })
})

function view(overrides: Partial<CustomerRequestView>): CustomerRequestView {
  return {
    kind: 'request',
    requestRef: 'request:keyword-match',
    revision: 1,
    state: 'needs_information',
    summary: 'emergency plumber near me tonight, how much?',
    nextAction: 'provide_information',
    missingFields: [],
    criteria: [],
    options: [],
    ...overrides,
  }
}
