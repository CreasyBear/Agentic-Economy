import { useRef, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/arc/button/button'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import type { RenameProviderDisplayNameResult } from '@/lib/server/owner-workspace.functions'
import './IdentityFieldsComposition.css'

export type ProviderNameEditorProps = Readonly<{
  businessId: string
  currentName: string
  onRename: (input: Readonly<{ businessId: string; name: string; requestKey: string }>) => Promise<RenameProviderDisplayNameResult>
  description?: string
}>

export function ProviderNameEditor({ businessId, currentName, onRename, description }: ProviderNameEditorProps) {
  const [name, setName] = useState(currentName)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<RenameProviderDisplayNameResult>()
  const requestKeyRef = useRef<string | null>(null)
  const [previousCurrentName, setPreviousCurrentName] = useState(currentName)
  if (currentName !== previousCurrentName) {
    setPreviousCurrentName(currentName)
    setName(currentName)
  }
  const normalized = name.trim().normalize('NFKC').replace(/\s+/g, ' ')
  const invalid = normalized.length === 0 || normalized.length > 160
  const unchanged = normalized === currentName

  return <div className="arc-market arc-identity-editor">
    <div role="group" data-invalid={invalid || undefined} className="arc-identity-field">
      <label htmlFor="provider-public-name" className="sr-only">Public Provider name</label>
      <input type="text" id="provider-public-name" className="arc-identity-input" value={name} maxLength={200} disabled={pending} aria-invalid={invalid || undefined}
        aria-describedby={[description ? 'provider-name-description' : null, invalid ? 'provider-name-error' : null].filter(Boolean).join(' ') || undefined}
        onChange={(event) => {
          setName(event.currentTarget.value)
          setFeedback(undefined)
          requestKeyRef.current = crypto.randomUUID()
        }} />
      {description ? <p id="provider-name-description" className="arc-identity-description">{description}</p> : null}
      {invalid ? <p id="provider-name-error" role="alert" className="arc-identity-error">Enter a public Provider name from 1 to 160 characters.</p> : null}
    </div>
    <Button variant="primary" size="md" type="button" className="arc-identity-save" disabled={pending || invalid || unchanged} aria-busy={pending || undefined}
      onClick={() => {
        setPending(true)
        setFeedback(undefined)
        void onRename({ businessId, name, requestKey: requestKeyRef.current ?? crypto.randomUUID() })
          .then((result) => {
            setFeedback(result)
            if (result.kind === 'updated') {
              setName(result.name)
              requestKeyRef.current = crypto.randomUUID()
            }
          })
          .catch((cause) => {
            captureClientExceptionOnClient(cause)
            setFeedback({ kind: 'refused', code: 'source_unavailable' })
          })
          .finally(() => setPending(false))
      }}>
      {pending ? 'Saving public name…' : 'Save public name'}
    </Button>
    {feedback?.kind === 'updated' || feedback?.kind === 'unchanged' ? (
      <Alert role="status"><AlertTitle>Public name saved</AlertTitle><AlertDescription>The Provider listing and current Tools now use {feedback.name}.</AlertDescription></Alert>
    ) : feedback?.kind === 'refused' ? (
      <Alert variant="destructive" role="alert"><AlertTitle>Public name was not saved</AlertTitle><AlertDescription>{
        feedback.code === 'invalid_name' ? 'Enter a public Provider name from 1 to 160 characters.'
          : feedback.code === 'unauthenticated' ? 'Sign in again before changing the public Provider name.'
            : feedback.code === 'wrong_owner' ? 'This Business does not own that Provider identity.'
              : 'Try again. The existing public name is unchanged.'
      }</AlertDescription></Alert>
    ) : null}
  </div>
}
