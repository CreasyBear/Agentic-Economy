import { WorkspaceClosePanel } from './components/WorkspaceClosePanel'
import { WorkspaceTransferPanel } from './components/WorkspaceTransferPanel'
import { useWorkspaceDangerZone } from './useWorkspaceDangerZone'
import { WorkspaceDangerZoneSkeleton } from './WorkspaceDangerZoneSkeleton'
import './WorkspaceDangerComposition.css'

export function WorkspaceDangerZone() {
  const { loading, closePanel, transferPanel } = useWorkspaceDangerZone()

  if (loading || closePanel === null || transferPanel === null) {
    return <WorkspaceDangerZoneSkeleton />
  }

  return (
    <div className="arc-market arc-workspace-danger-workspace">
      <WorkspaceClosePanel {...closePanel} />
      <WorkspaceTransferPanel {...transferPanel} />
    </div>
  )
}
