// Arc Pro ai-composer's textPad/toolbar/send composition, retrieved 1 October
// 2026, bound to AE's controlled session. No sample transport or reply state.
import { ArrowUpIcon, SquareIcon } from 'lucide-react'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Button } from '@/components/arc/button/button'
import '@/components/arc/chat/ChatComposer.css'
import { RecoveryNotice } from '../../recovery/RecoveryNotice'
import { chatAnonymousCountLine, chatComposer, chatRecovery } from '@/lib/public/chat-ia'

import { MAX_PROMPT_CHARACTERS } from '../anonymous-session'
import type { ChatComposerProps } from '../chat-session.contracts'

/** The session owns admission and retries; the view submits only an enabled draft. */
export function ChatComposer({ prompt, busy, disabled, error, errorReference, browseMarketOnError, status, anonymousMessageCount, anonymousMessageLimitReached, recovery, onPromptChange, onSubmit, onRetry, onEditLast, onNewChat, onStop }: ChatComposerProps) {
  const promptLength = Array.from(prompt).length
  const invalid = error.length > 0
  const canSend = !busy && !disabled && prompt.trim().length > 0 && Array.from(prompt.trim()).length <= MAX_PROMPT_CHARACTERS
  return <form className="arc-market arc-chat arc-chat-form" action={onSubmit}>
    <div className="arc-chat-composer" data-invalid={invalid || undefined}>
      <div className="arc-chat-text-pad"><label htmlFor="tool-chat-prompt" className="sr-only">{chatComposer.promptLabel}</label>
        <textarea id="tool-chat-prompt" className="arc-chat-input" value={prompt} onChange={event => onPromptChange(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            if (canSend) event.currentTarget.form?.requestSubmit()
          }
        }} placeholder={chatComposer.placeholder} disabled={disabled} aria-describedby="tool-chat-limit tool-chat-error" aria-invalid={invalid} rows={1} />
      </div>
      <div className="arc-chat-toolbar"><p className="arc-chat-composer-hint" aria-hidden="true">{busy ? 'Response in progress' : 'Enter to send, Shift Enter for a new line'}</p>
        {busy && onStop !== undefined ? <Button type="button" className="arc-chat-send" onClick={onStop} aria-label={chatComposer.stopAria}><SquareIcon size={16} aria-hidden="true" />{chatComposer.stop}</Button> : <Button type="submit" className="arc-chat-send" disabled={!canSend} loading={busy} aria-label={busy ? chatComposer.sendingAria : chatComposer.sendAria}>{busy ? chatComposer.sending : chatComposer.send}<ArrowUpIcon size={18} aria-hidden="true" /></Button>}
      </div>
    </div>
    <div className="arc-chat-feedback" data-quiet={!invalid && anonymousMessageCount === undefined && promptLength < 1_800 || undefined}>
      <div className="arc-chat-feedback-main">
        {invalid ? <div id="tool-chat-error" className="arc-chat-error">{recovery === undefined ? <p role="alert" className="arc-chat-error-message">{error}</p> : <RecoveryNotice reason={recovery} {...(onRetry === undefined ? {} : { onRetry })} {...(onEditLast === undefined ? {} : { onEdit: onEditLast })} {...(onNewChat === undefined ? {} : { onNewChat })} />}
          {errorReference === undefined ? null : <p className="arc-chat-support-reference"><span>{chatRecovery.reference}</span><AeCopyReference label="chat support reference" value={errorReference} /></p>}
          {browseMarketOnError && recovery === undefined ? <a href="/market" className="arc-chat-recovery-link">{chatRecovery.browse}</a> : null}
        </div> : <div id="tool-chat-error" role="alert" />}
        {anonymousMessageLimitReached && !invalid ? <RecoveryNotice reason="anonymous_message_limit" {...(onNewChat === undefined ? {} : { onNewChat })} /> : anonymousMessageCount === undefined || invalid ? null : <p className="arc-chat-browser-count">{chatAnonymousCountLine(anonymousMessageCount, false)}</p>}
      </div>
      <p id="tool-chat-limit" className="arc-chat-character-count">{promptLength >= 1_800 ? `${promptLength.toLocaleString('en-AU')} / 2,000` : ''}</p>
    </div>
    <p className="sr-only" role="status" aria-live="polite">{status}</p>
  </form>
}
