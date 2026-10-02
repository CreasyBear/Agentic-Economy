// Invariant: a recoverable chat failure always stays beside its safe next action, following the existing chat card notices.
import { Button } from '@/components/arc/button/button'
import { DecisionPanel } from '@/components/arc/chat/DecisionPanel'
import { projectChatRecovery } from './recovery.view-model'
import type { RecoveryNoticeProps } from './recovery.contracts'

export function RecoveryNotice({ reason, onRetry, onEdit, onAddCredit, onNewChat, statusHref, callRefs, className }: RecoveryNoticeProps) {
  if (reason === undefined) return null
  const recovery = projectChatRecovery(reason)
  return (
    <DecisionPanel role="status" aria-live="polite" aria-atomic="true" className={className}>
      <p>{recovery.message}</p>
      {recovery.actions.length === 0 ? null : (
        <div className="arc-decision-actions">
          {recovery.actions.map(action => {
            if (action.kind === 'retry') return onRetry === undefined ? null : (
              <Button key={action.kind} type="button" variant="secondary" onClick={onRetry}>{action.label}</Button>
            )
            if (action.kind === 'edit') return onEdit === undefined ? null : (
              <Button key={action.kind} type="button" variant="secondary" onClick={onEdit}>{action.label}</Button>
            )
            if (action.kind === 'add_credit') return onAddCredit === undefined ? null : (
              <Button key={action.kind} type="button" variant="secondary" onClick={onAddCredit}>{action.label}</Button>
            )
            if (action.kind === 'new_chat') return (
              onNewChat === undefined
                ? <a key={action.kind} href={action.href} className="arc-decision-link">{action.label}</a>
                : <Button key={action.kind} type="button" variant="secondary" onClick={onNewChat}>{action.label}</Button>
            )
            if (action.kind === 'check_status') {
              if (statusHref !== undefined) return <a key={action.kind} href={statusHref} className="arc-decision-link">{action.label}</a>
              return callRefs?.map(callRef => (
                <a key={`status-${callRef}`} href={`/calls/${encodeURIComponent(callRef)}`} className="arc-decision-link">{action.label}</a>
              )) ?? null
            }
            return action.href === undefined ? null : <a key={action.kind} href={action.href} className="arc-decision-link">{action.label}</a>
          })}
        </div>
      )}
    </DecisionPanel>
  )
}
