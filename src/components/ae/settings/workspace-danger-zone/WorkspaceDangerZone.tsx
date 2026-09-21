import { Alert } from '@/components/ui/alert'

import { WorkspaceClosePanel } from './components/WorkspaceClosePanel'
import { WorkspaceTransferPanel } from './components/WorkspaceTransferPanel'
import { useWorkspaceDangerZone } from './useWorkspaceDangerZone'
import { WorkspaceDangerZoneSkeleton } from './WorkspaceDangerZoneSkeleton'

export function WorkspaceDangerZone() {
  const { loading, closePanel, transferPanel } = useWorkspaceDangerZone()

  if (loading || closePanel === null || transferPanel === null) {
    return <WorkspaceDangerZoneSkeleton />
  }

  return (
    <Alert variant="destructive" className="grid-cols-1 gap-section p-gutter [&>*]:col-start-1">
      <WorkspaceClosePanel {...closePanel} />
      <WorkspaceTransferPanel {...transferPanel} />
    </Alert>
  )
}
