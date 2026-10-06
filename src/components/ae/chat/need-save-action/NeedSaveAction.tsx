import { Button } from '@/components/arc/button/button'
import type { ChatNeedActions, ChatSaveNeed } from '@/modules/chat/tool-card'
import './NeedRecordComposition.css'
import { useNeedSaveAction } from './useNeedSaveAction'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

type NeedSaveActionProps = Readonly<{ input: ChatSaveNeed; actions: ChatNeedActions | null }>

export function NeedSaveAction({ input, actions }: NeedSaveActionProps) {
  const { busy, requestRef, withdrawn, message, lookupState, save, checkStatus, withdraw, retry } = useNeedSaveAction(input, actions)
  if (actions === null) return null
  if (!actions.authenticated) {
    return (
      <div className="arc-market arc-chat arc-need-record arc-need-record-root">
        <a href="/sign-in" className={actionLinkClassName('secondary', 'md')}>Sign in to save this need</a>
      </div>
    )
  }
  return (
    <div className="arc-market arc-chat arc-need-record arc-need-record-root">
      {lookupState === 'checking' ? <p className="arc-need-record-status" role="status">Checking saved needs…</p> : null}
      {lookupState === 'error' ? (
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={retry}>Retry saved needs</Button>
      ) : null}
      {lookupState === 'ready' && (requestRef === null || withdrawn) ? (
        <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save this need'}
        </Button>
      ) : null}
      {requestRef !== null ? (
        <div className="arc-need-record-row">
          <p className="arc-need-record-reference">Request reference: <code className="arc-need-record-reference-value">{requestRef}</code></p>
          {!withdrawn ? (
            <div className="arc-need-record-actions">
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void checkStatus()}>Check status</Button>
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void withdraw()}>Withdraw</Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {message ? <p className="arc-need-record-status" role="status">{message}</p> : null}
    </div>
  )
}
