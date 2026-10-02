import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { DecisionPanel } from '@/components/arc/chat/DecisionPanel'
import { ADMIN_ACTION_COPY, ADMIN_ACTION_SHEET_COPY, ADMIN_REASON_LABELS, ADMIN_REASON_OPTIONS, type AuditPreviewProps } from '../actions.contracts'
import './CommandReviewComposition.css'

export function AuditPreview({ action, targetRefs, reasonCode, evidenceRefs, approval }: AuditPreviewProps) {
  const reason = ADMIN_REASON_OPTIONS[action].find((candidate) => candidate === reasonCode)
  return (
    <DecisionPanel aria-label="Action review" className="arc-command-review">
      <dl className="arc-command-facts">
        <div className="arc-command-fact">
          <dt>{ADMIN_ACTION_SHEET_COPY.operation}</dt>
          <dd>{ADMIN_ACTION_COPY[action]}</dd>
        </div>
        {targetRefs.map((target) => (
          <div key={`${target.label}:${target.value}`} className="arc-command-fact">
            <dt>{target.label}</dt>
            <dd><AeCopyReference label={target.label} value={target.value} /></dd>
          </div>
        ))}
        <div className="arc-command-fact">
          <dt>{ADMIN_ACTION_SHEET_COPY.reason}</dt>
          <dd>{reason === undefined ? reasonCode : ADMIN_REASON_LABELS[reason]}</dd>
        </div>
        <div className="arc-command-fact">
          <dt>{ADMIN_ACTION_SHEET_COPY.evidence}</dt>
          {evidenceRefs.map((value) => (
            <dd key={value}><AeCopyReference label={ADMIN_ACTION_SHEET_COPY.evidence} value={value} /></dd>
          ))}
        </div>
        <div className="arc-command-fact">
          <dt>{ADMIN_ACTION_SHEET_COPY.approval}</dt>
          <dd>{approval.kind}</dd>
        </div>
      </dl>
    </DecisionPanel>
  )
}
