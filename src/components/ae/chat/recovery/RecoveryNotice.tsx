// Invariant: a recoverable chat failure always stays beside its safe next action, following the existing chat card notices.
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { projectChatRecovery } from './recovery.view-model'
import type { RecoveryNoticeProps } from './recovery.contracts'

export function RecoveryNotice({ reason, onRetry, onEdit, onAddCredit, onNewChat, statusHref, callRefs, className }: RecoveryNoticeProps) {
  if (reason === undefined) return null
  const recovery = projectChatRecovery(reason)
  return (
    <section role="status" aria-live="polite" aria-atomic="true" className={cn('grid gap-related rounded-card border border-border bg-card px-3 py-3 text-sm', className)}>
      <p>{recovery.message}</p>
      {recovery.actions.length === 0 ? null : (
        <div className="flex flex-wrap gap-2">
          {recovery.actions.map(action => {
            if (action.kind === 'retry') return onRetry === undefined ? null : (
              <Button key={action.kind} type="button" variant="outline" className="min-h-touch" onClick={onRetry}>{action.label}</Button>
            )
            if (action.kind === 'edit') return onEdit === undefined ? null : (
              <Button key={action.kind} type="button" variant="outline" className="min-h-touch" onClick={onEdit}>{action.label}</Button>
            )
            if (action.kind === 'add_credit') return onAddCredit === undefined ? null : (
              <Button key={action.kind} type="button" variant="outline" className="min-h-touch" onClick={onAddCredit}>{action.label}</Button>
            )
            if (action.kind === 'new_chat') return (
              <Button key={action.kind} type="button" variant="outline" className="min-h-touch"
                {...(onNewChat === undefined ? { render: <a href={action.href} /> } : { onClick: onNewChat })}>{action.label}</Button>
            )
            if (action.kind === 'check_status') {
              if (statusHref !== undefined) return <Button key={action.kind} variant="outline" className="min-h-touch" render={<a href={statusHref} />}>{action.label}</Button>
              return callRefs?.map(callRef => (
                <Button key={`status-${callRef}`} variant="outline" className="min-h-touch" render={<a href={`/calls/${encodeURIComponent(callRef)}`} />}>{action.label}</Button>
              )) ?? null
            }
            return action.href === undefined ? null : (
              <Button key={action.kind} variant="outline" className="min-h-touch" render={<a href={action.href} />}>{action.label}</Button>
            )
          })}
        </div>
      )}
    </section>
  )
}
