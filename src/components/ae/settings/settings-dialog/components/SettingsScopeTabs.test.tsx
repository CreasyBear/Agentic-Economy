// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, afterEach } from 'vitest'

import { SettingsScopeTabs } from '@/components/ae/settings/settings-dialog/components/SettingsScopeTabs'
import { SETTINGS_SCOPE_LABELS } from '@/components/ae/settings/settings-dialog/settings-dialog.contracts'

afterEach(() => {
  cleanup()
})

describe('SettingsScopeTabs', () => {
  it('exposes Personal and Workspace scope tabs with touch targets', () => {
    render(<SettingsScopeTabs scope="personal" onScopeChange={() => undefined} />)

    expect(screen.getByRole('tab', { name: SETTINGS_SCOPE_LABELS.personal })).toBeTruthy()
    expect(screen.getByRole('tab', { name: SETTINGS_SCOPE_LABELS.workspace })).toBeTruthy()
    expect(screen.getByRole('tab', { name: SETTINGS_SCOPE_LABELS.personal }).className).toContain('min-h-touch')
  })

  it('calls onScopeChange when Workspace is selected', () => {
    let next: 'personal' | 'workspace' = 'personal'
    render(
      <SettingsScopeTabs
        scope="personal"
        onScopeChange={(scope) => {
          next = scope
        }}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: SETTINGS_SCOPE_LABELS.workspace }))
    expect(next).toBe('workspace')
  })
})
