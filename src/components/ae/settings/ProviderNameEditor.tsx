import { useRef, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import type { RenameProviderDisplayNameResult } from '@/lib/server/owner-workspace.functions'

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

  return <div className="grid min-w-0 gap-3 sm:max-w-sm">
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor="provider-public-name" className="sr-only">Public Provider name</FieldLabel>
      <Input id="provider-public-name" value={name} maxLength={200} disabled={pending} aria-invalid={invalid || undefined}
        onChange={(event) => {
          setName(event.currentTarget.value)
          setFeedback(undefined)
          requestKeyRef.current = crypto.randomUUID()
        }} />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {invalid ? <FieldError>Enter a public Provider name from 1 to 160 characters.</FieldError> : null}
    </Field>
    <Button type="button" className="min-h-touch justify-self-start" disabled={pending || invalid || unchanged} aria-busy={pending || undefined}
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
