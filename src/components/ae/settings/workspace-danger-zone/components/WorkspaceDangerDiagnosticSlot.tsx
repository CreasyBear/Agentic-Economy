import type { WorkspaceDangerDiagnosticSlotProps } from '../workspace-danger-zone.contracts'

export function WorkspaceDangerDiagnosticSlot({ diagnostic }: WorkspaceDangerDiagnosticSlotProps) {
  return (
    <div className="min-h-[2.5rem]" role="status" aria-live="polite">
      {diagnostic ? (
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>
            <strong>What happened:</strong> {diagnostic.whatHappened}
          </p>
          <p className="font-mono text-xs tabular-nums">
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
