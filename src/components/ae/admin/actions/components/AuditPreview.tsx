import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { ADMIN_ACTION_COPY, ADMIN_ACTION_SHEET_COPY, ADMIN_REASON_LABELS, ADMIN_REASON_OPTIONS, type AuditPreviewProps } from '../actions.contracts'

export function AuditPreview({ action, targetRefs, reasonCode, evidenceRefs, approval }: AuditPreviewProps) {
  const reason = ADMIN_REASON_OPTIONS[action].find((candidate) => candidate === reasonCode)
  return (
    <dl className="flex flex-col gap-4 text-sm">
      <div>
        <dt className="text-muted-foreground">{ADMIN_ACTION_SHEET_COPY.operation}</dt>
        <dd className="font-medium">{ADMIN_ACTION_COPY[action]}</dd>
      </div>
      {targetRefs.map((target) => (
        <div key={`${target.label}:${target.value}`}>
          <dt className="text-muted-foreground">{target.label}</dt>
          <dd><AeCopyReference label={target.label} value={target.value} /></dd>
        </div>
      ))}
      <div>
        <dt className="text-muted-foreground">{ADMIN_ACTION_SHEET_COPY.reason}</dt>
        <dd>{reason === undefined ? reasonCode : ADMIN_REASON_LABELS[reason]}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{ADMIN_ACTION_SHEET_COPY.evidence}</dt>
        {evidenceRefs.map((value) => (
          <dd key={value}><AeCopyReference label={ADMIN_ACTION_SHEET_COPY.evidence} value={value} /></dd>
        ))}
      </div>
      <div>
        <dt className="text-muted-foreground">{ADMIN_ACTION_SHEET_COPY.approval}</dt>
        <dd>{approval.kind}</dd>
      </div>
    </dl>
  )
}
