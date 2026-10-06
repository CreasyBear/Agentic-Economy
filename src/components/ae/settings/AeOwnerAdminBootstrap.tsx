import { useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { SettingsGroup } from './settings-shell/components/SettingsSections'
import { AeAlert } from '@/components/ae/shared/arc/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { createPrefixedRandomId } from '@/modules/common/random-id'
import { bootstrapOwnerAdminServer, readOwnerAdminBootstrapServer, type OwnerAdminBootstrapCommand, type OwnerAdminBootstrapStatus } from '@/modules/security/owner-admin-bootstrap.functions'

/** One card owns its draft and attempted command. Reading status never submits or
 * rewrites that command; only an explicit click after eligible readback may retry. */
export function AeOwnerAdminBootstrap({ initialStatus }: { initialStatus: OwnerAdminBootstrapStatus }) {
  const submit = useServerFn(bootstrapOwnerAdminServer)
  const read = useServerFn(readOwnerAdminBootstrapServer)
  const [status, setStatus] = useState(initialStatus)
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [command, setCommand] = useState<OwnerAdminBootstrapCommand | null>(null)
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'checking' | 'unknown' | 'reviewed'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const inFlight = useRef(false)
  const busy = phase === 'submitting' || phase === 'checking'

  async function checkStatus() {
    if (inFlight.current) return
    inFlight.current = true
    setPhase('checking')
    try {
      const next = await read({ data: command === null ? {} : { operationKey: command.operationKey } })
      setStatus(next)
      setPhase(next.kind === 'unavailable' ? 'unknown' : 'reviewed')
      setMessage(next.kind === 'eligible' && command !== null
        ? 'No completed setup is recorded for this request. You can check again or retry the same request; the server rechecks eligibility before acting.' : null)
    } catch {
      setStatus({ kind: 'unavailable' })
      setPhase('unknown')
    } finally { inFlight.current = false }
  }
  async function activate() {
    if (inFlight.current || status.kind !== 'eligible' || (command !== null && phase !== 'reviewed')) return
    if (reason.trim() === '' || evidence.trim() === '') { setMessage('Enter a reason and an external authorization evidence reference.'); return }
    const request = command ?? { reasonCode: reason.trim(), evidenceRefs: [evidence.trim()],
      operationKey: createPrefixedRandomId('admin-bootstrap:'), correlationId: createPrefixedRandomId('admin-bootstrap:correlation:') }
    inFlight.current = true
    setCommand(request)
    setPhase('submitting')
    setMessage(null)
    try {
      const result = await submit({ data: request })
      if (result.kind === 'unknown' || result.kind === 'refused') {
        setPhase('unknown')
        setMessage(result.kind === 'refused' ? 'Setup was refused. Check current access before another attempt.' : 'The setup result could not be confirmed. Check current access before another attempt.')
      } else { setStatus(result); setPhase('idle') }
    } catch {
      setPhase('unknown')
      setMessage('The setup result could not be confirmed. Check current access before another attempt.')
    } finally { inFlight.current = false }
  }

  if (status.kind === 'ineligible' && command === null) return null
  return <SettingsGroup title="Admin owner setup" description="Initial platform administration for the preauthorized owner account.">
    {status.kind === 'active' ? <p role="status">Admin owner access is active. <a className="underline" href="/admin">Open Admin</a>. Guarded changes still require MFA.</p>
      : status.kind === 'recorded' ? <p role="status">This setup was recorded, but this account no longer has active Admin owner access. An Admin owner must review access before it is restored.</p>
        : status.kind === 'ineligible' ? <p role="status">Initial setup is no longer available for this account. An Admin owner must review access.</p> : <>
          <p className="text-sm">This gives your signed-in account authority to manage Admin memberships, commercial policies and payment controls. Setup does not enable payments or enroll MFA.</p>
          {status.kind === 'eligible' ? <fieldset disabled={command !== null || busy} className="grid gap-related">
            <Input id="admin-bootstrap-reason" label="Reason for initial setup" value={reason} maxLength={200} onChange={event => setReason(event.target.value)} />
            <div className="grid gap-intra"><Input id="admin-bootstrap-evidence" label="Authorization evidence reference" value={evidence} maxLength={200} onChange={event => setEvidence(event.target.value)} /><p className="text-xs text-muted-foreground">Use an existing approval, ticket or document reference supporting this authority.</p></div>
          </fieldset> : <p role="status">Current setup eligibility is unavailable. Check status before continuing.</p>}
          {message === null ? null : <AeAlert tone="info" title={message} role="status" />}
          <div className="flex flex-wrap gap-intra">
            {status.kind === 'eligible' && (command === null || phase === 'reviewed') ? <Button type="button" disabled={busy} onClick={() => void activate()}>{command === null ? 'Set up Admin owner access' : 'Retry reviewed setup'}</Button> : null}
            {command !== null || status.kind === 'unavailable' ? <Button type="button" variant="secondary" disabled={busy} onClick={() => void checkStatus()}>{phase === 'checking' ? 'Checking access…' : 'Check setup status'}</Button> : null}
          </div>
          {phase === 'submitting' ? <p role="status">Submitting initial setup…</p> : null}
        </>}
    {(status.kind === 'active' || status.kind === 'recorded') && status.auditEventRef !== null ? <p className="break-all text-xs">Recorded setup: {status.auditEventRef}</p> : null}
  </SettingsGroup>
}
