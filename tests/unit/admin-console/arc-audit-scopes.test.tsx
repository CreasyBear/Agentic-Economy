/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AuditFilterChips } from '@/components/ae/admin/audit/components/AuditFilterChips'
import type { AdminAuditFilterDraft } from '@/components/ae/admin/audit/audit.contracts'

const draft: AdminAuditFilterDraft = { eventType: '', actorRef: '', targetType: '', targetRef: '', correlationId: '', from: '', to: '' }
const handlers = () => ({ onDraftChange: vi.fn(), onApply: vi.fn(), onRemove: vi.fn(), onClear: vi.fn() })
afterEach(cleanup)

describe('Arc audit scopes', () => {
  it('removes the exact indexed chip and clears through their existing callbacks', () => {
    const callbacks = handlers()
    render(<AuditFilterChips chips={[{ key: 'actorRef', label: 'Actor', value: 'principal:long-exact-reference' }]} draft={draft} {...callbacks} />)
    expect(screen.getByText('principal:long-exact-reference')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Actor' }))
    expect(callbacks.onRemove).toHaveBeenCalledWith('actorRef')
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(callbacks.onClear).toHaveBeenCalledOnce()
    expect(callbacks.onApply).not.toHaveBeenCalled()
  })

  it('keeps date edits as draft until the explicit form submission', async () => {
    const callbacks = handlers()
    render(<AuditFilterChips chips={[]} draft={draft} {...callbacks} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'From' }))
    const input = screen.getByLabelText('From')
    expect(input.getAttribute('type')).toBe('date')
    fireEvent.change(input, { target: { value: '2026-10-02' } })
    expect(callbacks.onDraftChange).toHaveBeenCalledWith('from', '2026-10-02')
    expect(callbacks.onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    expect(callbacks.onApply).toHaveBeenCalledOnce()
    expect(screen.queryByLabelText('From')).toBeNull()
  })

  it('keeps event selection searchable and separate from applying the scope', async () => {
    const callbacks = handlers()
    render(<AuditFilterChips chips={[]} draft={draft} {...callbacks} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Event type' }))
    const picker = await screen.findByRole('dialog', { name: 'Event type' })
    fireEvent.change(within(picker).getByRole('combobox', { name: 'Event type' }), { target: { value: 'admin.action_denied' } })
    fireEvent.click(await within(picker).findByRole('option', { name: /admin\.action_denied/u }))
    expect(callbacks.onDraftChange).toHaveBeenCalledWith('eventType', 'admin.action_denied')
    expect(callbacks.onApply).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Event type' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    expect(callbacks.onApply).toHaveBeenCalledOnce()
  })
})
