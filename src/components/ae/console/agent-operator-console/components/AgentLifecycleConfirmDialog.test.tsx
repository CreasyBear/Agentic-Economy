// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AgentLifecycleConfirmDialog } from './AgentLifecycleConfirmDialog'

describe('AgentLifecycleConfirmDialog', () => {
  it('uses revocation mode only for the confirm label', () => {
    const onConfirm = vi.fn()
    render(
      <AgentLifecycleConfirmDialog
        lifecycleTarget={{ kind: 'agent', principalRef: 'prn_test', name: 'Agent A' }}
        revocationMode="freeze"
        revokePending={false}
        revokeDiagnostic={null}
        revokeTriggerRef={createRef()}
        onOpenChange={() => undefined}
        onConfirm={onConfirm}
        onRevocationModeChange={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: 'Remove immediately' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Drain then remove' })).toBeNull()
  })

  it('returns focus to the trigger ref after cancel', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    const revokeTriggerRef = { current: trigger }
    const onOpenChange = vi.fn()
    render(
      <AgentLifecycleConfirmDialog
        lifecycleTarget={{ kind: 'agent', principalRef: 'prn_test', name: 'Agent A' }}
        revocationMode="drain"
        revokePending={false}
        revokeDiagnostic={null}
        revokeTriggerRef={revokeTriggerRef}
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
        onRevocationModeChange={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
