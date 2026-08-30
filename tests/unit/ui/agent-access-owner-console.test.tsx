// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AeOwnerCredit } from '@/components/ae/console/AeOwnerCredit'
import { AeAgentOperatorConsole } from '@/components/ae/console/AeAgentOperatorConsole'

describe('assistant access owner continuation anchors', () => {
  it('keeps funding on Credit and revocation on Keys', () => {
    const { container: credit } = render(
      <AeOwnerCredit items={[]} loading={false} />,
    )
    const { container: keys } = render(
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

    expect(credit.querySelector('#fund')).not.toBeNull()
    expect(credit.querySelector('a[href="/market?window=30d"]')?.textContent).toBe('Search Operations')
    expect(keys.querySelector('#revoke')).not.toBeNull()
    expect(keys.querySelector('#fund')).toBeNull()
    expect(keys.querySelector('a[href="/for-agents"]')?.textContent).toBe('Connect agent')
  })
})
