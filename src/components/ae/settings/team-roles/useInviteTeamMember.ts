import { useState, type FormEvent } from 'react'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { inviteTeamMemberServer } from './team-roles.functions'

export function useInviteTeamMember() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
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
    void inviteTeamMemberServer({ data: { email: trimmed, role } })
      .then(() => {
        setMessage(`Invitation sent to ${trimmed}. The member appears here after accepting.`)
        setEmail('')
      })
      .catch(cause => {
        captureClientExceptionOnClient(cause)
        const serverMessage = cause instanceof Error ? cause.message : ''
        setError(serverMessage === 'Sign in to invite a member.' || serverMessage === 'Invitations are no longer available. Refresh Team & roles to see why.'
          ? serverMessage
          : 'Could not send the invitation. Try again.')
      })
      .finally(() => setPending(false))
  }

  return { email, setEmail, role, setRole, pending, message, error, emailError, submit }
}
