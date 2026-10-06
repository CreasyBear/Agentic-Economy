// The installed Arc block owns the composer; AE owns draft admission and recovery.

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { ArcAiComposer } from '@/components/ae/shared/arc-pro/ai-composer/ai-composer'
import { AlphaLearningNotice } from '@/components/ae/shared/AlphaLearningNotice'
import './ChatComposerFeedback.css'
import { RecoveryNotice } from '../../recovery/RecoveryNotice'
import { chatAnonymousCountLine, chatComposer, chatRecovery } from '@/lib/public/chat-ia'

import { MAX_PROMPT_CHARACTERS } from '../anonymous-session'
import type { ChatComposerProps } from '../chat-session.contracts'

/** The session owns admission and retries; the view submits only an enabled draft. */
export function ChatComposer({ prompt, busy, disabled, error, errorReference, browseMarketOnError, status, anonymousMessageCount, anonymousMessageLimitReached, recovery, onPromptChange, onSubmit, onRetry, onEditLast, onNewChat, onStop }: ChatComposerProps) {
  const promptLength = Array.from(prompt).length
  const invalid = error.length > 0
  const canSend = !busy && !disabled && prompt.trim().length > 0 && Array.from(prompt.trim()).length <= MAX_PROMPT_CHARACTERS
  return <><ArcAiComposer value={prompt} onValueChange={onPromptChange} onSubmit={onSubmit}
    busy={busy} disabled={disabled} canSend={canSend} inputId="tool-chat-prompt"
    label={chatComposer.promptLabel} placeholder={chatComposer.placeholder}
    describedBy="tool-chat-limit tool-chat-error" invalid={invalid}
    hint={busy ? 'Response in progress' : 'Enter to send, Shift Enter for a new line'}
    sendLabel={chatComposer.send} sendingLabel={chatComposer.sending} stopLabel={chatComposer.stop}
    sendAria={chatComposer.sendAria} sendingAria={chatComposer.sendingAria} stopAria={chatComposer.stopAria}
    {...(onStop === undefined ? {} : { onStop })} announcement={status}
    feedback={
    <div className="arc-chat-feedback" data-quiet={!invalid && anonymousMessageCount === undefined && promptLength < 1_800 || undefined}>
      <div className="arc-chat-feedback-main">
        {invalid ? <div id="tool-chat-error" className="arc-chat-error">{recovery === undefined ? <p role="alert" className="arc-chat-error-message">{error}</p> : <RecoveryNotice reason={recovery} {...(onRetry === undefined ? {} : { onRetry })} {...(onEditLast === undefined ? {} : { onEdit: onEditLast })} {...(onNewChat === undefined ? {} : { onNewChat })} />}
          {errorReference === undefined ? null : <p className="arc-chat-support-reference"><span>{chatRecovery.reference}</span><AeCopyReference label="chat support reference" value={errorReference} /></p>}
          {browseMarketOnError ? <a href="/market" className="arc-chat-recovery-link">{chatRecovery.browse}</a> : null}
        </div> : <div id="tool-chat-error" role="alert" />}
        {anonymousMessageLimitReached && !invalid ? <RecoveryNotice reason="anonymous_message_limit" {...(onNewChat === undefined ? {} : { onNewChat })} /> : anonymousMessageCount === undefined || invalid ? null : <p className="arc-chat-browser-count">{chatAnonymousCountLine(anonymousMessageCount, false)}</p>}
      </div>
      <p id="tool-chat-limit" className="arc-chat-character-count">{promptLength >= 1_800 ? `${promptLength.toLocaleString('en-AU')} / 2,000` : ''}</p>
    </div>
    } /><AlphaLearningNotice /></>
}
