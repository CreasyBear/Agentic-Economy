import { makeFunctionReference } from 'convex/server'
import { useMutation } from 'convex/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { AeNavigationSafetyBoundary } from '@/components/ae/layout/AeNavigationSafetyBoundary'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { renameWorkspaceServer } from '@/lib/server/workspace-profile.functions'
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
  const saveRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (requestedName !== null && name === requestedName) {
      setRequestedName(null)
      setMessage('Workspace name saved and confirmed.')
    } else if (requestedName === null) {
      setDraft(name)
    }
  }, [name, requestedName])

  const normalized = draft.trim()
  const invalid = normalized.length === 0 || normalized.length > 200 || !/^[\p{L}\p{N}\p{P}\p{S}\p{Zs}]+$/u.test(normalized)

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending || invalid || normalized === canonicalName || !canEdit) return
    setPending(true)
    setRequestedName(normalized)
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
        setMessage('Name saved. Waiting for the workspace to confirm it…')
        setSaveOutcome('saved')
        return
      }
      const result = await renameWorkspaceServer({ data: { name: normalized } })
      if (result.kind === 'refused') {
        setRequestedName(null)
        setSaveOutcome('failed')
        setMessage(result.code === 'forbidden'
          ? 'Only the workspace owner can change its name.'
          : 'Name was not saved. Try again; the existing name is unchanged.')
      } else {
        setMessage('Name saved. Waiting for the workspace to confirm it…')
        setSaveOutcome('saved')
      }
    })().catch((cause: unknown) => {
      captureClientExceptionOnClient(cause)
      setRequestedName(null)
      setSaveOutcome('failed')
      setMessage('Name was not saved. Try again; the existing name is unchanged.')
    }).finally(() => setPending(false))
  }

  if (!canEdit) return <span className="font-medium">{name}</span>

  const dirty = normalized !== name.trim()
  return (
    <AeNavigationSafetyBoundary
      state={{ dirty, pending, saveOutcome }}
      title="Leave without saving the workspace name?"
      pendingTitle="Workspace name is still saving"
      description="The name you typed will be discarded."
      pendingDescription="Wait until the save finishes. The current name is unchanged until it confirms."
      saveActionRef={saveRef}
      headingRef={inputRef}
    >
      <form onSubmit={onSubmit} className="grid min-w-0 gap-2 sm:max-w-sm">
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor="workspace-name" className="sr-only">Workspace name</FieldLabel>
          <Input ref={inputRef} id="workspace-name" value={draft} maxLength={200} disabled={pending || requestedName !== null}
            aria-invalid={invalid || undefined} spellCheck={false}
            onChange={(event) => { setDraft(event.currentTarget.value); setMessage(''); setSaveOutcome('idle') }} />
          {invalid ? <FieldError>Enter a name of 1 to 200 characters.</FieldError> : null}
        </Field>
        <Button ref={saveRef} type="submit" disabled={pending || requestedName !== null || invalid || normalized === canonicalName}
          className="min-h-touch justify-self-start">{pending ? 'Saving…' : 'Save workspace name'}</Button>
        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
      </form>
    </AeNavigationSafetyBoundary>
  )
}
