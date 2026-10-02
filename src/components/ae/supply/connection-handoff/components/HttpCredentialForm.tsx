import { Button } from '@/components/arc/button/button'

import type { HttpCredentialFormProps } from '../connection-handoff.contracts'
import '../ConnectionHandoffComposition.css'

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
    <form className="arc-market arc-connection-handoff" onSubmit={(event) => void onSubmit(event)}>
      <div className="arc-connection-handoff-copy">
        <p>
          Enter the credential for {sourceOriginLabel}. Agentic Economy stores it in the Provider connection and will not show it again.
        </p>
      </div>
      <div className="arc-connection-handoff-field">
        <label htmlFor="provider-connection-credential">{credentialLabel}</label>
        <input
          className="arc-connection-handoff-input"
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
          <p id="provider-connection-error" className="arc-connection-handoff-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="arc-connection-handoff-actions">
        <Button type="submit" variant="primary" size="md" disabled={busy}>
          {busy ? 'Connecting…' : 'Connect Provider'}
        </Button>
        <Button type="button" variant="secondary" size="md" disabled={busy} onClick={() => void onCancel()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
