import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { HttpCredentialFormProps } from '../connection-handoff.contracts'

export function HttpCredentialForm({
  sourceOriginLabel,
  credentialLabel,
  credential,
  busy,
  error,
  onCredentialChange,
  onSubmit,
  onCancel,
}: HttpCredentialFormProps) {
  return (
    <form className="grid max-w-xl gap-5" onSubmit={(event) => void onSubmit(event)}>
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">
          Enter the credential for {sourceOriginLabel}. Agentic Economy stores it in the Provider connection and will not show it again.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="provider-connection-credential">{credentialLabel}</Label>
        <Input
          id="provider-connection-credential"
          type="password"
          value={credential}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={32_768}
          disabled={busy}
          aria-describedby={error === undefined ? undefined : 'provider-connection-error'}
          aria-invalid={error === undefined ? undefined : true}
          onChange={(event) => onCredentialChange(event.target.value)}
        />
        {error === undefined ? null : (
          <p id="provider-connection-error" className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Connecting…' : 'Connect Provider'}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void onCancel()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
