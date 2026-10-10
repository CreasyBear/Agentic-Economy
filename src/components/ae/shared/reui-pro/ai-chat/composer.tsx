/* Adapted from licensed ReUI ai-chat-3 composer.tsx, base-nova, 2026-10-07.
 * Registry SHA-256: c64800b8fc671b83430ffd8a9475f1efd14fce54c13394597d2547236227b11d.
 * Retains the controlled InputGroup composition. AE owns draft admission,
 * failure recovery and optional Stop; no mock context, effort or reply state.
 */
import { ArrowUpIcon, SquareIcon } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'

export type ReuiChatComposerProps = Readonly<{
  value: string; onValueChange(value: string): void; onSubmit(): void
  busy: boolean; disabled: boolean; canSend: boolean; onStop?: () => void
  inputId: string; label: string; placeholder: string; describedBy: string
  invalid: boolean; hint: string; sendAria: string; sendingAria: string; stopAria: string
  feedback: ReactNode; announcement: string
}>

export function ReuiChatComposer(props: ReuiChatComposerProps) {
  const field = useRef<HTMLTextAreaElement>(null)
  const stopping = props.busy && props.onStop !== undefined
  const sendEnabled = props.canSend && !props.busy && !props.disabled
  return <div className="flex w-full flex-col gap-2">
    <form onSubmit={event => {
      event.preventDefault()
      if (!sendEnabled) return
      props.onSubmit()
      field.current?.focus()
    }}>
      <FieldLabel className="sr-only" htmlFor={props.inputId}>{props.label}</FieldLabel>
      <InputGroup className="h-auto rounded-xl bg-background px-2 [&_[data-slot=button]]:rounded-full" data-invalid={props.invalid || undefined}>
        <InputGroupTextarea id={props.inputId} ref={field} rows={1}
          value={props.value} onChange={event => props.onValueChange(event.target.value)}
          placeholder={props.placeholder} disabled={props.disabled} aria-invalid={props.invalid} aria-describedby={props.describedBy}
          className="field-sizing-content max-h-40 min-h-12 w-full py-3 text-base md:text-sm"
          onKeyDown={event => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
            event.preventDefault()
            if (sendEnabled) event.currentTarget.form?.requestSubmit()
          }} />
        <InputGroupAddon align="inline-end" className="self-end pb-1">
          {stopping ? <InputGroupButton type="button" size="icon-sm" variant="default"
            className="min-h-11 min-w-11 rounded-full" aria-label={props.stopAria} onClick={props.onStop}>
            <SquareIcon className="fill-current" aria-hidden="true" />
          </InputGroupButton> : <InputGroupButton type="submit" size="icon-sm" variant="default"
            className="min-h-11 min-w-11 rounded-full" disabled={!sendEnabled} aria-busy={props.busy}
            aria-label={props.busy ? props.sendingAria : props.sendAria}>
            {props.busy ? <Spinner aria-hidden="true" /> : <ArrowUpIcon aria-hidden="true" />}
          </InputGroupButton>}
        </InputGroupAddon>
      </InputGroup>
      <p className="sr-only">{props.hint}</p>
    </form>
    {props.feedback}
    <p className="sr-only" role="status" aria-live="polite">{props.announcement}</p>
  </div>
}
