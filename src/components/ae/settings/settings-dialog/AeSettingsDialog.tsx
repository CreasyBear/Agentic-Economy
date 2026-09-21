'use client'

import { useEffect, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AccountSettingsSection } from '@/components/ae/settings/OwnerSettingsSections'
import type { AccountSecurityHistoryResult } from '@/modules/security/account-security'
import { readAccountSecurityHistoryServer } from '@/modules/security/account-security.functions'

import { SettingsScopeTabs } from './components/SettingsScopeTabs'
import { WorkspaceSettingsBody } from './components/WorkspaceSettingsBody'
import type { SettingsScope } from './settings-dialog.contracts'

export type AeSettingsDialogProps = Readonly<{
  open: boolean
  scope: SettingsScope
  onOpenChange: (open: boolean) => void
  onScopeChange: (scope: SettingsScope) => void
}>

export function AeSettingsDialog({
  open,
  scope,
  onOpenChange,
  onScopeChange,
}: AeSettingsDialogProps) {
  const readHistory = useServerFn(readAccountSecurityHistoryServer)
  const [history, setHistory] = useState<AccountSecurityHistoryResult | null>(null)

  useEffect(() => {
    if (!open || scope !== 'personal') return
    let cancelled = false
    void readHistory({ data: {} }).then((result) => {
      if (!cancelled) setHistory(result)
    })
    return () => {
      cancelled = true
    }
  }, [open, readHistory, scope])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(42rem,calc(100dvh-2rem))] flex-col gap-section overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0 text-start">
          <DialogTitle>Account & settings</DialogTitle>
          <DialogDescription>
            Personal profile and workspace controls without leaving your current task.
          </DialogDescription>
        </DialogHeader>
        <SettingsScopeTabs scope={scope} onScopeChange={onScopeChange} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pe-1">
          {scope === 'personal' ? (
            history === null ? (
              <p className="text-sm text-muted-foreground">Loading account settings…</p>
            ) : (
              <AccountSettingsSection history={history} />
            )
          ) : (
            <WorkspaceSettingsBody />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
