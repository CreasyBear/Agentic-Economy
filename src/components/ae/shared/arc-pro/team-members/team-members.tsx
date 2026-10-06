"use client";

/* Licensed Arc Pro TeamMembers source adapted to controlled real members and
 * single invitations. Header, invite, toolbar and roster composition retained.
 * No demo seats, bulk send, pending records, role mutation or removal engine. */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '../../../../arc/button/button'
import styles from './team-members.module.css'

export type TeamMember = Readonly<{ key: string; name: string; email: string | null; role: string }>
export type TeamInvitation =
  | Readonly<{ kind: 'unavailable'; reason: string }>
  | Readonly<{
      kind: 'available'; email: string; role: 'admin' | 'member'; pending: boolean
      message: string; error: string; emailError: string
      onEmailChange: (email: string) => void
      onRoleChange: (role: 'admin' | 'member') => void
      onSubmit: (event: FormEvent<HTMLFormElement>) => void
    }>

export type TeamMembersProps = Readonly<{ members: readonly TeamMember[]; invitation: TeamInvitation }>

function initials(name: string) {
  const words = name.trim().split(/\s+/u).filter(Boolean)
  return [words[0], ...(words.length > 1 ? [words.at(-1)] : [])]
    .map(word => Array.from(word ?? '')[0]?.toUpperCase() ?? '').join('')
}

// Requires authoritative members and an explicitly available invitation form.
// Ensures view-only search; onSubmit owns asynchronous acceptance and failure.
// Invariant: unknown email stays unknown; no optimistic members or invented seats.
// On unavailable invitation authority, keep the roster and show the supplied reason.
export function TeamMembers({ members, invitation }: TeamMembersProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const shownMembers = members.filter(member => !needle
    || member.name.toLowerCase().includes(needle)
    || (member.email?.toLowerCase().includes(needle) ?? false)
    || member.role.toLowerCase().includes(needle))

  return <section className={`arc-market ${styles.block}`} aria-labelledby={`${id}-title`}>
    <header className={styles.header}>
      <div className={styles.heading}>
        <h3 id={`${id}-title`}>Members</h3>
        <p>Roles shown here are the workspace permissions Agentic Economy enforces.</p>
      </div>
      <span className={styles.count}>{members.length} {members.length === 1 ? 'member' : 'members'}</span>
    </header>

    {invitation.kind === 'available' ? <Invite invitation={invitation} /> : <div className={styles.invite}>
      <h4>Invitations unavailable</h4>
      <p className={styles.description}>{invitation.reason}</p>
    </div>}

    <div className={styles.sectionHead}>
      <label htmlFor={`${id}-search`}>Find a member</label>
      <input id={`${id}-search`} className={styles.search} type="search" value={query} onChange={event => setQuery(event.currentTarget.value)} />
    </div>
    <div className={styles.lists}>
      {members.length === 0 ? <div className={styles.empty}>
        <h4>No members yet</h4>
        <p>{invitation.kind === 'available' ? 'Invite someone to work in this workspace.' : 'Workspace members will appear here.'}</p>
      </div> : shownMembers.length === 0 ? <div className={styles.empty}>
        <p>No members match this search.</p>
        <Button type="button" variant="secondary" onClick={() => setQuery('')}>Clear member search</Button>
      </div> : <ul className={styles.list} aria-label="Workspace members">
        {shownMembers.map(member => <li key={member.key} className={styles.row}>
          <div className={styles.rowInner}>
            <span className={styles.avatar} aria-hidden="true">{initials(member.name)}</span>
            <div className={styles.identity}>
              <span className={styles.name}>{member.name}</span>
              <span className={styles.detail}>{member.email ?? 'Email not available'}</span>
            </div>
            <span className={styles.role}>{member.role}</span>
          </div>
        </li>)}
      </ul>}
    </div>
  </section>
}

function Invite({ invitation }: { invitation: Extract<TeamInvitation, { kind: 'available' }> }) {
  const id = useId()
  const emailRef = useRef<HTMLInputElement>(null)
  const { email, role, pending, message, error, emailError, onEmailChange, onRoleChange, onSubmit } = invitation
  useEffect(() => { if (emailError) emailRef.current?.focus() }, [emailError])
  return <section className={styles.invite} aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`}>Invite a member</h4>
    <p className={styles.description}>{"Invitations are sent to this workspace's linked identity organisation. Access is granted only after the invitation is accepted and recorded by Agentic Economy."}</p>
    <form onSubmit={onSubmit} className={styles.inviteRow}>
      <div className={styles.field} data-invalid={emailError !== '' || undefined}>
        <label htmlFor={`${id}-email`}>Email address</label>
        <input ref={emailRef} id={`${id}-email`} className={styles.draft} type="email" autoComplete="email" required value={email} disabled={pending} aria-invalid={emailError !== '' || undefined} aria-describedby={emailError ? `${id}-email-error` : undefined} onChange={event => onEmailChange(event.currentTarget.value)} />
        {emailError ? <p id={`${id}-email-error`} className={styles.error}>{emailError}</p> : null}
      </div>
      <div className={styles.roleField}>
        <label htmlFor={`${id}-role`}>Workspace role</label>
        <select id={`${id}-role`} value={role} disabled={pending} onChange={event => onRoleChange(event.currentTarget.value === 'admin' ? 'admin' : 'member')}>
          <option value="member">Member</option><option value="admin">Admin</option>
        </select>
        <p className={styles.help}>Admins manage workspace settings. Members can use the workspace.</p>
      </div>
      <Button type="submit" variant="primary" className={styles.send} disabled={pending} aria-busy={pending}>{pending ? 'Sending…' : 'Send invitation'}</Button>
      {message ? <p role="status" className={styles.message}>{message}</p> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </form>
  </section>
}

export default TeamMembers

export function TeamMembersSkeleton() {
  return <div className={`arc-market ${styles.block}`} role="status" aria-label="Loading team and roles" aria-busy="true">
    <div aria-hidden="true">
      <div className={styles.header}><span className={styles.skeletonTitle} /></div>
      <div className={styles.invite}><span className={styles.skeletonLine} /></div>
      <div className={styles.sectionHead}><span className={styles.skeletonTitle} /></div>
      {[0, 1].map(index => <div key={index} className={styles.rowInner}>
        <span className={styles.avatar} /><div className={styles.identity}><span className={styles.skeletonLine} /><span className={styles.skeletonLine} /></div><span className={styles.skeletonTitle} />
      </div>)}
    </div>
  </div>
}
