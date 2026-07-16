import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { BusinessProblemPanel } from '../../../src/routes/_operator/owner.request-problems.$reportRef'

describe('affected business problem view', () => {
  it('shows the shared customer claim and preserves the non-adjudication boundary', () => {
    const html = renderToStaticMarkup(<BusinessProblemPanel
      problem={{
        kind: 'business_problem',
        reportRef: 'problem:one',
        business: 'Journey Case Intake',
        category: 'incorrect_result',
        customerStatement: 'The first result did not meet the confirmed constraint.',
        causality: 'unknown',
        resolution: 'not_adjudicated',
        decisionAuthority: 'not_assigned',
        evidence: [{ receiptRef: 'evidence:one', label: 'Result evidence 1' }],
        availableEvidence: [{ receiptRef: 'evidence:one', label: 'Result evidence 1' }],
        businessClaims: [],
      }}
      onRecord={vi.fn()}
    />)

    expect(html).toContain('The first result did not meet the confirmed constraint.')
    expect(html).toContain('Result evidence 1')
    expect(html).toContain('AE has not decided what caused the problem')
    expect(html).toContain('Record business statement')
    expect(html).not.toContain('problem:one')
    expect(html).not.toContain('evidence:one')
  })
})
