import { useLocation } from '@tanstack/react-router'
import { useCallback, useState } from 'react'

import type { SettingsScope } from './settings-dialog.contracts'

export function isOnOwnerSettingsPath(pathname: string): boolean {
  if (pathname === '/owner/settings' || pathname === '/owner/team' || pathname === '/owner/workspace') {
    return true
  }
  return pathname.startsWith('/owner/settings/')
}

export function useAeSettingsDialog() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<SettingsScope>('personal')

  const openSettings = useCallback(
    (nextScope: SettingsScope = 'personal') => {
      if (isOnOwnerSettingsPath(pathname)) return
      setScope(nextScope)
      setOpen(true)
    },
    [pathname],
  )

  return {
    open,
    scope,
    setOpen,
    setScope,
    openSettings,
  }
}
