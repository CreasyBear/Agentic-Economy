import type { WorkspaceDangerDiagnosticSlotProps } from '../workspace-danger-zone.contracts'
import '../WorkspaceDangerComposition.css'

export function WorkspaceDangerDiagnosticSlot({ diagnostic }: WorkspaceDangerDiagnosticSlotProps) {
  return (
    <div className="arc-market arc-workspace-diagnostic-slot" role="status" aria-live="polite">
      {diagnostic ? (
        <div className="arc-workspace-diagnostic">
          <p>
            <strong>What happened:</strong> {diagnostic.whatHappened}
          </p>
          <p className="arc-workspace-diagnostic-money">
            <strong>Financial impact:</strong> {diagnostic.financialImpact}
          </p>
          <p>
            <strong>Next step:</strong> {diagnostic.nextStep}
          </p>
        </div>
      ) : null}
    </div>
  )
}
