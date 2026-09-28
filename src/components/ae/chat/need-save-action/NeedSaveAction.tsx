import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import type { ChatNeedActions, ChatSaveNeed } from '@/modules/chat/tool-card'
import { useNeedSaveAction } from './useNeedSaveAction'

type NeedSaveActionProps = Readonly<{ input: ChatSaveNeed; actions: ChatNeedActions | null }>

export function NeedSaveAction({ input, actions }: NeedSaveActionProps) {
  const { busy, requestRef, withdrawn, message, lookupState, save, checkStatus, withdraw, retry } = useNeedSaveAction(input, actions)
  if (actions === null) return null
  if (!actions.authenticated) {
    return <a href="/sign-in" className={buttonVariants({ variant: 'outline' })}>Sign in to save this need</a>
  }
  return (
    <div className="grid gap-intra">
      {lookupState === 'checking' ? <p className="text-sm" role="status">Checking saved needs…</p> : null}
      {lookupState === 'error' ? (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={retry}>Retry saved needs</Button>
      ) : null}
      {lookupState === 'ready' && (requestRef === null || withdrawn) ? (
        <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save this need'}
        </Button>
      ) : null}
      {requestRef !== null ? (
        <div className="grid gap-intra">
          <p className="break-all text-sm">Request reference: <code>{requestRef}</code></p>
          {!withdrawn ? (
            <div className="flex flex-wrap gap-intra">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void checkStatus()}>Check status</Button>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void withdraw()}>Withdraw</Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {message ? <p className="text-sm" role="status">{message}</p> : null}
    </div>
  )
}
