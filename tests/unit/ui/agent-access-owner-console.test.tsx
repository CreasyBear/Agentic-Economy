// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AeAgentOperatorConsole } from '@/components/ae/console/AeAgentOperatorConsole'

describe('assistant access owner continuation anchors', () => {
  it('keeps funding and revocation on the existing owner surface', () => {
    render(
      <AeAgentOperatorConsole
        items={[]}
        loading={false}
        onRevoke={() => undefined}
        approvals={[]}
        approvalsLoading={false}
        onRetryApprovals={() => undefined}
        onDecideApproval={() => undefined}
      />,
    )

    expect(document.getElementById('fund')).not.toBeNull()
    expect(document.getElementById('revoke')).not.toBeNull()
  })
})
