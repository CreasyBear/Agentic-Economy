import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { formatRelativeTime } from '@/lib/ui/format-time'

import {
  projectStatusChecks,
  recoveryGuidance,
  statusAnnouncementText,
  statusLastUpdatedLabel,
  statusPageTitle,
  type UseSystemStatusInput,
  type UseSystemStatusResult,
} from './system-status.contracts'

export function useSystemStatus({ loaded }: UseSystemStatusInput): UseSystemStatusResult {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(false)
  const relativeCheckedAt = formatRelativeTime(loaded.checkedAt)
  const checks = projectStatusChecks(loaded.checks, isChecking, relativeCheckedAt)
  const degradedChecks = checks.filter((check) => check.state === 'degraded')
  const degraded = degradedChecks.length > 0
  const recovery = degraded ? recoveryGuidance(degradedChecks) : undefined

  const onRefresh = () => {
    if (isChecking) return
    setIsChecking(true)
    void router.invalidate()
      .catch((cause) => captureClientExceptionOnClient(cause))
      .finally(() => setIsChecking(false))
  }

  return {
    isChecking,
    title: statusPageTitle(isChecking, degraded),
    refreshLabel: isChecking ? 'Checking status…' : 'Refresh status',
    checks,
    statusAnnouncement: statusAnnouncementText(isChecking, checks, degradedChecks, loaded.checkedAt),
    lastUpdated: `${statusLastUpdatedLabel} ${relativeCheckedAt}`,
    onRefresh,
    ...(recovery === undefined ? {} : { recovery }),
  }
}
