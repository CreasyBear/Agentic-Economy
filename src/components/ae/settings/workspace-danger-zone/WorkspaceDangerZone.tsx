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
    <div className="grid gap-section">
      <WorkspaceClosePanel {...closePanel} />
      <WorkspaceTransferPanel {...transferPanel} />
    </div>
  )
}
