import { useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SettingsGroup } from '../../settings-shell/components/SettingsSections'
import type { TeamInviteFormProps } from '../team-roles.contracts'

export function TeamInviteForm({ email, role, pending, message, error, emailError, onEmailChange, onRoleChange, onSubmit }: TeamInviteFormProps) {
  const emailRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (emailError === '') return
    emailRef.current?.focus()
  }, [emailError])

  return <SettingsGroup title="Invite a member" description="Invitations are sent to this workspace's linked identity organisation. Access is granted only after the invitation is accepted and recorded by Agentic Economy.">
    <form onSubmit={onSubmit} className="grid max-w-lg gap-4 pt-4">
      <Field data-invalid={emailError !== '' || undefined}>
        <FieldLabel htmlFor="team-invite-email">Email address</FieldLabel>
        <Input ref={emailRef} id="team-invite-email" type="email" autoComplete="email" required value={email} disabled={pending} aria-invalid={emailError !== '' || undefined} aria-describedby={emailError !== '' ? 'team-invite-email-error' : undefined} onChange={event => onEmailChange(event.currentTarget.value)} />
        {emailError !== '' ? <FieldDescription id="team-invite-email-error">{emailError}</FieldDescription> : null}
      </Field>
      <Field><FieldLabel htmlFor="team-invite-role">Workspace role</FieldLabel>
        <select id="team-invite-role" value={role} disabled={pending} onChange={event => onRoleChange(event.currentTarget.value as 'admin' | 'member')} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring">
          <option value="member">Member</option><option value="admin">Admin</option>
        </select><FieldDescription>Admins manage workspace settings. Members can use the workspace.</FieldDescription>
      </Field>
      <Button type="submit" className="justify-self-start" disabled={pending} aria-busy={pending}>{pending ? 'Sending…' : 'Send invitation'}</Button>
      {message && <p role="status" className="text-sm text-foreground">{message}</p>}
      {error && <p id="team-invite-error" role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  </SettingsGroup>
}
