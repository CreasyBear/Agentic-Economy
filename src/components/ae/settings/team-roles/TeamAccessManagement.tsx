import { useEffect, useRef, useState, type Ref, type MouseEvent } from 'react'
import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'
import { Button } from '@/components/ui/button'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { useTypedReverification } from '@/lib/client/useTypedReverification'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { changeTeamAccessServer, manageTeamInvitationServer, readTeamAccessServer } from './team-access.functions'
import type { TeamAccessMember, TeamAccessResult, TeamAccessView, PendingTeamInvitation } from './team-access.contracts'

import { TeamMembersTable, TeamInvitationsTable, type TeamTableMember } from './TeamTables'
import { TeamInviteDialog } from './TeamInviteDialog'
import type { TeamMemberView } from './team-roles.contracts'
import type { useInviteTeamMember } from './useInviteTeamMember'

type Decision = Readonly<{ kind: 'member'; member: TeamAccessMember; action: 'admin' | 'member' | 'remove' }>
  | Readonly<{ kind: 'invitation'; invitation: PendingTeamInvitation; action: 'cancel' | 'resend' }>
const refusalCopy = {
  forbidden: 'Your current account role cannot make this change.',
  stale: 'Access changed since this page was read. Refresh the team before making another change.',
  mfa_reverification_required: 'Verify with two-factor authentication to change access.',
  last_admin: 'The identity organisation must retain an admin. Promote another member first.',
  source_unavailable: 'The change could not be confirmed. Refresh the team and pending invitations before trying again.',
} as const

export function TeamAccessManagement({ onRecordedRead, accountRef, members = [], invitation, inviteReason, inviteActionRef }: Readonly<{
  onRecordedRead?: (view: TeamAccessView) => Promise<void>; accountRef?: string; members?: readonly TeamMemberView[]
  invitation?: ReturnType<typeof useInviteTeamMember>; inviteReason?: string; inviteActionRef?: Ref<HTMLButtonElement>
}> = {}) {
  const [view, setView] = useState<TeamAccessView>()
  const [pending, setPending] = useState(false)
  const [decision, setDecision] = useState<Decision>()
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')
  const [readFailed, setReadFailed] = useState(false)
  // Explicit reads supersede initial reads. Mutations/readback never overlap.
  const requestGeneration = useRef(0)
  const operationInFlight = useRef(false)
  const refreshRef = useRef<HTMLButtonElement>(null)
  const decisionTriggerRef = useRef<HTMLElement | null>(null)
  function choose(next: Decision, event: MouseEvent<HTMLButtonElement>) {
    decisionTriggerRef.current = event.currentTarget
    setDecision(next)
  }
  const changeMember = useTypedReverification(
    (data: Parameters<typeof changeTeamAccessServer>[0]['data']) => changeTeamAccessServer({ data }),
    (result: TeamAccessResult) => result.kind === 'refused' && result.code === 'mfa_reverification_required' ? 'strict_mfa' : null,
  )
  async function refresh() {
    if (operationInFlight.current) return
    operationInFlight.current = true
    const request = ++requestGeneration.current
    setPending(true)
    try {
      const refreshed = await readTeamAccessServer({ data: {} })
      if (request !== requestGeneration.current) return
      if (accountRef !== undefined && refreshed.accountRef !== accountRef) throw new Error('workspace_changed')
      await onRecordedRead?.(refreshed)
      if (request !== requestGeneration.current) return
      setView(refreshed); setReadFailed(false); setProblem('')
    }
    catch (cause) { if (request === requestGeneration.current) { captureClientExceptionOnClient(cause); setReadFailed(true); setProblem('Current team access could not be read. Refresh before changing access.') } }
    finally { operationInFlight.current = false; if (request === requestGeneration.current) setPending(false) }
  }
  async function loadMore(kind: 'members' | 'invitations') {
    if (view === undefined || operationInFlight.current || pending || readFailed) return
    const offset = kind === 'members' ? view.nextMemberOffset : view.nextInvitationOffset
    if (offset === null) return
    operationInFlight.current = true
    const request = ++requestGeneration.current
    setPending(true)
    try {
      const next = await readTeamAccessServer({ data: kind === 'members' ? { memberOffset: offset } : { invitationOffset: offset } })
      if (request !== requestGeneration.current) return
      if (next.accountRef !== view.accountRef || next.accountRevision !== view.accountRevision || next.ownershipRevision !== view.ownershipRevision || next.canManageMembers !== view.canManageMembers || next.canManageInvitations !== view.canManageInvitations) {
        setReadFailed(true); setProblem('Account access changed during pagination. Refresh before making a change.'); return
      }
      const combined = kind === 'members' ? { ...view, members: [...new Map([...view.members, ...next.members].map(member => [member.membershipRef, member])).values()], membersComplete: next.membersComplete, nextMemberOffset: next.nextMemberOffset }
        : { ...view, invitations: [...new Map([...view.invitations, ...next.invitations].map(invitation => [invitation.invitationId, invitation])).values()], invitationsComplete: next.invitationsComplete, nextInvitationOffset: next.nextInvitationOffset }
      await onRecordedRead?.(combined)
      if (request === requestGeneration.current) setView(combined)
    } catch (cause) { if (request === requestGeneration.current) { captureClientExceptionOnClient(cause); setReadFailed(true); setProblem('The next page could not be read. Refresh before changing access.') } }
    finally { operationInFlight.current = false; if (request === requestGeneration.current) setPending(false) }
  }
  useEffect(() => {
    const request = ++requestGeneration.current
    void readTeamAccessServer({ data: {} }).then(value => {
      if (request !== requestGeneration.current) return
      if (accountRef !== undefined && value.accountRef !== accountRef) throw new Error('workspace_changed')
      setView(value)
    })
      .catch(cause => { if (request === requestGeneration.current) { captureClientExceptionOnClient(cause); setReadFailed(true); setProblem('Current team access could not be read. Refresh before changing access.') } })
    return () => { requestGeneration.current += 1 }
  }, [accountRef])
  async function confirm() {
    if (view === undefined || decision === undefined || operationInFlight.current || pending || readFailed) return
    operationInFlight.current = true
    const request = ++requestGeneration.current
    setPending(true); setProblem(''); setMessage('')
    try {
      const expected = { accountRef: view.accountRef, accountRevision: view.accountRevision, ownershipRevision: view.ownershipRevision }
      const result = decision.kind === 'member'
        ? await changeMember({ ...expected, membershipRef: decision.member.membershipRef,
          membershipRevision: decision.member.revision, upstreamUpdatedAt: decision.member.upstreamUpdatedAt, action: decision.action })
        : await manageTeamInvitationServer({ data: { ...expected, invitationId: decision.invitation.invitationId,
          expectedUpdatedAt: decision.invitation.updatedAt, action: decision.action } })
      if (request !== requestGeneration.current) return
      if (result.kind === 'refused') { setProblem(refusalCopy[result.code]); setReadFailed(true); setDecision(undefined); return }
      setDecision(undefined)
      setMessage(decision.kind === 'member'
        ? 'The identity provider accepted this access change. The roster changes after Agentic Economy records it. Refresh to confirm; do not repeat the change while it is being recorded.'
        : decision.action === 'cancel' ? 'Invitation cancelled. Refresh to confirm the pending list.' : 'A replacement invitation was sent and the original invitation was cancelled. Refresh to confirm the pending list.')
      setReadFailed(true)
    } catch (cause) {
      if (request === requestGeneration.current && !isReverificationCancelledError(cause)) { captureClientExceptionOnClient(cause); setReadFailed(true); setProblem(refusalCopy.source_unavailable); setDecision(undefined) }
    } finally { operationInFlight.current = false; if (request === requestGeneration.current) setPending(false) }
  }
  const disabled = pending || readFailed
  const description = decision?.kind === 'member'
    ? decision.action === 'remove' ? `Remove ${decision.member.name} from this account. Their account access ends after the identity change is recorded. Agent keys and Provider connections have their own controls.`
      : `Change ${decision.member.name} to ${decision.action === 'admin' ? 'Admin' : 'Member'}. Admins manage account settings. The account owner remains protected.`
    : decision?.action === 'resend' ? `Cancel the waiting invitation to ${decision.invitation.email} and send a replacement with the same role. If sending fails, refresh before sending a new invitation.`
      : `Cancel the waiting invitation to ${decision?.invitation.email ?? ''}. It will no longer grant membership.`
  // The directory owns names/roles. Owner-read members supply controls only when
  // the same durable membership and recorded role agree; owners never gain controls.
  const shownMembers: readonly TeamTableMember[] = [
    ...members,
    ...(view?.members ?? []).filter(member => !members.some(recorded => recorded.key === member.membershipRef))
      .map(member => ({ key: member.membershipRef, name: member.name, email: null, role: member.role === 'admin' ? 'Admin' as const : 'Member' as const })),
  ]
  const inviteAction = invitation ? <TeamInviteDialog invitation={invitation} disabled={readFailed || view?.canManageInvitations === false} onObserve={() => void refresh()} {...(inviteActionRef === undefined ? {} : { actionRef: inviteActionRef })} /> : undefined
  return <section className="grid min-w-0 grid-cols-1 gap-6" aria-label="Manage team access">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">Keep membership and pending invitations in view.</p>
      <div className="flex flex-wrap gap-2"><Button ref={refreshRef} type="button" variant="outline" disabled={pending} onClick={() => void refresh()}>Refresh team access</Button>{inviteAction}</div>
    </div>
    {message ? <p role="status" className="text-sm">{message}</p> : null}
    {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
    {invitation?.unconfirmed ? <p role="status" className="text-sm">Invitation to {invitation.email} is unconfirmed. Refresh team access before sending again.</p> : null}
    <TeamMembersTable members={shownMembers} renderActions={member => {
      const access = view?.canManageMembers ? view.members.find(candidate => candidate.membershipRef === member.key
        && (candidate.role === 'admin' ? 'Admin' : 'Member') === member.role) : undefined
      return access ? <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={event => choose({ kind: 'member', member: access, action: access.role === 'admin' ? 'member' : 'admin' }, event)}>Make {access.role === 'admin' ? 'Member' : 'Admin'}</Button>
        <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={disabled} onClick={event => choose({ kind: 'member', member: access, action: 'remove' }, event)}>Remove member</Button>
      </div> : <span className="text-xs text-muted-foreground">{member.role === 'Owner' ? 'Account owner' : 'No access changes available'}</span>
    }} footer={<div className="grid gap-3 text-sm text-muted-foreground">
      <p>Only the account owner can change recorded members. Changes require two-factor verification.</p>
      {view && !view.membersComplete ? <p>Member controls are a partial list. Load more to review later members.</p> : null}
      {view?.nextMemberOffset != null ? <Button type="button" variant="outline" disabled={disabled} onClick={() => void loadMore('members')}>Load more members</Button> : null}
    </div>} />
    {view === undefined ? <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status">{readFailed ? 'Team management is unavailable.' : 'Reading current team access…'}</p>
    </div> : view.canManageInvitations ? <TeamInvitationsTable invitations={view.invitations} complete={view.invitationsComplete}
      renderActions={item => <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={event => choose({ kind: 'invitation', invitation: item, action: 'resend' }, event)}>Resend invitation</Button>
        <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={disabled} onClick={event => choose({ kind: 'invitation', invitation: item, action: 'cancel' }, event)}>Cancel invitation</Button>
      </div>}
      footer={view.nextInvitationOffset !== null ? <Button type="button" variant="outline" disabled={disabled} onClick={() => void loadMore('invitations')}>Load more invitations</Button> : undefined} />
      : <div className="grid gap-3"><h2 className="text-lg font-medium">Invitations unavailable</h2><p className="text-sm text-muted-foreground">{inviteReason ?? 'Pending invitations are available to account owners and admins after the Business identity organisation is set up.'}</p></div>}
    {inviteReason && view?.canManageInvitations !== false ? <p className="text-sm text-muted-foreground">{inviteReason}</p> : null}
    <AeConfirmDialog open={decision !== undefined} onOpenChange={open => { if (!pending && !open) setDecision(undefined) }}
      returnFocusRef={decisionTriggerRef} returnFocusFallbackRefs={[refreshRef]}
      title="Confirm team access change" description={description} confirmLabel="Confirm change" pending={pending} onConfirm={() => void confirm()} />
  </section>
}
