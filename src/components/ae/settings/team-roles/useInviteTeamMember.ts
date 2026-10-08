import { useState, type FormEvent } from 'react'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import type { TeamAccessView } from './team-access.contracts'
import { inviteTeamMemberServer } from './team-roles.functions'

export function useInviteTeamMember(transferRequested = false, accountRef?: string) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [pending, setPending] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState<Readonly<{ email: string; role: 'admin' | 'member'; accountRef: string | undefined }>>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || unconfirmed !== undefined) return
    if (accountRef === undefined) { setError('Refresh Team & roles before inviting a member.'); return }
    const trimmed = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Enter a valid email address.')
      setError('')
      setMessage('')
      return
    }
    setPending(true)
    setEmailError('')
    setError('')
    setMessage('')
    void inviteTeamMemberServer({ data: { expectedAccountRef: accountRef, email: trimmed, role, ...(transferRequested ? { returnForTransfer: true } : {}) } })
      .then(() => {
        setMessage(`Invitation sent to ${trimmed}. The member appears here after accepting.`)
        setEmail('')
      })
      .catch(cause => {
        captureClientExceptionOnClient(cause)
        const serverMessage = cause instanceof Error ? cause.message : ''
        const knownRefusal = serverMessage === 'Sign in to invite a member.' || serverMessage === 'Invitations are no longer available. Refresh Team & roles to see why.'
        if (!knownRefusal) setUnconfirmed({ email: trimmed, role, accountRef })
        setError(serverMessage === 'Sign in to invite a member.' || serverMessage === 'Invitations are no longer available. Refresh Team & roles to see why.'
          ? serverMessage
          : 'The invitation could not be confirmed. Refresh pending invitations before sending another invitation.')
      })
      .finally(() => setPending(false))
  }

  function observeInvitations(view: TeamAccessView) {
    if (unconfirmed === undefined || view.accountRef !== unconfirmed.accountRef || !view.canManageInvitations) return
    const observed = view.invitations.find(invitation => invitation.email.toLowerCase() === unconfirmed.email.toLowerCase())
    if (observed !== undefined) {
      if (observed.role !== `org:${unconfirmed.role}`) { setError('A pending invitation has a different role. Review or cancel it before inviting again.'); return }
      setMessage(`A pending invitation to ${unconfirmed.email} is confirmed. The member appears after accepting.`)
      setEmail(''); setError(''); setUnconfirmed(undefined)
    } else if (view.invitationsComplete) {
      setError('No pending invitation for this address is recorded in the current list. Review the roster in case it was accepted before sending another invitation.')
      setUnconfirmed(undefined)
    }
  }
  return { email, setEmail: (value: string) => { if (unconfirmed === undefined && !pending) setEmail(value) },
    role, setRole: (value: 'admin' | 'member') => { if (unconfirmed === undefined && !pending) setRole(value) },
    pending: pending || unconfirmed !== undefined, unconfirmed: unconfirmed !== undefined,
    message, error, emailError, submit, observeInvitations }
}
