import { RefreshCwIcon } from 'lucide-react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { Button } from '@/components/ui/button'

import { StatusCheckList } from './components/StatusCheckList'
import { StatusPageFooter } from './components/StatusPageFooter'
import { StatusRecoveryPanel } from './components/StatusRecoveryPanel'
import type { AeSystemStatusProps } from './system-status.contracts'
import { statusPageDescription } from './system-status.contracts'
import { useSystemStatus } from './useSystemStatus'

export type { AeSystemStatusProps } from './system-status.contracts'

export function AeSystemStatus({ loaded }: AeSystemStatusProps) {
  const model = useSystemStatus({ loaded })

  return (
    <AePublicPage
      kind="document"
      eyebrow="System status"
      title={model.title}
      description={statusPageDescription}
      actions={
        <Button
          type="button"
          variant="outline"
          className="min-h-touch"
          disabled={model.isChecking}
          aria-busy={model.isChecking}
          onClick={model.onRefresh}
        >
          <RefreshCwIcon aria-hidden="true" /> {model.refreshLabel}
        </Button>
      }
    >
      <div className="ae-rail pb-page">
        <StatusCheckList checks={model.checks} isChecking={model.isChecking} />
        <p className="mt-intra text-sm text-muted-foreground">{model.lastUpdated}</p>
        {model.recovery !== undefined ? <StatusRecoveryPanel recovery={model.recovery} /> : null}
        <StatusPageFooter statusAnnouncement={model.statusAnnouncement} />
      </div>
    </AePublicPage>
  )
}
