import { PencilIcon } from 'lucide-react'
import { useId, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Editor state while an inline edit session is open. `null` means display mode. */
type InlineEditSession = Readonly<{ seed: string; draft: string; error: string | null }>

export type InlineEditFieldProps = Readonly<{
  /** Committed value shown in display mode. An empty (or whitespace-only) value renders an em-dash cell. */
  value: string
  /**
   * Commit seam. Resolve `true` to accept; resolve `false` or reject to roll
   * back: the attempted value reverts to the committed value, a sanitized
   * inline error is announced via role="alert", and the editor stays open
   * for a retry.
   */
  onSave(nextValue: string): Promise<boolean>
  /** Accessible name for both the edit affordance and the input. */
  label: string
  /** Locks the field into a plain display cell with no affordance. */
  readOnly?: boolean
  /** Static sanitized error copy used when a save fails. */
  errorMessage?: string
  /** Commit/cancel button labels so each surface keeps its centralized copy. */
  saveLabel?: string
  cancelLabel?: string
  /** Controlled single-editor gate (e.g. one open row per list); omit for self-managed state. */
  editing?: boolean
  /** Controlled companions of `editing`; called after every exit (commit, cancel, escape). */
  onEditStart?(): void
  onEditEnd?(): void
}>

const DEFAULT_SAVE_ERROR_MESSAGE = 'Could not save. Try again.'

/**
 * Twenty-style inline-editing cell in AE idiom (Tailwind v4 + existing ui
 * primitives): display text with a hover-revealed pencil affordance that
 * swaps to an input + save/cancel form. Commit is delegated entirely to
 * `onSave`; this component never invents transport. The consumer owns the
 * committed value pipeline and passes the fresh value back through `value`.
 */
export function InlineEditField({
  value,
  onSave,
  label,
  readOnly = false,
  errorMessage = DEFAULT_SAVE_ERROR_MESSAGE,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  editing: editingProp,
  onEditStart,
  onEditEnd,
}: InlineEditFieldProps) {
  const [selfEditing, setSelfEditing] = useState(false)
  const editing = editingProp ?? selfEditing

  function startEdit(): void {
    if (readOnly) return
    onEditStart?.()
    setSelfEditing(true)
  }

  function endEdit(): void {
    setSelfEditing(false)
    onEditEnd?.()
  }

  if (readOnly) {
    return (
      <div className="min-w-0">
        <DisplayText value={value} />
      </div>
    )
  }

  if (!editing) {
    return (
      <div className="group/inline-edit min-w-0">
        <span className="flex min-w-0 items-center gap-intra">
          <DisplayText value={value} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-touch min-w-touch shrink-0 opacity-100 lg:opacity-0 lg:group-hover/inline-edit:opacity-100 lg:group-focus-within/inline-edit:opacity-100"
            aria-label={label}
            onClick={startEdit}
          >
            <PencilIcon aria-hidden="true" />
          </Button>
        </span>
      </div>
    )
  }

  return (
    <InlineEditEditor
      value={value}
      onSave={onSave}
      label={label}
      errorMessage={errorMessage}
      saveLabel={saveLabel}
      cancelLabel={cancelLabel}
      onEnd={endEdit}
    />
  )
}

function InlineEditEditor({
  value,
  onSave,
  label,
  errorMessage,
  saveLabel,
  cancelLabel,
  onEnd,
}: Readonly<{
  value: string
  onSave(nextValue: string): Promise<boolean>
  label: string
  errorMessage: string
  saveLabel: string
  cancelLabel: string
  onEnd(): void
}>) {
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState<InlineEditSession>(() => ({
    seed: value,
    draft: value,
    error: null,
  }))
  const inputId = useId()
  const errorId = `${inputId}-error`

  async function commit(): Promise<void> {
    if (busy) return
    const next = session.draft.trim()
    if (next === '' || next === session.seed.trim()) {
      onEnd()
      return
    }
    setBusy(true)
    let accepted: boolean
    try {
      accepted = await onSave(next)
    } catch {
      accepted = false
    }
    if (accepted) {
      onEnd()
      return
    }
    setBusy(false)
    setSession({ seed: session.seed, draft: session.seed, error: errorMessage })
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape' && !busy) {
      event.stopPropagation()
      onEnd()
    }
  }

  return (
    <form
      className="flex w-full flex-col gap-intra"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault()
        void commit()
      }}
    >
      <Input
        id={inputId}
        aria-label={label}
        aria-invalid={session.error !== null}
        aria-describedby={session.error === null ? undefined : errorId}
        value={session.draft}
        onChange={(event) => setSession({ ...session, draft: event.target.value })}
        onKeyDown={onKeyDown}
        disabled={busy}
        autoFocus
      />
      {session.error === null ? null : (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {session.error}
        </p>
      )}
      <div className="flex items-center gap-intra">
        <Button type="submit" size="sm" disabled={busy} onClick={(event) => { event.preventDefault(); void commit() }}>
          {saveLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onEnd}>
          {cancelLabel}
        </Button>
      </div>
    </form>
  )
}

function DisplayText({ value }: Readonly<{ value: string }>) {
  if (value.trim() === '') {
    return (
      <span className="truncate text-muted-foreground" aria-label="empty">
        &mdash;
      </span>
    )
  }
  return <span className="truncate">{value}</span>
}
