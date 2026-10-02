import { RefreshCwIcon } from 'lucide-react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { Button } from '@/components/arc/button/button'
import '../StatusComposition.css'

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
          size="md"
          disabled={model.isChecking}
          aria-busy={model.isChecking}
          onClick={model.onRefresh}
        >
          <RefreshCwIcon aria-hidden="true" /> {model.refreshLabel}
        </Button>
      }
    >
      <div className="arc-market arc-system-status ae-rail">
        <StatusCheckList checks={model.checks} isChecking={model.isChecking} />
        <p className="arc-system-status-updated">{model.lastUpdated}</p>
        {model.recovery !== undefined ? <StatusRecoveryPanel recovery={model.recovery} /> : null}
        <StatusPageFooter statusAnnouncement={model.statusAnnouncement} />
      </div>
    </AePublicPage>
  )
}
