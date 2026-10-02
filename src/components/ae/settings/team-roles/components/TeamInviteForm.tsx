import { useEffect, useRef } from 'react'

import { Button } from '@/components/arc/button/button'
import { SettingsGroup } from '../../settings-shell/components/SettingsSections'
import type { TeamInviteFormProps } from '../team-roles.contracts'
import '../TeamComposition.css'

export function TeamInviteForm({ email, role, pending, message, error, emailError, onEmailChange, onRoleChange, onSubmit }: TeamInviteFormProps) {
  const emailRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (emailError === '') return
    emailRef.current?.focus()
  }, [emailError])

  return <SettingsGroup title="Invite a member" description="Invitations are sent to this workspace's linked identity organisation. Access is granted only after the invitation is accepted and recorded by Agentic Economy.">
    <form onSubmit={onSubmit} className="arc-market arc-team-invite">
      <div className="arc-team-invite-email-field" data-invalid={emailError !== '' || undefined}>
        <label htmlFor="team-invite-email">Email address</label>
        <input ref={emailRef} id="team-invite-email" type="email" autoComplete="email" required value={email} disabled={pending} aria-invalid={emailError !== '' || undefined} aria-describedby={emailError !== '' ? 'team-invite-email-error' : undefined} onChange={event => onEmailChange(event.currentTarget.value)} />
        {emailError !== '' ? <p id="team-invite-email-error" className="arc-team-invite-help">{emailError}</p> : null}
      </div>
      <div className="arc-team-invite-role-field">
        <label htmlFor="team-invite-role">Workspace role</label>
        <select id="team-invite-role" value={role} disabled={pending} onChange={event => onRoleChange(event.currentTarget.value as 'admin' | 'member')}>
          <option value="member">Member</option><option value="admin">Admin</option>
        </select>
        <p className="arc-team-invite-help">Admins manage workspace settings. Members can use the workspace.</p>
      </div>
      <Button type="submit" variant="primary" className="arc-team-invite-submit" disabled={pending} aria-busy={pending}>{pending ? 'Sending…' : 'Send invitation'}</Button>
      {message && <p role="status" className="arc-team-invite-message">{message}</p>}
      {error && <p id="team-invite-error" role="alert" className="arc-team-invite-error">{error}</p>}
    </form>
  </SettingsGroup>
}
