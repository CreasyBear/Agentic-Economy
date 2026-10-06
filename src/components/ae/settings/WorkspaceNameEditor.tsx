import { makeFunctionReference } from 'convex/server'
import { useMutation } from 'convex/react'
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'

import { AeNavigationSafetyBoundary } from '@/components/ae/layout/AeNavigationSafetyBoundary'
import { SettingsSaveBar } from '@/components/ae/shared/arc-pro/settings-page/settings-page'
import { Button } from '@/components/arc/button/button'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { renameWorkspaceServer } from '@/lib/server/workspace-profile.functions'
import './IdentityFieldsComposition.css'
const renameUnboundWorkspaceRef = makeFunctionReference<
  'mutation',
  Readonly<{ name: string; expectedRevision: number; correlationRef: string; idempotencyRef: string }>,
  Readonly<{ kind: 'updated' | 'replayed' | 'unchanged'; name: string }>
>('workspaceAccounts:renameUnboundWorkspace')

export type WorkspaceNameEditorProps = Readonly<{
  name: string
  canonicalName: string
  accountRevision: number
  clerkOrgId: string | null
  canEdit: boolean
}>

export function WorkspaceNameEditor({ name, canonicalName, accountRevision, clerkOrgId, canEdit }: WorkspaceNameEditorProps) {
  const renameUnboundWorkspace = useMutation(renameUnboundWorkspaceRef)
  const idempotencyRef = useRef(`idem:workspace-name:${crypto.randomUUID()}`)
  const [draft, setDraft] = useState(name)
  const [requestedName, setRequestedName] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [saveOutcome, setSaveOutcome] = useState<'idle' | 'saved' | 'failed'>('idle')
  const [observedIdentity, setObservedIdentity] = useState({ name, canonicalName })
  const confirmationSeenRef = useRef(false)
  const saveRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reconcile actual source changes before rendering children. A display alias
  // alone cannot confirm a rename; the canonical source must echo the request.
  if (observedIdentity.name !== name || observedIdentity.canonicalName !== canonicalName) {
    setObservedIdentity({ name, canonicalName })
    if (requestedName !== null && canonicalName === requestedName) {
      setRequestedName(null)
      setDraft(name)
      setMessage('Workspace name saved and confirmed.')
      setSaveOutcome('saved')
    } else if (requestedName === null) {
      setDraft(name)
      setSaveOutcome('idle')
    }
  }
  // Commit this readback before an in-flight promise can overwrite its feedback.
  useLayoutEffect(() => {
    if (saveOutcome === 'saved') confirmationSeenRef.current = true
  }, [saveOutcome])

  const normalized = draft.trim()
  const invalid = normalized.length === 0 || normalized.length > 200 || !/^[\p{L}\p{N}\p{P}\p{S}\p{Zs}]+$/u.test(normalized)
  const waitingForConfirmation = pending || requestedName !== null
  const submitDisabled = waitingForConfirmation || invalid || normalized === canonicalName

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitDisabled || !canEdit) return
    setPending(true)
    setRequestedName(normalized)
    confirmationSeenRef.current = false
    setSaveOutcome('idle')
    setMessage('Saving workspace name…')
    void (async () => {
      if (clerkOrgId === null) {
        await renameUnboundWorkspace({
          name: normalized,
          expectedRevision: accountRevision,
          correlationRef: 'ui:workspace-name:save',
          idempotencyRef: idempotencyRef.current,
        })
        idempotencyRef.current = `idem:workspace-name:${crypto.randomUUID()}`
        if (!confirmationSeenRef.current) setMessage('Name saved. Waiting for the workspace to confirm it…')
        return
      }
      const result = await renameWorkspaceServer({ data: { name: normalized } })
      if (result.kind === 'refused') {
        if (confirmationSeenRef.current) return
        setRequestedName(null)
        setSaveOutcome('failed')
        setMessage(result.code === 'forbidden'
          ? 'Only the workspace owner can change its name.'
          : 'Name was not saved. Try again; the existing name is unchanged.')
      } else {
        if (!confirmationSeenRef.current) setMessage('Name saved. Waiting for the workspace to confirm it…')
      }
    })().catch((cause: unknown) => {
      captureClientExceptionOnClient(cause)
      if (confirmationSeenRef.current) return
      setRequestedName(null)
      setSaveOutcome('failed')
      setMessage('Name was not saved. Try again; the existing name is unchanged.')
    }).finally(() => setPending(false))
  }

  if (!canEdit) return <span className="arc-market arc-identity-editor arc-identity-readonly">{name}</span>

  const dirty = normalized !== name.trim()
  let saveBarState: 'edit' | 'saving' | 'saved' | null = null
  if (saveOutcome === 'saved') saveBarState = 'saved'
  if (dirty) saveBarState = 'edit'
  if (waitingForConfirmation) saveBarState = 'saving'
  let saveLabel = 'Save workspace name'
  if (requestedName !== null) saveLabel = 'Confirming…'
  if (pending) saveLabel = 'Saving…'
  return (
    <AeNavigationSafetyBoundary
      // The accepted Clerk write waits for a webhook echo. Keep the field locked,
      // but allow explicit departure once transport settles; acceptance is not confirmation.
      state={{ dirty, pending, saveOutcome }}
      title={requestedName === null ? 'Leave without saving the workspace name?' : 'Leave before the workspace name is confirmed?'}
      pendingTitle="Workspace name is still saving"
      description={requestedName === null ? 'The name you typed will be discarded.' : 'The rename request was accepted. Check the workspace name when you return.'}
      pendingDescription="Wait until the save finishes. The current name is unchanged until it confirms."
      saveActionRef={saveRef}
      headingRef={inputRef}
    >
      <form onSubmit={onSubmit} className="arc-market arc-identity-editor">
        <div role="group" data-invalid={invalid || undefined} className="arc-identity-field">
          <label htmlFor="workspace-name" className="sr-only">Workspace name</label>
          <input ref={inputRef} type="text" id="workspace-name" className="arc-identity-input" value={draft} maxLength={200} disabled={waitingForConfirmation}
            aria-invalid={invalid} spellCheck={false}
            aria-describedby={invalid ? 'workspace-name-error' : undefined}
            onChange={(event) => { setDraft(event.currentTarget.value); setMessage(''); setSaveOutcome('idle') }} />
          {invalid ? <p id="workspace-name-error" role="alert" className="arc-identity-error">Enter a name of 1 to 200 characters.</p> : null}
        </div>
        <SettingsSaveBar
          state={saveBarState}
          count={Number(dirty)}
          savedLabel="Workspace name saved and confirmed"
          focusReturnRef={inputRef}
        >
          <Button variant="primary" size="md" ref={saveRef} type="submit" disabled={submitDisabled}
            aria-busy={waitingForConfirmation}
            className="arc-identity-save">{saveLabel}</Button>
        </SettingsSaveBar>
        {message ? <p role="status" className="arc-identity-message">{message}</p> : null}
      </form>
    </AeNavigationSafetyBoundary>
  )
}
