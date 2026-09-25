import { useState, type FormEvent } from 'react'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { inviteTeamMemberServer } from './team-roles.functions'

export function useInviteTeamMember() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    setMessage('')
    void inviteTeamMemberServer({ data: { email: email.trim(), role } })
      .then(() => {
        setMessage(`Invitation sent to ${email.trim()}. The member appears here after accepting.`)
        setEmail('')
      })
      .catch(cause => {
        captureClientExceptionOnClient(cause)
        setError('Could not send the invitation. Check the address and try again.')
      })
      .finally(() => setPending(false))
  }

  return { email, setEmail, role, setRole, pending, message, error, submit }
}
