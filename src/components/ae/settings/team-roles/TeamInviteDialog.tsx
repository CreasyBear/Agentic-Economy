import { useEffect, useId, useRef, useState, type Ref } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { useInviteTeamMember } from './useInviteTeamMember'

/** Licensed Solution Users 4 invite-people-dialog.tsx, adapted to one supported invitation.
 * https://reui.io/preview/base/solution-users-4
 * SHA-256 de5e5950bc8317d44d5fa50284a693df963325a378264e9ad3a7dc484bed65e3
 * Existing owner retains draft, pending and uncertain outcomes when the dialog closes.
 */
export function TeamInviteDialog({ invitation, actionRef, onObserve, disabled = false }: {
  invitation: ReturnType<typeof useInviteTeamMember>; actionRef?: Ref<HTMLButtonElement>; onObserve: () => void; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const sending = invitation.pending && !invitation.unconfirmed
  useEffect(() => { if (invitation.emailError && open) emailRef.current?.focus() }, [invitation.emailError, open])
  return <Dialog open={open} onOpenChange={value => { if (!sending) setOpen(value) }}>
    <DialogTrigger render={<Button ref={actionRef} type="button" disabled={disabled} />}><Send aria-hidden="true" />Invite a member</DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl" initialFocus={emailRef} showCloseButton={!sending}>
      <DialogHeader><DialogTitle>Invite a member</DialogTitle><DialogDescription>Access begins after they accept and Aecon records their membership.</DialogDescription></DialogHeader>
      <form onSubmit={event => { if (disabled) event.preventDefault(); else invitation.submit(event) }} className="grid gap-5">
        <Field data-invalid={invitation.emailError !== '' || undefined}>
          <FieldLabel htmlFor={`${id}-email`}>Email address</FieldLabel>
          <Input ref={emailRef} id={`${id}-email`} type="email" required autoComplete="email" value={invitation.email} disabled={invitation.pending || disabled}
            aria-invalid={invitation.emailError !== '' || undefined} aria-describedby={invitation.emailError ? `${id}-email-error` : undefined}
            onChange={event => invitation.setEmail(event.target.value)} />
          {invitation.emailError ? <p id={`${id}-email-error`} className="text-sm text-destructive">{invitation.emailError}</p> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-role`}>Workspace role</FieldLabel>
          <select id={`${id}-role`} className="min-h-11 w-full rounded-sm border bg-background px-3 text-sm" value={invitation.role} disabled={invitation.pending || disabled}
            aria-describedby={`${id}-role-help`} onChange={event => invitation.setRole(event.target.value === 'admin' ? 'admin' : 'member')}>
            <option value="member">Member</option><option value="admin">Admin</option>
          </select>
          <FieldDescription id={`${id}-role-help`}>Admins manage workspace settings. Members can use the workspace.</FieldDescription>
        </Field>
        {invitation.message ? <p role="status" className="text-sm">{invitation.message}</p> : null}
        {invitation.error ? <p role="alert" className="text-sm text-destructive">{invitation.error}</p> : null}
        {disabled ? <p className="text-sm text-muted-foreground">Close this dialog and refresh team access before sending an invitation.</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={sending} onClick={() => setOpen(false)}>Close</Button>
          {invitation.unconfirmed ? <Button type="button" onClick={() => { setOpen(false); onObserve() }}>Check pending invitations</Button>
            : <Button type="submit" disabled={invitation.pending || disabled} aria-busy={sending}>{sending ? 'Sending…' : 'Send invitation'}</Button>}
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
