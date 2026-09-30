// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AgentLifecycleConfirmDialog } from './AgentLifecycleConfirmDialog'

describe('AgentLifecycleConfirmDialog', () => {
  it('confirms exactly once without closing as a side effect', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <AgentLifecycleConfirmDialog
        lifecycleTarget={{ kind: 'agent', principalRef: 'prn_test', name: 'Agent A' }}
        revokePending={false}
        revokeDiagnostic={null}
        revokeTriggerRef={createRef()}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    )

    const buttons = within(screen.getByRole('alertdialog')).getAllByRole('button')
    const confirmButton = buttons[1]
    if (confirmButton === undefined) throw new Error('Expected confirm button after cancel button')
    fireEvent.click(confirmButton)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('does not confirm when cancelled', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <AgentLifecycleConfirmDialog
        lifecycleTarget={{ kind: 'agent', principalRef: 'prn_test', name: 'Agent A' }}
        revokePending={false}
        revokeDiagnostic={null}
        revokeTriggerRef={createRef()}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    )

    const buttons = within(screen.getByRole('alertdialog')).getAllByRole('button')
    const cancelButton = buttons[0]
    if (cancelButton === undefined) throw new Error('Expected cancel button before confirm button')
    fireEvent.click(cancelButton)

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

})
