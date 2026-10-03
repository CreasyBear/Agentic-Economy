/* Retrieved upstream source SHA-256: e5fb913291f365ef3dae5eb00e5eb25858cf168a87a8c2cd5ccf7a83345f2ce0 */
/* Licensed Arc Pro AI Composer textPad/toolbar/SendButton source regions.
 * Retrieved via Arc MCP 2026-10-03. The controlled session replaces demo transport,
 * file attachments, message flight and scripted replies; no engine is installed.
 */
import { ArrowUp } from 'lucide-react'
import type { ReactNode } from 'react'

import styles from './ai-composer.module.css'

export type ArcAiComposerProps = Readonly<{
  value: string
  onValueChange(value: string): void
  onSubmit(): void
  busy: boolean
  disabled: boolean
  canSend: boolean
  onStop?: () => void
  inputId: string
  label: string
  placeholder: string
  describedBy: string
  invalid: boolean
  hint: string
  sendLabel: string
  sendingLabel: string
  stopLabel: string
  sendAria: string
  sendingAria: string
  stopAria: string
  feedback: ReactNode
  announcement: string
}>

/** Requires caller-owned admission; ensures only an enabled draft can submit.
 * Invariant: the block neither clears the draft nor invents a reply or retry.
 * On violation the native disabled controls keep the session unchanged.
 */
export function ArcAiComposer(props: ArcAiComposerProps) {
  const stopping = props.busy && props.onStop !== undefined
  const sendEnabled = props.canSend && !props.busy && !props.disabled
  return <form className={styles.root} onSubmit={event => {
    event.preventDefault()
    if (sendEnabled) props.onSubmit()
  }}>
    <div className={styles.composer} data-invalid={props.invalid || undefined}>
      <div className={styles.textPad}>
        <label className={styles.srOnly} htmlFor={props.inputId}>{props.label}</label>
        <textarea id={props.inputId} className={styles.input} rows={1} value={props.value}
          placeholder={props.placeholder} disabled={props.disabled} aria-invalid={props.invalid}
          aria-describedby={props.describedBy} onChange={event => props.onValueChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (sendEnabled) event.currentTarget.form?.requestSubmit()
            }
          }} />
      </div>
      <div className={styles.toolbar}>
        <span className={styles.spacer} />
        <span className={styles.hint} aria-hidden="true">{props.hint}</span>
        {stopping ? <button type="button" className={styles.send} data-busy aria-label={props.stopAria} onClick={props.onStop}>
          <span className={styles.sendFace}><span className={styles.stopGlyph} aria-hidden="true" />{props.stopLabel}</span>
        </button> : <button type="submit" className={styles.send} disabled={!sendEnabled}
          aria-busy={props.busy} aria-label={props.busy ? props.sendingAria : props.sendAria}>
          <span className={styles.sendFace}>{props.busy ? props.sendingLabel : props.sendLabel}<ArrowUp size={18} strokeWidth={2} aria-hidden="true" /></span>
        </button>}
      </div>
    </div>
    {props.feedback}
    <p className={styles.srOnly} role="status" aria-live="polite">{props.announcement}</p>
  </form>
}
