// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AgentLifecycleConfirmDialog } from './AgentLifecycleConfirmDialog'

describe('AgentLifecycleConfirmDialog', () => {
  it('shows a plain destructive confirmation', () => {
    const onConfirm = vi.fn()
    render(
      <AgentLifecycleConfirmDialog
        lifecycleTarget={{ kind: 'agent', principalRef: 'prn_test', name: 'Agent A' }}
        revokePending={false}
        revokeDiagnostic={null}
        revokeTriggerRef={createRef()}
        onOpenChange={() => undefined}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.getByRole('button', { name: 'Remove agent' })).toBeDefined()
  })

  it('returns focus to the trigger ref after cancel', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    const revokeTriggerRef = { current: trigger }
    const onOpenChange = vi.fn()
    render(
      <AgentLifecycleConfirmDialog
        lifecycleTarget={{ kind: 'agent', principalRef: 'prn_test', name: 'Agent A' }}
        revokePending={false}
        revokeDiagnostic={null}
        revokeTriggerRef={revokeTriggerRef}
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
